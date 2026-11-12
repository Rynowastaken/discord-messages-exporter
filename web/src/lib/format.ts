export function fmt(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return "—";
  return number.toLocaleString("en-US");
}

export function compact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (Math.abs(n) >= 10_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return fmt(n);
}

export function plural(
  value: number | string | null | undefined,
  one: string,
  many: string
): string {
  const n = Number(value) || 0;
  return `${fmt(n)} ${n === 1 ? one : many}`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function bytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let n = Number(value);
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit += 1;
  }
  return `${n.toFixed(n >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function shortDate(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 10) : "—";
}

export function snowflakeDate(
  value: string | number | bigint | null | undefined
): string {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const ms = (BigInt(value) >> 22n) + 1420070400000n;
    return new Date(Number(ms)).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export function dateSpan(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  return `${shortDate(first)} → ${shortDate(last)}`;
}

export function percent(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

export function runTint(run: { tint?: string | null; id?: string } | null): "primary" | "accent" {
  if (run?.tint === "primary" || run?.tint === "accent") return run.tint;
  return run?.id === "r_yno" ? "primary" : "accent";
}
