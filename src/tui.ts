#!/usr/bin/env node
/**
 * Interactive terminal launcher.
 *
 * Plain line input and ANSI output, no curses dependency. The token comes from
 * DISCORD_TOKEN or a hidden prompt and is never written to disk.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DiscordClient, DiscordError } from "./api.js";
import {
  Crawler,
  type CrawlConfig,
  type CrawlReport,
  type CrawlStats,
  discoverAuthor,
} from "./crawl.js";
import { humanDuration, parseDate, snowflakeAt, StopSignal } from "./util.js";
import { VERSION } from "./version.js";

const SETTINGS_PATH = resolve(homedir(), ".discord-messages-exporter.json");
const LEGACY_SETTINGS_PATH = resolve(
  homedir(),
  ".discord-author-export.json"
);

async function readSettingsFile(): Promise<string> {
  try {
    return await readFile(SETTINGS_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // Keep settings saved under the project's original name.
    return readFile(LEGACY_SETTINGS_PATH, "utf8");
  }
}
const TOKEN_ENV = "DISCORD_TOKEN";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

interface TuiSettings {
  channel: string;
  author: string;
  guild: string;
  since: string;
  until: string;
  out: string;
  work: string;
  ranges: number;
  workers: number;
  rate: number;
}

const DEFAULTS: TuiSettings = {
  channel: "",
  author: "",
  guild: "",
  since: "",
  until: "",
  out: "",
  work: "",
  ranges: 140,
  workers: 8,
  rate: 6,
};

function clear(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function rule(width = 64): string {
  return `${DIM}${"─".repeat(width)}${RESET}`;
}

function bar(fraction: number, width = 34): string {
  const value = Math.min(Math.max(fraction, 0), 1);
  const filled = Math.trunc(width * value);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

async function question(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function hiddenQuestion(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await question(prompt)).trim();
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolveValue, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("interrupted"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolveValue(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (char >= " ") {
          value += char;
          process.stdout.write("*");
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

class LiveStatus {
  private drawn = 0;

  update(lines: string[]): void {
    if (this.drawn) process.stdout.write(`\x1b[${this.drawn}A`);
    for (const line of lines) {
      process.stdout.write(`\x1b[2K${line}\n`);
    }
    this.drawn = lines.length;
  }

  finish(): void {
    this.drawn = 0;
  }
}

export class Launcher {
  private settings: TuiSettings = { ...DEFAULTS };
  private readonly status = new LiveStatus();
  private tokenValue: string | null = null;
  private account: { id?: string; username?: string } | null = null;

  private async loadSettings(): Promise<void> {
    try {
      const stored = JSON.parse(
        await readSettingsFile()
      ) as Partial<TuiSettings>;
      for (const key of Object.keys(DEFAULTS) as Array<keyof TuiSettings>) {
        if (stored[key] !== undefined) {
          // Only known keys are accepted.
          (this.settings as unknown as Record<string, unknown>)[key] =
            stored[key];
        }
      }
      for (const key of ["ranges", "workers", "rate"] as const) {
        const parsed = Number(this.settings[key]);
        if (Number.isFinite(parsed)) this.settings[key] = parsed;
      }
    } catch {
      // Settings are a convenience, never a hard failure.
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await mkdir(dirname(SETTINGS_PATH), { recursive: true });
      await writeFile(
        SETTINGS_PATH,
        JSON.stringify(this.settings, null, 2),
        "utf8"
      );
    } catch {
      // Ignore a failed settings write.
    }
  }

  private async ask(label: string, current?: string): Promise<string> {
    const suffix = current ? ` ${DIM}[${current}]${RESET}` : "";
    try {
      const value = (await question(`  ${label}${suffix}: `)).trim();
      return value || current || "";
    } catch {
      throw new Error("interrupted");
    }
  }

  private async identify(
    token: string
  ): Promise<{ state: "ok" | "invalid" | "unknown"; account: { id?: string; username?: string } | null }> {
    try {
      const client = new DiscordClient(token, { rate: 1.5 });
      return { state: "ok", account: await client.me() };
    } catch (err) {
      if (err instanceof DiscordError && err.status === 401) {
        return { state: "invalid", account: null };
      }
      return { state: "unknown", account: null };
    }
  }

  async signIn(): Promise<boolean> {
    this.header("sign in");
    let envToken = (process.env[TOKEN_ENV] ?? "").trim();
    console.log(`  ${BOLD}A token is needed before anything else.${RESET}`);
    console.log(`  ${DIM}Input is hidden and never written to disk.${RESET}\n`);

    for (;;) {
      const hint = envToken ? ` ${DIM}[Enter = ${TOKEN_ENV}]${RESET}` : "";
      let typed: string;
      try {
        typed = (await hiddenQuestion(`  Discord token${hint}: `)).trim();
      } catch {
        return false;
      }
      const token = typed || envToken;
      if (!token) {
        console.log(`\n  ${YELLOW}A token is required.${RESET}\n`);
        continue;
      }
      const { state, account } = await this.identify(token);
      if (state === "invalid") {
        console.log(`\n  ${RED}Discord rejected that token.${RESET}\n`);
        if (typed) continue;
        envToken = "";
        continue;
      }
      this.tokenValue = token;
      this.account = account;
      if (account) {
        console.log(
          `\n  ${GREEN}verified${RESET} as ${BOLD}${account.username ?? ""}${RESET} ` +
            `${DIM}(${account.id ?? ""})${RESET}`
        );
      } else {
        console.log(
          `\n  ${YELLOW}could not verify the token (network?); ` +
            `continuing anyway${RESET}`
        );
      }
      try {
        await question(`\n  ${DIM}press Enter to continue${RESET}`);
      } catch {
        // End of input still means "continue".
      }
      return true;
    }
  }

  private async token(): Promise<string> {
    if (!this.tokenValue && !(await this.signIn())) {
      throw new Error("no token provided");
    }
    if (!this.tokenValue) throw new Error("no token provided");
    return this.tokenValue;
  }

  header(subtitle = ""): void {
    clear();
    console.log(rule());
    console.log(
      ` ${BOLD}Discord Messages Exporter${RESET} ${DIM}v${VERSION}${RESET}` +
        (subtitle ? `  ${DIM}·${RESET}  ${subtitle}` : "")
    );
    console.log(rule());
    console.log();
  }

  private summary(): void {
    const settings = this.settings;
    const rows: Array<[string, string]> = [
      ["Channel", settings.channel || `${DIM}not set${RESET}`],
      ["Author", settings.author || `${DIM}not set${RESET}`],
      ["Since", settings.since || `${DIM}author's first message${RESET}`],
      ["Until", settings.until || `${DIM}now${RESET}`],
      [
        "Workers",
        `${settings.workers}   pace ${settings.rate}/s   ranges ${settings.ranges}`,
      ],
      ["Output", settings.out || `${DIM}messages_<author>.json${RESET}`],
    ];
    for (const [label, value] of rows) {
      console.log(`  ${DIM}${label.padEnd(9)}${RESET} ${value}`);
    }
    console.log();
  }

  private menu(): void {
    const subtitle = this.account
      ? `signed in as ${this.account.username ?? ""}`
      : "";
    this.header(subtitle);
    this.summary();
    console.log(
      `  ${CYAN}[1]${RESET} Look up author      (count and date range, no crawling)`
    );
    console.log(
      `  ${CYAN}[2]${RESET} Export              (resumes if an earlier run stopped)`
    );
    console.log(`  ${CYAN}[3]${RESET} Settings`);
    console.log(`  ${CYAN}[4]${RESET} Open output folder`);
    console.log(`  ${CYAN}[q]${RESET} Quit`);
    console.log();
  }

  private async editSettings(): Promise<void> {
    this.header("settings");
    console.log(`  ${DIM}Leave blank to keep the current value.${RESET}\n`);
    const settings = this.settings;
    settings.channel = await this.ask(
      "Channel ID",
      settings.channel || undefined
    );
    settings.author = await this.ask(
      "Author ID",
      settings.author || undefined
    );
    settings.guild = await this.ask(
      "Guild ID (blank = look up)",
      settings.guild || undefined
    );
    settings.since = await this.ask(
      "Since (YYYY-MM-DD, blank = first message)",
      settings.since || undefined
    );
    settings.until = await this.ask(
      "Until (YYYY-MM-DD, blank = now)",
      settings.until || undefined
    );
    settings.out = await this.ask("Output path", settings.out || undefined);
    const workers = await this.ask("Workers", String(settings.workers));
    const rate = await this.ask(
      "Requests per second",
      String(settings.rate)
    );
    const ranges = await this.ask("Ranges", String(settings.ranges));
    const parsedWorkers = Number.parseInt(workers, 10);
    const parsedRate = Number.parseFloat(rate);
    const parsedRanges = Number.parseInt(ranges, 10);
    if (Number.isFinite(parsedWorkers)) settings.workers = parsedWorkers;
    if (Number.isFinite(parsedRate)) settings.rate = parsedRate;
    if (Number.isFinite(parsedRanges)) settings.ranges = parsedRanges;
    await this.saveSettings();
    console.log(`\n  ${GREEN}saved${RESET} to ${SETTINGS_PATH}`);
  }

  private requireTarget(): boolean {
    if (!this.settings.channel || !this.settings.author) {
      console.log(
        `\n  ${YELLOW}Set a channel and author in Settings first.${RESET}`
      );
      return false;
    }
    return true;
  }

  private async lookup(): Promise<void> {
    if (!this.requireTarget()) return;
    this.header("look up author");
    try {
      const client = new DiscordClient(await this.token(), {
        rate: this.settings.rate,
      });
      const channelId = this.settings.channel;
      const channel = await client.channel(channelId);
      const guildId =
        this.settings.guild || String(channel.guild_id ?? "");
      const info = await discoverAuthor(
        client,
        guildId,
        channelId,
        this.settings.author
      );
      console.log(
        `  ${DIM}channel${RESET} ${channel.name ?? ""} (${channelId})`
      );
      console.log(`  ${DIM}author ${RESET} ${this.settings.author}`);
      console.log(
        `  ${DIM}total  ${RESET} ${BOLD}${info.totalResults ?? 0}${RESET} messages`
      );
      console.log(`  ${DIM}first  ${RESET} ${info.firstTimestamp}`);
      console.log(`  ${DIM}last   ${RESET} ${info.lastTimestamp}`);
    } catch (err) {
      console.log(
        `  ${RED}${err instanceof Error ? err.message : err}${RESET}`
      );
    }
  }

  private async export(): Promise<void> {
    if (!this.requireTarget()) return;
    this.header("export");
    const settings = this.settings;
    let client: DiscordClient;
    let channelName: string | null = null;
    let guildId: string;
    let loId: bigint;
    let hiId: bigint;
    let total: number;
    try {
      client = new DiscordClient(await this.token(), {
        rate: settings.rate,
      });
      const channel = await client.channel(settings.channel);
      channelName = channel.name ?? null;
      guildId = settings.guild || String(channel.guild_id ?? "");
      const info = await discoverAuthor(
        client,
        guildId,
        settings.channel,
        settings.author
      );
      total = info.totalResults ?? 0;
      if (!total) {
        console.log(
          `  ${YELLOW}No messages by that author in this channel.${RESET}`
        );
        return;
      }
      loId = settings.since
        ? snowflakeAt(parseDate(settings.since))
        : BigInt(info.firstId ?? "0");
      hiId = settings.until
        ? snowflakeAt(parseDate(settings.until))
        : snowflakeAt(new Date());
    } catch (err) {
      console.log(
        `  ${RED}${err instanceof Error ? err.message : err}${RESET}`
      );
      return;
    }

    const author = settings.author;
    const workdir =
      settings.work || `./crawl_${settings.channel}_${author}`;
    const outPath = settings.out || `messages_${author}.json`;
    const config: CrawlConfig = {
      channelId: settings.channel,
      authorId: author,
      loId,
      hiId,
      workdir,
      outPath,
      guildId,
      guildName: null,
      channelName,
      ranges: settings.ranges,
      workers: settings.workers,
      rate: settings.rate,
    };

    const stopSignal = new StopSignal();
    let latest: CrawlStats | null = null;
    const outcome: { report: CrawlReport | null; error: unknown } = {
      report: null,
      error: null,
    };
    let settled = false;
    const crawler = new Crawler(config, client, {
      progress: (stats) => {
        latest = stats;
      },
      progressInterval: 0.5,
      stopSignal,
    });

    console.log(
      `  ${DIM}Ctrl-C pauses and keeps progress for resume.${RESET}\n`
    );
    let interrupted = false;
    const onSigint = () => {
      interrupted = true;
      stopSignal.set();
    };
    process.on("SIGINT", onSigint);
    const running = crawler
      .run()
      .then((value) => {
        outcome.report = value;
      })
      .catch((err) => {
        outcome.error = err;
      })
      .finally(() => {
        settled = true;
      });

    while (!settled) {
      this.status.update(
        this.statusLines(latest, total, performance.now())
      );
      await new Promise((resolveValue) => setTimeout(resolveValue, 400));
    }
    await running;
    process.off("SIGINT", onSigint);
    this.status.finish();

    if (outcome.error) {
      console.log(
        `  ${RED}error: ${
          outcome.error instanceof Error
            ? outcome.error.message
            : outcome.error
        }${RESET}`
      );
      return;
    }
    if (interrupted) {
      console.log(
        `  ${YELLOW}stopped.${RESET} Re-run Export to resume from ` +
          `${workdir}/done.`
      );
      return;
    }
    if (!outcome.report) {
      console.log(`  ${YELLOW}finished without a report.${RESET}`);
      return;
    }
    const result = outcome.report.assembly;
    if (!result) {
      console.log(
        `  ${YELLOW}finished with incomplete ranges.${RESET} ` +
          `See ${workdir}/errors.log, then re-run Export.`
      );
      return;
    }
    console.log(`  ${GREEN}done${RESET} → ${outPath}`);
    console.log(
      `  ${DIM}messages${RESET} ${result.total}   ` +
        `${DIM}attachments${RESET} ${result.attachments} (metadata)   ` +
        `${DIM}size${RESET} ${(result.sizeBytes / 1048576).toFixed(1)} MiB`
    );
    console.log(
      `  ${DIM}range${RESET} ${result.oldestTimestamp} → ${result.newestTimestamp}`
    );
    console.log(
      `  ${DIM}elapsed${RESET} ${humanDuration(outcome.report.stats.elapsed)}   ` +
        `${DIM}pages${RESET} ${outcome.report.stats.pages}   ` +
        `${DIM}429s${RESET} ${outcome.report.stats.rateLimited}`
    );
    try {
      const window = await client.search(guildId, {
        channelId: settings.channel,
        authorId: author,
        minId: loId,
        maxId: hiId - 1n,
      });
      const searchTotal = window.total_results ?? 0;
      if (searchTotal && result.total !== searchTotal) {
        const difference = result.total - searchTotal;
        console.log(
          `  ${DIM}note${RESET} search reports ${searchTotal} in this ` +
            `window (${difference >= 0 ? "+" : ""}${difference}); it can list ` +
            `messages history no longer returns`
        );
      }
    } catch {
      // The count check is best effort.
    }
  }

  private statusLines(
    stats: CrawlStats | null,
    total: number,
    started: number
  ): string[] {
    if (!stats) return [`  ${DIM}starting…${RESET}`];
    const fraction = stats.rangesTotal
      ? stats.rangesDone / stats.rangesTotal
      : 0;
    const elapsed =
      stats.elapsed || (performance.now() - started) / 1000;
    const rate = stats.pagesPerSecond;
    const remaining = stats.rangesTotal - stats.rangesDone;
    let eta = "";
    if (rate > 0 && stats.rangesDone) {
      const pagesLeft =
        remaining * (stats.pages / Math.max(stats.rangesDone, 1));
      eta = `  eta ~${humanDuration(pagesLeft / rate)}`;
    }
    const matchedPercent = total
      ? (stats.messagesMatched / total) * 100
      : 0;
    return [
      `  ${CYAN}${bar(fraction)}${RESET} ${(fraction * 100).toFixed(1)}%`,
      `  ${DIM}ranges${RESET} ${stats.rangesDone}/${stats.rangesTotal}   ` +
        `${DIM}pages${RESET} ${stats.pages}   ` +
        `${DIM}scanned${RESET} ${stats.messagesScanned.toLocaleString("en-US")}`,
      `  ${DIM}matched${RESET} ${stats.messagesMatched.toLocaleString("en-US")}/${total.toLocaleString("en-US")} ` +
        `(${matchedPercent.toFixed(0)}%)   ${DIM}rate${RESET} ${rate.toFixed(1)}p/s   ` +
        `${DIM}elapsed${RESET} ${humanDuration(elapsed)}${eta}`,
      `  ${DIM}429s${RESET} ${stats.rateLimited}   ` +
        `${DIM}work${RESET} ${this.settings.work || "default"}`,
    ];
  }

  private async openOutput(): Promise<void> {
    const target = resolve(this.settings.out || ".");
    const folder = dirname(target);
    this.header("output folder");
    console.log(`  ${folder}`);
    try {
      const command =
        process.platform === "win32"
          ? "cmd"
          : process.platform === "darwin"
            ? "open"
            : "xdg-open";
      const args =
        process.platform === "win32"
          ? ["/c", "start", "", folder]
          : [folder];
      spawn(command, args, {
        detached: true,
        stdio: "ignore",
      }).unref();
    } catch (err) {
      console.log(
        `  ${YELLOW}could not open automatically: ${
          err instanceof Error ? err.message : err
        }${RESET}`
      );
    }
  }

  async run(): Promise<number> {
    await this.loadSettings();
    if (!(await this.signIn())) return 1;
    for (;;) {
      this.menu();
      let choice: string;
      try {
        choice = (await question(`  ${BOLD}>${RESET} `)).trim().toLowerCase();
      } catch {
        console.log();
        return 0;
      }
      if (choice === "q" || choice === "quit" || choice === "exit") {
        return 0;
      }
      try {
        if (choice === "1") await this.lookup();
        else if (choice === "2") await this.export();
        else if (choice === "3") await this.editSettings();
        else if (choice === "4") await this.openOutput();
        else continue;
      } catch (err) {
        console.log(
          `\n  ${RED}${err instanceof Error ? err.message : err}${RESET}`
        );
      }
      try {
        await question(`\n  ${DIM}press Enter to continue${RESET}`);
      } catch {
        return 0;
      }
    }
  }
}

export async function main(
  argv: string[] = process.argv.slice(2)
): Promise<number> {
  if (argv.includes("--version")) {
    console.log(VERSION);
    return 0;
  }
  try {
    return await new Launcher().run();
  } catch (err) {
    if (err instanceof Error && err.message === "interrupted") {
      console.log();
      return 130;
    }
    console.error(err);
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
