/** Read-only directory listing for the in-app export-folder picker. */
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  home: string;
  entries: DirectoryEntry[];
  truncated: boolean;
  error: string | null;
}

function expandPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return homedir();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return join(homedir(), trimmed.slice(2));
  }
  if (!isAbsolute(trimmed)) {
    return resolve(homedir(), trimmed);
  }
  return resolve(trimmed);
}

export async function listDirectories(input: string): Promise<DirectoryListing> {
  const path = expandPath(input);
  const listing: DirectoryListing = {
    path,
    parent: dirname(path) === path ? null : dirname(path),
    home: homedir(),
    entries: [],
    truncated: false,
    error: null,
  };
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return { ...listing, error: "That path is a file, not a folder." };
    }
    const entries = await readdir(path, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    return {
      ...listing,
      entries: directories.slice(0, 500),
      truncated: directories.length > 500,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ...listing,
      error:
        code === "ENOENT"
          ? "That folder does not exist."
          : code === "EACCES" || code === "EPERM"
            ? "Permission denied for that folder."
            : err instanceof Error
              ? err.message
              : String(err),
    };
  }
}
