import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
  buildIndex,
  configureExportLibrary,
  ensureIndexed,
  finalizeImport,
  getExport,
  hideJobExport,
  prepareImport,
  queryFacets,
  queryMessage,
  queryMessages,
  queryStats,
  refreshExports,
  removeImport,
} from "../exports.js";
import type { ExportSummary } from "../exports.js";

const SAMPLE = {
  export_metadata: {
    mode: "server",
    guild: { id: "100", name: "Test Guild" },
    channels: [
      { id: "201", name: "general", status: "done" },
      { id: "202", name: "random", status: "done" },
    ],
    target_user_id: null,
  },
  messages: [
    {
      id: "1001",
      channel_id: "201",
      timestamp: "2025-05-08T10:00:00+00:00",
      author: {
        id: "u1",
        username: "ryno",
        global_name: "Ryno",
        avatar: "abc123",
        avatar_url:
          "https://cdn.discordapp.com/avatars/u1/abc123.png?size=128",
      },
      content: "hello world",
      attachments: [],
      reactions: [],
      edited_timestamp: null,
      message_reference: null,
      referenced_message: null,
      embeds: [
        {
          type: "video",
          title: "A test video",
          description: "A description of the video.",
          url: "https://example.com/watch?v=1",
          provider: { name: "Example" },
          thumbnail: { url: "https://example.com/thumb.jpg" },
        },
      ],
      mentions: [
        {
          id: "u2",
          username: "botty",
          global_name: "Botty",
          avatar: "def456",
          avatar_url:
            "https://cdn.discordapp.com/avatars/u2/def456.png?size=128",
        },
      ],
      sticker_items: [],
      thread: null,
    },
    {
      id: "1002",
      channel_id: "201",
      timestamp: "2025-05-08T11:30:00+00:00",
      author: { id: "u2", username: "botty", bot: true },
      content: "second message with a picture",
      attachments: [
        {
          id: "a1",
          filename: "pic.png",
          content_type: "image/png",
          size: 10,
        },
      ],
      reactions: [{ emoji: { name: "ok" }, count: 3 }],
      edited_timestamp: "2025-05-08T11:31:00+00:00",
      message_reference: null,
      referenced_message: null,
      embeds: [],
      sticker_items: [],
      thread: null,
    },
    {
      id: "1003",
      channel_id: "202",
      timestamp: "2025-05-09T09:15:00+00:00",
      author: { id: "u1", username: "ryno", global_name: "Ryno" },
      content: "another channel message",
      attachments: [],
      reactions: [],
      edited_timestamp: null,
      message_reference: { message_id: "1001" },
      referenced_message: {
        id: "1001",
        author: { id: "u1", username: "ryno" },
        content: "hello world",
      },
      embeds: [],
      sticker_items: [],
      thread: null,
    },
    {
      id: "1004",
      channel_id: "202",
      timestamp: "2025-05-10T22:45:00+00:00",
      author: { id: "u3", username: "third" },
      content: "late night note",
      attachments: [
        {
          id: "a2",
          filename: "clip.mp4",
          content_type: "video/mp4",
          size: 42,
        },
      ],
      reactions: [],
      edited_timestamp: null,
      message_reference: null,
      referenced_message: null,
      embeds: [],
      sticker_items: [],
      thread: null,
    },
  ],
};

async function waitFor(
  check: () => boolean,
  timeoutMs = 5000
): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("timed out waiting for the export index");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("export library", () => {
  let root = "";
  let runsDir = "";
  let exportsDir = "";

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "dae-library-"));
    runsDir = join(root, "runs");
    exportsDir = join(root, "exports");
    const jobDir = join(runsDir, "testjob");
    await mkdir(jobDir, { recursive: true });
    await writeFile(
      join(jobDir, "messages.json"),
      JSON.stringify(SAMPLE, null, 2),
      "utf8"
    );
    configureExportLibrary({ runsDir, exportsDir });
    const listed = await refreshExports();
    assert.equal(listed.length, 1);
  });

  after(async () => {
    configureExportLibrary({
      runsDir: join(root, "empty-runs"),
      exportsDir: join(root, "empty-exports"),
    });
    await rm(root, { recursive: true, force: true });
  });

  test("discovers and indexes a finished job export", async () => {
    const summary = getExport("job-testjob");
    assert.ok(summary);
    assert.equal(summary.kind, "job");
    assert.equal(summary.name, "Test Guild");
    assert.equal(summary.status, "unindexed");

    await ensureIndexed("job-testjob");
    await waitFor(() => getExport("job-testjob")?.status === "ready");
    const ready = getExport("job-testjob") as ExportSummary;
    assert.equal(ready.message_count, 4);
    assert.equal(ready.progress, 1);
  });

  test("pages, searches, and filters messages", async () => {
    const first = queryMessages("job-testjob", {}, 0, 2, "desc");
    assert.ok(first);
    assert.equal(first.total, 4);
    assert.equal(first.messages.length, 2);
    assert.equal(first.messages[0].id, "1004");
    assert.equal(first.has_more, true);

    const oldest = queryMessages(
      "job-testjob",
      {},
      0,
      1,
      "asc"
    );
    assert.ok(oldest);
    assert.equal(oldest.messages[0].embeds.length, 1);
    assert.equal(oldest.messages[0].embeds[0].title, "A test video");
    assert.equal(oldest.messages[0].embeds[0].provider, "Example");
    assert.equal(
      oldest.messages[0].embeds[0].thumbnail_url,
      "https://example.com/thumb.jpg"
    );
    assert.equal(oldest.messages[0].author_avatar_url, "https://cdn.discordapp.com/avatars/u1/abc123.png?size=128");
    assert.equal(oldest.messages[0].mentions[0]?.name, "Botty");
    assert.equal(
      oldest.messages[0].mentions[0]?.avatar_url,
      "https://cdn.discordapp.com/avatars/u2/def456.png?size=128"
    );

    const search = queryMessages(
      "job-testjob",
      { q: "hello" },
      0,
      100,
      "desc"
    );
    assert.ok(search);
    assert.equal(search.total, 1);
    assert.equal(search.messages[0].id, "1001");

    const prefix = queryMessages(
      "job-testjob",
      { q: "pict" },
      0,
      100,
      "desc"
    );
    assert.equal(prefix?.total, 1);

    const author = queryMessages(
      "job-testjob",
      { author: "u1" },
      0,
      100,
      "desc"
    );
    assert.equal(author?.total, 2);

    const channel = queryMessages(
      "job-testjob",
      { channel: "201" },
      0,
      100,
      "desc"
    );
    assert.equal(channel?.total, 2);

    const window = queryMessages(
      "job-testjob",
      { from: "2025-05-09T00:00:00Z" },
      0,
      100,
      "asc"
    );
    assert.equal(window?.total, 2);
    assert.equal(window?.messages[0].id, "1003");

    const detail = queryMessage("job-testjob", "1002");
    assert.ok(detail);
    assert.equal(detail.id, "1002");
    assert.equal(
      (detail.attachments as Array<{ filename: string }>)[0].filename,
      "pic.png"
    );
  });

  test("returns facets and filter-aware stats", async () => {
    const facets = queryFacets("job-testjob");
    assert.ok(facets);
    assert.equal(facets.authors.length, 3);
    assert.equal(facets.channels.length, 2);

    const stats = queryStats("job-testjob", {});
    assert.ok(stats);
    assert.equal(stats.total, 4);
    assert.equal(stats.authors, 3);
    assert.equal(stats.channels, 2);
    assert.equal(stats.active_days, 3);
    assert.equal(stats.attachments, 2);
    assert.equal(stats.reactions, 3);
    assert.equal(stats.replies, 1);
    assert.equal(stats.activity.length, 3);
    assert.equal(stats.clock.length, 4);
    assert.deepEqual(
      stats.attachment_types.map((row) => row.type).sort(),
      ["image/png", "video/mp4"]
    );
    assert.equal(stats.median_length, 23);
    assert.equal(stats.messages_per_active_day, 1.3);
    assert.equal(stats.night_share, 0);
    assert.equal(stats.reply_rate, 0.25);
    assert.equal(stats.edit_rate, 0.25);
    assert.equal(stats.attachment_rate, 0.5);
    assert.equal(stats.link_rate, 0);
    assert.equal(stats.longest_streak_days, 3);
    assert.equal(stats.busiest_day?.day, "2025-05-08");
    assert.equal(stats.busiest_day?.count, 2);
    assert.equal(stats.busiest_hour?.hour, 10);
    assert.equal(stats.longest_gap?.seconds, 135000);
    assert.equal(stats.longest_message?.id, "1002");
    assert.equal(stats.first_message?.id, "1001");
    assert.equal(stats.last_message?.id, "1004");
    assert.deepEqual(stats.top_reactions, [{ emoji: "ok", count: 3 }]);
    assert.deepEqual(stats.top_domains, []);
    assert.ok(stats.top_words.some((row) => row.word === "world"));
    assert.deepEqual(stats.length_buckets, [
      { label: "1-50", count: 4 },
      { label: "51-140", count: 0 },
      { label: "141-280", count: 0 },
      { label: "281-1000", count: 0 },
      { label: "1001+", count: 0 },
    ]);

    const filtered = queryStats("job-testjob", { q: "hello" });
    assert.ok(filtered);
    assert.equal(filtered.scope, "filtered");
    assert.equal(filtered.total, 1);

    const withAttachment = queryStats("job-testjob", { q: "picture" });
    assert.ok(withAttachment);
    assert.equal(withAttachment.total, 1);
    assert.equal(withAttachment.attachments, 1);
    assert.deepEqual(withAttachment.attachment_types, [
      { type: "image/png", count: 1 },
    ]);
  });

  test("imports, indexes, and removes a loaded file", async () => {
    const target = await prepareImport("my archive.json");
    await writeFile(
      target.filePath,
      JSON.stringify(SAMPLE, null, 2),
      "utf8"
    );
    const imported = await finalizeImport(target);
    assert.ok(imported);
    assert.equal(imported.kind, "import");
    assert.equal(imported.name, "Test Guild");

    await ensureIndexed(imported.id);
    await waitFor(() => getExport(imported.id)?.status === "ready");
    assert.equal(getExport(imported.id)?.message_count, 4);
    assert.equal(queryStats(imported.id, {})?.total, 4);

    assert.equal(await removeImport(imported.id), true);
    assert.equal(getExport(imported.id), null);
  });

  test("rejects a malformed export", async () => {
    const badDir = join(runsDir, "badexport");
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, "messages.json"), "{ not json", "utf8");
    await refreshExports();
    await ensureIndexed("job-badexport");
    await waitFor(() => getExport("job-badexport")?.status === "failed");
    assert.match(
      getExport("job-badexport")?.error ?? "",
      /messages|end|JSON|expected/i
    );

    const direct = join(root, "direct-index.sqlite");
    await assert.rejects(
      buildIndex(join(badDir, "messages.json"), direct),
      /messages|JSON|end|expected/i
    );
    assert.equal(
      await readFile(join(badDir, "messages.json"), "utf8"),
      "{ not json"
    );
  });

  test("removes a job export from the library without deleting its files", async () => {
    assert.equal(await hideJobExport("job-testjob"), true);
    await refreshExports();
    assert.equal(getExport("job-testjob"), null);
    const hidden = JSON.parse(
      await readFile(join(runsDir, ".hidden-jobs.json"), "utf8")
    ) as string[];
    assert.ok(hidden.includes("job-testjob"));
    assert.ok(existsSync(join(runsDir, "testjob", "messages.json")));
  });
});
