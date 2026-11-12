/** Shared on-disk locations for the exporter, server, and export explorer. */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(start: string): string {
  let directory = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (
      existsSync(join(directory, "package.json")) &&
      existsSync(join(directory, "web"))
    ) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return start;
}

// A Node SEA bundle is CommonJS, so import.meta.url is not available there.
// The desktop launcher supplies explicit directories in that case.
const MODULE_DIR =
  typeof __dirname === "string"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = findRepoRoot(MODULE_DIR);
export const WEB_DIR = join(REPO_DIR, "web");

function configuredPath(envNames: string[], fallback: string): string {
  for (const envName of envNames) {
    const configured = (process.env[envName] ?? "").trim();
    if (configured) return resolve(configured);
  }
  return fallback;
}

export const DIST_DIR = configuredPath(
  ["DISCORD_MESSAGES_EXPORTER_DIST", "DISCORD_AUTHOR_EXPORT_DIST"],
  join(WEB_DIR, "dist")
);

export const RUNS_DIR = configuredPath(
  ["DISCORD_MESSAGES_EXPORTER_RUNS", "DISCORD_AUTHOR_EXPORT_RUNS"],
  join(WEB_DIR, "runs")
);
export const EXPORTS_DIR = configuredPath(
  ["DISCORD_MESSAGES_EXPORTER_EXPORTS", "DISCORD_AUTHOR_EXPORT_EXPORTS"],
  join(WEB_DIR, "exports")
);
