import assert from "node:assert/strict";
import { test } from "node:test";
import { DiscordClient } from "../src/api.js";

test("bot requests identify the application and authenticate as a bot", async (t) => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    requests.push({ url: String(url), headers: new Headers(init.headers) });
    return new Response("[]", { status: 200 });
  });
  const client = new DiscordClient("test-token", { isBot: true, rate: 10000 });
  await client.guildChannels("123");
  await client.messagesBefore("456");
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).pathname, "/api/v10/guilds/123/channels");
  assert.equal(new URL(requests[1].url).pathname, "/api/v10/channels/456/messages");
  for (const { headers } of requests) {
    assert.equal(headers.get("Authorization"), "Bot test-token");
    assert.match(headers.get("User-Agent")!, /^DiscordBot \(https:\/\/github\.com\/Rynowastaken\/discord-messages-exporter, \d+\.\d+\.\d+\)$/);
  }
});

test("user tokens retain their existing authentication and user agent", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: URL, init: RequestInit) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.get("Authorization"), "test-token");
    assert.match(headers.get("User-Agent")!, /^Mozilla\/5\.0 /);
    return new Response('{"id":"123"}', { status: 200 });
  });
  await new DiscordClient("test-token").me();
});

test("an explicit user agent overrides the bot default", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: URL, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get("User-Agent"), "CustomClient/1.0");
    return new Response('{"id":"123"}', { status: 200 });
  });
  await new DiscordClient("test-token", {
    isBot: true,
    userAgent: "CustomClient/1.0",
  }).me();
});
