/**
 * Small persisted settings file for the console.
 *
 * Only server-side preferences live here; the Discord token never does. The
 * appearance block mirrors the NUTC portal's theme controls: a generated
 * palette plus an optional background image with its own brightness and blur.
 */
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { RUNS_DIR } from "./paths.js";

export const COLOR_SCHEMES = [
  "content",
  "expressive",
  "fidelity",
  "monochrome",
  "neutral",
  "tonalSpot",
  "vibrant",
  "rainbow",
  "fruitSalad",
] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export interface AppearanceSettings {
  scheme: ColorScheme;
  colorfulness: number;
  brightness: number;
  background_brightness: number;
  background_blur: number;
}

export interface AppSettings {
  output_dir: string;
  appearance: AppearanceSettings;
  background_url: string | null;
  background_type: string | null;
}

interface StoredBackground {
  content_type: string;
  updated_at: string;
}

interface StoredSettings {
  output_dir: string;
  appearance: AppearanceSettings;
  background: StoredBackground | null;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  scheme: "tonalSpot",
  colorfulness: 1,
  brightness: 1,
  background_brightness: 100,
  background_blur: 0,
};

export const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;
/** Enough room for an 8 MiB JPEG as base64 plus the JSON envelope. */
export const MAX_SETTINGS_BODY = 12 * 1024 * 1024;

const SETTINGS_PATH = join(dirname(RUNS_DIR), "settings.json");
const BACKGROUND_PATH = join(dirname(RUNS_DIR), "appearance-background.bin");
const BACKGROUND_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

let settings: StoredSettings = {
  output_dir: "",
  appearance: { ...DEFAULT_APPEARANCE },
  background: null,
};

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

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  step = 0
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  const stepped = step > 0 ? Math.round(numeric / step) * step : numeric;
  return Number(
    Math.min(max, Math.max(min, stepped)).toFixed(
      step > 0 && step < 1 ? 2 : 0
    )
  );
}

function normalizeAppearance(value: unknown): AppearanceSettings {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const scheme = COLOR_SCHEMES.includes(input.scheme as ColorScheme)
    ? (input.scheme as ColorScheme)
    : DEFAULT_APPEARANCE.scheme;
  return {
    scheme,
    colorfulness: clampNumber(
      input.colorfulness,
      0.5,
      1.5,
      DEFAULT_APPEARANCE.colorfulness,
      0.05
    ),
    brightness: clampNumber(
      input.brightness,
      0.5,
      1.5,
      DEFAULT_APPEARANCE.brightness,
      0.05
    ),
    background_brightness: clampNumber(
      input.background_brightness,
      0,
      200,
      DEFAULT_APPEARANCE.background_brightness,
      5
    ),
    background_blur: clampNumber(
      input.background_blur,
      0,
      100,
      DEFAULT_APPEARANCE.background_blur,
      5
    ),
  };
}

function backgroundUrl(background: StoredBackground | null): string | null {
  if (!background) return null;
  return `/api/settings/background?v=${encodeURIComponent(
    background.updated_at
  )}`;
}

export function currentSettings(): AppSettings {
  return {
    output_dir: settings.output_dir,
    appearance: { ...settings.appearance },
    background_url: backgroundUrl(settings.background),
    background_type: settings.background?.content_type ?? null,
  };
}

export function configuredOutputDir(): string {
  return settings.output_dir;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const parsed = JSON.parse(await readFile(SETTINGS_PATH, "utf8")) as {
      output_dir?: unknown;
      appearance?: unknown;
      background?: unknown;
    };
    const background =
      parsed.background &&
      typeof parsed.background === "object" &&
      typeof (parsed.background as StoredBackground).content_type === "string" &&
      typeof (parsed.background as StoredBackground).updated_at === "string"
        ? (parsed.background as StoredBackground)
        : null;
    settings = {
      output_dir:
        typeof parsed.output_dir === "string" ? parsed.output_dir : "",
      appearance: normalizeAppearance(parsed.appearance),
      background,
    };
  } catch {
    settings = {
      output_dir: "",
      appearance: { ...DEFAULT_APPEARANCE },
      background: null,
    };
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

function parseBackgroundDataUrl(value: string): {
  bytes: Buffer;
  contentType: string;
} {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(
    value.trim()
  );
  if (!match) {
    throw new Error("Background must be a PNG, JPEG, or WebP image.");
  }
  const contentType = match[1].toLowerCase();
  if (!BACKGROUND_TYPES.has(contentType)) {
    throw new Error("Background must be a PNG, JPEG, or WebP image.");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) {
    throw new Error("The background image is empty.");
  }
  if (bytes.length > MAX_BACKGROUND_BYTES) {
    throw new Error("The background image is too large. Use one under 8 MB.");
  }
  return { bytes, contentType };
}

export async function readBackground(): Promise<{
  body: Buffer;
  contentType: string;
} | null> {
  if (!settings.background) return null;
  try {
    const body = await readFile(BACKGROUND_PATH);
    if (!body.length) return null;
    return { body, contentType: settings.background.content_type };
  } catch {
    return null;
  }
}

export async function saveSettings(input: {
  output_dir?: unknown;
  appearance?: unknown;
  background_data_url?: unknown;
}): Promise<AppSettings> {
  const outputDir = await validateOutputDir(
    typeof input.output_dir === "string"
      ? input.output_dir
      : settings.output_dir
  );
  const appearance =
    input.appearance === undefined
      ? { ...settings.appearance }
      : normalizeAppearance(input.appearance);

  let background = settings.background;
  let backgroundBytes: Buffer | null = null;
  let clearBackground = false;

  if (input.background_data_url === null) {
    background = null;
    clearBackground = true;
  } else if (typeof input.background_data_url === "string") {
    const data = input.background_data_url.trim();
    if (data) {
      const parsed = parseBackgroundDataUrl(data);
      backgroundBytes = parsed.bytes;
      background = {
        content_type: parsed.contentType,
        updated_at: new Date().toISOString(),
      };
    }
  }

  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  if (backgroundBytes) {
    const tmp = `${BACKGROUND_PATH}.tmp`;
    await writeFile(tmp, backgroundBytes);
    await rename(tmp, BACKGROUND_PATH);
  } else if (clearBackground) {
    await unlink(BACKGROUND_PATH).catch(() => undefined);
  }

  const next: StoredSettings = {
    output_dir: outputDir,
    appearance,
    background,
  };
  const tmp = `${SETTINGS_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await rename(tmp, SETTINGS_PATH);
  settings = next;
  return currentSettings();
}
