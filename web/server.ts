#!/usr/bin/env node
/**
 * Local web console for discord-messages-exporter.
 *
 * Serves the built React app and a small JSON API that runs the exporter
 * in-process. Jobs keep their work directory under web/runs/<id>/work, so
 * stopping and resuming uses the exporter's own done markers.
 *
 * The Discord token is read from DISCORD_TOKEN or from the job request. It is
 * held only in memory for the life of the job and is never written to disk,
 * logged, or included in API responses.
 */
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
} from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DIST_DIR, RUNS_DIR } from "./paths.js";
import {
  clearStoredToken,
  readStoredToken,
  tokenStorage,
  writeStoredToken,
} from "./token-store.js";
import {
  discardImport,
  ensureIndexed,
  finalizeImport,
  getExport,
  getExportDirectory,
  getExportKind,
  getExportSourcePath,
  hideJobExport,
  listExports,
  prepareImport,
  queryFacets,
  queryMessage,
  queryMessages,
  queryStats,
  refreshExports,
  reindexExport,
  removeImport,
  type ExportFilters,
  type MessageContentKind,
} from "./exports.js";
import {
  DiscordClient,
  DiscordError,
  type DiscordChannel,
  type DiscordGuild,
  type DiscordUser,
} from "../src/api.js";
import { mergeLines, type AssemblyResult } from "../src/assemble.js";
import {
  Crawler,
  discoverAuthor,
  type AuthorInfo,
  type CrawlConfig,
  type CrawlReport,
  type CrawlStats,
} from "../src/crawl.js";
import {
  parseDate,
  snowflakeAt,
  splitRanges,
  StopSignal,
  toSnowflake,
} from "../src/util.js";
import { VERSION } from "../src/version.js";
import {
  configuredOutputDir,
  currentSettings,
  loadSettings,
  MAX_SETTINGS_BODY,
  readBackground,
  saveSettings,
} from "./settings.js";
import { checkForUpdates } from "./updates.js";
import { listDirectories } from "./fs-browser.js";
import { buildLogDump, installLogCapture } from "./log-buffer.js";
import {
  downloadExportAttachments,
  readAttachmentManifest,
  type AttachmentDownloadStats,
} from "../src/attachments.js";

let storedToken: { token: string; isBot: boolean } | null = null;

function environmentToken(): string {
  return (process.env.DISCORD_TOKEN ?? "").trim();
}

function environmentTokenIsBot(): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env.DISCORD_TOKEN_IS_BOT ?? "").trim().toLowerCase()
  );
}

function serverToken(): string {
  return environmentToken() || storedToken?.token || "";
}

function serverTokenIsBot(): boolean {
  return environmentToken() ? environmentTokenIsBot() : storedToken?.isBot ?? false;
}

function tokenSource(): "env" | "stored" | "none" {
  if (environmentToken()) return "env";
  return storedToken ? "stored" : "none";
}
const MAX_JOBS = 25;
const MAX_BODY = 64 * 1024;
const MAX_EXPORT_BYTES = Math.max(
  1,
  Number(
    process.env.DISCORD_MESSAGES_EXPORTER_MAX_BYTES ??
      process.env.DISCORD_AUTHOR_EXPORT_MAX_BYTES
  ) || 2 * 1024 * 1024 * 1024
);
const TERMINAL = new Set([
  "done",
  "partial",
  "failed",
  "stopped",
  "empty",
]);
const ACTIVE = new Set(["queued", "resolving", "running", "stopping"]);
const MODES = new Set(["author", "channel", "server"]);
const TEXT_CHANNEL_TYPES = new Set([0, 5]);

export type ClientFactory = (
  token: string,
  options: { rate?: number; isBot?: boolean }
) => DiscordClient;

let clientFactory: ClientFactory = (token, options) =>
  new DiscordClient(token, options);

/** Replace the Discord client constructor. Tests use this; production does not. */
export function setClientFactory(factory: ClientFactory | null): void {
  clientFactory =
    factory ??
    ((token, options) => new DiscordClient(token, options));
}

function createClient(
  token: string,
  options: { rate?: number; isBot?: boolean }
): DiscordClient {
  return clientFactory(token, options);
}

type Mode = "author" | "channel" | "server";
type Json = Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

function text(value: unknown): string {
  return value === null || value === undefined
    ? ""
    : String(value).trim();
}

function asInt(
  value: unknown,
  fallback: number,
  low: number,
  high: number
): number {
  const number =
    typeof value === "number" ? value : Number.parseInt(text(value), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(low, Math.min(high, Math.trunc(number)));
}

function asFloat(
  value: unknown,
  fallback: number,
  low: number,
  high: number
): number {
  const number =
    typeof value === "number" ? value : Number.parseFloat(text(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(low, Math.min(high, number));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

interface JobStatsPayload extends Json {
  ranges_total: number;
  ranges_done: number;
  pages: number;
  messages_scanned: number;
  messages_matched: number;
  rate_limited: number;
  elapsed: number;
  pages_per_second: number;
  errors: number;
}

function statsPayload(stats: CrawlStats): JobStatsPayload {
  return {
    ranges_total: stats.rangesTotal,
    ranges_done: stats.rangesDone,
    pages: stats.pages,
    messages_scanned: stats.messagesScanned,
    messages_matched: stats.messagesMatched,
    rate_limited: stats.rateLimited,
    elapsed: round(stats.elapsed, 1),
    pages_per_second: round(stats.pagesPerSecond, 2),
    errors: stats.errors.length,
  };
}

interface ChannelOption {
  id: string;
  name: string;
}

/** Guild channels that carry ordinary message history, in display order. */
export function textChannels(channels: DiscordChannel[] | null | undefined): ChannelOption[] {
  const selected: Array<ChannelOption & { position: number }> = [];
  for (const channel of channels ?? []) {
    const kind = Number(channel.type ?? -1);
    if (!TEXT_CHANNEL_TYPES.has(kind)) continue;
    const channelId = text(channel.id);
    if (!channelId) continue;
    const position = Number(channel.position ?? 0);
    selected.push({
      id: channelId,
      name: text(channel.name) || channelId,
      position: Number.isFinite(position) ? position : 0,
    });
  }
  selected.sort((a, b) =>
    a.position === b.position
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.position - b.position
  );
  return selected.map((channel) => ({
    id: channel.id,
    name: channel.name,
  }));
}

function guildIconUrl(
  guildId: string,
  iconHash: string | null | undefined,
  size = 64
): string | null {
  if (!iconHash) return null;
  const extension = iconHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${extension}?size=${size}`;
}

function userAvatarUrl(
  userId: string,
  avatarHash: string | null | undefined,
  size = 64
): string {
  if (!avatarHash) {
    let index = 0;
    try {
      index = Number((toSnowflake(userId) >> 22n) % 6n);
    } catch {
      index = 0;
    }
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const extension = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}?size=${size}`;
}

function authorInfoPayload(info: AuthorInfo): Json {
  return {
    total_results: info.totalResults,
    first_timestamp: info.firstTimestamp,
    first_id: info.firstId,
    last_timestamp: info.lastTimestamp,
    last_id: info.lastId,
  };
}

interface JobConfig {
  mode: Mode;
  channel: string;
  author: string;
  server: string;
  since: string;
  until: string;
  ranges: number;
  workers: number;
  rate: number;
  include_attachments: boolean;
  download_attachments: boolean;
  check_total: boolean;
  is_bot: boolean;
  output_dir: string;
}

interface ChannelPlan {
  id: string;
  name: string;
  lo: bigint;
  hi: bigint;
  ranges: number;
  range_count: number;
}

interface ChannelState extends ChannelOption {
  status: string;
  ranges_total: number;
  ranges_done: number;
  pages: number;
  matched: number;
  scanned: number;
}

interface RangePayload {
  index: number;
  lo: string | null;
  hi: string | null;
  pages: number;
  matched: number;
  share?: number;
}

interface ThroughputSample {
  t: number;
  pages: number;
}

export class Job {
  readonly id: string;
  readonly createdAt: string;
  readonly config: JobConfig;
  readonly jobDir: string;
  readonly workdir: string;
  readonly outPath: string;

  token: string;
  tokenSource: "request" | "server" | "none";
  status = "queued";
  stage = "queued";
  channel: { id: string; name: string | null } | null = null;
  guild: { id: string; name: string | null } | null = null;
  author: {
    id: string | null;
    username: string | null;
    global_name: string | null;
  } | null = null;
  channels: ChannelState[] = [];
  info: Json | null = null;
  stats: JobStatsPayload | Json = {};
  ranges: RangePayload[] = [];
  throughput: ThroughputSample[] = [];
  assembly: Json | null = null;
  attachmentDownload: AttachmentDownloadStats | null = null;
  attachmentError: string | null = null;
  savedTo: string | null = null;
  saveError: string | null = null;
  error: string | null = null;
  errors: string[] = [];
  startedAt: string | null = null;
  finishedAt: string | null = null;
  stopSignal = new StopSignal();

  private running = false;
  private client: DiscordClient | null = null;
  private plannedRanges = 0;
  private runStartPages = 0;
  private runStarted = 0;
  private finalChannels = new Set<string>();
  private rangesRefreshing = false;
  private multiRefreshing = false;

  constructor(payload: Json) {
    this.id = randomBytes(6).toString("hex");
    this.createdAt = nowIso();
    let mode = text(payload.mode || "author").toLowerCase();
    if (!MODES.has(mode)) mode = "author";
    const selectedMode = mode as Mode;
    const token = text(payload.token);
    this.config = {
      mode: selectedMode,
      channel: text(payload.channel),
      author:
        selectedMode === "author" ? text(payload.author) : "",
      server:
        selectedMode === "server" ? text(payload.server) : "",
      since: text(payload.since),
      until: text(payload.until),
      ranges: asInt(payload.ranges, 140, 1, 1000),
      workers: asInt(payload.workers, 8, 1, 32),
      rate: asFloat(payload.rate, 6.0, 0.5, 10.0),
      include_attachments: Boolean(payload.include_attachments ?? true),
      download_attachments: Boolean(payload.download_attachments ?? false),
      check_total: Boolean(payload.check_total ?? false),
      output_dir: configuredOutputDir(),
      // The server token's type is configured once; a pasted token declares
      // its own type. Never guess from the token's shape.
      is_bot: token ? Boolean(payload.is_bot ?? false) : serverTokenIsBot(),
    };
    if (selectedMode === "server") this.config.channel = "";
    this.token = token;
    this.tokenSource = token
      ? "request"
      : serverToken()
        ? "server"
        : "none";
    this.jobDir = join(RUNS_DIR, this.id);
    this.workdir = join(this.jobDir, "work");
    this.outPath = join(this.jobDir, "messages.json");
  }

  // --------------------------------------------------------------- helpers

  private async rangesSnapshot(): Promise<RangePayload[]> {
    const doneDir = join(this.workdir, "done");
    let names: string[];
    try {
      names = await readdir(doneDir);
    } catch {
      return [];
    }
    const items: RangePayload[] = [];
    for (const name of names.filter((entry) => entry.endsWith(".done")).sort()) {
      try {
        const data = JSON.parse(
          await readFile(join(doneDir, name), "utf8")
        ) as Json;
        items.push({
          index: asInt(data.index ?? data.idx, items.length, 0, 1_000_000),
          lo: data.lo === undefined ? null : text(data.lo),
          hi: data.hi === undefined ? null : text(data.hi),
          pages: asInt(data.pages, 0, 0, 100_000_000),
          matched: asInt(data.matched, 0, 0, 100_000_000),
        });
      } catch {
        // A corrupt marker is ignored, exactly as in the crawler.
      }
    }
    items.sort((a, b) => a.index - b.index);
    const peak = Math.max(1, ...items.map((item) => item.pages));
    for (const item of items) {
      item.share = round(item.pages / peak, 4);
    }
    return items;
  }

  private async refreshRanges(): Promise<void> {
    if (this.rangesRefreshing) return;
    this.rangesRefreshing = true;
    try {
      this.ranges = await this.rangesSnapshot();
    } finally {
      this.rangesRefreshing = false;
    }
  }

  private pushThroughput(elapsed: number, pages: number): void {
    const rounded = round(elapsed, 1);
    const last = this.throughput[this.throughput.length - 1];
    if (!last || rounded - last.t >= 1) {
      this.throughput.push({ t: rounded, pages });
      if (this.throughput.length > 900) {
        this.throughput = this.throughput.slice(-900);
      }
    }
  }

  private onProgress = (stats: CrawlStats): void => {
    this.stats = statsPayload(stats);
    this.pushThroughput(stats.elapsed, stats.pages);
    void this.refreshRanges();
  };

  private eta(): number | null {
    const stats = this.stats as Partial<JobStatsPayload>;
    const done = stats.ranges_done ?? 0;
    const total = stats.ranges_total ?? 0;
    const pages = stats.pages ?? 0;
    const rate = stats.pages_per_second ?? 0;
    if (!done || !total || !pages || !rate) return null;
    const pagesLeft = (total - done) * (pages / Math.max(done, 1));
    return round(pagesLeft / rate, 1);
  }

  downloadName(): string {
    if (this.config.mode === "channel") {
      return `messages_channel_${this.config.channel}.json`;
    }
    if (this.config.mode === "server") {
      return `messages_server_${this.config.server}.json`;
    }
    return `messages_${this.config.author}.json`;
  }

  private channelWorkdir(channelId: string): string {
    return join(this.workdir, channelId);
  }

  private async computeMulti(): Promise<JobStatsPayload> {
    let pages = 0;
    let scanned = 0;
    let matched = 0;
    let done = 0;
    for (const channel of this.channels) {
      let channelDone: number;
      let channelPages: number;
      let channelMatched: number;
      let channelScanned: number;
      if (this.finalChannels.has(channel.id)) {
        channelDone = channel.ranges_done || 0;
        channelPages = channel.pages || 0;
        channelMatched = channel.matched || 0;
        channelScanned = channel.scanned || 0;
      } else {
        channelDone = 0;
        channelPages = 0;
        channelMatched = 0;
        channelScanned = 0;
        const doneDir = join(this.channelWorkdir(channel.id), "done");
        try {
          const names = await readdir(doneDir);
          for (const name of names.filter((entry) => entry.endsWith(".done"))) {
            try {
              const marker = JSON.parse(
                await readFile(join(doneDir, name), "utf8")
              ) as Json;
              channelDone += 1;
              channelPages += asInt(marker.pages, 0, 0, 100_000_000);
              channelMatched += asInt(marker.matched, 0, 0, 100_000_000);
              channelScanned += asInt(marker.scanned, 0, 0, 100_000_000);
            } catch {
              // Skip a corrupt marker.
            }
          }
        } catch {
          // No done directory yet.
        }
        channel.ranges_done = channelDone;
        channel.pages = channelPages;
        channel.matched = channelMatched;
        channel.scanned = channelScanned;
      }
      done += channelDone;
      pages += channelPages;
      matched += channelMatched;
      scanned += channelScanned;
    }
    const elapsed = this.runStarted
      ? Math.max(0, (performance.now() - this.runStarted) / 1000)
      : 0;
    const fresh = Math.max(0, pages - this.runStartPages);
    return {
      ranges_total: this.plannedRanges,
      ranges_done: done,
      pages,
      messages_scanned: scanned,
      messages_matched: matched,
      rate_limited: this.client?.rateLimited ?? 0,
      elapsed: round(elapsed, 1),
      pages_per_second: elapsed ? round(fresh / elapsed, 2) : 0,
      errors: this.errors.length,
      channels_total: this.channels.length,
      channels_done: this.channels.filter(
        (channel) =>
          channel.status === "done" || channel.status === "empty"
      ).length,
    } as JobStatsPayload;
  }

  private async refreshMulti(): Promise<void> {
    if (this.multiRefreshing) return;
    this.multiRefreshing = true;
    try {
      const snapshot = await this.computeMulti();
      this.stats = snapshot;
      this.pushThroughput(snapshot.elapsed, snapshot.pages);
    } finally {
      this.multiRefreshing = false;
    }
  }

  asDict(full = true): Json {
    let output: Json | null = null;
    if (
      (this.status === "done" || this.status === "partial") &&
      existsSync(this.outPath)
    ) {
      try {
        output = {
          download_url: `/api/jobs/${this.id}/download`,
          download_name: this.downloadName(),
          size_bytes: statSync(this.outPath).size,
        };
      } catch {
        output = null;
      }
    }
    const payload: Json = {
      id: this.id,
      status: this.status,
      stage: this.stage,
      mode: this.config.mode,
      created_at: this.createdAt,
      started_at: this.startedAt,
      finished_at: this.finishedAt,
      config: { ...this.config },
      token_source: this.tokenSource,
      channel: this.channel,
      guild: this.guild,
      author: this.author,
      info: this.info,
      stats: { ...this.stats },
      eta_seconds: this.eta(),
      assembly: this.assembly,
      attachment_download: this.attachmentDownload,
      attachment_error: this.attachmentError,
      saved_to: this.savedTo,
      save_error: this.saveError,
      error: this.error,
      errors: this.errors.slice(0, 20),
      output,
    };
    if (full) {
      payload.ranges = this.ranges.map((item) => ({ ...item }));
      payload.throughput = this.throughput.map((item) => ({ ...item }));
      payload.channels = this.channels.map((channel) => ({ ...channel }));
    }
    return payload;
  }

  // ------------------------------------------------------------------- run

  start(): void {
    void this.run();
  }

  resume(): boolean {
    if (this.running) return false;
    this.stopSignal = new StopSignal();
    this.status = "queued";
    this.stage = "queued";
    this.error = null;
    this.errors = [];
    this.assembly = null;
    this.attachmentDownload = null;
    this.attachmentError = null;
    this.savedTo = null;
    this.saveError = null;
    this.finishedAt = null;
    this.throughput = [];
    this.start();
    return true;
  }

  stop(): boolean {
    if (!["queued", "resolving", "running"].includes(this.status)) {
      return false;
    }
    this.stopSignal.set();
    this.status = "stopping";
    return true;
  }

  private checkStop(): boolean {
    if (!this.stopSignal.isSet()) return false;
    this.status = "stopped";
    this.stage = "stopped";
    this.error =
      "Stopped. Progress is kept; resume to fetch only the missing ranges.";
    return true;
  }

  private bounds(channelId: string): [bigint, bigint] {
    // A channel's own snowflake predates every message in it, so it is a safe
    // lower bound when no ``since`` is set.
    const channelSnowflake = toSnowflake(channelId);
    const loId = this.config.since
      ? maxBigInt(snowflakeAt(parseDate(this.config.since)), channelSnowflake)
      : channelSnowflake;
    const hiId = this.config.until
      ? snowflakeAt(parseDate(this.config.until))
      : snowflakeAt(new Date());
    return [loId, hiId];
  }

  private recordAssembly(result: AssemblyResult): void {
    this.assembly = {
      total: result.total,
      wrong_author: result.wrongAuthor,
      attachments: result.attachments,
      size_bytes: result.sizeBytes,
      oldest_timestamp: result.oldestTimestamp,
      newest_timestamp: result.newestTimestamp,
      duplicate_ids: result.duplicateIds,
    };
  }

  private crawlConfig(options: {
    channelId: string;
    loId: bigint;
    hiId: bigint;
    workdir: string;
    outPath: string;
    channelName: string | null;
    lineOutput?: boolean;
    ranges?: number;
  }): CrawlConfig {
    return {
      channelId: options.channelId,
      authorId:
        this.config.mode === "author" ? this.config.author : null,
      loId: options.loId,
      hiId: options.hiId,
      workdir: options.workdir,
      outPath: options.outPath,
      guildId: this.guild?.id ?? null,
      channelName: options.channelName,
      guildName: this.guild?.name ?? null,
      ranges: options.ranges ?? this.config.ranges,
      workers: this.config.workers,
      rate: this.config.rate,
      includeAttachments: this.config.include_attachments,
      downloadAttachments: this.config.download_attachments,
      keepIds: this.config.check_total,
      lineOutput: options.lineOutput ?? false,
      mode: this.config.mode,
    };
  }

  /** Avoid empty slices when the window is narrower than the range count. */
  private rangeCount(loId: bigint, hiId: bigint): number {
    const span = hiId - loId;
    const requested = BigInt(this.config.ranges);
    const wanted = span < requested ? span : requested;
    return Number(wanted < 1n ? 1n : wanted);
  }

  private async attachChannel(client: DiscordClient): Promise<DiscordChannel> {
    const channel = await client.channel(this.config.channel);
    const guildId = text(channel.guild_id);
    let guildName: string | null = null;
    if (guildId) {
      try {
        guildName = (await client.guild(guildId)).name ?? null;
      } catch (err) {
        if (!(err instanceof DiscordError)) throw err;
      }
    }
    this.channel = {
      id: this.config.channel,
      name: channel.name ?? null,
    };
    this.guild = { id: guildId, name: guildName };
    return channel;
  }

  private async finishSingle(
    report: CrawlReport,
    emptyMessage: string
  ): Promise<void> {
    this.stats = statsPayload(report.stats);
    await this.refreshRanges();
    if (this.stopSignal.isSet()) {
      this.status = "stopped";
      this.stage = "stopped";
      this.error =
        "Stopped. Progress is kept; resume to fetch only the missing ranges.";
      return;
    }
    if (report.stats.errors.length) {
      this.status = "partial";
      this.stage = "partial";
      this.errors = report.stats.errors.slice(0, 20);
      this.error =
        `${report.stats.errors.length} range(s) failed. Resume to retry ` +
        "only those ranges.";
      return;
    }
    if (report.empty) {
      this.status = "empty";
      this.stage = "empty";
      this.error = emptyMessage;
      return;
    }
    if (!report.assembly) {
      this.status = "failed";
      this.stage = "failed";
      this.error = "Crawl finished without an assembly result.";
      return;
    }
    this.recordAssembly(report.assembly);
    if (!(await this.archiveAttachments())) return;
    await this.saveExportCopy();
    this.status = "done";
    this.stage = "done";
  }

  private async archiveAttachments(): Promise<boolean> {
    if (!this.config.download_attachments) return true;
    this.stage = "attachments";
    this.attachmentError = null;
    try {
      this.attachmentDownload = await downloadExportAttachments({
        sourcePath: this.outPath,
        outDir: join(this.jobDir, "attachments"),
        isStopped: () => this.stopSignal.isSet(),
        onProgress: (progress) => {
          this.attachmentDownload = progress;
        },
      });
      if (this.attachmentDownload.failed > 0) {
        this.attachmentError =
          `${this.attachmentDownload.failed} attachment(s) could not be ` +
          "downloaded. The JSON export is still complete.";
      }
    } catch (err) {
      this.attachmentError =
        `attachments: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (this.stopSignal.isSet()) {
      this.status = "stopped";
      this.stage = "stopped";
      this.error =
        "Stopped while archiving attachments. Resume to finish the files.";
      return false;
    }
    return true;
  }

  private exportLabel(): string {
    const raw =
      this.config.mode === "server"
        ? this.guild?.name || `server ${this.config.server}`
        : this.config.mode === "channel"
          ? this.channel?.name || `channel ${this.config.channel}`
          : [
              this.author?.global_name ||
                this.author?.username ||
                this.config.author,
              this.channel?.name,
            ]
              .filter(Boolean)
              .join(" - ");
    return (
      raw
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 90)
        .replace(/[. ]+$/, "") || `export ${this.id}`
    );
  }

  private async freeOutputDirectory(root: string, label: string): Promise<string> {
    for (let index = 0; index < 1000; index += 1) {
      const name = index === 0 ? label : `${label} (${index + 1})`;
      const candidate = join(root, name);
      if (!existsSync(candidate)) return candidate;
    }
    return join(root, `${label} ${this.id}`);
  }

  private async saveExportCopy(): Promise<void> {
    if (!this.config.output_dir) return;
    this.stage = "saving";
    try {
      const folder = await this.freeOutputDirectory(
        this.config.output_dir,
        this.exportLabel()
      );
      await mkdir(folder, { recursive: true });
      await copyFile(this.outPath, join(folder, "messages.json"));
      const attachmentDir = join(this.jobDir, "attachments");
      if (this.config.download_attachments && existsSync(attachmentDir)) {
        await cp(attachmentDir, join(folder, "attachments"), {
          recursive: true,
        });
      }
      this.savedTo = folder;
      this.saveError = null;
    } catch (err) {
      this.saveError =
        `could not save a copy: ${err instanceof Error ? err.message : err}`;
    }
  }

  private async run(): Promise<void> {
    this.running = true;
    this.status = "resolving";
    this.stage = "resolving";
    this.startedAt = nowIso();
    this.finishedAt = null;
    const token = this.token || serverToken();
    try {
      if (!token) {
        throw new Error(
          "no Discord token: set DISCORD_TOKEN on the server or paste one in the form"
        );
      }
      const mode = this.config.mode;
      if (
        mode === "author" &&
        (!this.config.channel || !this.config.author)
      ) {
        throw new Error("channel and author ids are required");
      }
      if (mode === "channel" && !this.config.channel) {
        throw new Error("a channel id is required");
      }
      if (mode === "server" && !this.config.server) {
        throw new Error("a server id is required");
      }

      const client = createClient(token, {
        rate: this.config.rate,
        isBot: this.config.is_bot,
      });
      this.client = client;
      if (mode === "server") await this.runServer(client);
      else if (mode === "channel") await this.runChannel(client);
      else await this.runAuthor(client);
    } catch (err) {
      this.status = "failed";
      this.stage = "failed";
      if (err instanceof DiscordError) {
        this.error = `Discord error ${err.status}: ${err.body.slice(0, 300)}`;
      } else if (err instanceof Error) {
        this.error = err.message || err.name;
        if (err instanceof TypeError || err instanceof ReferenceError) {
          // Real programming faults are worth a stack in the server log;
          // validation and Discord failures are reported to the console only.
          console.error(`[job ${this.id}]`, err);
        }
      } else {
        this.error = String(err);
      }
      console.error(`[job ${this.id}] failed: ${this.error}`);
    } finally {
      this.finishedAt = nowIso();
      this.token = "";
      this.client = null;
      if (!TERMINAL.has(this.status)) {
        this.status = "failed";
        this.stage = "failed";
      }
      console.log(`[job ${this.id}] ${this.status} · ${this.label()}`);
      this.running = false;
    }
  }

  private label(): string {
    if (this.config.mode === "channel") {
      return `channel ${this.config.channel}`;
    }
    if (this.config.mode === "server") {
      return `server ${this.config.server}`;
    }
    return `${this.config.author} in ${this.config.channel}`;
  }

  private async runAuthor(client: DiscordClient): Promise<void> {
    const channel = await this.attachChannel(client);
    if (this.checkStop()) return;

    const guildId = this.guild?.id ?? "";
    const info = await discoverAuthor(
      client,
      guildId,
      this.config.channel,
      this.config.author
    );
    this.info = authorInfoPayload(info);
    try {
      const latest = await client.search(guildId, {
        channelId: this.config.channel,
        authorId: this.config.author,
        sortOrder: "desc",
      });
      const user = latest.messages?.[0]?.[0]?.author;
      this.author = user
        ? {
            id: user.id ?? null,
            username: user.username ?? null,
            global_name: user.global_name ?? null,
          }
        : { id: this.config.author, username: null, global_name: null };
    } catch (err) {
      if (!(err instanceof DiscordError)) throw err;
      this.author = {
        id: this.config.author,
        username: null,
        global_name: null,
      };
    }
    if (this.checkStop()) return;

    if (!info.totalResults) {
      this.status = "empty";
      this.stage = "empty";
      this.error = `No messages by ${this.config.author} in this channel.`;
      return;
    }

    const loId = this.config.since
      ? snowflakeAt(parseDate(this.config.since))
      : BigInt(info.firstId ?? "0");
    const hiId = this.config.until
      ? snowflakeAt(parseDate(this.config.until))
      : snowflakeAt(new Date());

    await mkdir(this.jobDir, { recursive: true });
    const config = this.crawlConfig({
      channelId: this.config.channel,
      loId,
      hiId,
      workdir: this.workdir,
      outPath: this.outPath,
      channelName: channel.name ?? null,
    });
    this.status = "running";
    this.stage = "crawling";
    const crawler = new Crawler(config, client, {
      progress: this.onProgress,
      progressInterval: 1.0,
      stopSignal: this.stopSignal,
    });
    const report = await crawler.run();
    await this.finishSingle(
      report,
      "No messages in this channel for the selected window."
    );
  }

  private async runChannel(client: DiscordClient): Promise<void> {
    const channel = await this.attachChannel(client);
    this.author = null;
    if (this.checkStop()) return;

    const [loId, hiId] = this.bounds(this.config.channel);
    if (hiId <= loId) {
      this.status = "empty";
      this.stage = "empty";
      this.error = "The selected window is empty.";
      return;
    }

    await mkdir(this.jobDir, { recursive: true });
    const config = this.crawlConfig({
      channelId: this.config.channel,
      loId,
      hiId,
      workdir: this.workdir,
      outPath: this.outPath,
      channelName: channel.name ?? null,
      ranges: this.rangeCount(loId, hiId),
    });
    this.status = "running";
    this.stage = "crawling";
    const crawler = new Crawler(config, client, {
      progress: this.onProgress,
      progressInterval: 1.0,
      stopSignal: this.stopSignal,
    });
    const report = await crawler.run();
    await this.finishSingle(
      report,
      "No messages in this channel for the selected window."
    );
  }

  private async runServer(client: DiscordClient): Promise<void> {
    const guildId = this.config.server;
    const guild: DiscordGuild = await client.guild(guildId);
    const channels = textChannels(await client.guildChannels(guildId));
    this.guild = { id: guildId, name: guild.name ?? null };
    this.channel = null;
    this.author = null;
    if (this.checkStop()) return;
    if (!channels.length) {
      this.status = "empty";
      this.stage = "empty";
      this.error = "No text channels were visible in this server.";
      return;
    }

    const sinceId = this.config.since
      ? snowflakeAt(parseDate(this.config.since))
      : null;
    const untilId = this.config.until
      ? snowflakeAt(parseDate(this.config.until))
      : snowflakeAt(new Date());

    const plans: ChannelPlan[] = [];
    for (const channel of channels) {
      let channelId: bigint;
      try {
        channelId = toSnowflake(channel.id);
      } catch {
        continue;
      }
      const loId =
        sinceId !== null && sinceId > channelId ? sinceId : channelId;
      if (untilId <= loId) continue;
      const rangeCount = this.rangeCount(loId, untilId);
      const ranges = splitRanges(loId, untilId, rangeCount).length;
      if (!ranges) continue;
      plans.push({
        id: channel.id,
        name: channel.name,
        lo: loId,
        hi: untilId,
        ranges,
        range_count: rangeCount,
      });
    }
    if (!plans.length) {
      this.status = "empty";
      this.stage = "empty";
      this.error = "The selected window is empty for every text channel.";
      return;
    }

    this.channels = plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      status: "pending",
      ranges_total: plan.ranges,
      ranges_done: 0,
      pages: 0,
      matched: 0,
      scanned: 0,
    }));
    this.plannedRanges = plans.reduce((sum, plan) => sum + plan.ranges, 0);
    this.finalChannels = new Set();
    this.runStarted = performance.now();
    const initial = await this.computeMulti();
    this.runStartPages = initial.pages;
    this.status = "running";
    this.stage = "crawling";
    await this.refreshMulti();

    const outputs: string[] = [];
    const failures: string[] = [];
    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index];
      const channel = this.channels[index];
      if (this.stopSignal.isSet()) break;
      channel.status = "running";
      await this.refreshMulti();
      const workdir = this.channelWorkdir(channel.id);
      const outPath = join(workdir, "messages.jsonl");
      const config = this.crawlConfig({
        channelId: channel.id,
        loId: plan.lo,
        hiId: plan.hi,
        workdir,
        outPath,
        channelName: channel.name,
        lineOutput: true,
        ranges: plan.range_count,
      });
      const crawler = new Crawler(config, client, {
        progress: () => {
          void this.refreshMulti();
        },
        progressInterval: 1.0,
        stopSignal: this.stopSignal,
      });
      let report: CrawlReport;
      try {
        report = await crawler.run();
      } catch (err) {
        // One channel must not sink the run.
        channel.status = "failed";
        failures.push(
          `#${channel.name}: ${err instanceof Error ? err.message : err}`
        );
        this.errors = failures.slice(0, 20);
        this.finalChannels.add(channel.id);
        await this.refreshMulti();
        continue;
      }
      if (this.stopSignal.isSet()) {
        channel.status = "stopped";
        break;
      }
      channel.scanned = report.stats.messagesScanned;
      channel.ranges_done = report.stats.rangesDone;
      channel.pages = report.stats.pages;
      channel.matched = report.stats.messagesMatched;
      this.finalChannels.add(channel.id);
      if (report.stats.errors.length) {
        channel.status = "failed";
        failures.push(
          `#${channel.name}: ${report.stats.errors.length} range(s) failed`
        );
      } else if (report.empty) {
        channel.status = "empty";
      } else if (report.assembly) {
        channel.status = "done";
        outputs.push(outPath);
      } else {
        channel.status = "failed";
        failures.push(`#${channel.name}: no assembly result`);
      }
      this.errors = failures.slice(0, 20);
      await this.refreshMulti();
    }

    if (this.stopSignal.isSet()) {
      this.status = "stopped";
      this.stage = "stopped";
      this.error =
        "Stopped. Progress is kept; resume to fetch only the missing ranges.";
      return;
    }
    if (!outputs.length) {
      this.status = failures.length ? "failed" : "empty";
      this.stage = this.status;
      this.error = failures.length
        ? failures[0]
        : "No messages were found in this server's text channels.";
      return;
    }

    const metadata: Json = {
      mode: "server",
      guild: this.guild,
      channels: this.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        status: channel.status,
      })),
      target_user_id: null,
      ordering: "chronological across all channels (oldest first)",
      attachments_note: this.config.include_attachments
        ? this.config.download_attachments
          ? "Attachment metadata is included and binaries are copied into this export's attachments directory after the merge. url/proxy_url remain signed CDN links that expire."
          : "Attachment binaries were NOT downloaded. Only metadata is included; url/proxy_url are signed CDN links that expire."
        : "Attachment records were excluded from this export.",
      window: {
        since: this.config.since || null,
        until: this.config.until || null,
      },
      crawl: {
        ranges: this.config.ranges,
        workers: this.config.workers,
        pace_requests_per_second: this.config.rate,
        channels: plans.length,
      },
    };
    const result = await mergeLines(outputs, this.outPath, metadata);
    this.recordAssembly(result);
    await this.refreshMulti();
    if (!(await this.archiveAttachments())) return;
    await this.saveExportCopy();
    if (failures.length) {
      this.status = "partial";
      this.stage = "partial";
      this.error =
        `${failures.length} channel(s) failed. The export contains the ` +
        "channels that finished; resume to retry the rest.";
    } else {
      this.status = "done";
      this.stage = "done";
    }
  }
}

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

const JOBS = new Map<string, Job>();

function listJobs(): Json[] {
  return [...JOBS.values()]
    .sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    )
    .map((job) => job.asDict(false));
}

function getJob(jobId: string): Job | null {
  return JOBS.get(jobId) ?? null;
}

function addJob(job: Job): void {
  JOBS.set(job.id, job);
  if (JOBS.size > MAX_JOBS) {
    const excess = JOBS.size - MAX_JOBS;
    const candidates = [...JOBS.values()]
      .filter((item) => !ACTIVE.has(item.status))
      .sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
      )
      .slice(0, excess);
    for (const item of candidates) JOBS.delete(item.id);
  }
}

// ------------------------------------------------------------------ routing

async function readJson(
  req: IncomingMessage,
  limit = MAX_BODY
): Promise<Json> {
  const declared = Number.parseInt(
    text(req.headers["content-length"]),
    10
  );
  if (Number.isFinite(declared) && (declared <= 0 || declared > limit)) {
    if (declared > limit) req.resume();
    return {};
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) {
        req.destroy();
        return {};
      }
      chunks.push(buffer);
    }
  } catch {
    return {};
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Json)
      : {};
  } catch {
    return {};
  }
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res: ServerResponse, payload: unknown, status = 200): void {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function apiError(res: ServerResponse, message: string, status = 400): void {
  sendJson(res, { error: message }, status);
}

function sendLogDump(res: ServerResponse): void {
  const jobs = listJobs();
  const activeJobs = jobs.filter((job) =>
    ["queued", "resolving", "running", "stopping"].includes(
      String(job.status)
    )
  ).length;
  const body = Buffer.from(
    buildLogDump({
      version: VERSION,
      tokenSource: tokenSource(),
      tokenStorage: tokenStorage(),
      activeJobs,
      totalJobs: jobs.length,
    }),
    "utf8"
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="discord-messages-exporter_${stamp}.log"`,
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function serveStatic(res: ServerResponse, pathname: string): void {
  if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
    const body = Buffer.from(
      "The web UI is not built yet. Run `npm run build` in web/ first.",
      "utf8"
    );
    res.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(body.length),
    });
    res.end(body);
    return;
  }
  let relative: string;
  try {
    relative = decodeURIComponent(pathname.replace(/^\/+/, "")) || "index.html";
  } catch {
    apiError(res, "forbidden", 403);
    return;
  }
  const root = resolve(DIST_DIR);
  let target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + sep)) {
    apiError(res, "forbidden", 403);
    return;
  }
  try {
    if (statSync(target).isDirectory()) {
      target = join(target, "index.html");
    }
  } catch {
    if (extname(relative)) {
      apiError(res, "not found", 404);
      return;
    }
    target = join(root, "index.html");
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    target = join(root, "index.html");
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    apiError(res, "not found", 404);
    return;
  }
  const body = statSync(target);
  const contentType =
    CONTENT_TYPES[extname(target).toLowerCase()] ??
    "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": String(body.size),
    "Cache-Control":
      target.endsWith("index.html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
  });
  createReadStream(target)
    .on("error", () => res.destroy())
    .pipe(res);
}

function downloadJob(res: ServerResponse, job: Job): void {
  if (
    (job.status !== "done" && job.status !== "partial") ||
    !existsSync(job.outPath)
  ) {
    apiError(res, "job has no finished output yet", 409);
    return;
  }
  const name = job
    .downloadName()
    .replace(/[^A-Za-z0-9._-]+/g, "_");
  const info = statSync(job.outPath);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}"`,
    "Content-Length": String(info.size),
  });
  createReadStream(job.outPath)
    .on("error", () => res.destroy())
    .pipe(res);
}

interface BrowserBody extends Json {
  token?: string;
  is_bot?: boolean;
  kind?: string;
  server?: string;
  channel?: string;
  query?: string;
  mode?: string;
  author?: string;
  remember?: boolean;
}

function suppliedToken(body: BrowserBody): {
  token: string;
  isBot: boolean;
  supplied: boolean;
} {
  const supplied = text(body.token);
  return {
    token: supplied || serverToken(),
    isBot: supplied ? Boolean(body.is_bot ?? false) : serverTokenIsBot(),
    supplied: Boolean(supplied),
  };
}

async function handleMe(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = (await readJson(req)) as BrowserBody;
  const { token, isBot, supplied } = suppliedToken(body);
  if (!token) {
    apiError(
      res,
      "no Discord token: set DISCORD_TOKEN on the server or add one in Settings",
      400
    );
    return;
  }
  try {
    const client = createClient(token, { rate: 1.5, isBot });
    const user: DiscordUser = await client.me();
    sendJson(res, {
      user: {
        id: text(user.id),
        username: user.username ?? "",
        global_name: user.global_name ?? null,
        bot: Boolean(user.bot),
        avatar: user.avatar ?? null,
      },
    });
  } catch (err) {
    if (err instanceof DiscordError && err.status === 401) {
      apiError(
        res,
        supplied
          ? "Discord rejected this token. Check that it is current and, for a bot token, that Bot token is ticked."
          : "Discord rejected the server token. Check DISCORD_TOKEN and DISCORD_TOKEN_IS_BOT on the server.",
        401
      );
      return;
    }
    if (err instanceof DiscordError) {
      apiError(res, `Discord error ${err.status}: ${err.body.slice(0, 300)}`, 502);
      return;
    }
    apiError(res, err instanceof Error ? err.message : String(err), 500);
  }
}

async function handleBrowse(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = (await readJson(req)) as BrowserBody;
  const kind = text(body.kind).toLowerCase();
  const { token, isBot } = suppliedToken(body);
  if (!["guilds", "channels", "members", "authors"].includes(kind)) {
    apiError(res, "unknown list kind");
    return;
  }
  if (!token) {
    apiError(
      res,
      "no Discord token: set DISCORD_TOKEN on the server or add one in Settings",
      400
    );
    return;
  }
  try {
    const client = createClient(token, { rate: 4.0, isBot });
    if (kind === "guilds") {
      const rows = (await client.userGuilds())
        .filter((guild) => guild.id)
        .map((guild) => ({
          id: text(guild.id),
          name: guild.name || text(guild.id),
          icon_url: guildIconUrl(text(guild.id), guild.icon),
        }))
        .sort((a, b) =>
          a.name.toLocaleLowerCase("en-US") <
          b.name.toLocaleLowerCase("en-US")
            ? -1
            : 1
        );
      sendJson(res, { guilds: rows });
      return;
    }
    if (kind === "channels") {
      const serverId = text(body.server);
      if (!serverId) {
        apiError(res, "a server id is required");
        return;
      }
      sendJson(res, {
        channels: textChannels(await client.guildChannels(serverId)),
      });
      return;
    }
    if (kind === "authors") {
      const channelId = text(body.channel);
      if (!channelId) {
        apiError(res, "a channel id is required");
        return;
      }
      const authors: Json[] = [];
      const seen = new Set<string>();
      let before: bigint | null = null;
      for (let page = 0; page < 3; page += 1) {
        const batch = await client.messagesBefore(channelId, before);
        if (!batch.length) break;
        for (const message of batch) {
          const user = message.author;
          const userId = text(user?.id);
          if (!userId || seen.has(userId)) continue;
          seen.add(userId);
          authors.push({
            id: userId,
            username: user?.username ?? "",
            global_name: user?.global_name ?? null,
            nick: null,
            bot: Boolean(user?.bot),
            avatar_url: userAvatarUrl(userId, user?.avatar),
          });
        }
        const oldest = text(batch[batch.length - 1]?.id);
        if (!oldest || batch.length < 100) break;
        before = toSnowflake(oldest);
      }
      sendJson(res, { authors: authors.slice(0, 100) });
      return;
    }

    const serverId = text(body.server);
    const query = text(body.query);
    if (!serverId) {
      apiError(res, "a server id is required");
      return;
    }
    if (!query) {
      sendJson(res, { members: [] });
      return;
    }
    const rows: Json[] = [];
    const seen = new Set<string>();
    for (const member of await client.searchMembers(serverId, query)) {
      const user = member.user;
      const userId = text(user?.id);
      if (!userId || seen.has(userId)) continue;
      seen.add(userId);
      rows.push({
        id: userId,
        username: user?.username ?? "",
        global_name: user?.global_name ?? null,
        nick: member.nick ?? null,
        bot: Boolean(user?.bot),
        avatar_url: userAvatarUrl(userId, user?.avatar),
      });
    }
    sendJson(res, { members: rows });
  } catch (err) {
    const detail =
      err instanceof DiscordError
        ? `Discord error ${err.status}: ${err.body.slice(0, 300)}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`[browse ${kind}] ${detail}`);
    if (err instanceof DiscordError) {
      if (kind === "members" && err.status === 403) {
        apiError(
          res,
          "Discord did not allow the member list for this token. Paste the author ID instead.",
          403
        );
      } else if (kind === "authors" && err.status === 403) {
        apiError(
          res,
          "Discord did not allow this channel's recent authors. Paste the author ID instead.",
          403
        );
      } else {
        apiError(res, detail, 502);
      }
      return;
    }
    apiError(res, detail, 500);
  }
}

async function lookupMessageCount(
  client: DiscordClient,
  guildId: string,
  channelId?: string
): Promise<{ total_results: number | null } | null> {
  if (!guildId) return null;
  try {
    const result = await client.search(guildId, {
      channelId: channelId ?? null,
      sortOrder: "desc",
    });
    return { total_results: result.total_results ?? null };
  } catch (err) {
    if (err instanceof DiscordError) return null;
    throw err;
  }
}

async function handleInfo(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {  const body = (await readJson(req)) as BrowserBody;
  let mode = text(body.mode || "author").toLowerCase();
  if (!MODES.has(mode)) mode = "author";
  const channelId = text(body.channel);
  const authorId = text(body.author);
  const serverId = text(body.server);
  const { token, isBot } = suppliedToken(body);
  if (mode === "author" && (!channelId || !authorId)) {
    apiError(res, "channel and author ids are required");
    return;
  }
  if (mode === "channel" && !channelId) {
    apiError(res, "a channel id is required");
    return;
  }
  if (mode === "server" && !serverId) {
    apiError(res, "a server id is required");
    return;
  }
  if (!token) {
    apiError(res, "no Discord token: set DISCORD_TOKEN or paste one", 400);
    return;
  }
  try {
    const client = createClient(token, { rate: 1.5, isBot });
    if (mode === "server") {
      const guild = await client.guild(serverId);
      const channels = textChannels(await client.guildChannels(serverId));
      const messageCount = await lookupMessageCount(client, serverId);
      sendJson(res, {
        mode,
        guild: { id: serverId, name: guild.name ?? null },
        channels,
        channel_count: channels.length,
        info: messageCount,
      });
      return;
    }

    const channel = await client.channel(channelId);
    const guildId = text(channel.guild_id);
    let guildName: string | null = null;
    if (guildId) {
      try {
        guildName = (await client.guild(guildId)).name ?? null;
      } catch (err) {
        if (!(err instanceof DiscordError)) throw err;
      }
    }
    if (mode === "channel") {
      const info = guildId
        ? await lookupMessageCount(client, guildId, channelId)
        : null;
      sendJson(res, {
        mode,
        channel: { id: channelId, name: channel.name ?? null },
        guild: { id: guildId, name: guildName },
        info,
      });
      return;
    }

    const info = await discoverAuthor(client, guildId, channelId, authorId);
    const author: Json = {
      id: authorId,
      username: null,
      global_name: null,
    };
    try {
      const latest = await client.search(guildId, {
        channelId,
        authorId,
        sortOrder: "desc",
      });
      const user = latest.messages?.[0]?.[0]?.author;
      if (user) {
        author.username = user.username ?? null;
        author.global_name = user.global_name ?? null;
      }
    } catch (err) {
      if (!(err instanceof DiscordError)) throw err;
    }
    sendJson(res, {
      mode,
      channel: { id: channelId, name: channel.name ?? null },
      guild: { id: guildId, name: guildName },
      author,
      info: authorInfoPayload(info),
    });
  } catch (err) {
    if (err instanceof DiscordError) {
      apiError(res, `Discord error ${err.status}: ${err.body.slice(0, 300)}`, 502);
      return;
    }
    apiError(res, err instanceof Error ? err.message : String(err), 500);
  }
}

async function handleStartJob(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readJson(req);
  const job = new Job(body);
  if (
    job.config.mode === "author" &&
    (!job.config.channel || !job.config.author)
  ) {
    apiError(res, "channel and author ids are required");
    return;
  }
  if (job.config.mode === "channel" && !job.config.channel) {
    apiError(res, "a channel id is required");
    return;
  }
  if (job.config.mode === "server" && !job.config.server) {
    apiError(res, "a server id is required");
    return;
  }
  if (!(job.token || serverToken())) {
    apiError(
      res,
      "no Discord token: set DISCORD_TOKEN on the server or paste one in the form",
      400
    );
    return;
  }
  const target =
    job.config.mode === "server"
      ? job.config.server
      : job.config.channel;
  console.log(
    `[job ${job.id}] starting · ${job.config.mode}${target ? ` ${target}` : ""}`
  );
  addJob(job);
  job.start();
  sendJson(res, { job: job.asDict(false) }, 202);
}

function jobParts(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function normalizeTimestamp(value: string | null, endOfDay: boolean): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`;
  }
  return value;
}

function exportFilters(search: URLSearchParams): ExportFilters {
  const weekdayRaw = search.get("weekday");
  const hourRaw = search.get("hour");
  const weekday = Number.parseInt(weekdayRaw ?? "", 10);
  const hour = Number.parseInt(hourRaw ?? "", 10);
  const contentRaw = (search.get("content") ?? "").trim();
  const contentKinds: MessageContentKind[] = [
    "text",
    "media",
    "images",
    "videos",
    "audio",
    "files",
    "code",
    "links",
    "stickers",
  ];
  return {
    q: (search.get("q") ?? "").trim(),
    author: (search.get("author") ?? "").trim(),
    channel: (search.get("channel") ?? "").trim(),
    from: normalizeTimestamp(search.get("from"), false),
    to: normalizeTimestamp(search.get("to"), true),
    weekday:
      weekdayRaw !== null && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
        ? weekday
        : undefined,
    hour:
      hourRaw !== null && Number.isInteger(hour) && hour >= 0 && hour <= 23
        ? hour
        : undefined,
    content: contentKinds.includes(contentRaw as MessageContentKind)
      ? (contentRaw as MessageContentKind)
      : undefined,
  };
}

function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"];
  if (typeof site === "string" && site) {
    return site === "same-origin" || site === "none";
  }
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const hosts = [req.headers.host, req.headers["x-forwarded-host"]]
      .filter((value): value is string => typeof value === "string")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    return hosts.includes(parsed.host);
  } catch {
    return false;
  }
}

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function looksLikeJsonObject(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer
      .subarray(0, bytesRead)
      .toString("utf8")
      .replace(/^﻿/, "")
      .trimStart();
    return text.startsWith("{");
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

function exportDownloadName(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) return "export.json";
  return base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
}

async function handleImport(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const rawName = req.headers["x-filename"];
  let originalName =
    typeof rawName === "string" && rawName ? rawName : "export.json";
  try {
    originalName = decodeURIComponent(originalName);
  } catch {
    // Keep the raw header value.
  }
  const target = await prepareImport(originalName);
  const stream = createWriteStream(target.partPath, { flags: "wx" });
  let size = 0;
  let tooLarge = false;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_EXPORT_BYTES) {
        tooLarge = true;
        break;
      }
      if (!stream.write(buffer)) {
        await once(stream, "drain");
      }
    }
    stream.end();
    await once(stream, "finish");
    if (tooLarge) {
      req.destroy();
      throw new Error(
        `the export is larger than ${Math.round(
          MAX_EXPORT_BYTES / (1024 * 1024)
        )} MiB`
      );
    }
    if (!size) throw new Error("the uploaded file is empty");
    if (!(await looksLikeJsonObject(target.partPath))) {
      throw new Error("the uploaded file is not a JSON object");
    }
    await rename(target.partPath, target.filePath);
    const summary = await finalizeImport(target);
    if (!summary) throw new Error("could not register the uploaded export");
    await ensureIndexed(summary.id);
    sendJson(res, { export: getExport(summary.id) }, 202);
  } catch (err) {
    stream.destroy();
    await discardImport(target);
    apiError(
      res,
      err instanceof Error ? err.message : String(err),
      tooLarge ? 413 : 400
    );
  }
}

function tokenStatusPayload(): Json {
  return {
    configured: Boolean(serverToken()),
    source: tokenSource(),
    is_bot: serverTokenIsBot(),
    storage: tokenStorage(),
  };
}

function handleTokenStatus(res: ServerResponse): void {
  sendJson(res, tokenStatusPayload());
}

async function handleSetToken(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (environmentToken()) {
    apiError(
      res,
      "a token is already configured by DISCORD_TOKEN on the server",
      409
    );
    return;
  }
  const body = (await readJson(req)) as BrowserBody;
  const token = text(body.token);
  const isBot = Boolean(body.is_bot ?? false);
  const remember = Boolean(body.remember ?? false);
  if (!token) {
    apiError(res, "a Discord token is required", 400);
    return;
  }
  let user: DiscordUser;
  try {
    user = await createClient(token, { rate: 1.5, isBot }).me();
  } catch (err) {
    if (err instanceof DiscordError && err.status === 401) {
      apiError(
        res,
        "Discord rejected this token. Check that it is current and that the bot/user switch is correct.",
        401
      );
      return;
    }
    if (err instanceof DiscordError) {
      apiError(res, `Discord error ${err.status}: ${err.body.slice(0, 300)}`, 502);
      return;
    }
    apiError(res, err instanceof Error ? err.message : String(err), 500);
    return;
  }
  const remembered = remember
    ? await writeStoredToken({ token, isBot })
    : false;
  storedToken = { token, isBot };
  sendJson(res, {
    ...tokenStatusPayload(),
    remembered,
    user: {
      id: text(user.id),
      username: user.username ?? "",
      global_name: user.global_name ?? null,
      bot: Boolean(user.bot),
      avatar: user.avatar ?? null,
    },
  });
}

async function handleClearToken(res: ServerResponse): Promise<void> {
  if (environmentToken()) {
    apiError(
      res,
      "the token is configured by DISCORD_TOKEN and cannot be cleared here",
      409
    );
    return;
  }
  storedToken = null;
  await clearStoredToken();
  sendJson(res, tokenStatusPayload());
}

async function handleExports(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const pathname = url.pathname;
  const method = req.method ?? "GET";
  if (pathname === "/api/exports") {
    if (method !== "GET") {
      apiError(res, "method not allowed", 405);
      return true;
    }
    await refreshExports();
    sendJson(res, { exports: listExports() });
    return true;
  }
  if (pathname === "/api/exports/import") {
    if (method !== "POST") {
      apiError(res, "method not allowed", 405);
      return true;
    }
    await handleImport(req, res);
    return true;
  }
  if (!pathname.startsWith("/api/exports/")) return false;

  const parts = jobParts(pathname);
  const id = parts[2] ? decodeSegment(parts[2]) : null;
  if (!id) {
    apiError(res, "export not found", 404);
    return true;
  }

  if (method === "DELETE") {
    if (parts.length !== 3) {
      apiError(res, "not found", 404);
      return true;
    }
    await refreshExports();
    const summary = getExport(id);
    if (!summary) {
      apiError(res, "export not found", 404);
      return true;
    }
    if (summary.status === "indexing") {
      apiError(res, "the export is still indexing", 409);
      return true;
    }
    if (getExportKind(id) === "job") {
      await hideJobExport(id);
      sendJson(res, { ok: true, hidden: true });
      return true;
    }
    await removeImport(id);
    sendJson(res, { ok: true });
    return true;
  }

  if (method === "POST" && parts.length === 4 && parts[3] === "reindex") {
    await refreshExports();
    if (!getExport(id)) {
      apiError(res, "export not found", 404);
      return true;
    }
    const summary = await reindexExport(id);
    sendJson(res, { export: summary ?? getExport(id) }, 202);
    return true;
  }

  if (method !== "GET") {
    apiError(res, "method not allowed", 405);
    return true;
  }

  let summary = getExport(id);
  if (!summary || parts.length === 3) {
    await refreshExports();
    summary = getExport(id);
  }
  if (!summary) {
    apiError(res, "export not found", 404);
    return true;
  }

  if (parts.length === 3) {
    if (summary.status === "unindexed") {
      summary = await ensureIndexed(id);
    }
    const current = getExport(id);
    sendJson(res, {
      export: current,
      facets:
        current?.status === "ready" ? queryFacets(id) : null,
    });
    return true;
  }

  if (parts.length === 4 && parts[3] === "download") {
    const sourcePath = getExportSourcePath(id);
    if (!sourcePath || !existsSync(sourcePath)) {
      apiError(res, "export file not found", 404);
      return true;
    }
    const info = statSync(sourcePath);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportDownloadName(
        summary.name
      )}"`,
      "Content-Length": String(info.size),
    });
    createReadStream(sourcePath)
      .on("error", () => res.destroy())
      .pipe(res);
    return true;
  }

  if (parts.length === 5 && parts[3] === "attachments") {
    const directory = getExportDirectory(id);
    const attachmentId = decodeSegment(parts[4]);
    if (!directory || !attachmentId || !/^\d{1,25}$/.test(attachmentId)) {
      apiError(res, "attachment not found", 404);
      return true;
    }
    const attachmentsDir = join(directory, "attachments");
    const manifest = await readAttachmentManifest(attachmentsDir);
    let file = manifest?.files[attachmentId]?.file ?? null;
    if (!file || file !== basename(file)) {
      try {
        const names = await readdir(attachmentsDir);
        file =
          names.find(
            (name) =>
              name.startsWith(`${attachmentId}.`) && !name.endsWith(".part")
          ) ?? null;
      } catch {
        file = null;
      }
    }
    if (!file) {
      apiError(res, "attachment not downloaded", 404);
      return true;
    }
    const root = resolve(attachmentsDir);
    const target = resolve(root, file);
    if (target !== root && !target.startsWith(root + sep)) {
      apiError(res, "forbidden", 403);
      return true;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      apiError(res, "attachment not downloaded", 404);
      return true;
    }
    const info = statSync(target);
    const contentType =
      manifest?.files[attachmentId]?.content_type ??
      CONTENT_TYPES[extname(target).toLowerCase()] ??
      "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": String(info.size),
      "Content-Disposition": `${
        contentType.startsWith("image/") ? "inline" : "attachment"
      }; filename="${file}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(target)
      .on("error", () => res.destroy())
      .pipe(res);
    return true;
  }

  if (summary.status === "unindexed") {
    summary = await ensureIndexed(id);
  }
  const current = getExport(id);
  if (!current || current.status !== "ready") {
    sendJson(
      res,
      {
        error:
          current?.status === "failed"
            ? current.error ?? "indexing failed"
            : "the export is still indexing",
        export: current,
      },
      409
    );
    return true;
  }

  const filters = exportFilters(url.searchParams);
  if (parts.length === 4 && parts[3] === "messages") {
    const offset = Math.max(
      0,
      Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0
    );
    const limit = Math.min(
      200,
      Math.max(
        1,
        Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100
      )
    );
    const order =
      (url.searchParams.get("order") ?? "desc").toLowerCase() === "asc"
        ? "asc"
        : "desc";
    const page = queryMessages(id, filters, offset, limit, order);
    if (!page) {
      apiError(res, "export index is not ready", 409);
      return true;
    }
    sendJson(res, { ...page, export: current });
    return true;
  }

  if (parts.length === 5 && parts[3] === "messages") {
    const messageId = decodeSegment(parts[4]);
    if (!messageId) {
      apiError(res, "message not found", 404);
      return true;
    }
    const message = queryMessage(id, messageId);
    if (!message) {
      apiError(res, "message not found", 404);
      return true;
    }
    sendJson(res, { message, export: current });
    return true;
  }

  if (parts.length === 4 && parts[3] === "stats") {
    const stats = queryStats(id, filters);
    if (!stats) {
      apiError(res, "export index is not ready", 409);
      return true;
    }
    sendJson(res, { stats, export: current });
    return true;
  }

  apiError(res, "not found", 404);
  return true;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  let url: URL;
  let pathname: string;
  try {
    url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "127.0.0.1"}`
    );
    pathname = url.pathname;
  } catch {
    apiError(res, "bad request", 400);
    return;
  }
  const method = req.method ?? "GET";
  try {
    if (
      (method === "POST" || method === "DELETE") &&
      !sameOrigin(req)
    ) {
      apiError(res, "cross-origin request refused", 403);
      return;
    }
    if (pathname === "/api/fs") {
      if (method !== "GET") {
        apiError(res, "method not allowed", 405);
        return;
      }
      sendJson(res, {
        listing: await listDirectories(url.searchParams.get("path") ?? ""),
      });
      return;
    }
    if (pathname === "/api/update") {
      if (method !== "GET") {
        apiError(res, "method not allowed", 405);
        return;
      }
      const force = url.searchParams.get("refresh") === "1";
      sendJson(res, {
        update: await checkForUpdates(force),
        version: VERSION,
      });
      return;
    }
    if (pathname === "/api/settings/background") {
      if (method !== "GET") {
        apiError(res, "method not allowed", 405);
        return;
      }
      const background = await readBackground();
      if (!background) {
        apiError(res, "no background image", 404);
        return;
      }
      res.writeHead(200, {
        "Content-Type": background.contentType,
        "Content-Length": String(background.body.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      });
      res.end(background.body);
      return;
    }
    if (pathname === "/api/settings") {
      if (method === "GET") {
        sendJson(res, { settings: currentSettings() });
        return;
      }
      if (method === "POST") {
        const declared = Number.parseInt(
          text(req.headers["content-length"]),
          10
        );
        if (Number.isFinite(declared) && declared > MAX_SETTINGS_BODY) {
          req.resume();
          apiError(res, "the background image is too large", 413);
          return;
        }
        const body = await readJson(req, MAX_SETTINGS_BODY);
        try {
          sendJson(res, { settings: await saveSettings(body) });
        } catch (err) {
          apiError(
            res,
            err instanceof Error ? err.message : String(err),
            400
          );
        }
        return;
      }
      apiError(res, "method not allowed", 405);
      return;
    }
    if (pathname === "/api/token") {
      if (method === "GET") {
        handleTokenStatus(res);
        return;
      }
      if (method === "POST") {
        await handleSetToken(req, res);
        return;
      }
      if (method === "DELETE") {
        await handleClearToken(res);
        return;
      }
      apiError(res, "method not allowed", 405);
      return;
    }
    if (await handleExports(req, res, url)) return;
    if (method === "GET") {
      if (pathname === "/api/logs") {
        sendLogDump(res);
        return;
      }
      if (pathname === "/api/status") {
        sendJson(res, {
          ok: true,
          version: VERSION,
          server_token: Boolean(serverToken()),
          server_token_is_bot: serverTokenIsBot(),
          token_source: tokenSource(),
          token_storage: tokenStorage(),
          jobs: listJobs(),
        });
        return;
      }
      if (pathname === "/api/jobs") {
        sendJson(res, { jobs: listJobs() });
        return;
      }
      if (pathname.startsWith("/api/jobs/")) {
        const parts = jobParts(pathname);
        const job = parts.length >= 3 ? getJob(parts[2]) : null;
        if (!job) {
          apiError(res, "job not found", 404);
          return;
        }
        if (parts.length === 4 && parts[3] === "download") {
          downloadJob(res, job);
          return;
        }
        sendJson(res, { job: job.asDict(true) });
        return;
      }
      if (pathname.startsWith("/api/")) {
        apiError(res, "not found", 404);
        return;
      }
      serveStatic(res, pathname);
      return;
    }

    if (method === "POST") {
      if (pathname === "/api/me") {
        await handleMe(req, res);
        return;
      }
      if (pathname === "/api/info") {
        await handleInfo(req, res);
        return;
      }
      if (pathname === "/api/browse") {
        await handleBrowse(req, res);
        return;
      }
      if (pathname === "/api/jobs") {
        await handleStartJob(req, res);
        return;
      }
      if (pathname.startsWith("/api/jobs/")) {
        const parts = jobParts(pathname);
        const job = parts.length >= 3 ? getJob(parts[2]) : null;
        if (!job) {
          apiError(res, "job not found", 404);
          return;
        }
        if (parts.length === 4 && parts[3] === "stop") {
          if (!job.stop()) {
            apiError(res, "job is not running", 409);
            return;
          }
          sendJson(res, { job: job.asDict(false) });
          return;
        }
        if (parts.length === 4 && parts[3] === "resume") {
          const body = (await readJson(req)) as BrowserBody;
          const token = text(body.token);
          if (token) {
            job.token = token;
            job.config.is_bot = Boolean(body.is_bot ?? false);
            job.tokenSource = "request";
          } else if (serverToken()) {
            job.config.is_bot = serverTokenIsBot();
            job.tokenSource = "server";
          }
          if (!(job.token || serverToken())) {
            apiError(res, "a Discord token is required to resume this job", 400);
            return;
          }
          if (!job.resume()) {
            apiError(res, "job is still running", 409);
            return;
          }
          sendJson(res, { job: job.asDict(false) });
          return;
        }
      }
      apiError(res, "not found", 404);
      return;
    }

    res.writeHead(405, {
      "Content-Type": "application/json; charset=utf-8",
      Allow: "GET, POST",
    });
    res.end(JSON.stringify({ error: "method not allowed" }));
  } catch (err) {
    console.error(err);
    try {
      apiError(res, err instanceof Error ? err.message : String(err), 500);
    } catch {
      res.destroy();
    }
  }
}

const HELP = `discord-messages-exporter web console

Usage:
  discord-messages-exporter-web [--host <address>] [--port <number>]

Options:
  --host <address>  address to bind (default 127.0.0.1)
  --port <number>   port to listen on (default 8788)
  --version         print the version
  --help            show this help

Environment:
  DISCORD_TOKEN           token used when a job does not supply one
  DISCORD_TOKEN_IS_BOT    set to 1 when DISCORD_TOKEN is a bot token`;

export function createApp(): Server {
  const server = createServer((req, res) => {
    void handle(req, res);
  });
  server.on("clientError", (_err, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    }
  });
  return server;
}

export async function main(
  argv: string[] = process.argv.slice(2)
): Promise<number> {
  installLogCapture();
  let values: {
    host?: string;
    port?: string;
    version?: boolean;
    help?: boolean;
  };
  try {
    values = parseArgs({
      args: argv,
      options: {
        host: { type: "string" },
        port: { type: "string" },
        version: { type: "boolean" },
        help: { type: "boolean" },
      },
    }).values;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 2;
  }
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const host = values.host ?? "127.0.0.1";
  const port = values.port ? Number.parseInt(values.port, 10) : 8788;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("--port must be an integer between 0 and 65535");
    return 2;
  }

  // The desktop shell starts this server as a child. If the shell dies
  // without running its exit cleanup, the reparented process exits itself.
  const parentPid = Number(
    process.env.DISCORD_MESSAGES_EXPORTER_PARENT_PID ?? ""
  );
  if (Number.isInteger(parentPid) && parentPid > 0) {
    const watcher = setInterval(() => {
      if (process.ppid !== parentPid) process.exit(0);
    }, 2000);
    watcher.unref();
  }

  await loadSettings();
  await mkdir(RUNS_DIR, { recursive: true });
  if (!environmentToken()) {
    storedToken = await readStoredToken();
  }
  await refreshExports();
  const server = createApp();

  try {
    await new Promise<void>((resolveValue, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolveValue();
      });
    });
  } catch (err) {
    console.error(
      `could not listen on ${host}:${port}: ${
        err instanceof Error ? err.message : err
      }`
    );
    return 1;
  }

  const source = tokenSource();
  const tokenLabel =
    source === "env"
      ? "DISCORD_TOKEN set"
      : source === "stored"
        ? "saved in the OS keychain"
        : "not set (the console will prompt)";
  console.log(
    `discord-messages-exporter web console on http://${host}:${port}\n` +
      `  token: ${tokenLabel}${serverToken() && serverTokenIsBot() ? " (bot)" : ""}\n` +
      `  runs:  ${RUNS_DIR}`
  );

  await new Promise<void>((resolveValue) => {
    const shutdown = () => {
      console.log("\nstopping");
      for (const job of JOBS.values()) job.stop();
      server.close(() => resolveValue());
      server.closeAllConnections();
      // Jobs keep their done markers, so a forced exit only loses the page
      // currently in flight. Without this, an active fetch can hold the
      // process open after Ctrl-C.
      setTimeout(() => process.exit(0), 1500).unref();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
  return 0;
}

function isDirectInvocation(): boolean {
  if (process.env.DISCORD_MESSAGES_EXPORTER_MAIN === "1") return true;
  if (!process.argv[1]) return false;
  try {
    // A Node SEA binary has no import.meta.url; argv[1] is the executable.
    if (realpathSync(process.argv[1]) === realpathSync(process.execPath)) {
      return true;
    }
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  main().then((code) => {
    process.exitCode = code;
  });
}
