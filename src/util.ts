/**
 * Snowflake and formatting helpers.
 *
 * A Discord snowflake packs a millisecond timestamp in its high bits, and ids
 * are larger than Number.MAX_SAFE_INTEGER, so every id stays a bigint.
 */
export const DISCORD_EPOCH_MS = 1420070400000n;

export type Snowflake = bigint;
export type SnowflakeInput = bigint | string | number;

export function toSnowflake(value: SnowflakeInput): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`snowflake ${value} exceeds the safe integer range`);
    }
    return BigInt(value);
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`${value} is not a numeric Discord id`);
  }
  return BigInt(text);
}

export function snowflakeTime(value: SnowflakeInput): Date {
  return new Date(Number((toSnowflake(value) >> 22n) + DISCORD_EPOCH_MS));
}

export function snowflakeAt(date: Date): bigint {
  const ms = BigInt(Math.floor(date.getTime())) - DISCORD_EPOCH_MS;
  return (ms < 0n ? 0n : ms) << 22n;
}

export function parseDate(value: string): Date {
  const text = value.trim();
  if (!text) throw new Error("a date is required");
  let normalized = text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized += "T00:00:00Z";
  } else if (
    !/[zZ]$/.test(normalized) &&
    !/[+-]\d{2}:\d{2}$/.test(normalized)
  ) {
    normalized += "Z";
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`could not parse date: ${value}`);
  }
  return date;
}

export function humanDuration(seconds: number): string {
  const total = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) {
    return `${hours}h${String(minutes).padStart(2, "0")}m`;
  }
  if (minutes) {
    return `${minutes}m${String(secs).padStart(2, "0")}s`;
  }
  return `${secs}s`;
}

/**
 * Split ``[loId, hiId)`` into ``count`` contiguous ranges. The returned pairs
 * tile the interval with no gap and no overlap.
 */
export function splitRanges(
  loId: bigint,
  hiId: bigint,
  count: number
): Array<[bigint, bigint]> {
  if (count < 1) throw new Error("count must be >= 1");
  if (hiId <= loId) return [];
  const span = hiId - loId;
  const width = BigInt(count);
  const edges: bigint[] = [];
  for (let index = 0; index <= count; index += 1) {
    edges.push(loId + (span * BigInt(index)) / width);
  }
  edges[0] = loId;
  edges[count] = hiId;
  const ranges: Array<[bigint, bigint]> = [];
  for (let index = 0; index < count; index += 1) {
    ranges.push([edges[index], edges[index + 1]]);
  }
  return ranges;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

export class StopSignal {
  private stopped = false;
  private readonly waiters: Array<() => void> = [];

  set(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const waiter of this.waiters.splice(0)) waiter();
  }

  isSet(): boolean {
    return this.stopped;
  }

  wait(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

