import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  after,
  before,
  beforeEach,
  describe,
  test,
} from "node:test";
import { DiscordError, type DiscordClient } from "../../src/api.js";
import { parseDate, snowflakeAt } from "../../src/util.js";
import {
  Job,
  createApp,
  setClientFactory,
  textChannels,
} from "../server.js";
import { recordLog } from "../log-buffer.js";

interface JobInternals {
  run(): Promise<void>;
  rangesSnapshot(): Promise<
    Array<{ index: number; pages: number; share: number }>
  >;
  eta(): number | null;
  bounds(channelId: string): [bigint, bigint];
  computeMulti(): Promise<Record<string, number>>;
}

function internals(job: Job): JobInternals {
  return job as unknown as JobInternals;
}

async function waitFor(
  check: () => boolean,
  timeoutMs = 10000
): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("timed out waiting for the job");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

class FakeDiscordClient {
  static failChannel: string | null = null;
  static failMembers = false;
  rateLimited = 0;

  constructor(_token: string, _options?: unknown) {}

  me() {
    return Promise.resolve({
      id: "u1",
      username: "someone",
      global_name: "Someone",
      bot: false,
    });
  }

  guild(guildId: string) {
    return Promise.resolve({ id: guildId, name: "Test Guild" });
  }

  userGuilds() {
    return Promise.resolve([
      { id: "g2", name: "Second Server", icon: null },
      { id: "g", name: "Test Guild", icon: "abc123" },
    ]);
  }

  channel(channelId: string) {
    return Promise.resolve({
      id: channelId,
      name: `channel-${channelId}`,
      guild_id: "g",
    });
  }

  guildChannels(_guildId: string) {
    return Promise.resolve([
      { id: "101", name: "general", type: 0, position: 0 },
      { id: "102", name: "random", type: 0, position: 1 },
      { id: "103", name: "voice", type: 2, position: 2 },
    ]);
  }

  searchMembers(_guildId: string, _query: string, _limit = 25) {
    if (FakeDiscordClient.failMembers) {
      return Promise.reject(
        new DiscordError(403, "missing access", "/members")
      );
    }
    return Promise.resolve([
      {
        user: {
          id: "u1",
          username: "ryno",
          global_name: "Ryno",
        },
        nick: null,
      },
      { user: { id: "u2", username: "botty", bot: true }, nick: "Botty" },
    ]);
  }

  messagesBefore(
    channelId: string,
    before?: bigint | string | number | null,
    limit = 100
  ) {
    if (
      FakeDiscordClient.failChannel !== null &&
      String(channelId) === FakeDiscordClient.failChannel
    ) {
      return Promise.reject(
        new DiscordError(403, "missing access", "/messages")
      );
    }
    const rows: Record<string, number[]> = {
      "101": [1000, 1001],
      "102": [2000, 2001],
    };
    const ids = rows[String(channelId)] ?? [];
    const selected = ids
      .filter(
        (messageId) =>
          before === null ||
          before === undefined ||
          BigInt(messageId) < BigInt(String(before))
      )
      .sort((a, b) => b - a)
      .slice(0, limit);
    return Promise.resolve(
      selected.map((messageId) => ({
        id: String(messageId),
        channel_id: String(channelId),
        timestamp: `t${messageId}`,
        author: { id: "u1", username: "someone" },
        content: "",
        attachments: [],
      }))
    );
  }
}

function useFakeClient(): void {
  FakeDiscordClient.failChannel = null;
  FakeDiscordClient.failMembers = false;
  setClientFactory(
    () => new FakeDiscordClient("t") as unknown as DiscordClient
  );
}

async function makeJob(
  payload: Record<string, unknown>
): Promise<{ job: Job; directory: string }> {
  const job = new Job(payload);
  // Keep test runs out of the real web/runs directory.
  const directory = await mkdtemp(join(tmpdir(), "dae-job-"));
  (job as unknown as { jobDir: string }).jobDir = directory;
  (job as unknown as { workdir: string }).workdir = join(directory, "work");
  (job as unknown as { outPath: string }).outPath = join(
    directory,
    "messages.json"
  );
  return { job, directory };
}

describe("Job", () => {
  test("token never serialized", async () => {
    const { job, directory } = await makeJob({
      channel: "c",
      author: "a",
      token: "super-secret",
    });
    try {
      const payload = JSON.stringify(job.asDict(true));
      assert.ok(!payload.includes("super-secret"));
      assert.equal(job.tokenSource, "request");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("missing token fails cleanly", async () => {
    const old = process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_TOKEN;
    const { job, directory } = await makeJob({ channel: "c", author: "a" });
    try {
      await internals(job).run();
      assert.equal(job.status, "failed");
      assert.match(job.error ?? "", /token/);
      assert.equal(job.token, "");
    } finally {
      await rm(directory, { recursive: true, force: true });
      if (old === undefined) delete process.env.DISCORD_TOKEN;
      else process.env.DISCORD_TOKEN = old;
    }
  });

  test("range snapshot reads markers", async () => {
    const { job, directory } = await makeJob({ channel: "c", author: "a" });
    try {
      const done = join(job.workdir, "done");
      await mkdir(done, { recursive: true });
      await writeFile(
        join(done, "0000.done"),
        JSON.stringify({ idx: 0, lo: 10, hi: 20, pages: 10, matched: 3 })
      );
      await writeFile(
        join(done, "0001.done"),
        JSON.stringify({ idx: 1, lo: 20, hi: 30, pages: 5, matched: 1 })
      );
      const ranges = await internals(job).rangesSnapshot();
      assert.deepEqual(
        ranges.map((item) => item.index),
        [0, 1]
      );
      assert.equal(ranges[0].pages, 10);
      assert.equal(ranges[0].share, 1.0);
      assert.equal(ranges[1].share, 0.5);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("stats and eta", async () => {
    const { job, directory } = await makeJob({ channel: "c", author: "a" });
    try {
      job.stats = {
        ranges_total: 10,
        ranges_done: 5,
        pages: 500,
        pages_per_second: 5.0,
      };
      assert.equal(internals(job).eta(), 100.0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("token type follows its source", async () => {
    const oldToken = process.env.DISCORD_TOKEN;
    const oldBot = process.env.DISCORD_TOKEN_IS_BOT;
    process.env.DISCORD_TOKEN = "server-secret";
    process.env.DISCORD_TOKEN_IS_BOT = "1";
    try {
      const serverJob = new Job({ channel: "c", author: "a" });
      assert.equal(serverJob.tokenSource, "server");
      assert.equal(serverJob.config.is_bot, true);

      const requestJob = new Job({
        channel: "c",
        author: "a",
        token: "request-secret",
        is_bot: false,
      });
      assert.equal(requestJob.tokenSource, "request");
      assert.equal(requestJob.config.is_bot, false);
    } finally {
      if (oldToken === undefined) delete process.env.DISCORD_TOKEN;
      else process.env.DISCORD_TOKEN = oldToken;
      if (oldBot === undefined) delete process.env.DISCORD_TOKEN_IS_BOT;
      else process.env.DISCORD_TOKEN_IS_BOT = oldBot;
    }
  });

  test("mode defaults and download names", async () => {
    const author = new Job({ channel: "c", author: "a" });
    assert.equal(author.config.mode, "author");
    assert.equal(author.downloadName(), "messages_a.json");

    const channel = new Job({
      mode: "channel",
      channel: "c",
      author: "a",
    });
    assert.equal(channel.config.mode, "channel");
    assert.equal(channel.config.author, "");
    assert.equal(channel.downloadName(), "messages_channel_c.json");

    const guild = new Job({
      mode: "server",
      server: "g",
      channel: "c",
    });
    assert.equal(guild.config.mode, "server");
    assert.equal(guild.config.channel, "");
    assert.equal(guild.downloadName(), "messages_server_g.json");
  });

  test("channel bounds start at the channel snowflake", async () => {
    const channelId = String(snowflakeAt(new Date(Date.UTC(2024, 0, 1))));
    const job = new Job({ mode: "channel", channel: channelId });
    const [loId, hiId] = internals(job).bounds(channelId);
    assert.equal(loId, BigInt(channelId));
    assert.ok(hiId > loId);

    const since = "2025-05-08";
    const sinceJob = new Job({
      mode: "channel",
      channel: channelId,
      since,
    });
    const [sinceLo] = internals(sinceJob).bounds(channelId);
    assert.equal(sinceLo, snowflakeAt(parseDate(since)));
  });

  test("text channels filters and sorts", () => {
    const channels = textChannels([
      { id: "3", name: "later", type: 0, position: 2 },
      { id: "1", name: "voice", type: 2, position: 0 },
      { id: "2", name: "announce", type: 5, position: 1 },
      { id: "4", name: "category", type: 4, position: 0 },
      { id: "5", name: "first", type: 0, position: 0 },
    ]);
    assert.deepEqual(
      channels.map((item) => item.id),
      ["5", "2", "3"]
    );
  });

  test("multi stats aggregate channel markers", async () => {
    const { job, directory } = await makeJob({
      mode: "server",
      server: "g",
    });
    try {
      job.channels = [
        {
          id: "c1",
          name: "one",
          status: "done",
          ranges_total: 2,
          ranges_done: 2,
          pages: 5,
          matched: 9,
          scanned: 12,
        },
        {
          id: "c2",
          name: "two",
          status: "running",
          ranges_total: 1,
          ranges_done: 0,
          pages: 0,
          matched: 0,
          scanned: 0,
        },
      ];
      (job as unknown as { plannedRanges: number }).plannedRanges = 3;
      (job as unknown as { finalChannels: Set<string> }).finalChannels =
        new Set(["c1"]);
      const done = join(job.workdir, "c2", "done");
      await mkdir(done, { recursive: true });
      await writeFile(
        join(done, "0000.done"),
        JSON.stringify({ index: 0, lo: 1, hi: 2, pages: 3, matched: 4 })
      );
      const stats = await internals(job).computeMulti();
      assert.equal(stats.ranges_total, 3);
      assert.equal(stats.ranges_done, 3);
      assert.equal(stats.pages, 8);
      assert.equal(stats.messages_matched, 13);
      assert.equal(stats.channels_total, 2);
      assert.equal(stats.channels_done, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("server-mode jobs", () => {
  beforeEach(() => {
    useFakeClient();
  });

  after(() => {
    setClientFactory(null);
  });

  test("merges text channels", async () => {
    const { job, directory } = await makeJob({
      mode: "server",
      server: "g",
      token: "t",
      ranges: 1,
      workers: 1,
    });
    try {
      await internals(job).run();
      assert.equal(job.status, "done", job.error ?? "no error");
      const assembly = job.assembly as { total: number };
      assert.equal(assembly.total, 4);
      assert.deepEqual(
        job.channels.map((item) => item.status),
        ["done", "done"]
      );
      const document = JSON.parse(
        await readFile(job.outPath, "utf8")
      ) as {
        messages: Array<{ id: string }>;
        export_metadata: {
          mode: string;
          channels: Array<{ name: string }>;
        };
      };
      assert.deepEqual(
        document.messages.map((entry) => Number(entry.id)),
        [1000, 1001, 2000, 2001]
      );
      assert.equal(document.export_metadata.mode, "server");
      assert.deepEqual(
        document.export_metadata.channels.map((channel) => channel.name),
        ["general", "random"]
      );
      assert.equal(job.downloadName(), "messages_server_g.json");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("keeps finished channels when one fails", async () => {
    FakeDiscordClient.failChannel = "102";
    const { job, directory } = await makeJob({
      mode: "server",
      server: "g",
      token: "t",
      ranges: 1,
      workers: 1,
    });
    try {
      await internals(job).run();
      assert.equal(job.status, "partial", job.error ?? "no error");
      const assembly = job.assembly as { total: number };
      assert.equal(assembly.total, 2);
      assert.notEqual(job.asDict(true).output, null);
      const statuses = Object.fromEntries(
        job.channels.map((item) => [item.id, item.status])
      );
      assert.equal(statuses["101"], "done");
      assert.equal(statuses["102"], "failed");
      const document = JSON.parse(
        await readFile(job.outPath, "utf8")
      ) as { messages: Array<{ id: string }> };
      assert.deepEqual(
        document.messages.map((entry) => Number(entry.id)),
        [1000, 1001]
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("resume retries failed channels", async () => {
    FakeDiscordClient.failChannel = "102";
    const { job, directory } = await makeJob({
      mode: "server",
      server: "g",
      token: "t",
      ranges: 1,
      workers: 1,
    });
    try {
      await internals(job).run();
      assert.equal(job.status, "partial");
      FakeDiscordClient.failChannel = null;
      job.token = "t";
      assert.equal(job.resume(), true);
      await waitFor(() => ["done", "failed", "empty"].includes(job.status));
      assert.equal(job.status, "done", job.error ?? "no error");
      const assembly = job.assembly as { total: number };
      assert.equal(assembly.total, 4);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("channel mode keeps every author", async () => {
    const { job, directory } = await makeJob({
      mode: "channel",
      channel: "101",
      token: "t",
      ranges: 1,
      workers: 1,
    });
    try {
      await internals(job).run();
      assert.equal(job.status, "done", job.error ?? "no error");
      const assembly = job.assembly as { total: number };
      assert.equal(assembly.total, 2);
      assert.equal(job.author, null);
      const document = JSON.parse(
        await readFile(job.outPath, "utf8")
      ) as {
        export_metadata: { mode: string; target_user_id: string | null };
      };
      assert.equal(document.export_metadata.mode, "channel");
      assert.equal(document.export_metadata.target_user_id, null);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("browse API", () => {
  let server: ReturnType<typeof createApp>;
  let base: string;

  before(async () => {
    useFakeClient();
    server = createApp();
    await new Promise<void>((resolveValue, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolveValue();
      });
    });
    const address = server.address() as AddressInfo;
    base = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    setClientFactory(null);
    await new Promise<void>((resolveValue) => server.close(() => resolveValue()));
  });

  beforeEach(() => {
    useFakeClient();
  });

  async function post(
    pathname: string,
    body: Record<string, unknown>
  ): Promise<{ status: number; payload: Record<string, unknown> }> {
    const response = await fetch(base + pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t", ...body }),
    });
    return {
      status: response.status,
      payload: (await response.json()) as Record<string, unknown>,
    };
  }

  test("guilds are sorted", async () => {
    const { status, payload } = await post("/api/browse", {
      kind: "guilds",
    });
    assert.equal(status, 200);
    const guilds = payload.guilds as Array<{
      name: string;
      icon_url: string | null;
    }>;
    assert.deepEqual(
      guilds.map((guild) => guild.name),
      ["Second Server", "Test Guild"]
    );
    assert.equal(guilds[0].icon_url, null);
    assert.match(guilds[1].icon_url ?? "", /\/icons\/g\/abc123\./);
  });

  test("channels filter non-text", async () => {
    const { status, payload } = await post("/api/browse", {
      kind: "channels",
      server: "g",
    });
    assert.equal(status, 200);
    const channels = payload.channels as Array<{ name: string }>;
    assert.deepEqual(
      channels.map((channel) => channel.name),
      ["general", "random"]
    );
  });

  test("members map nick and bot", async () => {
    const { status, payload } = await post("/api/browse", {
      kind: "members",
      server: "g",
      query: "ry",
    });
    assert.equal(status, 200);
    const members = payload.members as Array<{
      global_name: string | null;
      nick: string | null;
      bot: boolean;
    }>;
    assert.equal(members[0].global_name, "Ryno");
    assert.equal(members[1].nick, "Botty");
    assert.equal(members[1].bot, true);
  });

  test("member 403 has clear fallback", async () => {
    FakeDiscordClient.failMembers = true;
    const { status, payload } = await post("/api/browse", {
      kind: "members",
      server: "g",
      query: "ry",
    });
    assert.equal(status, 403);
    assert.match(String(payload.error), /Paste the author ID/);
  });

  test("authors come from recent messages", async () => {
    const { status, payload } = await post("/api/browse", {
      kind: "authors",
      channel: "101",
    });
    assert.equal(status, 200);
    const authors = payload.authors as Array<{
      id: string;
      avatar_url: string;
    }>;
    assert.deepEqual(
      authors.map((author) => author.id),
      ["u1"]
    );
    assert.match(authors[0].avatar_url, /\/embed\/avatars\//);
  });

  test("authors 403 has clear fallback", async () => {
    FakeDiscordClient.failChannel = "102";
    const { status, payload } = await post("/api/browse", {
      kind: "authors",
      channel: "102",
    });
    assert.equal(status, 403);
    assert.match(String(payload.error), /Paste the author ID/);
  });

  test("me returns the token identity without the token", async () => {
    const { status, payload } = await post("/api/me", {});
    assert.equal(status, 200);
    const user = payload.user as {
      id: string;
      username: string;
      global_name: string | null;
      bot: boolean;
    };
    assert.equal(user.id, "u1");
    assert.equal(user.username, "someone");
    assert.equal(user.global_name, "Someone");
    assert.equal(user.bot, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "token"));
  });

  test("status reports server token presence as a boolean", async () => {
    const response = await fetch(base + "/api/status");
    assert.equal(response.status, 200);
    const payload = (await response.json()) as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.server_token, "boolean");
    assert.equal(typeof payload.server_token_is_bot, "boolean");
    assert.ok(Array.isArray(payload.jobs));
  });

  test("downloads redacted server logs", async () => {
    const fakeToken = [
      "MTIzNDU2Nzg5MDEyMzQ1Njc4",
      "GaBsCd",
      "EfGhIjKlMnOpQrStUvWxYz0123456789",
    ].join(".");
    recordLog(
      "error",
      `Discord error 404: token=${fakeToken} authorization: Bearer ${fakeToken}`
    );

    const response = await fetch(base + "/api/logs");
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/plain/
    );
    assert.match(
      response.headers.get("content-disposition") ?? "",
      /attachment; filename="discord-messages-exporter_.*\.log"/
    );
    const body = await response.text();
    assert.match(body, /Discord Messages Exporter diagnostic log/);
    assert.match(body, /\[redacted\]/);
    assert.ok(!body.includes(fakeToken));
  });

  test("verifies and stores a token without returning it", async () => {
    const saved = await post("/api/token", {
      token: "super-secret-token",
      is_bot: false,
      remember: false,
    });
    assert.equal(saved.status, 200);
    const payload = saved.payload as {
      configured: boolean;
      source: string;
      user?: { username: string };
    };
    assert.equal(payload.configured, true);
    assert.equal(payload.source, "stored");
    assert.equal(payload.user?.username, "someone");
    assert.ok(!JSON.stringify(payload).includes("super-secret-token"));

    const status = await fetch(base + "/api/status");
    const statusPayload = (await status.json()) as {
      server_token: boolean;
      token_source: string;
    };
    assert.equal(statusPayload.server_token, true);
    assert.equal(statusPayload.token_source, "stored");

    const cleared = await fetch(base + "/api/token", { method: "DELETE" });
    assert.equal(cleared.status, 200);
    const clearedPayload = (await cleared.json()) as {
      configured: boolean;
      source: string;
    };
    assert.equal(clearedPayload.configured, false);
    assert.equal(clearedPayload.source, "none");
  });

  test("refuses cross-origin writes", async () => {
    const response = await fetch(base + "/api/exports/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://evil.test",
      },
      body: "{}",
    });
    assert.equal(response.status, 403);
  });
});
