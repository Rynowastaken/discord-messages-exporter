#!/usr/bin/env node
/**
 * Command line interface.
 *
 * ``info`` reports where an author's messages sit; ``export`` crawls them.
 */
import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DiscordClient, DiscordError } from "./api.js";
import {
  Crawler,
  type CrawlConfig,
  type CrawlStats,
  discoverAuthor,
} from "./crawl.js";
import { downloadExportAttachments } from "./attachments.js";
import { humanDuration, parseDate, snowflakeAt } from "./util.js";
import { VERSION } from "./version.js";

const TOKEN_ENV = "DISCORD_TOKEN";

interface CommonOptions {
  channel: string;
  author: string;
  guild?: string;
  token?: string;
  bot: boolean;
  rate: number;
  timeout: number;
}

interface ExportOptions extends CommonOptions {
  since?: string;
  until?: string;
  out?: string;
  work?: string;
  ranges: number;
  workers: number;
  noAttachments: boolean;
  downloadAttachments: boolean;
  checkTotal: boolean;
}

function clientFor(options: CommonOptions): DiscordClient {
  const token = options.token ?? process.env[TOKEN_ENV];
  if (!token) {
    throw new UsageError(`no token: pass --token or set ${TOKEN_ENV}`);
  }
  return new DiscordClient(token, {
    rate: options.rate,
    isBot: options.bot,
    timeout: options.timeout,
  });
}

class UsageError extends Error {}

async function guildIdFor(
  client: DiscordClient,
  channelId: string,
  explicit?: string
): Promise<string> {
  if (explicit) return explicit;
  const channel = await client.channel(channelId);
  if (!channel.guild_id) {
    throw new UsageError(
      `channel ${channelId} has no guild; pass --guild`
    );
  }
  return String(channel.guild_id);
}

function printStats(stats: CrawlStats): void {
  const rate = stats.pagesPerSecond;
  process.stderr.write(
    `\rranges ${stats.rangesDone}/${stats.rangesTotal}  ` +
      `pages=${stats.pages}  scanned=${stats.messagesScanned}  ` +
      `matched=${stats.messagesMatched}  ${rate.toFixed(1)}p/s  ` +
      `429s=${stats.rateLimited}   `
  );
}

export async function cmdInfo(options: CommonOptions): Promise<number> {
  const client = clientFor(options);
  const guildId = await guildIdFor(client, options.channel, options.guild);
  const info = await discoverAuthor(
    client,
    guildId,
    options.channel,
    options.author
  );
  const channel = await client.channel(options.channel);
  console.log(`channel : ${channel.name ?? ""} (${options.channel})`);
  console.log(`author  : ${options.author}`);
  console.log(`messages: ${info.totalResults}`);
  console.log(`first   : ${info.firstTimestamp}`);
  console.log(`last    : ${info.lastTimestamp}`);
  return 0;
}

export async function cmdExport(options: ExportOptions): Promise<number> {
  if (options.downloadAttachments && options.noAttachments) {
    throw new UsageError(
      "--download-attachments cannot be used with --no-attachments"
    );
  }
  const client = clientFor(options);
  const channelId = options.channel;
  const authorId = options.author;
  const guildId = await guildIdFor(client, channelId, options.guild);

  const channel = await client.channel(channelId);
  let guildName: string | null = null;
  try {
    const guild = await client.guild(guildId);
    guildName = guild.name ?? null;
  } catch (err) {
    if (!(err instanceof DiscordError)) throw err;
  }

  const info = await discoverAuthor(client, guildId, channelId, authorId);
  if (!info.totalResults) {
    process.stderr.write(
      `no messages by ${authorId} in channel ${channelId}\n`
    );
    return 1;
  }

  let loId: bigint;
  if (options.since) {
    loId = snowflakeAt(parseDate(options.since));
  } else {
    loId = BigInt(info.firstId ?? "0");
    process.stderr.write(
      `first message by this author: ${info.firstTimestamp} ` +
        `(no earlier range to scan)\n`
    );
  }
  const hiId = options.until
    ? snowflakeAt(parseDate(options.until))
    : snowflakeAt(new Date());

  const workdir = options.work ?? `./crawl_${channelId}_${authorId}`;
  const outPath = options.out ?? `messages_${authorId}.json`;

  process.stderr.write(
    `exporting ${authorId} from ${channel.name ?? ""} ` +
      `(${channelId}); search reports ${info.totalResults} messages\n`
  );
  process.stderr.write(
    `work dir ${workdir}  output ${outPath}  ` +
      `${options.ranges} ranges / ${options.workers} workers at ` +
      `${options.rate}/s\n`
  );

  const config: CrawlConfig = {
    channelId,
    authorId,
    loId,
    hiId,
    workdir,
    outPath,
    guildId,
    guildName,
    channelName: channel.name ?? null,
    ranges: options.ranges,
    workers: options.workers,
    rate: options.rate,
    includeAttachments: !options.noAttachments,
    downloadAttachments: options.downloadAttachments,
    keepIds: options.checkTotal,
  };
  const crawler = new Crawler(config, client, {
    progress: printStats,
  });
  const report = await crawler.run();
  process.stderr.write("\n");

  const stats = report.stats;
  if (stats.errors.length) {
    process.stderr.write(
      `${stats.errors.length} range(s) failed; see ${workdir}/errors.log\n`
    );
    for (const error of stats.errors.slice(0, 5)) {
      process.stderr.write(`  ${error}\n`);
    }
    process.stderr.write(
      "re-run the same command to retry only the failed ranges\n"
    );
    return 3;
  }

  const result = report.assembly;
  if (!result) {
    process.stderr.write("crawl finished without an assembly result\n");
    return 3;
  }
  let attachmentLine =
    `${result.attachments} ` +
    `(${options.noAttachments ? "excluded" : "metadata only"})`;
  if (options.downloadAttachments && result.attachments > 0) {
    const attachmentDir = join(workdir, "attachments");
    process.stderr.write(`archiving attachments in ${attachmentDir}\n`);
    const downloads = await downloadExportAttachments({
      sourcePath: outPath,
      outDir: attachmentDir,
      onProgress: (progress) => {
        const done =
          progress.downloaded + progress.skipped + progress.failed;
        process.stderr.write(
          `\rattachments ${done}/${progress.total} ` +
            `(${progress.failed} failed)   `
        );
      },
    });
    process.stderr.write("\n");
    attachmentLine =
      `${result.attachments} ` +
      `(${downloads.downloaded} downloaded, ${downloads.skipped} existing, ` +
      `${downloads.failed} failed, ${(downloads.bytes / 1048576).toFixed(1)} MiB)`;
  }
  console.log(`wrote ${outPath}`);
  console.log(`  messages     : ${result.total}`);
  console.log(`  wrong author : ${result.wrongAuthor}`);
  console.log(`  attachments  : ${attachmentLine}`);
  console.log(`  size         : ${(result.sizeBytes / 1048576).toFixed(1)} MiB`);
  console.log(
    `  range        : ${result.oldestTimestamp} -> ${result.newestTimestamp}`
  );
  console.log(
    `  elapsed      : ${humanDuration(stats.elapsed)} ` +
      `(${stats.pages} pages, ${stats.rateLimited} rate limits)`
  );

  if (options.checkTotal && result.ids.length) {
    let searchTotal = 0;
    try {
      const window = await client.search(guildId, {
        channelId,
        authorId,
        minId: loId,
        maxId: hiId - 1n,
      });
      searchTotal = window.total_results ?? 0;
    } catch (err) {
      if (!(err instanceof DiscordError)) throw err;
    }
    if (searchTotal && result.total !== searchTotal) {
      const difference = result.total - searchTotal;
      process.stderr.write(
        `  note         : search reports ${searchTotal} in this window, ` +
          `export has ${result.total} (${difference >= 0 ? "+" : ""}${difference}). ` +
          "Search can list messages the history endpoint no longer returns, " +
          "typically deleted ones.\n"
      );
    } else if (searchTotal) {
      process.stderr.write(
        `  check        : matches search exactly (${searchTotal} messages)\n`
      );
    }
  }
  return 0;
}

function numberOption(
  value: string | undefined,
  fallback: number,
  label: string
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new UsageError(`${label} must be a number`);
  }
  return parsed;
}

const HELP = `discord-messages-exporter

Usage:
  discord-messages-exporter info --channel <id> --author <id> [options]
  discord-messages-exporter export --channel <id> --author <id> [options]

Common options:
  --guild <id>       guild id (looked up from the channel if omitted)
  --token <token>    token (default: $DISCORD_TOKEN)
  --bot              token is a bot token
  --rate <n>         requests per second, all workers combined (default 6)
  --timeout <n>      per-request timeout in seconds (default 45)

Export options:
  --since <date>     ISO date to start from (default: author's first message)
  --until <date>     ISO date to stop at (default: now)
  --out <path>       output JSON path
  --work <dir>       working directory for resumable state
  --ranges <n>       id ranges to split the scan into (default 140)
  --workers <n>      concurrent fetchers (default 8)
  --no-attachments   omit attachment metadata entirely
  --download-attachments  copy attachment files next to the crawl work dir
  --check-total      compare the exported count with search
  --version          print the version
  --help             show this help`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean" },
        version: { type: "boolean" },
        channel: { type: "string" },
        author: { type: "string" },
        guild: { type: "string" },
        token: { type: "string" },
        bot: { type: "boolean" },
        rate: { type: "string" },
        timeout: { type: "string" },
        since: { type: "string" },
        until: { type: "string" },
        out: { type: "string" },
        work: { type: "string" },
        ranges: { type: "string" },
        workers: { type: "string" },
        "no-attachments": { type: "boolean" },
        "download-attachments": { type: "boolean" },
        "check-total": { type: "boolean" },
      },
    });
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    return 2;
  }

  const { values, positionals } = parsed;
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  if (values.help || !positionals.length) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  const command = positionals[0];
  if (command !== "info" && command !== "export") {
    process.stderr.write(`unknown command: ${command}\n${HELP}\n`);
    return 2;
  }
  if (!values.channel || !values.author) {
    process.stderr.write("--channel and --author are required\n");
    return 2;
  }

  try {
    const common: CommonOptions = {
      channel: values.channel,
      author: values.author,
      guild: values.guild,
      token: values.token,
      bot: Boolean(values.bot),
      rate: numberOption(values.rate, 6, "--rate"),
      timeout: numberOption(values.timeout, 45, "--timeout"),
    };
    if (command === "info") {
      return await cmdInfo(common);
    }
    return await cmdExport({
      ...common,
      since: values.since,
      until: values.until,
      out: values.out,
      work: values.work,
      ranges: numberOption(values.ranges, 140, "--ranges"),
      workers: numberOption(values.workers, 8, "--workers"),
      noAttachments: Boolean(values["no-attachments"]),
      downloadAttachments: Boolean(values["download-attachments"]),
      checkTotal: Boolean(values["check-total"]),
    });
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    if (err instanceof DiscordError) {
      process.stderr.write(`discord error: ${err.message}\n`);
      if (err.status === 403 && err.body.includes("Only bots")) {
        process.stderr.write(
          "hint: this token is a user token, and some endpoints " +
            "(single-message fetch) are bot-only\n"
        );
      }
      return 2;
    }
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    return 1;
  }
}

function isDirectInvocation(): boolean {
  if (!process.argv[1]) return false;
  try {
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
