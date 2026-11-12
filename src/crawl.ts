/**
 * Range-parallel crawl with resume support.
 *
 * Splitting the snowflake id space into contiguous ranges lets several workers
 * pull different parts of a channel at once. Ids are monotonic, so the ranges
 * tile time exactly. Completion markers under ``done/`` make a re-run resume
 * rather than restart.
 */
import { access, appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DiscordClient,
  DiscordError,
  type DiscordMessage,
} from "./api.js";
import {
  AssemblyError,
  assemble,
  assembleLines,
  type AssemblyResult,
} from "./assemble.js";
import { slimMessage } from "./schema.js";
import {
  splitRanges,
  StopSignal,
  toSnowflake,
} from "./util.js";
import type { ExportMode } from "./types.js";

export type ProgressCallback = (stats: CrawlStats) => void;

export interface CrawlConfig {
  channelId: string;
  authorId: string | null;
  loId: bigint;
  hiId: bigint;
  workdir: string;
  outPath: string;
  guildId?: string | null;
  channelName?: string | null;
  guildName?: string | null;
  ranges?: number;
  workers?: number;
  rate?: number;
  includeAttachments?: boolean;
  downloadAttachments?: boolean;
  keepIds?: boolean;
  lineOutput?: boolean;
  mode?: ExportMode;
}

export class CrawlStats {
  rangesTotal = 0;
  rangesDone = 0;
  pages = 0;
  messagesScanned = 0;
  messagesMatched = 0;
  rateLimited = 0;
  elapsed = 0;
  pagesSeeded = 0;
  errors: string[] = [];

  get pagesPerSecond(): number {
    const fresh = this.pages - this.pagesSeeded;
    return this.elapsed ? fresh / this.elapsed : 0;
  }
}

export interface CrawlReport {
  stats: CrawlStats;
  assembly?: AssemblyResult | null;
  empty: boolean;
}

interface WorkItem {
  index: number;
  lo: bigint;
  hi: bigint;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const pad = (value: number): string => String(value).padStart(4, "0");

interface CrawlManifest {
  version: 1;
  channelId: string;
  authorId: string | null;
  loId: string;
  hiId: string;
  ranges: number;
  mode: string;
  lineOutput: boolean;
}

export class Crawler {
  readonly config: CrawlConfig;
  readonly client: DiscordClient;
  private readonly progress?: ProgressCallback;
  private readonly progressInterval: number;
  readonly stopSignal: StopSignal;
  private readonly pagesDir: string;
  private readonly doneDir: string;
  private readonly errorsPath: string;
  private readonly ranges: Array<[bigint, bigint]>;
  private readonly stats = new CrawlStats();
  private fatal = false;

  constructor(
    config: CrawlConfig,
    client: DiscordClient,
    options: {
      progress?: ProgressCallback;
      progressInterval?: number;
      stopSignal?: StopSignal;
    } = {}
  ) {
    this.config = config;
    this.client = client;
    this.progress = options.progress;
    this.progressInterval = options.progressInterval ?? 10;
    this.stopSignal = options.stopSignal ?? new StopSignal();
    this.pagesDir = join(config.workdir, "pages");
    this.doneDir = join(config.workdir, "done");
    this.errorsPath = join(config.workdir, "errors.log");
    this.ranges = splitRanges(
      config.loId,
      config.hiId,
      config.ranges ?? 140
    );
    this.stats.rangesTotal = this.ranges.length;
  }

  private async prepareWorkdir(): Promise<void> {
    await mkdir(this.config.workdir, { recursive: true });
    const manifestPath = join(this.config.workdir, "crawl.json");
    const manifest: CrawlManifest = {
      version: 1,
      channelId: this.config.channelId,
      authorId: this.config.authorId,
      loId: String(this.config.loId),
      hiId: String(this.config.hiId),
      ranges: this.config.ranges ?? 140,
      mode: this.config.mode ?? "author",
      lineOutput: this.config.lineOutput === true,
    };
    if (await exists(manifestPath)) {
      let previous: Partial<CrawlManifest>;
      try {
        previous = JSON.parse(
          await readFile(manifestPath, "utf8")
        ) as Partial<CrawlManifest>;
      } catch {
        throw new AssemblyError(
          `${manifestPath} is unreadable; use a different work directory ` +
            "or delete it to start over"
        );
      }
      const same =
        previous.version === 1 &&
        previous.channelId === manifest.channelId &&
        (previous.authorId ?? null) === manifest.authorId &&
        previous.loId === manifest.loId &&
        previous.ranges === manifest.ranges &&
        previous.mode === manifest.mode &&
        previous.lineOutput === manifest.lineOutput;
      if (!same) {
        throw new AssemblyError(
          `work directory ${this.config.workdir} belongs to a different ` +
            "export (channel, author, start, range count, or mode changed); " +
            "use a different work directory or delete it to start over"
        );
      }
      return;
    }
    const tmpPath = `${manifestPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
    await rename(tmpPath, manifestPath);
  }

  private donePath(index: number): string {
    return join(this.doneDir, `${pad(index)}.done`);
  }

  private async runRange(index: number, lo: bigint, hi: bigint): Promise<void> {
    if (await exists(this.donePath(index))) return;

    let before: bigint | null = hi;
    let sequence = 0;
    let matched = 0;
    let scanned = 0;
    for (;;) {
      const batch: DiscordMessage[] = await this.client.messagesBefore(
        this.config.channelId,
        before,
        100
      );
      if (!batch.length) break;
      const ids = batch.map((message) => toSnowflake(message.id));
      const kept = batch.filter((_, position) => ids[position] >= lo);
      const keptIds = ids.filter((id) => id >= lo);
      const hits = kept
        .filter((message) => {
          if (this.config.authorId === null) return true;
          return message.author?.id === this.config.authorId;
        })
        .map((message) =>
          slimMessage(message, {
            includeAttachments: this.config.includeAttachments !== false,
          })
        );
      sequence += 1;
      matched += hits.length;
      scanned += keptIds.length;

      const path = join(
        this.pagesDir,
        `r${pad(index)}_${pad(sequence)}.json`
      );
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify(hits), "utf8");
      await rename(tmp, path);

      this.stats.pages += 1;
      this.stats.messagesScanned += keptIds.length;
      this.stats.messagesMatched += hits.length;

      const oldest = ids[ids.length - 1];
      if (oldest <= lo || batch.length < 100) break;
      before = oldest;
    }

    await writeFile(
      this.donePath(index),
      JSON.stringify({
        index,
        lo: String(lo),
        hi: String(hi),
        pages: sequence,
        scanned,
        matched,
      }),
      "utf8"
    );
  }

  private async recordError(
    index: number,
    lo: bigint,
    hi: bigint,
    err: unknown
  ): Promise<void> {
    const message = `range ${index} (${lo}-${hi}) failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
    this.stats.errors.push(message);
    await appendFile(this.errorsPath, message + "\n", "utf8");
  }

  private async worker(queue: WorkItem[]): Promise<void> {
    while (!this.stopSignal.isSet() && !this.fatal) {
      const item = queue.shift();
      if (!item) return;
      try {
        await this.runRange(item.index, item.lo, item.hi);
      } catch (err) {
        if (err instanceof DiscordError && [401, 403, 404].includes(err.status)) {
          if (!this.fatal) {
            this.stats.errors.push(
              `range ${item.index} (${item.lo}-${item.hi}) failed: ${err.message}`
            );
            this.fatal = true;
          }
          return;
        }
        await this.recordError(item.index, item.lo, item.hi, err);
      }
    }
  }

  private async seedFromMarkers(): Promise<void> {
    let seededPages = 0;
    for (let index = 0; index < this.ranges.length; index += 1) {
      const path = this.donePath(index);
      if (!(await exists(path))) continue;
      try {
        const marker = JSON.parse(await readFile(path, "utf8")) as {
          pages?: number;
          scanned?: number;
          matched?: number;
        };
        const pages = Number(marker.pages ?? 0);
        seededPages += pages;
        this.stats.pages += pages;
        this.stats.messagesScanned += Number(marker.scanned ?? 0);
        this.stats.messagesMatched += Number(marker.matched ?? 0);
      } catch {
        // A corrupt marker simply leaves that range to be retried.
      }
    }
    this.stats.pagesSeeded = seededPages;
  }

  private async tick(started: number): Promise<void> {
    this.stats.elapsed = (performance.now() - started) / 1000;
    let done = 0;
    for (let index = 0; index < this.ranges.length; index += 1) {
      if (await exists(this.donePath(index))) done += 1;
    }
    this.stats.rangesDone = done;
    this.stats.rateLimited = this.client.rateLimited;
    this.progress?.(this.stats);
  }

  async run(): Promise<CrawlReport> {
    await this.prepareWorkdir();
    await mkdir(this.pagesDir, { recursive: true });
    await mkdir(this.doneDir, { recursive: true });
    await this.seedFromMarkers();

    const queue: WorkItem[] = [];
    for (let index = 0; index < this.ranges.length; index += 1) {
      const [lo, hi] = this.ranges[index];
      if (!(await exists(this.donePath(index)))) queue.push({ index, lo, hi });
    }

    const started = performance.now();
    let finished = false;
    const progressTask = (async () => {
      let lastTick = performance.now();
      while (!finished) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (finished) break;
        if (performance.now() - lastTick >= this.progressInterval * 1000) {
          lastTick = performance.now();
          await this.tick(started);
        }
      }
    })();

    const workers = Array.from(
      { length: Math.max(1, this.config.workers ?? 8) },
      () => this.worker(queue)
    );
    let workerFailure: unknown = null;
    try {
      await Promise.all(workers);
    } catch (err) {
      workerFailure = err;
    }
    finished = true;
    await progressTask;
    if (workerFailure) throw workerFailure;
    await this.tick(started);

    const report: CrawlReport = { stats: this.stats, empty: false };
    const complete =
      !this.stopSignal.isSet() &&
      this.stats.errors.length === 0 &&
      this.stats.rangesDone === this.stats.rangesTotal;
    if (complete) {
      if (this.stats.messagesMatched === 0) {
        report.empty = true;
      } else {
        try {
          report.assembly = await this.assembleOutput();
        } catch (err) {
          if (!this.config.lineOutput) throw err;
          this.stats.errors.push(
            `assembly failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
    return report;
  }

  private metadata(): Record<string, unknown> {
    const includeAttachments = this.config.includeAttachments !== false;
    return {
      mode: this.config.mode ?? "author",
      channel: {
        id: this.config.channelId,
        name: this.config.channelName ?? null,
      },
      guild: {
        id: this.config.guildId ?? null,
        name: this.config.guildName ?? null,
      },
      target_user_id: this.config.authorId,
      ordering: "chronological (oldest first)",
      attachments_note: includeAttachments
        ? this.config.downloadAttachments
          ? "Attachment metadata is included and the binaries are copied into the export's attachments directory when the crawl finishes. url/proxy_url remain signed CDN links that expire."
          : "Attachment binaries were NOT downloaded. Only metadata is included; url/proxy_url are signed CDN links that expire."
        : "Attachment records were excluded from this export.",
      crawl: {
        ranges: this.config.ranges ?? 140,
        workers: this.config.workers ?? 8,
        pace_requests_per_second: this.config.rate ?? 6,
        pages: this.stats.pages,
        messages_scanned: this.stats.messagesScanned,
        messages_matched: this.stats.messagesMatched,
      },
    };
  }

  private async assembleOutput(): Promise<AssemblyResult> {
    if (this.config.lineOutput) {
      return assembleLines(
        this.config.workdir,
        this.config.outPath,
        this.config.authorId
      );
    }
    return assemble(
      this.config.workdir,
      this.config.outPath,
      this.metadata(),
      this.config.authorId,
      { keepIds: this.config.keepIds }
    );
  }
}

export interface AuthorInfo {
  totalResults: number | null;
  firstTimestamp: string | null;
  firstId: string | null;
  lastTimestamp: string | null;
  lastId: string | null;
}

/** Report where an author's messages sit, without crawling. */
export async function discoverAuthor(
  client: DiscordClient,
  guildId: string,
  channelId: string,
  authorId: string
): Promise<AuthorInfo> {
  const earliest = await client.search(guildId, {
    channelId,
    authorId,
    sortOrder: "asc",
    offset: 0,
  });
  const latest = await client.search(guildId, {
    channelId,
    authorId,
    sortOrder: "desc",
    offset: 0,
  });
  const first = earliest.messages?.[0]?.[0];
  const last = latest.messages?.[0]?.[0];
  return {
    totalResults: earliest.total_results ?? null,
    firstTimestamp: first?.timestamp ?? null,
    firstId: first?.id ?? null,
    lastTimestamp: last?.timestamp ?? null,
    lastId: last?.id ?? null,
  };
}

export { AssemblyError };
