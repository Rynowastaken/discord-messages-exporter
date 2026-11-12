/**
 * Unit tests that need no network access.
 *
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { DiscordClient, DiscordMessage } from "../src/api.js";
import {
  AssemblyError,
  assemble,
  assembleLines,
  mergeLines,
  type AssemblyResult,
} from "../src/assemble.js";
import { Crawler, type CrawlConfig } from "../src/crawl.js";
import { ATTACHMENT_FIELDS, slimMessage } from "../src/schema.js";
import {
  parseDate,
  snowflakeAt,
  snowflakeTime,
  splitRanges,
} from "../src/util.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "discord-messages-exporter-test-"));
}

function message(
  messageId: number,
  author = "9",
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: String(messageId),
    author: { id: author },
    timestamp: `t${messageId}`,
    attachments: [],
    content: "",
    ...extra,
  };
}

async function buildWorkdir(
  pages: Record<string, Array<Record<string, unknown>>>
): Promise<string> {
  const workdir = await tempDir();
  await mkdir(join(workdir, "pages"), { recursive: true });
  for (const [name, messages] of Object.entries(pages)) {
    await writeFile(
      join(workdir, "pages", name),
      JSON.stringify(messages),
      "utf8"
    );
  }
  return workdir;
}

describe("snowflakes", () => {
  test("round-trip a timestamp", () => {
    const moment = new Date(Date.UTC(2025, 4, 8, 12, 30));
    const recovered = snowflakeTime(snowflakeAt(moment));
    assert.equal(
      Math.floor(recovered.getTime() / 1000),
      Math.floor(moment.getTime() / 1000)
    );
  });

  test("parseDate is UTC midnight", () => {
    const parsed = parseDate("2025-05-08");
    assert.equal(parsed.getUTCHours(), 0);
    assert.equal(parsed.getUTCMinutes(), 0);
    assert.equal(parsed.toISOString(), "2025-05-08T00:00:00.000Z");
  });

  test("snowflakes increase with time", () => {
    const early = snowflakeAt(new Date(Date.UTC(2024, 0, 1)));
    const late = snowflakeAt(new Date(Date.UTC(2025, 0, 1)));
    assert.ok(early < late);
  });
});

describe("splitRanges", () => {
  test("tiles without gap or overlap", () => {
    const lo = 1000n;
    const hi = 9000n;
    const count = 17;
    const ranges = splitRanges(lo, hi, count);
    assert.equal(ranges.length, count);
    assert.equal(ranges[0][0], lo);
    assert.equal(ranges[ranges.length - 1][1], hi);
    for (let index = 1; index < ranges.length; index += 1) {
      assert.equal(ranges[index - 1][1], ranges[index][0]);
    }
  });

  test("every id belongs to exactly one range", () => {
    const ranges = splitRanges(0n, 500n, 7);
    for (let value = 0n; value < 500n; value += 1n) {
      const owners = ranges.filter(
        ([low, high]) => low <= value && value < high
      );
      assert.equal(owners.length, 1, `${value} owned by ${owners.length}`);
    }
  });

  test("empty and invalid", () => {
    assert.deepEqual(splitRanges(10n, 10n, 5), []);
    assert.throws(() => splitRanges(0n, 10n, 0), /count/);
  });
});

describe("slimMessage", () => {
  const raw = {
    id: "123",
    channel_id: "456",
    timestamp: "2025-05-08T00:00:00+00:00",
    author: { id: "9", username: "someone", bot: false },
    content: "hello",
    attachments: [
      {
        id: "a1",
        filename: "pic.png",
        size: 10,
        content_type: "image/png",
        width: 1,
        height: 2,
        url: "https://cdn.example/x",
        proxy_url: "https://p/x",
        ephemeral: false,
        extra: "dropped",
      },
    ],
    embeds: [{ title: "e" }],
    reactions: [{ emoji: { name: "ok", id: null }, count: 3 }],
    thread: { id: "t1", name: "thread" },
  } as unknown as DiscordMessage;

  test("attachment is metadata only", () => {
    const record = slimMessage(raw);
    const attachment = record.attachments[0];
    assert.deepEqual(
      Object.keys(attachment).sort(),
      [...ATTACHMENT_FIELDS].sort()
    );
    assert.equal(
      (attachment as unknown as Record<string, unknown>).extra,
      undefined
    );
    assert.equal(attachment.url, "https://cdn.example/x");
  });

  test("attachments can be dropped", () => {
    const record = slimMessage(raw, { includeAttachments: false });
    assert.deepEqual(record.attachments, []);
  });

  test("reactions and thread survive", () => {
    const record = slimMessage(raw);
    assert.equal(record.reactions[0]?.emoji, "ok");
    assert.deepEqual(record.thread, { id: "t1", name: "thread" });
  });
});

describe("assemble", () => {
  test("orders ranges and pages chronologically", async () => {
    const workdir = await buildWorkdir({
      "r0000_0002.json": [message(10)],
      "r0000_0001.json": [message(30), message(20)],
      "r0001_0001.json": [message(50), message(40)],
    });
    try {
      const out = join(workdir, "out.json");
      const result = await assemble(workdir, out, { meta: true }, "9");
      assert.equal(result.total, 5);
      assert.equal(result.wrongAuthor, 0);
      const document = JSON.parse(await readFile(out, "utf8")) as {
        messages: Array<{ id: string }>;
      };
      assert.deepEqual(
        document.messages.map((entry) => Number(entry.id)),
        [10, 20, 30, 40, 50]
      );
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("rejects out-of-order pages", async () => {
    const workdir = await buildWorkdir({
      "r0000_0001.json": [message(10)],
      "r0001_0001.json": [message(5)],
    });
    try {
      await assert.rejects(
        assemble(workdir, join(workdir, "out.json"), {}, "9"),
        AssemblyError
      );
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("counts wrong author", async () => {
    const workdir = await buildWorkdir({
      "r0000_0001.json": [message(11), message(10, "7")],
    });
    try {
      const result = await assemble(
        workdir,
        join(workdir, "out.json"),
        {},
        "9"
      );
      assert.equal(result.wrongAuthor, 1);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("whole channel keeps every author", async () => {
    const workdir = await buildWorkdir({
      "r0000_0001.json": [message(11, "7"), message(10, "9")],
    });
    try {
      const result = await assemble(
        workdir,
        join(workdir, "out.json"),
        {},
        null
      );
      assert.equal(result.total, 2);
      assert.equal(result.wrongAuthor, 0);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("lines merge across channels", async () => {
    const first = await buildWorkdir({
      "r0000_0001.json": [message(3, "a"), message(1, "a")],
    });
    const second = await buildWorkdir({
      "r0000_0001.json": [message(4, "b"), message(2, "b")],
    });
    try {
      const firstLines = join(first, "messages.jsonl");
      const secondLines = join(second, "messages.jsonl");
      assert.equal(
        (await assembleLines(first, firstLines, null)).total,
        2
      );
      assert.equal(
        (await assembleLines(second, secondLines, null)).total,
        2
      );
      const out = join(first, "merged.json");
      const result = await mergeLines(
        [firstLines, secondLines],
        out,
        { mode: "server" }
      );
      assert.equal(result.total, 4);
      const document = JSON.parse(await readFile(out, "utf8")) as {
        messages: Array<{ id: string }>;
        export_metadata: { mode: string };
      };
      assert.deepEqual(
        document.messages.map((entry) => Number(entry.id)),
        [1, 2, 3, 4]
      );
      assert.equal(document.export_metadata.mode, "server");
    } finally {
      await rm(first, { recursive: true, force: true });
      await rm(second, { recursive: true, force: true });
    }
  });

  test("empty workdir raises", async () => {
    const workdir = await tempDir();
    try {
      await mkdir(join(workdir, "pages"), { recursive: true });
      await assert.rejects(
        assemble(workdir, join(workdir, "out.json"), {}, "9"),
        AssemblyError
      );
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });
});

class FakeClient {
  rateLimited = 0;
  readonly messages: Array<Record<string, unknown>>;

  constructor(messages: Array<Record<string, unknown>>) {
    this.messages = messages;
  }

  messagesBefore(
    _channelId: string | number,
    before?: bigint | string | number | null,
    limit = 100
  ): Promise<DiscordMessage[]> {
    const rows = this.messages
      .filter(
        (entry) =>
          before === null ||
          before === undefined ||
          BigInt(String(entry.id)) < BigInt(String(before))
      )
      .sort((a, b) =>
        BigInt(String(b.id)) > BigInt(String(a.id)) ? 1 : -1
      )
      .slice(0, limit);
    return Promise.resolve(rows as unknown as DiscordMessage[]);
  }
}

describe("crawler modes", () => {
  function crawlerMessage(messageId: number, author: string): Record<string, unknown> {
    return {
      id: String(messageId),
      channel_id: "c",
      timestamp: `t${messageId}`,
      author: { id: author, username: author },
      content: "",
      attachments: [],
    };
  }

  async function crawl(
    authorId: string | null
  ): Promise<{ report: Awaited<ReturnType<Crawler["run"]>>; out: string; workdir: string }> {
    const workdir = await tempDir();
    const out = join(workdir, "out.json");
    const config: CrawlConfig = {
      channelId: "c",
      loId: 0n,
      hiId: 100n,
      workdir,
      outPath: out,
      authorId,
      ranges: 1,
      workers: 1,
    };
    const client = new FakeClient([
      crawlerMessage(10, "a"),
      crawlerMessage(20, "b"),
      crawlerMessage(30, "a"),
    ]);
    const crawler = new Crawler(
      config,
      client as unknown as DiscordClient,
      { progressInterval: 0.01 }
    );
    return { report: await crawler.run(), out, workdir };
  }

  test("author null keeps every message", async () => {
    const { report, out, workdir } = await crawl(null);
    try {
      assert.ok(report.assembly);
      const assembly = report.assembly as AssemblyResult;
      assert.equal(assembly.total, 3);
      const document = JSON.parse(await readFile(out, "utf8")) as {
        messages: Array<{ author: { id: string } }>;
        export_metadata: { target_user_id: string | null };
      };
      assert.deepEqual(
        new Set(document.messages.map((entry) => entry.author.id)),
        new Set(["a", "b"])
      );
      assert.equal(document.export_metadata.target_user_id, null);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("author filter still applies", async () => {
    const { report, out, workdir } = await crawl("a");
    try {
      assert.ok(report.assembly);
      assert.equal(report.assembly.total, 2);
      const document = JSON.parse(await readFile(out, "utf8")) as {
        messages: Array<{ author: { id: string } }>;
      };
      assert.deepEqual(
        new Set(document.messages.map((entry) => entry.author.id)),
        new Set(["a"])
      );
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("refuses a workdir from a different export", async () => {
    const workdir = await tempDir();
    const client = new FakeClient([
      crawlerMessage(10, "a"),
      crawlerMessage(20, "b"),
    ]);
    const make = (authorId: string | null): CrawlConfig => ({
      channelId: "c",
      loId: 0n,
      hiId: 100n,
      workdir,
      outPath: join(workdir, "out.json"),
      authorId,
      ranges: 1,
      workers: 1,
    });
    try {
      await new Crawler(
        make("a"),
        client as unknown as DiscordClient,
        { progressInterval: 0.01 }
      ).run();
      await assert.rejects(
        new Crawler(
          make("b"),
          client as unknown as DiscordClient,
          { progressInterval: 0.01 }
        ).run(),
        /different export/
      );
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });
});
