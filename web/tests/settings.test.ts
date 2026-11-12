import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

const SAMPLE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lP1W9QAAAABJRU5ErkJggg==";

let directory: string;
let settings: typeof import("../settings.js");

describe("appearance settings", () => {
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "discord-messages-settings-"));
    process.env.DISCORD_MESSAGES_EXPORTER_RUNS = join(directory, "runs");
    await mkdir(join(directory, "runs"), { recursive: true });
    settings = await import("../settings.js");
    await settings.loadSettings();
  });

  after(async () => {
    delete process.env.DISCORD_MESSAGES_EXPORTER_RUNS;
    await rm(directory, { recursive: true, force: true });
  });

  test("starts with the portal appearance", () => {
    const current = settings.currentSettings();
    assert.equal(current.output_dir, "");
    assert.equal(current.appearance.scheme, "tonalSpot");
    assert.equal(current.appearance.colorfulness, 1);
    assert.equal(current.appearance.background_brightness, 100);
    assert.equal(current.background_url, null);
  });

  test("saves appearance and clamps numeric controls", async () => {
    const saved = await settings.saveSettings({
      output_dir: join(directory, "exports"),
      appearance: {
        scheme: "rainbow",
        colorfulness: 9,
        brightness: 0.1,
        background_brightness: 101,
        background_blur: 44,
      },
    });
    assert.equal(saved.appearance.scheme, "rainbow");
    assert.equal(saved.appearance.colorfulness, 1.5);
    assert.equal(saved.appearance.brightness, 0.5);
    assert.equal(saved.appearance.background_brightness, 100);
    assert.equal(saved.appearance.background_blur, 45);
    assert.equal(saved.background_url, null);
  });

  test("stores a background image and serves it back", async () => {
    const saved = await settings.saveSettings({
      background_data_url: SAMPLE_PNG,
    });
    assert.equal(saved.background_type, "image/png");
    assert.ok(saved.background_url);
    const background = await settings.readBackground();
    assert.equal(background?.contentType, "image/png");
    assert.ok(background && background.body.length > 0);
  });

  test("keeps the background when only other fields change", async () => {
    const saved = await settings.saveSettings({
      output_dir: "",
      appearance: {
        scheme: "vibrant",
        colorfulness: 1,
        brightness: 1,
        background_brightness: 100,
        background_blur: 0,
      },
    });
    assert.ok(saved.background_url);
  });

  test("clears the background", async () => {
    const saved = await settings.saveSettings({ background_data_url: null });
    assert.equal(saved.background_url, null);
    assert.equal(await settings.readBackground(), null);
  });

  test("rejects a malformed background", async () => {
    await assert.rejects(
      settings.saveSettings({ background_data_url: "data:text/plain;base64,aGk=" }),
      /PNG, JPEG, or WebP/
    );
  });

  test("loads persisted settings after restart", async () => {
    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({
        output_dir: "",
        appearance: {
          scheme: "expressive",
          colorfulness: 1.2,
          brightness: 0.9,
          background_brightness: 80,
          background_blur: 10,
        },
        background: null,
      })
    );
    const loaded = await settings.loadSettings();
    assert.equal(loaded.appearance.scheme, "expressive");
    assert.equal(loaded.appearance.colorfulness, 1.2);
    assert.equal(loaded.appearance.background_blur, 10);
  });
});
