import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { downloadExportAttachments } from "../src/attachments.js";

const SAMPLE = {
  export_metadata: {
    mode: "author",
    guild: { id: "10", name: "Guild" },
    channel: { id: "20", name: "general" },
    target_user_id: "42",
  },
  messages: [
    {
      id: "100",
      timestamp: "2026-01-01T00:00:00Z",
      content: "photo",
      author: { id: "42", username: "tester" },
      attachments: [
        {
          id: "123456789012345678",
          filename: "photo.png",
          size: 4,
          content_type: "image/png",
          url: "https://cdn.discordapp.com/attachments/20/123456789012345678/photo.png",
        },
      ],
    },
  ],
};

test("downloads attachments, then skips existing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "discord-messages-exporter-att-"));
  const source = join(root, "messages.json");
  const outDir = join(root, "attachments");
  await writeFile(source, JSON.stringify(SAMPLE), "utf8");
  let requests = 0;
  const fakeFetch = (async () => {
    requests += 1;
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "image/png", "content-length": "4" },
    });
  }) as typeof fetch;

  try {
    const first = await downloadExportAttachments({
      sourcePath: source,
      outDir,
      fetch: fakeFetch,
    });
    assert.equal(first.total, 1);
    assert.equal(first.downloaded, 1);
    assert.equal(first.failed, 0);
    assert.equal(first.bytes, 4);
    assert.equal(requests, 1);

    const file = join(outDir, "123456789012345678.png");
    assert.deepEqual(
      [...(await readFile(file))],
      [1, 2, 3, 4]
    );
    const manifest = JSON.parse(
      await readFile(join(outDir, "manifest.json"), "utf8")
    ) as { files: Record<string, { file: string; size: number }> };
    assert.equal(manifest.files["123456789012345678"].file, "123456789012345678.png");
    assert.equal(manifest.files["123456789012345678"].size, 4);

    const second = await downloadExportAttachments({
      sourcePath: source,
      outDir,
      fetch: fakeFetch,
    });
    assert.equal(second.downloaded, 0);
    assert.equal(second.skipped, 1);
    assert.equal(requests, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("counts an unreachable attachment as failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "discord-messages-exporter-att-"));
  const source = join(root, "messages.json");
  await writeFile(source, JSON.stringify(SAMPLE), "utf8");
  const fakeFetch = (async () =>
    new Response("gone", { status: 404 })) as typeof fetch;
  try {
    const stats = await downloadExportAttachments({
      sourcePath: source,
      outDir: join(root, "attachments"),
      fetch: fakeFetch,
    });
    assert.equal(stats.failed, 1);
    assert.equal(stats.downloaded, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
