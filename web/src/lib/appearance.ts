/**
 * Appearance engine inherited from the NUTC portal.
 *
 * The palette is generated in OKLCH from the portal's five source colors so a
 * scheme changes the hue relationships without losing the site's contrast.
 * Background images are dimmed, tinted, and optionally blurred behind the
 * glass, exactly like the portal's backdrop controls.
 */
import type { AppearanceSettings, ColorScheme } from "../types";

interface SchemeDefinition {
  name: string;
  chroma: number;
  hueOffsets: [number, number, number];
  chromaLimit?: number;
  chromaFloor?: number;
}

export const COLOR_SCHEMES: Record<ColorScheme, SchemeDefinition> = {
  content: { name: "Content", chroma: 1, hueOffsets: [0, 0, 0] },
  expressive: {
    name: "Expressive",
    chroma: 1.15,
    hueOffsets: [0, 75, 35],
  },
  fidelity: { name: "Fidelity", chroma: 1.05, hueOffsets: [0, 0, 0] },
  monochrome: { name: "Monochrome", chroma: 0, hueOffsets: [0, 0, 0] },
  neutral: {
    name: "Neutral",
    chroma: 0.16,
    hueOffsets: [0, 0, 0],
    chromaLimit: 0.035,
  },
  tonalSpot: {
    name: "Tonal Spot",
    chroma: 0.72,
    hueOffsets: [0, 0, 0],
    chromaLimit: 0.14,
  },
  vibrant: {
    name: "Vibrant",
    chroma: 1.5,
    hueOffsets: [0, 0, 0],
    chromaFloor: 0.12,
  },
  rainbow: {
    name: "Rainbow",
    chroma: 1.2,
    hueOffsets: [0, 110, 220],
    chromaFloor: 0.1,
  },
  fruitSalad: {
    name: "Fruit Salad",
    chroma: 1.25,
    hueOffsets: [-50, 50, 0],
    chromaFloor: 0.09,
  },
};

export const COLOR_SCHEME_ORDER: ColorScheme[] = [
  "tonalSpot",
  "vibrant",
  "expressive",
  "rainbow",
  "fruitSalad",
  "content",
  "fidelity",
  "neutral",
  "monochrome",
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  scheme: "tonalSpot",
  colorfulness: 1,
  brightness: 1,
  background_brightness: 100,
  background_blur: 0,
};

const SOURCE_PALETTE = ["#f0a8c8", "#e8b86d", "#51314a", "#f07178", "#151018"];
const BACKDROP_CANVAS = "#17121b";
const MAX_BACKGROUND_BLUR_PX = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = String(hex || "").replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    g: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    b: Number.parseInt(normalized.slice(4, 6), 16) || 0,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((value) =>
        Math.round(clamp(Number(value) || 0, 0, 255))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function rgbToOklab(r: number, g: number, b: number) {
  const red = srgbToLinear(r);
  const green = srgbToLinear(g);
  const blue = srgbToLinear(b);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const lightness =
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const labB =
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const chroma = Math.hypot(a, labB);
  const hue = (Math.atan2(labB, a) * 180) / Math.PI;
  return { lightness, a, b: labB, chroma, hue: (hue + 360) % 360 };
}

function linearToSrgb(channel: number): number {
  const value =
    channel <= 0.0031308
      ? 12.92 * channel
      : 1.055 * channel ** (1 / 2.4) - 0.055;
  return clamp(value * 255, 0, 255);
}

function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const labB = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * labB;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * labB;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * labB;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return rgbToHex(
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  );
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function readableText(background: string): string {
  return contrastRatio("#17121b", background) >= 4.5
    ? "#17121b"
    : "#fff8fc";
}

function ensureColorContrast(
  color: string,
  background = "#17121b",
  minimumRatio = 4.5
): string {
  if (contrastRatio(color, background) >= minimumRatio) return color;
  const { r, g, b } = hexToRgb(color);
  const lab = rgbToOklab(r, g, b);
  for (
    let lightness = lab.lightness + 0.015;
    lightness <= 0.94;
    lightness += 0.015
  ) {
    const candidate = oklchToHex(lightness, lab.chroma, lab.hue);
    if (contrastRatio(candidate, background) >= minimumRatio) {
      return candidate;
    }
  }
  return color;
}

function normalizeAppearance(
  appearance: AppearanceSettings
): AppearanceSettings {
  const scheme = COLOR_SCHEMES[appearance.scheme]
    ? appearance.scheme
    : DEFAULT_APPEARANCE.scheme;
  return {
    scheme,
    colorfulness: clamp(Number(appearance.colorfulness) || 1, 0.5, 1.5),
    brightness: clamp(Number(appearance.brightness) || 1, 0.5, 1.5),
    background_brightness: clamp(
      Number(appearance.background_brightness) || 0,
      0,
      200
    ),
    background_blur: clamp(Number(appearance.background_blur) || 0, 0, 100),
  };
}

export function paletteFor(
  appearance: AppearanceSettings
): [string, string, string, string, string] {
  const settings = normalizeAppearance(appearance);
  const mode = COLOR_SCHEMES[settings.scheme];
  const lightnessOffset = (settings.brightness - 1) * 0.18;
  const generated = SOURCE_PALETTE.map((color, index) => {
    if (index === 3) return color;
    const { r, g, b } = hexToRgb(color);
    const lab = rgbToOklab(r, g, b);
    const roleIndex = Math.min(index, 2);
    const hue = (lab.hue + mode.hueOffsets[roleIndex] + 360) % 360;
    let chroma = lab.chroma * mode.chroma * settings.colorfulness;
    if (mode.chromaFloor && lab.chroma >= 0.025) {
      chroma = Math.max(chroma, mode.chromaFloor * settings.colorfulness);
    }
    if (mode.chromaLimit !== undefined) {
      chroma = Math.min(chroma, mode.chromaLimit * settings.colorfulness);
    }
    if (index === 4) chroma *= 0.55;
    return oklchToHex(
      clamp(lab.lightness + lightnessOffset, 0.2, 0.94),
      chroma,
      hue
    );
  });
  generated[0] = ensureColorContrast(generated[0], BACKDROP_CANVAS, 4.5);
  generated[1] = ensureColorContrast(generated[1]);
  return generated as [string, string, string, string, string];
}

function backdropImage(
  palette: [string, string, string, string, string],
  backgroundUrl: string | null,
  appearance: AppearanceSettings
): { image: string; filter: string; margin: string } {
  const primary = palette[0];
  const accent = palette[1];
  if (!backgroundUrl) {
    return {
      image:
        `radial-gradient(ellipse 72% 48% at 12% -6%, ${hexToRgba(
          primary,
          0.16
        )}, transparent 66%), ` +
        `radial-gradient(ellipse 54% 44% at 88% 4%, ${hexToRgba(
          accent,
          0.09
        )}, transparent 68%), ` +
        "linear-gradient(180deg, #17121b 0%, #100d13 58%, #09080a 100%)",
      filter: "",
      margin: "",
    };
  }

  const level = clamp(
    Math.round(appearance.background_brightness / 5) * 5,
    0,
    200
  );
  const darken = Math.max(0, (100 - level) / 100);
  const brighten = Math.max(0, (level - 100) / 100);
  const topOpacity = (0.68 + 0.3 * darken - 0.58 * brighten).toFixed(3);
  const bottomOpacity = (0.88 + 0.11 * darken - 0.68 * brighten).toFixed(3);
  const blurPx =
    (clamp(Math.round(appearance.background_blur / 5) * 5, 0, 100) / 100) *
    MAX_BACKGROUND_BLUR_PX;
  return {
    image:
      `linear-gradient(180deg, rgba(12,10,14,${topOpacity}), ` +
      `rgba(12,10,14,${bottomOpacity})), ` +
      `radial-gradient(ellipse 80% 60% at 50% 0%, ${hexToRgba(
        primary,
        0.14
      )}, transparent 56%), ` +
      `url("${backgroundUrl.replace(/"/g, "%22")}")`,
    filter: blurPx ? `blur(${blurPx}px)` : "",
    margin: blurPx ? `${-2 * blurPx}px` : "",
  };
}

export function applyAppearance(
  appearance: AppearanceSettings,
  backgroundUrl: string | null
): void {
  const palette = paletteFor(appearance);
  const [primary, accent, secondary, danger, neutral] = palette;
  const root = document.documentElement;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--secondary", secondary);
  root.style.setProperty("--danger", danger);
  root.style.setProperty("--neutral", neutral);
  root.style.setProperty("--primary-soft", hexToRgba(primary, 0.14));
  root.style.setProperty("--primary-ring", hexToRgba(primary, 0.42));
  root.style.setProperty("--accent-soft", hexToRgba(accent, 0.12));
  root.style.setProperty("--control-bg", primary);
  root.style.setProperty("--control-border", hexToRgba(primary, 0.72));
  root.style.setProperty("--control-text", readableText(primary));
  root.style.setProperty("--control-hover-bg", accent);
  root.style.setProperty("--control-hover-border", hexToRgba(accent, 0.78));
  root.style.setProperty("--control-hover-text", readableText(accent));
  root.style.setProperty("--backdrop-primary", primary);
  root.style.setProperty("--backdrop-accent", accent);

  const backdrop = document.querySelector<HTMLElement>(".app-backdrop");
  if (backdrop) {
    const { image, filter, margin } = backdropImage(
      palette,
      backgroundUrl,
      appearance
    );
    backdrop.style.backgroundImage = image;
    backdrop.style.filter = filter;
    backdrop.style.margin = margin;
  }
}

export function resetAppearance(): void {
  applyAppearance(DEFAULT_APPEARANCE, null);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolveValue, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolveValue(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale a chosen image before upload: 1280px on the longest side, JPEG
 * quality .72. This keeps settings small while staying sharp on 4K displays.
 */
export async function prepareBackgroundImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("That image is larger than 25 MB. Choose a smaller one.");
  }
  const source = await fileToDataUrl(file);
  const image = new Image();
  await new Promise<void>((resolveValue, reject) => {
    image.onload = () => resolveValue();
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = source;
  });
  const maxSize = 1280;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot prepare the image.");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
