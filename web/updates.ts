/**
 * GitHub release checks for the in-app updater panel.
 *
 * No credentials are ever returned to the browser. A GITHUB_TOKEN is only
 * used server-side when the release repository is private.
 */
import { VERSION } from "../src/version.js";

const REPOSITORY =
  (process.env.DISCORD_MESSAGES_EXPORTER_UPDATE_REPO ?? "").trim() ||
  "Rynowastaken/discord-messages-exporter";
const CACHE_MS = 5 * 60 * 1000;

export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  published_at: string | null;
  assets: UpdateAsset[];
  checked_at: string;
  repository: string;
  error: string | null;
}

let cached: { at: number; info: UpdateInfo } | null = null;

function versionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function isNewer(latest: string, current: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(current);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

export async function checkForUpdates(force = false): Promise<UpdateInfo> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    return cached.info;
  }
  const checkedAt = new Date().toISOString();
  const token = (process.env.GITHUB_TOKEN ?? "").trim();
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "discord-messages-exporter",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "No release was found. For a private repository, set GITHUB_TOKEN on the server."
          : `GitHub returned ${response.status}.`
      );
    }
    const release = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      published_at?: string;
      assets?: Array<{
        name?: string;
        browser_download_url?: string;
        size?: number;
      }>;
    };
    const latest = (release.tag_name ?? "").replace(/^v/i, "") || null;
    const assets = (release.assets ?? [])
      .map((asset) => ({
        name: asset.name ?? "",
        url: asset.browser_download_url ?? "",
        size: Number(asset.size) || 0,
      }))
      .filter((asset) => asset.name && asset.url);
    const info: UpdateInfo = {
      current_version: VERSION,
      latest_version: latest,
      update_available: Boolean(latest && isNewer(latest, VERSION)),
      release_url: release.html_url ?? null,
      published_at: release.published_at ?? null,
      assets,
      checked_at: checkedAt,
      repository: REPOSITORY,
      error: null,
    };
    cached = { at: Date.now(), info };
    return info;
  } catch (err) {
    const info: UpdateInfo = {
      current_version: VERSION,
      latest_version: null,
      update_available: false,
      release_url: null,
      published_at: null,
      assets: [],
      checked_at: checkedAt,
      repository: REPOSITORY,
      error: err instanceof Error ? err.message : String(err),
    };
    cached = { at: Date.now(), info };
    return info;
  }
}
