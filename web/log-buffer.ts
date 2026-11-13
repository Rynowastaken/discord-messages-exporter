/**
 * Bounded, redacted server log capture for the console's diagnostic download.
 *
 * Console output is mirrored into a small in-memory ring buffer. Token-like
 * values are scrubbed before storage, and the full Discord token is never
 * included in the generated file.
 */
import { format } from "node:util";

export type LogLevel = "info" | "warn" | "error";

export interface LogDumpMeta {
  version: string;
  tokenSource: string;
  tokenStorage: string;
  activeJobs: number;
  totalJobs: number;
}

interface LogEntry {
  at: string;
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 1200;
const MAX_CHARS = 600_000;
const MAX_MESSAGE_CHARS = 8000;

const entries: LogEntry[] = [];
let totalChars = 0;
let installed = false;

const originals = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const TOKEN_PATTERN =
  /(?<![A-Za-z0-9_-])(?:mfa\.[A-Za-z0-9_-]{40,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])/g;
const AUTH_HEADER_PATTERN =
  /(authorization\s*[:=]\s*)(?:bot\s+|bearer\s+)?[^\s,;]+/gi;
const KEY_VALUE_PATTERN =
  /((?:discord[_-]?token|auth[_-]?token|access[_-]?token|refresh[_-]?token|token|password|secret|api[_-]?key|client[_-]?secret)(?:["']?\s*[:=]\s*["']?))([A-Za-z0-9._~+/=-]{16,})/gi;
const BEARER_PATTERN = /(bearer\s+)[A-Za-z0-9._~+/=-]{10,}/gi;

export function redactLogText(value: string): string {
  return value
    .replace(TOKEN_PATTERN, "[redacted]")
    .replace(AUTH_HEADER_PATTERN, "$1[redacted]")
    .replace(KEY_VALUE_PATTERN, "$1[redacted]")
    .replace(BEARER_PATTERN, "$1[redacted]");
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.stack || arg.message;
      return format(arg, {
        colors: false,
        depth: 4,
        breakLength: 120,
        maxArrayLength: 60,
        maxStringLength: 4000,
      });
    })
    .join(" ");
}

function trimBuffer(): void {
  while (
    entries.length > MAX_ENTRIES ||
    (totalChars > MAX_CHARS && entries.length > 1)
  ) {
    const removed = entries.shift();
    if (!removed) break;
    totalChars -= removed.message.length;
  }
}

export function recordLog(level: LogLevel, message: string): void {
  const cleaned = redactLogText(message).slice(0, MAX_MESSAGE_CHARS);
  entries.push({
    at: new Date().toISOString(),
    level,
    message: cleaned,
  });
  totalChars += cleaned.length;
  trimBuffer();
}

export function installLogCapture(): void {
  if (installed) return;
  installed = true;

  console.log = (...args: unknown[]) => {
    recordLog("info", formatArgs(args));
    originals.log(...args);
  };
  console.info = (...args: unknown[]) => {
    recordLog("info", formatArgs(args));
    originals.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    recordLog("warn", formatArgs(args));
    originals.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    recordLog("error", formatArgs(args));
    originals.error(...args);
  };

  process.on("uncaughtExceptionMonitor", (error) => {
    recordLog(
      "error",
      `Uncaught exception: ${error.stack || error.message}`
    );
  });

  recordLog("info", "Log capture started");
}

function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours) return `${hours}h ${minutes}m ${rest}s`;
  if (minutes) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

export function buildLogDump(meta: LogDumpMeta): string {
  const header = [
    "Discord Messages Exporter diagnostic log",
    `Generated: ${new Date().toISOString()}`,
    `Version: ${meta.version}`,
    `Platform: ${process.platform} ${process.arch}`,
    `Node: ${process.version}`,
    `Uptime: ${formatUptime(process.uptime())}`,
    `Token source: ${meta.tokenSource || "unknown"}`,
    `Token storage: ${meta.tokenStorage || "unknown"}`,
    `Jobs: ${meta.activeJobs} active / ${meta.totalJobs} total`,
    "",
    "Recent activity:",
  ];
  if (!entries.length) {
    header.push("(no entries captured)");
  } else {
    for (const entry of entries) {
      const lines = entry.message.split(/\r?\n/);
      header.push(
        `[${entry.at}] ${entry.level.toUpperCase().padEnd(5)} ${lines[0]}`
      );
      for (const line of lines.slice(1)) {
        header.push(`                           ${line}`);
      }
    }
  }
  return `${header.join("\n")}\n`;
}
