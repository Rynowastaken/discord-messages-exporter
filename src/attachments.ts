/**
 * Optional attachment archiving for finished exports.
 *
 * The crawler deliberately stores metadata only. When the job asks for files,
 * this module makes a second pass over the assembled JSON and copies each
 * attachment from Discord's CDN into the job's attachments directory. Signed
 * CDN URLs expire, so this is the only point where the bytes are still
 * guaranteed to be reachable.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DEFAULT_USER_AGENT } from "../src/api.js";
import { scanExportFile } from "../src/export-file.js";

export interface AttachmentDownloadStats {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
  bytes: number;
  complete: boolean;
}

export interface AttachmentDownloadOptions {
  sourcePath: string;
  outDir: string;
  signal?: AbortSignal;
  isStopped?: () => boolean;
  concurrency?: number;
  maxBytes?: number;
  fetch?: typeof fetch;
  onProgress?: (stats: AttachmentDownloadStats) => void;
}

interface AttachmentRef {
  id: string;
  url: string;
  proxyUrl: string | null;
  filename: string;
  contentType: string | null;
  expectedSize: number | null;
}

interface ManifestFile {
  file: string;
  filename: string;
  content_type: string | null;
  size: number;
}

interface AttachmentManifest {
  version: 1;
  downloaded_at: string;
  files: Record<string, ManifestFile>;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
};

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

function isDiscordAttachmentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "cdn.discordapp.com" ||
      url.hostname === "discord.com" ||
      url.hostname.endsWith(".discordapp.com") ||
      url.hostname.endsWith(".discordapp.net")
    );
  } catch {
    return false;
  }
}

function extensionFor(
  filename: string,
  contentType: string | null
): string {
  const fromName = extname(filename).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  if (contentType) {
    const mapped = EXTENSIONS[contentType.toLowerCase()];
    if (mapped) return mapped;
  }
  return ".bin";
}

function fileNameFor(ref: AttachmentRef): string {
  return `${ref.id}${extensionFor(ref.filename, ref.contentType)}`;
}

function collectAttachment(
  value: unknown,
  seen: Map<string, AttachmentRef>
): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const id = String(record.id ?? "").trim();
  if (!/^\d{1,25}$/.test(id) || seen.has(id)) return;
  const url = String(record.url ?? "").trim();
  const proxyUrl = String(record.proxy_url ?? "").trim();
  if (!isDiscordAttachmentUrl(url) && !isDiscordAttachmentUrl(proxyUrl)) {
    return;
  }
  const filename = String(record.filename ?? `${id}.bin`).trim() || `${id}.bin`;
  const contentType =
    typeof record.content_type === "string" ? record.content_type : null;
  const expectedSize = Number(record.size);
  seen.set(id, {
    id,
    url: isDiscordAttachmentUrl(url) ? url : proxyUrl,
    proxyUrl: isDiscordAttachmentUrl(proxyUrl) ? proxyUrl : null,
    filename,
    contentType,
    expectedSize:
      Number.isFinite(expectedSize) && expectedSize > 0
        ? expectedSize
        : null,
  });
}

async function existsWithBytes(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0 ? info.size : null;
  } catch {
    return null;
  }
}

async function fetchToFile(
  url: string,
  tmpPath: string,
  maxBytes: number,
  signal?: AbortSignal,
  request: typeof fetch = fetch
): Promise<number> {
  const response = await request(url, {
    headers: { "User-Agent": DEFAULT_USER_AGENT },
    redirect: "follow",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("attachment exceeds the size limit");
  }
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new Error("attachment exceeds the size limit"));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as never),
    limiter,
    createWriteStream(tmpPath, { flags: "wx" })
  );
  return bytes;
}

/**
 * Copy every attachment referenced by an assembled export into outDir.
 * Existing files make a resumed export cheap; the manifest is rewritten even
 * when the run is stopped so completed files stay visible in the console.
 */
export async function downloadExportAttachments(
  options: AttachmentDownloadOptions
): Promise<AttachmentDownloadStats> {
  const {
    sourcePath,
    outDir,
    signal,
    isStopped,
    concurrency = 4,
    maxBytes = DEFAULT_MAX_BYTES,
    fetch: request = fetch,
    onProgress,
  } = options;

  const attachments = new Map<string, AttachmentRef>();
  await scanExportFile(sourcePath, {
    onMetadata: () => {},
    onMessage: (message) => {
      const list = (message as { attachments?: unknown }).attachments;
      if (!Array.isArray(list)) return;
      for (const item of list) collectAttachment(item, attachments);
    },
  });

  const stats: AttachmentDownloadStats = {
    total: attachments.size,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
    complete: false,
  };
  const manifest: AttachmentManifest = {
    version: 1,
    downloaded_at: new Date().toISOString(),
    files: {},
  };
  await mkdir(outDir, { recursive: true });

  let lastProgress = 0;
  const emit = (force = false): void => {
    const now = performance.now();
    if (!force && now - lastProgress < 200) return;
    lastProgress = now;
    onProgress?.({ ...stats });
  };
  const finished = (): boolean => Boolean(signal?.aborted || isStopped?.());
  const queue = [...attachments.values()];

  async function downloadOne(ref: AttachmentRef): Promise<void> {
    if (finished()) return;
    const file = fileNameFor(ref);
    const finalPath = join(outDir, file);
    const existing = await existsWithBytes(finalPath);
    if (existing !== null) {
      stats.skipped += 1;
      manifest.files[ref.id] = {
        file,
        filename: ref.filename,
        content_type: ref.contentType,
        size: existing,
      };
      emit();
      return;
    }
    if (ref.expectedSize !== null && ref.expectedSize > maxBytes) {
      stats.skipped += 1;
      emit();
      return;
    }

    const tmpPath = `${finalPath}.part`;
    await rm(tmpPath, { force: true });
    const sources = [ref.url, ref.proxyUrl].filter(
      (value): value is string => Boolean(value)
    );
    let lastError: unknown = null;
    for (const source of sources) {
      if (finished()) break;
      try {
        const bytes = await fetchToFile(
          source,
          tmpPath,
          maxBytes,
          signal,
          request
        );
        await rename(tmpPath, finalPath);
        stats.downloaded += 1;
        stats.bytes += bytes;
        manifest.files[ref.id] = {
          file,
          filename: ref.filename,
          content_type: ref.contentType,
          size: bytes,
        };
        emit();
        return;
      } catch (err) {
        lastError = err;
        await rm(tmpPath, { force: true });
        if (finished()) return;
      }
    }
    if (!finished()) {
      stats.failed += 1;
      console.warn(
        `[attachments] ${ref.filename}: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`
      );
      emit();
    }
  }

  try {
    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, 8)) },
      async () => {
        for (;;) {
          if (finished()) return;
          const ref = queue.shift();
          if (!ref) return;
          await downloadOne(ref);
        }
      }
    );
    await Promise.all(workers);
  } finally {
    stats.complete = !finished();
    const manifestPath = join(outDir, "manifest.json");
    const tmpManifest = `${manifestPath}.tmp`;
    try {
      await writeFile(tmpManifest, JSON.stringify(manifest, null, 2), "utf8");
      await rename(tmpManifest, manifestPath);
    } catch {
      // A manifest failure must not hide files that were already downloaded.
    }
    emit(true);
  }

  return stats;
}

export async function readAttachmentManifest(
  outDir: string
): Promise<AttachmentManifest | null> {
  try {
    return JSON.parse(
      await readFile(join(outDir, "manifest.json"), "utf8")
    ) as AttachmentManifest;
  } catch {
    return null;
  }
}
