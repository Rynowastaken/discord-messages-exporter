/**
 * Small persisted settings file for the console.
 *
 * Only server-side preferences live here; the Discord token never does.
 */
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { RUNS_DIR } from "./paths.js";

export interface AppSettings {
  output_dir: string;
}

const SETTINGS_PATH = join(dirname(RUNS_DIR), "settings.json");
let settings: AppSettings = { output_dir: "" };

function expandPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const expanded =
    trimmed === "~"
      ? homedir()
      : trimmed.startsWith("~/")
        ? join(homedir(), trimmed.slice(2))
        : trimmed;
  if (!isAbsolute(expanded)) {
    throw new Error("Use an absolute folder path, or leave it blank for the default.");
  }
  return resolve(expanded);
}

export function currentSettings(): AppSettings {
  return { ...settings };
}

export function configuredOutputDir(): string {
  return settings.output_dir;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const parsed = JSON.parse(await readFile(SETTINGS_PATH, "utf8")) as {
      output_dir?: unknown;
    };
    settings = {
      output_dir:
        typeof parsed.output_dir === "string" ? parsed.output_dir : "",
    };
  } catch {
    settings = { output_dir: "" };
  }
  return currentSettings();
}

async function validateOutputDir(value: string): Promise<string> {
  const directory = expandPath(value);
  if (!directory) return "";
  await mkdir(directory, { recursive: true });
  await access(directory, constants.W_OK);
  return directory;
}

export async function saveSettings(input: {
  output_dir?: unknown;
}): Promise<AppSettings> {
  const outputDir = await validateOutputDir(
    typeof input.output_dir === "string" ? input.output_dir : ""
  );
  const next: AppSettings = { output_dir: outputDir };
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  const tmp = `${SETTINGS_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await rename(tmp, SETTINGS_PATH);
  settings = next;
  return currentSettings();
}
