/**
 * Export library: finds finished job outputs and imported JSON files, builds a
 * local SQLite index for each one, and serves paged message/stat queries.
 *
 * The index is an implementation detail. Nothing here mutates the export file.
 */
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EXPORTS_DIR, RUNS_DIR } from "./paths.js";

export type ExportKind = "job" | "import";
export type ExportStatus =
  | "unindexed"
  | "indexing"
  | "ready"
  | "failed";

export interface ExportMetadata {
  mode?: string;
  channel?: { id?: string; name?: string | null };
  guild?: { id?: string; name?: string | null };
  target_user_id?: string | null;
  target_username?: string | null;
  author?: {
    id?: string;
    name?: string | null;
    global_name?: string | null;
  } | null;
  ordering?: string;
  attachments_note?: string;
  channels?: Array<{
    id?: string;
    name?: string;
    status?: string;
  }>;
  window?: { since?: string | null; until?: string | null };
  crawl?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExportSummary {
  id: string;
  kind: ExportKind;
  name: string;
  status: ExportStatus;
  progress: number;
  indexed: number;
  message_count: number | null;
  size_bytes: number;
  created_at: string;
  modified_at: string;
  metadata: ExportMetadata | null;
  error: string | null;
}

interface ExportRecord extends ExportSummary {
  sourcePath: string;
  indexPath: string;
  directory: string;
}

export interface FacetValue {
  id: string;
  name: string;
  count: number;
}

export interface ExportFacets {
  authors: FacetValue[];
  channels: FacetValue[];
  first_timestamp: string | null;
  last_timestamp: string | null;
}

export interface MessageSummary {
  id: string;
  timestamp: string;
  author_id: string | null;
  author_name: string | null;
  author_global_name: string | null;
  author_bot: boolean;
  channel_id: string | null;
  channel_name: string | null;
  content: string;
  content_length: number;
  attachment_count: number;
  reaction_count: number;
  reply_to_id: string | null;
  edited: boolean;
}

export interface MessagePage {
  messages: MessageSummary[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface ExportFilters {
  q?: string;
  author?: string;
  channel?: string;
  from?: string;
  to?: string;
}

export interface ExportStats {
  scope: "all" | "filtered";
  total: number;
  authors: number;
  channels: number;
  first_timestamp: string | null;
  last_timestamp: string | null;
  active_days: number;
  attachments: number;
  reactions: number;
  edited: number;
  replies: number;
  average_length: number;
  median_length: number;
  messages_per_active_day: number;
  night_share: number;
  reply_rate: number;
  edit_rate: number;
  attachment_rate: number;
  link_rate: number;
  longest_streak_days: number;
  busiest_day: { day: string; count: number } | null;
  busiest_hour: { weekday: number; hour: number; count: number } | null;
  longest_gap: { seconds: number; from: string; to: string } | null;
  longest_message: {
    id: string;
    author_name: string;
    length: number;
    content: string;
  } | null;
  first_message: {
    id: string;
    timestamp: string;
    author_name: string;
    content: string;
  } | null;
  last_message: {
    id: string;
    timestamp: string;
    author_name: string;
    content: string;
  } | null;
  activity: Array<{ day: string; count: number }>;
  clock: Array<{ weekday: number; hour: number; count: number }>;
  top_authors: FacetValue[];
  top_channels: FacetValue[];
  attachment_types: Array<{ type: string; count: number }>;
  top_reactions: Array<{ emoji: string; count: number }>;
  top_domains: Array<{ domain: string; count: number }>;
  top_words: Array<{ word: string; count: number }>;
  length_buckets: Array<{ label: string; count: number }>;
}

const INDEX_SCHEMA = 3;

interface IndexMeta {
  schema_version: number;
  message_count: number;
  metadata: ExportMetadata | null;
  source_size: number;
  source_mtime_ms: number;
}

const records = new Map<string, ExportRecord>();
const indexing = new Map<string, Promise<void>>();
const IMPORT_ID = /^import-[a-f0-9]{12}$/;
const JOB_ID = /^job-[A-Za-z0-9_-]{1,80}$/;
const MAX_NAME = 160;

let libraryRunsDir = RUNS_DIR;
let libraryExportsDir = EXPORTS_DIR;

/** Point the library at other directories. Used by tests and deployments. */
export function configureExportLibrary(options: {
  runsDir?: string;
  exportsDir?: string;
}): void {
  if (options.runsDir) libraryRunsDir = options.runsDir;
  if (options.exportsDir) libraryExportsDir = options.exportsDir;
  records.clear();
}

function nowIso(): string {
  return new Date().toISOString();
}

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function publicRecord(record: ExportRecord): ExportSummary {
  const {
    sourcePath: _sourcePath,
    indexPath: _indexPath,
    directory: _directory,
    ...summary
  } = record;
  return summary;
}

function cleanName(value: string): string {
  const base = value.split(/[/\\]/).pop() ?? value;
  return base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_NAME);
}

type InferredMode = "author" | "channel" | "server" | null;

function inferredMode(metadata: ExportMetadata | null): InferredMode {
  if (!metadata) return null;
  if (
    metadata.mode === "author" ||
    metadata.mode === "channel" ||
    metadata.mode === "server"
  ) {
    return metadata.mode;
  }
  if (metadata.target_user_id) return "author";
  if ((metadata.channels?.length ?? 0) > 0) return "server";
  if (metadata.channel?.id || metadata.channel?.name) return "channel";
  return null;
}

function labelFor(
  metadata: ExportMetadata | null,
  fallback: string
): string {
  if (!metadata) return fallback;
  const mode = inferredMode(metadata);
  if (mode === "server") {
    return metadata.guild?.name || `server ${metadata.guild?.id ?? ""}`;
  }
  if (mode === "channel" && metadata.channel?.name) {
    return `#${metadata.channel.name}`;
  }
  if (mode === "author") {
    const person =
      metadata.author?.global_name ||
      metadata.author?.name ||
      metadata.target_username ||
      null;
    if (person) return person;
    if (metadata.target_user_id) return `user ${metadata.target_user_id}`;
  }
  if (mode === "channel" || metadata.channel?.name) {
    return metadata.channel?.name
      ? `#${metadata.channel.name}`
      : fallback;
  }
  return fallback;
}

async function readMetadataPreview(
  sourcePath: string
): Promise<ExportMetadata | null> {
  let handle;
  try {
    handle = await open(sourcePath, "r");
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const key = text.indexOf('"export_metadata"');
    if (key < 0) return null;
    const start = text.indexOf("{", key);
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(text.slice(start, index + 1)) as ExportMetadata;
        }
      }
    }
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
  return null;
}

function readIndexMeta(indexPath: string): IndexMeta | null {
  if (!existsSync(indexPath)) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(indexPath, { readOnly: true });
    const rows = db
      .prepare("SELECT key, value FROM meta")
      .all() as Array<{ key: string; value: string }>;
    const values = new Map(rows.map((row) => [row.key, row.value]));
    const metadataRaw = values.get("metadata");
    return {
      schema_version: asNumber(values.get("schema_version"), 0),
      message_count: asNumber(values.get("message_count")),
      metadata: metadataRaw
        ? (JSON.parse(metadataRaw) as ExportMetadata)
        : null,
      source_size: asNumber(values.get("source_size"), -1),
      source_mtime_ms: asNumber(values.get("source_mtime_ms"), -1),
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function readIndexedAuthor(
  indexPath: string,
  authorId: string
): { name?: string | null; global_name?: string | null } | null {
  if (!existsSync(indexPath)) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(indexPath, { readOnly: true });
    const row = db
      .prepare(
        `SELECT author_name, author_global_name FROM messages
         WHERE author_id = ?
           AND (COALESCE(author_global_name, '') <> ''
             OR COALESCE(author_name, '') <> '')
         ORDER BY id LIMIT 1`
      )
      .get(authorId) as
      | { author_name?: string | null; author_global_name?: string | null }
      | undefined;
    if (!row) return null;
    return {
      name: row.author_name || null,
      global_name: row.author_global_name || null,
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

async function considerSource(
  id: string,
  kind: ExportKind,
  sourcePath: string,
  indexPath: string,
  directory: string,
  displayName: string,
  createdAt?: string
): Promise<void> {
  if (records.get(id)?.status === "indexing") return;
  let info;
  try {
    info = await stat(sourcePath);
  } catch {
    return;
  }
  if (!info.isFile()) return;

  const previous = records.get(id);
  const indexMeta = readIndexMeta(indexPath);
  const mtime = Math.floor(info.mtimeMs);
  const fresh =
    indexMeta !== null &&
    indexMeta.schema_version === INDEX_SCHEMA &&
    indexMeta.source_size === info.size &&
    indexMeta.source_mtime_ms === mtime;
  const metadata =
    indexMeta?.metadata ??
    previous?.metadata ??
    (await readMetadataPreview(sourcePath));
  if (
    fresh &&
    metadata?.target_user_id &&
    (!metadata.mode || metadata.mode === "author") &&
    !metadata.author
  ) {
    const author = readIndexedAuthor(indexPath, metadata.target_user_id);
    if (author) {
      metadata.author = { id: metadata.target_user_id, ...author };
    }
  }
  const record: ExportRecord = {
    id,
    kind,
    name: labelFor(metadata, previous?.name ?? displayName),
    status: fresh ? "ready" : "unindexed",
    progress: fresh ? 1 : 0,
    indexed: fresh ? (indexMeta?.message_count ?? 0) : 0,
    message_count: fresh ? (indexMeta?.message_count ?? 0) : null,
    size_bytes: info.size,
    created_at:
      previous?.created_at ??
      createdAt ??
      new Date(info.birthtimeMs || info.mtimeMs).toISOString(),
    modified_at: new Date(info.mtimeMs).toISOString(),
    metadata,
    error: null,
    sourcePath,
    indexPath,
    directory,
  };
  if (previous?.status === "failed" && !fresh) {
    // Keep a failure visible until the user asks to rebuild or reloads.
    record.status = "failed";
    record.error = previous.error;
  }
  records.set(id, record);
}

async function refreshJobs(): Promise<Set<string>> {
  const seen = new Set<string>();
  let entries;
  try {
    entries = await readdir(libraryRunsDir, { withFileTypes: true });
  } catch {
    return seen;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = join(libraryRunsDir, entry.name);
    const sourcePath = join(directory, "messages.json");
    if (!existsSync(sourcePath)) continue;
    const id = `job-${entry.name}`;
    if (!JOB_ID.test(id)) continue;
    seen.add(id);
    await considerSource(
      id,
      "job",
      sourcePath,
      join(directory, "explorer.sqlite"),
      directory,
      `job ${entry.name}`
    );
  }
  return seen;
}

async function refreshImports(): Promise<Set<string>> {
  const seen = new Set<string>();
  let entries;
  try {
    entries = await readdir(libraryExportsDir, { withFileTypes: true });
  } catch {
    return seen;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !IMPORT_ID.test(entry.name)) continue;
    const directory = join(libraryExportsDir, entry.name);
    const sourcePath = join(directory, "messages.json");
    if (!existsSync(sourcePath)) continue;
    seen.add(entry.name);
    let originalName = "export.json";
    let createdAt: string | undefined;
    try {
      const meta = JSON.parse(
        await readFile(join(directory, "import.json"), "utf8")
      ) as { original_name?: string; created_at?: string };
      if (meta.original_name) originalName = cleanName(meta.original_name);
      if (meta.created_at) createdAt = meta.created_at;
    } catch {
      // A missing import.json only costs the display name.
    }
    await considerSource(
      entry.name,
      "import",
      sourcePath,
      join(directory, "explorer.sqlite"),
      directory,
      originalName,
      createdAt
    );
  }
  return seen;
}

export async function refreshExports(): Promise<ExportSummary[]> {
  await mkdir(libraryExportsDir, { recursive: true });
  const jobs = await refreshJobs();
  const imports = await refreshImports();
  const seen = new Set([...jobs, ...imports]);
  for (const id of [...records.keys()]) {
    if (!seen.has(id) && records.get(id)?.status !== "indexing") {
      records.delete(id);
    }
  }
  return listExports();
}

export function listExports(): ExportSummary[] {
  return [...records.values()]
    .sort((a, b) =>
      a.modified_at < b.modified_at
        ? 1
        : a.modified_at > b.modified_at
          ? -1
          : 0
    )
    .map(publicRecord);
}

export function getExport(id: string): ExportSummary | null {
  const record = records.get(id);
  return record ? publicRecord(record) : null;
}

export function getExportSourcePath(id: string): string | null {
  return records.get(id)?.sourcePath ?? null;
}

export function getExportKind(id: string): ExportKind | null {
  return records.get(id)?.kind ?? null;
}

export async function ensureIndexed(
  id: string
): Promise<ExportSummary | null> {
  const record = records.get(id);
  if (!record) return null;
  if (indexing.has(id)) return publicRecord(record);

  let info;
  try {
    info = await stat(record.sourcePath);
  } catch {
    records.delete(id);
    return null;
  }
  const indexMeta = readIndexMeta(record.indexPath);
  const mtime = Math.floor(info.mtimeMs);
  if (
    record.status === "ready" &&
    indexMeta !== null &&
    indexMeta.schema_version === INDEX_SCHEMA &&
    indexMeta.source_size === info.size &&
    indexMeta.source_mtime_ms === mtime
  ) {
    return publicRecord(record);
  }

  record.status = "indexing";
  record.progress = 0;
  record.indexed = 0;
  record.error = null;
  record.size_bytes = info.size;
  const job = (async () => {
    try {
      const result = await buildIndex(
        record.sourcePath,
        record.indexPath,
        (bytes, indexed) => {
          record.indexed = indexed;
          record.progress = info.size
            ? Math.min(0.99, bytes / info.size)
            : 0;
        }
      );
      record.status = "ready";
      record.progress = 1;
      record.indexed = result.count;
      record.message_count = result.count;
      record.metadata = result.metadata;
      if (record.kind === "job") {
        record.name = labelFor(result.metadata, record.name);
      }
      record.error = null;
    } catch (err) {
      record.status = "failed";
      record.progress = 0;
      record.error = err instanceof Error ? err.message : String(err);
    } finally {
      indexing.delete(id);
    }
  })();
  indexing.set(id, job);
  return publicRecord(record);
}

export async function removeImport(id: string): Promise<boolean> {
  const record = records.get(id);
  if (!record || record.kind !== "import") return false;
  records.delete(id);
  await rm(record.directory, { recursive: true, force: true });
  return true;
}

export async function reindexExport(
  id: string
): Promise<ExportSummary | null> {
  const record = records.get(id);
  if (!record) return null;
  if (record.status === "indexing") return publicRecord(record);
  record.status = "unindexed";
  record.error = null;
  return ensureIndexed(id);
}

export interface ImportTarget {
  id: string;
  directory: string;
  filePath: string;
  partPath: string;
  originalName: string;
}

export async function prepareImport(
  originalName: string
): Promise<ImportTarget> {
  await mkdir(libraryExportsDir, { recursive: true });
  const id = `import-${randomBytes(6).toString("hex")}`;
  const directory = join(libraryExportsDir, id);
  await mkdir(directory, { recursive: true });
  const name = cleanName(originalName || "export.json");
  return {
    id,
    directory,
    filePath: join(directory, "messages.json"),
    partPath: join(directory, "messages.json.part"),
    originalName: name,
  };
}

export async function finalizeImport(
  target: ImportTarget
): Promise<ExportSummary | null> {
  await writeFile(
    join(target.directory, "import.json"),
    JSON.stringify(
      {
        original_name: target.originalName,
        created_at: nowIso(),
      },
      null,
      2
    ),
    "utf8"
  );
  await refreshExports();
  return getExport(target.id);
}

export async function discardImport(target: ImportTarget): Promise<void> {
  await rm(target.directory, { recursive: true, force: true });
}

function sqlValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

const STOP_WORDS = new Set(
  `a about after again all also am an and any are as at be because been before being but by can could did do does doing down each even for from further get got had has have having he her here hers him his how i if in into is it its itself just know like made make many me might more most much must my no nor not now of off on once only or other our out over own said same say see she should so some such than that the their them then there these they thing things this those through to too under until up very was we well were what when where which while who why will with would you your yours youre im ive dont doesnt didnt cant wont isnt arent wasnt werent thats theres lets lol ok okay yeah yes hi hello hey thanks thank please sorry maybe actually right way us our youre weve ive whats hows today yesterday tomorrow people time good new still think want need going go went one two three`
    .split(/\s+/)
);

function wordsIn(content: string): Array<{ word: string; count: number }> {
  const cleaned = content
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[@#][!&]?\d+>/g, " ")
    .replace(/<a?:[a-z0-9_]+:\d+>/g, " ");
  const counts = new Map<string, number>();
  for (const match of cleaned.matchAll(/[a-z0-9][a-z0-9'_-]{1,30}/g)) {
    const word = match[0].replace(/^[-_']+|[-_']+$/g, "");
    if (word.length < 2 || STOP_WORDS.has(word) || /^\d+$/.test(word)) {
      continue;
    }
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  for (const match of content.matchAll(/[\u3400-\u9fff]+/g)) {
    const run = match[0];
    if (run.length === 1) {
      counts.set(run, (counts.get(run) ?? 0) + 1);
    } else {
      for (let index = 0; index < run.length - 1; index += 1) {
        const word = run.slice(index, index + 2);
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 120)
    .map(([word, count]) => ({ word, count }));
}

function domainsIn(content: string): string[] {
  const domains = new Set<string>();
  for (const match of content.matchAll(/https?:\/\/([^\s/<>"')\]]+)/gi)) {
    let host = match[1].toLowerCase().replace(/^www\./, "").split(":")[0];
    host = host.replace(/[.,;!?]+$/, "");
    if (host && host.includes(".")) domains.add(host.slice(0, 120));
  }
  return [...domains];
}

function normalizeMessage(
  message: Record<string, unknown>,
  index: number,
  metadata: ExportMetadata | null,
  channelNames: Map<string, string>
): {
  id: string;
  timestamp: string;
  authorId: string;
  authorName: string;
  authorGlobalName: string;
  authorBot: number;
  channelId: string;
  channelName: string;
  content: string;
  attachmentCount: number;
  reactionCount: number;
  replyToId: string;
  edited: number;
  raw: string;
  attachments: Array<{ id: string; type: string }>;
  reactions: Array<{ emoji: string; count: number }>;
  links: string[];
  words: Array<{ word: string; count: number }>;
} {
  const id = sqlValue(message.id) || `row-${index}`;
  const author = (message.author ?? {}) as Record<string, unknown>;
  const channelId =
    sqlValue(message.channel_id) || sqlValue(metadata?.channel?.id);
  const channelName =
    channelNames.get(channelId) ||
    (metadata?.channel?.id === channelId
      ? metadata.channel?.name ?? ""
      : "") ||
    channelId;
  const attachments = Array.isArray(message.attachments)
    ? (message.attachments as Array<Record<string, unknown>>)
    : [];
  const reactions = Array.isArray(message.reactions)
    ? (message.reactions as Array<Record<string, unknown>>)
    : [];
  const reference = (message.message_reference ?? {}) as Record<
    string,
    unknown
  >;
  const referenced = (message.referenced_message ?? {}) as Record<
    string,
    unknown
  >;
  const replyToId =
    sqlValue(reference.message_id) ||
    sqlValue(referenced.id);
  const content = sqlValue(message.content);
  const reactionCounts = new Map<string, number>();
  for (const reaction of reactions) {
    const emoji = (reaction.emoji ?? {}) as Record<string, unknown>;
    const name =
      sqlValue(emoji.name) || sqlValue(emoji.id) || "unknown emoji";
    reactionCounts.set(
      name,
      (reactionCounts.get(name) ?? 0) + asNumber(reaction.count)
    );
  }
  return {
    id,
    timestamp: sqlValue(message.timestamp),
    authorId: sqlValue(author.id),
    authorName: sqlValue(author.username) || sqlValue(author.id),
    authorGlobalName: sqlValue(author.global_name),
    authorBot: author.bot ? 1 : 0,
    channelId,
    channelName,
    content,
    attachmentCount: attachments.length,
    reactionCount: reactions.reduce(
      (sum, reaction) => sum + asNumber(reaction.count),
      0
    ),
    replyToId,
    edited: message.edited_timestamp ? 1 : 0,
    raw: JSON.stringify(message),
    attachments: attachments.map((attachment, attachmentIndex) => ({
      id: sqlValue(attachment.id) || `attachment-${attachmentIndex}`,
      type: sqlValue(attachment.content_type) || "unknown",
    })),
    reactions: [...reactionCounts.entries()].map(([emoji, count]) => ({
      emoji,
      count,
    })),
    links: domainsIn(content),
    words: wordsIn(content),
  };
}

interface ScanCallbacks {
  onMetadata: (metadata: ExportMetadata) => void;
  onMessage: (message: Record<string, unknown>, index: number) => void;
  onProgress?: (bytes: number, indexed: number) => void;
  signal?: AbortSignal;
}

async function scanExportFile(
  sourcePath: string,
  callbacks: ScanCallbacks
): Promise<void> {
  const stream = createReadStream(sourcePath, {
    encoding: "utf8",
    highWaterMark: 1024 * 1024,
  });
  let bytes = 0;
  let messages = 0;
  let depth = 0;
  let rootStarted = false;
  let inString = false;
  let escaped = false;
  let expectingKey = false;
  let keyCapture: string | null = null;
  let currentKey: string | null = null;
  let inMessages = false;
  let sawMessages = false;
  let capture: string | null = null;
  let captureBase = 0;
  let captureKind: "metadata" | "message" | null = null;

  const feed = (char: string): void => {
    if (capture !== null) {
      capture += char;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        return;
      }
      if (char === '"') {
        inString = true;
        return;
      }
      if (char === "{" || char === "[") {
        depth += 1;
        return;
      }
      if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === captureBase) {
          const value = capture;
          const kind = captureKind;
          capture = null;
          captureKind = null;
          if (kind === "metadata") {
            callbacks.onMetadata(JSON.parse(value) as ExportMetadata);
          } else if (kind === "message") {
            callbacks.onMessage(
              JSON.parse(value) as Record<string, unknown>,
              messages
            );
            messages += 1;
          }
        }
      }
      return;
    }

    if (inString) {
      if (keyCapture !== null) keyCapture += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        inString = false;
        if (keyCapture !== null) {
          currentKey = JSON.parse(keyCapture) as string;
          keyCapture = null;
          expectingKey = false;
        }
      }
      return;
    }

    if (char === '"') {
      inString = true;
      if (depth === 1 && expectingKey) keyCapture = '"';
      return;
    }
    if (char === "{" || char === "[") {
      if (!rootStarted && depth === 0 && char === "{") {
        rootStarted = true;
        depth = 1;
        expectingKey = true;
        return;
      }
      if (depth === 1 && currentKey === "export_metadata" && char === "{") {
        capture = "{";
        captureBase = 1;
        captureKind = "metadata";
        depth = 2;
        return;
      }
      if (inMessages && depth === 2 && char === "{") {
        capture = "{";
        captureBase = 2;
        captureKind = "message";
        depth = 3;
        return;
      }
      if (depth === 1 && currentKey === "messages" && char === "[") {
        inMessages = true;
        sawMessages = true;
        depth = 2;
        return;
      }
      depth += 1;
      return;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      if (inMessages && depth === 1 && char === "]") {
        inMessages = false;
        currentKey = null;
      }
      return;
    }
    if (char === "," && depth === 1) {
      expectingKey = true;
      currentKey = null;
    }
  };

  for await (const chunk of stream) {
    if (callbacks.signal?.aborted) throw new Error("indexing cancelled");
    bytes += Buffer.byteLength(chunk);
    for (let index = 0; index < chunk.length; index += 1) {
      feed(chunk[index]);
    }
    callbacks.onProgress?.(bytes, messages);
  }
  if (!rootStarted) {
    throw new Error("the file is not a JSON object");
  }
  if (!sawMessages) {
    throw new Error("the file has no messages array");
  }
  if (depth !== 0) {
    throw new Error("the export file is not complete JSON");
  }
  if (capture !== null || inString) {
    throw new Error("the export file ends inside a JSON value");
  }
}

export interface IndexResult {
  count: number;
  metadata: ExportMetadata | null;
}

export async function buildIndex(
  sourcePath: string,
  indexPath: string,
  onProgress?: (bytes: number, indexed: number) => void
): Promise<IndexResult> {
  await mkdir(dirname(indexPath), { recursive: true });
  const tmpPath = `${indexPath}.tmp`;
  await rm(tmpPath, { force: true });
  await rm(`${tmpPath}-wal`, { force: true });
  await rm(`${tmpPath}-shm`, { force: true });

  const db = new DatabaseSync(tmpPath);
  let metadata: ExportMetadata | null = null;
  const channelNames = new Map<string, string>();
  let count = 0;
  let committed = false;
  const sourceBefore = await stat(sourcePath);
  try {
    db.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE messages (
        rowid INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        timestamp TEXT NOT NULL,
        author_id TEXT,
        author_name TEXT,
        author_global_name TEXT,
        author_bot INTEGER NOT NULL DEFAULT 0,
        channel_id TEXT,
        channel_name TEXT,
        content TEXT NOT NULL,
        attachment_count INTEGER NOT NULL DEFAULT 0,
        reaction_count INTEGER NOT NULL DEFAULT 0,
        reply_to_id TEXT,
        edited INTEGER NOT NULL DEFAULT 0,
        raw TEXT NOT NULL
      );
      CREATE INDEX messages_time ON messages(timestamp, id);
      CREATE INDEX messages_author ON messages(author_id);
      CREATE INDEX messages_channel ON messages(channel_id);
      CREATE TABLE attachments (
        message_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        content_type TEXT NOT NULL
      );
      CREATE UNIQUE INDEX attachments_unique
        ON attachments(message_id, attachment_id);
      CREATE TABLE reactions (
        message_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX reactions_unique
        ON reactions(message_id, emoji);
      CREATE TABLE links (
        message_id TEXT NOT NULL,
        domain TEXT NOT NULL
      );
      CREATE UNIQUE INDEX links_unique
        ON links(message_id, domain);
      CREATE TABLE words (
        message_id TEXT NOT NULL,
        word TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX words_unique
        ON words(message_id, word);
      CREATE INDEX words_word ON words(word);
      CREATE VIRTUAL TABLE messages_fts USING fts5(
        content,
        content='messages',
        content_rowid='rowid',
        tokenize='unicode61'
      );
    `);
    const insertMessage = db.prepare(`
      INSERT OR REPLACE INTO messages
        (id, timestamp, author_id, author_name, author_global_name,
         author_bot, channel_id, channel_name, content, attachment_count,
         reaction_count, reply_to_id, edited, raw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAttachment = db.prepare(
      "INSERT OR IGNORE INTO attachments (message_id, attachment_id, content_type) VALUES (?, ?, ?)"
    );
    const insertReaction = db.prepare(
      "INSERT OR IGNORE INTO reactions (message_id, emoji, count) VALUES (?, ?, ?)"
    );
    const insertLink = db.prepare(
      "INSERT OR IGNORE INTO links (message_id, domain) VALUES (?, ?)"
    );
    const insertWord = db.prepare(
      "INSERT OR IGNORE INTO words (message_id, word, count) VALUES (?, ?, ?)"
    );
    db.exec("BEGIN");
    await scanExportFile(sourcePath, {
      onMetadata: (value) => {
        metadata = value;
        for (const channel of value.channels ?? []) {
          if (channel.id) {
            channelNames.set(String(channel.id), channel.name ?? "");
          }
        }
        const soleChannel = value.channel;
        if (soleChannel?.id) {
          channelNames.set(String(soleChannel.id), soleChannel.name ?? "");
        }
      },
      onMessage: (message, index) => {
        const normalized = normalizeMessage(
          message,
          index,
          metadata,
          channelNames
        );
        insertMessage.run(
          normalized.id,
          normalized.timestamp,
          normalized.authorId,
          normalized.authorName,
          normalized.authorGlobalName,
          normalized.authorBot,
          normalized.channelId,
          normalized.channelName,
          normalized.content,
          normalized.attachmentCount,
          normalized.reactionCount,
          normalized.replyToId,
          normalized.edited,
          normalized.raw
        );
        for (const attachment of normalized.attachments) {
          insertAttachment.run(
            normalized.id,
            attachment.id,
            attachment.type
          );
        }
        for (const reaction of normalized.reactions) {
          insertReaction.run(normalized.id, reaction.emoji, reaction.count);
        }
        for (const domain of normalized.links) {
          insertLink.run(normalized.id, domain);
        }
        for (const word of normalized.words) {
          insertWord.run(normalized.id, word.word, word.count);
        }
        count += 1;
        if (count % 2000 === 0) {
          db.exec("COMMIT");
          db.exec("BEGIN");
        }
      },
      onProgress,
    });
    db.exec("COMMIT");
    committed = true;
    if (channelNames.size) {
      const updateChannel = db.prepare(
        "UPDATE messages SET channel_name = ? WHERE channel_id = ?"
      );
      for (const [channelId, channelName] of channelNames) {
        updateChannel.run(channelName || channelId, channelId);
      }
    }
    db.exec("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')");
    const indexedMetadata = metadata as ExportMetadata | null;
    if (
      indexedMetadata?.target_user_id &&
      (!indexedMetadata.mode || indexedMetadata.mode === "author")
    ) {
      const author = readIndexedAuthor(tmpPath, indexedMetadata.target_user_id);
      if (author) {
        indexedMetadata.author = {
          id: indexedMetadata.target_user_id,
          ...author,
        };
      }
    }
    const sourceInfo = await stat(sourcePath);
    if (
      sourceInfo.size !== sourceBefore.size ||
      Math.floor(sourceInfo.mtimeMs) !== Math.floor(sourceBefore.mtimeMs)
    ) {
      throw new Error("the export file changed while it was being indexed");
    }
    const setMeta = db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)"
    );
    setMeta.run("schema_version", String(INDEX_SCHEMA));
    setMeta.run("message_count", String(count));
    setMeta.run("metadata", JSON.stringify(indexedMetadata ?? {}));
    setMeta.run("source_size", String(sourceInfo.size));
    setMeta.run(
      "source_mtime_ms",
      String(Math.floor(sourceInfo.mtimeMs))
    );
    setMeta.run("indexed_at", nowIso());
    db.close();
    // Windows rename does not reliably replace an existing file.
    await rm(indexPath, { force: true });
    await rename(tmpPath, indexPath);
    return { count, metadata };
  } catch (err) {
    if (!committed) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // No active transaction.
      }
    }
    try {
      db.close();
    } catch {
      // Already closed.
    }
    await rm(tmpPath, { force: true });
    await rm(`${tmpPath}-wal`, { force: true });
    await rm(`${tmpPath}-shm`, { force: true });
    throw err;
  }
}

function openIndex(indexPath: string): DatabaseSync {
  return new DatabaseSync(indexPath, { readOnly: true });
}

function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function ftsQuery(value: string): { mode: "fts" | "like"; value: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // unicode61 does not segment CJK text into useful search terms; a substring
  // scan is both simpler and more accurate for non-ASCII queries.
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return { mode: "like", value: trimmed };
  }
  const terms = trimmed.match(/[\p{L}\p{N}_]+/gu);
  if (!terms || !terms.length) return { mode: "like", value: trimmed };
  return {
    mode: "fts",
    value: terms
      .map((term) => `"${term.replace(/"/g, '""')}"*`)
      .join(" AND "),
  };
}

interface SqlFilter {
  from: string;
  where: string;
  params: Array<string | number>;
}

function buildFilter(
  filters: ExportFilters,
  includeSearch = true
): SqlFilter {
  let from = "messages m";
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (includeSearch) {
    const search = ftsQuery(filters.q ?? "");
    if (search?.mode === "fts") {
      from += " JOIN messages_fts f ON f.rowid = m.rowid";
      clauses.push("messages_fts MATCH ?");
      params.push(search.value);
    } else if (search?.mode === "like") {
      clauses.push("m.content LIKE ? ESCAPE '\\'");
      params.push(`%${likeEscape(search.value)}%`);
    }
  }
  if (filters.author) {
    clauses.push("m.author_id = ?");
    params.push(filters.author);
  }
  if (filters.channel) {
    clauses.push("m.channel_id = ?");
    params.push(filters.channel);
  }
  if (filters.from) {
    clauses.push("m.timestamp >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push("m.timestamp <= ?");
    params.push(filters.to);
  }
  return {
    from,
    where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function hasFilters(filters: ExportFilters): boolean {
  return Boolean(
    filters.q?.trim() ||
      filters.author ||
      filters.channel ||
      filters.from ||
      filters.to
  );
}

export function queryMessages(
  id: string,
  filters: ExportFilters,
  offset: number,
  limit: number,
  order: "asc" | "desc"
): MessagePage | null {
  const record = records.get(id);
  if (!record || record.status !== "ready") return null;
  const db = openIndex(record.indexPath);
  try {
    const filter = buildFilter(filters);
    const totalRow = db
      .prepare(
        `SELECT COUNT(*) AS total FROM ${filter.from}${filter.where}`
      )
      .get(...filter.params) as { total?: number } | undefined;
    const total = asNumber(totalRow?.total);
    const direction = order === "asc" ? "ASC" : "DESC";
    const rows = db
      .prepare(
        `SELECT m.id, m.timestamp, m.author_id, m.author_name,
                m.author_global_name, m.author_bot, m.channel_id,
                m.channel_name, substr(m.content, 1, 1200) AS content,
                length(m.content) AS content_length,
                m.attachment_count, m.reaction_count, m.reply_to_id,
                m.edited
         FROM ${filter.from}${filter.where}
         ORDER BY m.timestamp ${direction}, m.id ${direction}
         LIMIT ? OFFSET ?`
      )
      .all(...filter.params, limit, offset) as Array<Record<string, unknown>>;
    return {
      messages: rows.map((row) => ({
        id: sqlValue(row.id),
        timestamp: sqlValue(row.timestamp),
        author_id: sqlValue(row.author_id) || null,
        author_name: sqlValue(row.author_name) || null,
        author_global_name: sqlValue(row.author_global_name) || null,
        author_bot: Boolean(row.author_bot),
        channel_id: sqlValue(row.channel_id) || null,
        channel_name: sqlValue(row.channel_name) || null,
        content: sqlValue(row.content),
        content_length: asNumber(row.content_length),
        attachment_count: asNumber(row.attachment_count),
        reaction_count: asNumber(row.reaction_count),
        reply_to_id: sqlValue(row.reply_to_id) || null,
        edited: Boolean(row.edited),
      })),
      total,
      offset,
      limit,
      has_more: offset + rows.length < total,
    };
  } finally {
    db.close();
  }
}

export function queryMessage(
  id: string,
  messageId: string
): Record<string, unknown> | null {
  const record = records.get(id);
  if (!record || record.status !== "ready") return null;
  const db = openIndex(record.indexPath);
  try {
    const row = db
      .prepare("SELECT raw FROM messages WHERE id = ?")
      .get(messageId) as { raw?: string } | undefined;
    if (!row?.raw) return null;
    return JSON.parse(row.raw) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function facetQuery(
  db: DatabaseSync,
  column: "author" | "channel",
  from: string,
  where: string,
  params: Array<string | number>
): FacetValue[] {
  const idColumn = column === "author" ? "author_id" : "channel_id";
  const nameColumn = column === "author" ? "author_name" : "channel_name";
  const rows = db
    .prepare(
      `SELECT ${idColumn} AS id, ${nameColumn} AS name, COUNT(*) AS count
       FROM ${from}${where}
       GROUP BY ${idColumn}
       ORDER BY count DESC, ${nameColumn} ASC
       LIMIT 100`
    )
    .all(...params) as Array<Record<string, unknown>>;
  return rows
    .map((row) => ({
      id: sqlValue(row.id),
      name: sqlValue(row.name) || sqlValue(row.id),
      count: asNumber(row.count),
    }))
    .filter((row) => row.id);
}

export function queryFacets(id: string): ExportFacets | null {
  const record = records.get(id);
  if (!record || record.status !== "ready") return null;
  const db = openIndex(record.indexPath);
  try {
    const filter = buildFilter({}, false);
    const bounds = db
      .prepare(
        `SELECT MIN(timestamp) AS first, MAX(timestamp) AS last
         FROM ${filter.from}${filter.where}`
      )
      .get(...filter.params) as
      | { first?: string; last?: string }
      | undefined;
    return {
      authors: facetQuery(db, "author", filter.from, filter.where, filter.params),
      channels: facetQuery(
        db,
        "channel",
        filter.from,
        filter.where,
        filter.params
      ),
      first_timestamp: bounds?.first ?? null,
      last_timestamp: bounds?.last ?? null,
    };
  } finally {
    db.close();
  }
}

export function queryStats(
  id: string,
  filters: ExportFilters
): ExportStats | null {
  const record = records.get(id);
  if (!record || record.status !== "ready") return null;
  const db = openIndex(record.indexPath);
  try {
    const filter = buildFilter(filters);
    const ftsJoin = filter.from.includes("JOIN")
      ? " JOIN messages_fts f ON f.rowid = m.rowid"
      : "";
    const summary = db
      .prepare(
        `SELECT COUNT(*) AS total,
                COUNT(DISTINCT m.author_id) AS authors,
                COUNT(DISTINCT m.channel_id) AS channels,
                MIN(m.timestamp) AS first,
                MAX(m.timestamp) AS last,
                SUM(m.attachment_count) AS attachments,
                SUM(m.reaction_count) AS reactions,
                SUM(m.edited) AS edited,
                SUM(CASE WHEN m.reply_to_id <> '' THEN 1 ELSE 0 END) AS replies,
                AVG(length(m.content)) AS average_length
         FROM ${filter.from}${filter.where}`
      )
      .get(...filter.params) as Record<string, unknown> | undefined;
    const total = asNumber(summary?.total);
    const activity = db
      .prepare(
        `SELECT substr(m.timestamp, 1, 10) AS day, COUNT(*) AS count
         FROM ${filter.from}${filter.where}
         GROUP BY day
         ORDER BY day ASC`
      )
      .all(...filter.params) as Array<Record<string, unknown>>;
    const clock = db
      .prepare(
        `SELECT CAST(strftime('%w', m.timestamp) AS INTEGER) AS weekday,
                CAST(strftime('%H', m.timestamp) AS INTEGER) AS hour,
                COUNT(*) AS count
         FROM ${filter.from}${filter.where}
         GROUP BY weekday, hour
         ORDER BY weekday, hour`
      )
      .all(...filter.params) as Array<Record<string, unknown>>;
    const activeDays = activity.filter((row) => row.day).length;
    const activityRows = activity
      .filter((row) => row.day)
      .map((row) => ({
        day: sqlValue(row.day),
        count: asNumber(row.count),
      }));
    const clockRows = clock
      .filter(
        (row) =>
          Number.isInteger(row.weekday) && Number.isInteger(row.hour)
      )
      .map((row) => ({
        weekday: asNumber(row.weekday),
        hour: asNumber(row.hour),
        count: asNumber(row.count),
      }));

    const tableQuery = (
      table: string,
      alias: string,
      columns: string,
      groupBy: string,
      order: string,
      limit: number
    ) =>
      db
        .prepare(
          `SELECT ${columns}
           FROM ${table}
           JOIN messages m ON m.id = ${alias}.message_id${ftsJoin}${filter.where}
           GROUP BY ${groupBy}
           ORDER BY ${order}
           LIMIT ?`
        )
        .all(...filter.params, limit) as Array<Record<string, unknown>>;

    const attachmentTypes = tableQuery(
      "attachments a",
      "a",
      "a.content_type AS type, COUNT(*) AS count",
      "a.content_type",
      "count DESC, a.content_type ASC",
      12
    );
    const topReactions = tableQuery(
      "reactions r",
      "r",
      "r.emoji AS emoji, SUM(r.count) AS count",
      "r.emoji",
      "count DESC, r.emoji ASC",
      12
    );
    const topDomains = tableQuery(
      "links l",
      "l",
      "l.domain AS domain, COUNT(*) AS count",
      "l.domain",
      "count DESC, l.domain ASC",
      10
    );
    const topWords = tableQuery(
      "words w",
      "w",
      "w.word AS word, SUM(w.count) AS count",
      "w.word",
      "count DESC, w.word ASC",
      18
    );

    const attachmentMessages = db
      .prepare(
        `SELECT COUNT(DISTINCT a.message_id) AS count
         FROM attachments a JOIN messages m ON m.id = a.message_id${ftsJoin}${filter.where}`
      )
      .get(...filter.params) as { count?: number } | undefined;
    const linkMessages = db
      .prepare(
        `SELECT COUNT(DISTINCT l.message_id) AS count
         FROM links l JOIN messages m ON m.id = l.message_id${ftsJoin}${filter.where}`
      )
      .get(...filter.params) as { count?: number } | undefined;

    const medianOffset = Math.floor(total / 2);
    const median =
      total > 0
        ? (db
            .prepare(
              `SELECT length(m.content) AS len
               FROM ${filter.from}${filter.where}
               ORDER BY len ASC
               LIMIT 1 OFFSET ?`
            )
            .get(...filter.params, medianOffset) as
            | { len?: number }
            | undefined)
        : undefined;

    const messageShape =
      "m.id AS id, m.timestamp AS timestamp, m.author_name AS author_name, substr(m.content, 1, 220) AS content, length(m.content) AS length";
    const firstMessage = db
      .prepare(
        `SELECT ${messageShape}
         FROM ${filter.from}${filter.where}
         ORDER BY m.timestamp ASC, m.id ASC
         LIMIT 1`
      )
      .get(...filter.params) as Record<string, unknown> | undefined;
    const lastMessage = db
      .prepare(
        `SELECT ${messageShape}
         FROM ${filter.from}${filter.where}
         ORDER BY m.timestamp DESC, m.id DESC
         LIMIT 1`
      )
      .get(...filter.params) as Record<string, unknown> | undefined;
    const longestMessage = db
      .prepare(
        `SELECT ${messageShape}
         FROM ${filter.from}${filter.where}
         ORDER BY length(m.content) DESC, m.timestamp DESC
         LIMIT 1`
      )
      .get(...filter.params) as Record<string, unknown> | undefined;

    const gap = db
      .prepare(
        `SELECT timestamp, previous,
                (julianday(timestamp) - julianday(previous)) * 86400.0 AS seconds
         FROM (
           SELECT m.timestamp,
                  LAG(m.timestamp) OVER (ORDER BY m.timestamp, m.id) AS previous
           FROM ${filter.from}${filter.where}
         )
         WHERE previous IS NOT NULL
         ORDER BY seconds DESC, timestamp ASC
         LIMIT 1`
      )
      .get(...filter.params) as
      | { timestamp?: string; previous?: string; seconds?: number }
      | undefined;

    const lengthRows = db
      .prepare(
        `SELECT CASE
                  WHEN length(m.content) <= 50 THEN '1-50'
                  WHEN length(m.content) <= 140 THEN '51-140'
                  WHEN length(m.content) <= 280 THEN '141-280'
                  WHEN length(m.content) <= 1000 THEN '281-1000'
                  ELSE '1001+'
                END AS label,
                COUNT(*) AS count
         FROM ${filter.from}${filter.where}
         GROUP BY label`
      )
      .all(...filter.params) as Array<Record<string, unknown>>;
    const lengthMap = new Map(
      lengthRows.map((row) => [sqlValue(row.label), asNumber(row.count)])
    );
    const lengthBuckets = ["1-50", "51-140", "141-280", "281-1000", "1001+"].map(
      (label) => ({ label, count: lengthMap.get(label) ?? 0 })
    );

    const busiestDay = activityRows.reduce<{ day: string; count: number } | null>(
      (best, row) => (!best || row.count > best.count ? row : best),
      null
    );
    const busiestHour = clockRows.reduce<{
      weekday: number;
      hour: number;
      count: number;
    } | null>(
      (best, row) => (!best || row.count > best.count ? row : best),
      null
    );
    let longestStreak = 0;
    let currentStreak = 0;
    let previousDay = 0;
    for (const row of activityRows) {
      const day = Date.parse(`${row.day}T00:00:00Z`);
      if (!Number.isFinite(day)) continue;
      currentStreak =
        previousDay && day - previousDay === 86_400_000 ? currentStreak + 1 : 1;
      previousDay = day;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    }
    const nightMessages = clockRows
      .filter((row) => row.hour >= 0 && row.hour < 6)
      .reduce((sum, row) => sum + row.count, 0);

    return {
      scope: hasFilters(filters) ? "filtered" : "all",
      total,
      authors: asNumber(summary?.authors),
      channels: asNumber(summary?.channels),
      first_timestamp: (summary?.first as string | undefined) ?? null,
      last_timestamp: (summary?.last as string | undefined) ?? null,
      active_days: activeDays,
      attachments: asNumber(summary?.attachments),
      reactions: asNumber(summary?.reactions),
      edited: asNumber(summary?.edited),
      replies: asNumber(summary?.replies),
      average_length: round1(asNumber(summary?.average_length)),
      median_length: asNumber(median?.len),
      messages_per_active_day: activeDays
        ? round1(total / activeDays)
        : 0,
      night_share: total ? nightMessages / total : 0,
      reply_rate: total ? asNumber(summary?.replies) / total : 0,
      edit_rate: total ? asNumber(summary?.edited) / total : 0,
      attachment_rate: total
        ? asNumber(attachmentMessages?.count) / total
        : 0,
      link_rate: total ? asNumber(linkMessages?.count) / total : 0,
      longest_streak_days: longestStreak,
      busiest_day: busiestDay,
      busiest_hour: busiestHour,
      longest_gap:
        gap?.timestamp && gap.previous
          ? {
              seconds: round1(asNumber(gap.seconds)),
              from: gap.previous,
              to: gap.timestamp,
            }
          : null,
      longest_message:
        longestMessage && sqlValue(longestMessage.id)
          ? {
              id: sqlValue(longestMessage.id),
              author_name:
                sqlValue(longestMessage.author_name) || "unknown",
              length: asNumber(longestMessage.length),
              content: sqlValue(longestMessage.content),
            }
          : null,
      first_message:
        firstMessage && sqlValue(firstMessage.id)
          ? {
              id: sqlValue(firstMessage.id),
              timestamp: sqlValue(firstMessage.timestamp),
              author_name: sqlValue(firstMessage.author_name) || "unknown",
              content: sqlValue(firstMessage.content),
            }
          : null,
      last_message:
        lastMessage && sqlValue(lastMessage.id)
          ? {
              id: sqlValue(lastMessage.id),
              timestamp: sqlValue(lastMessage.timestamp),
              author_name: sqlValue(lastMessage.author_name) || "unknown",
              content: sqlValue(lastMessage.content),
            }
          : null,
      activity: activityRows,
      clock: clockRows,
      top_authors: facetQuery(
        db,
        "author",
        filter.from,
        filter.where,
        filter.params
      ).slice(0, 10),
      top_channels: facetQuery(
        db,
        "channel",
        filter.from,
        filter.where,
        filter.params
      ).slice(0, 10),
      attachment_types: attachmentTypes.map((row) => ({
        type: sqlValue(row.type) || "unknown",
        count: asNumber(row.count),
      })),
      top_reactions: topReactions.map((row) => ({
        emoji: sqlValue(row.emoji) || "unknown",
        count: asNumber(row.count),
      })),
      top_domains: topDomains.map((row) => ({
        domain: sqlValue(row.domain) || "unknown",
        count: asNumber(row.count),
      })),
      top_words: topWords.map((row) => ({
        word: sqlValue(row.word) || "unknown",
        count: asNumber(row.count),
      })),
      length_buckets: lengthBuckets,
    };
  } finally {
    db.close();
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
