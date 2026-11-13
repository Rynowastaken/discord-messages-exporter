#!/usr/bin/env node
/**
 * Visual checker for the console.
 *
 * Starts the built console on a private data directory with a fixture export,
 * drives headless Chromium through the main pages and every settings tab at
 * desktop and mobile widths, then audits what rendered: overflow, clipped
 * controls, overlapping hit areas, broken images, control-height mismatches,
 * empty actions, console errors and failed requests.
 *
 * Usage:
 *   npm run visual:check
 *   node scripts/visual-check.mjs --url http://127.0.0.1:8788 --cdp http://127.0.0.1:9222
 *
 * Reports land in .visual-report/ with screenshots and an HTML summary.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const REPORT_DIR = join(ROOT, ".visual-report");
const SHOT_DIR = join(REPORT_DIR, "shots");
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]
    .find((path) => existsSync(path));

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const item = process.argv[index];
  if (!item.startsWith("--")) continue;
  const [key, inline] = item.slice(2).split("=");
  args.set(key, inline ?? process.argv[index + 1] ?? "");
  if (inline === undefined && process.argv[index + 1]?.startsWith("--") === false) {
    index += 1;
  }
}

const baseUrlArg = args.get("url");
const cdpArg = args.get("cdp");
const keep = args.has("keep");

function log(message) {
  process.stdout.write(`${message}\n`);
}

function sleep(ms) {
  return new Promise((resolveValue) => setTimeout(resolveValue, ms));
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveValue, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveValue);
  });
  const port = server.address().port;
  await new Promise((resolveValue) => server.close(resolveValue));
  return port;
}

async function waitForHttp(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${url}`);
}

const FIXTURE_MESSAGES = [
  {
    id: "9101",
    timestamp: "2026-10-24T06:01:00+00:00",
    author: {
      id: "551019276174229505",
      username: "ryno",
      global_name: "Ryno",
      avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
    },
    content:
      "A **bold** note with *italic* text, `inline code`, and a [link](https://example.com).",
    mentions: [],
    attachments: [],
    reactions: [
      { emoji: { name: "pin", id: "1123085349598535750" }, count: 3 },
      { emoji: { name: "🔥" }, count: 1 },
    ],
  },
  {
    id: "9102",
    timestamp: "2026-10-25T08:30:00+00:00",
    author: {
      id: "551019276174229506",
      username: "mira",
      global_name: "Mira",
      avatar_url: "https://cdn.discordapp.com/embed/avatars/1.png",
    },
    content:
      "A message so long that it needs to wrap cleanly across several lines without pushing against the edge of the row. ".repeat(
        2
      ),
    mentions: [],
    attachments: [],
    reactions: [],
  },
  {
    id: "9103",
    timestamp: "2026-10-26T09:45:00+00:00",
    author: {
      id: "551019276174229505",
      username: "ryno",
      global_name: "Ryno",
      avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
    },
    content: "hello <@551019276174229506> — look at this video",
    mentions: [
      {
        id: "551019276174229506",
        username: "mira",
        global_name: "Mira",
        avatar_url: "https://cdn.discordapp.com/embed/avatars/1.png",
      },
    ],
    attachments: [],
    embeds: [
      {
        type: "video",
        title: "A compact link preview with a thumbnail",
        description: "An embed description that should clamp after two lines.",
        url: "https://www.youtube.com/watch?v=GFPP21OSbAo",
        provider: { name: "YouTube" },
        thumbnail: {
          url: "https://i.ytimg.com/vi/GFPP21OSbAo/maxresdefault.jpg",
        },
      },
    ],
    reactions: [],
  },
  {
    id: "9104",
    timestamp: "2026-10-27T10:15:00+00:00",
    author: {
      id: "551019276174229507",
      username: "nami",
      global_name: "Nami",
      avatar_url: "https://cdn.discordapp.com/embed/avatars/2.png",
    },
    content: "```ts\nconst ready = true;\n```\n> quoted line\n\n- first item\n- second item",
    mentions: [],
    attachments: [],
    reactions: [],
  },
  {
    id: "9105",
    timestamp: "2026-10-28T11:05:00+00:00",
    author: {
      id: "551019276174229506",
      username: "mira",
      global_name: "Mira",
      avatar_url: "https://cdn.discordapp.com/embed/avatars/1.png",
    },
    content: "Short reply.",
    mentions: [],
    attachments: [],
    reference: { message_id: "9101" },
    referenced_message: {
      id: "9101",
      author: { id: "551019276174229505", username: "ryno" },
      content: "A **bold** note with *italic* text",
    },
    reactions: [],
  },
  {
    id: "9106",
    timestamp: "2026-10-29T18:20:00+00:00",
    author: {
      id: "551019276174229507",
      username: "nami",
      global_name: "Nami",
      avatar_url: "https://cdn.discordapp.com/embed/avatars/2.png",
    },
    content: "A spoiler ||hidden answer|| and a plain :wave: shortcode.",
    mentions: [],
    attachments: [
      {
        id: "att-fixture",
        filename: "notes.txt",
        size: 1024,
        content_type: "text/plain",
        url: "https://example.com/notes.txt",
      },
    ],
    reactions: [],
  },
].map((message) => ({
  channel_id: "201",
  channel_name: "general",
  edited_timestamp: null,
  embeds: [],
  sticker_items: [],
  thread: null,
  message_reference: null,
  referenced_message: null,
  ...message,
}));

const FIXTURE_ID = "import-aaaaaaaaaaaa";

async function createFixture(exportsDir, runsDir) {
  const id = FIXTURE_ID;
  const directory = join(exportsDir, id);
  await mkdir(directory, { recursive: true });
  const document = {
    export_metadata: {
      mode: "author",
      guild: { id: "100", name: "Visual Check" },
      channel: { id: "201", name: "general" },
      target_user_id: "551019276174229505",
      target_username: "ryno",
      author: { id: "551019276174229505", name: "Ryno" },
      ordering: "chronological",
      window: { since: "2026-10-01", until: "2026-11-01" },
    },
    messages: FIXTURE_MESSAGES,
  };
  await writeFile(
    join(directory, "messages.json"),
    JSON.stringify(document, null, 2)
  );
  await writeFile(
    join(directory, "import.json"),
    JSON.stringify(
      { original_name: "Visual check.json", created_at: "2026-11-01T00:00:00.000Z" },
      null,
      2
    )
  );
  const jobDirectory = join(runsDir, "visualjob");
  await mkdir(jobDirectory, { recursive: true });
  await writeFile(
    join(jobDirectory, "messages.json"),
    JSON.stringify(document, null, 2)
  );
  return id;
}

class CdpPage {
  constructor(endpoint, target) {
    this.endpoint = endpoint;
    this.target = target;
    this.pending = new Map();
    this.events = [];
    this.requestUrls = new Map();
    this.nextId = 1;
  }

  async connect() {
    this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      } else {
        if (message.method === "Network.requestWillBeSent") {
          this.requestUrls.set(
            message.params.requestId,
            message.params.request?.url ?? ""
          );
        }
        this.events.push(message);
      }
    });
    await new Promise((resolveValue, reject) => {
      this.ws.addEventListener("open", resolveValue, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Network.enable");
    return this;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveValue, reject) => {
      this.pending.set(id, { resolve: resolveValue, reject });
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          "page evaluation failed"
      );
    }
    return result.result.value;
  }

  async viewport(width, height, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  }

  async navigate(url) {
    this.events.length = 0;
    await this.send("Page.navigate", { url });
    await sleep(700);
    await this.evaluate("document.fonts?.ready ?? Promise.resolve()");
  }

  async waitFor(expression, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.evaluate(expression)) return true;
      await sleep(120);
    }
    return false;
  }

  async clickText(text) {
    return this.evaluate(`(() => {
      const node = [...document.querySelectorAll("button, a")]
        .find((item) => (item.innerText || "").trim() === ${JSON.stringify(text)});
      if (!node) return false;
      node.scrollIntoView({ block: "nearest", inline: "center" });
      node.click();
      return true;
    })()`);
  }

  async screenshot(path) {
    const result = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(path, Buffer.from(result.data, "base64"));
  }

  errors() {
    const isLocal = (url) =>
      /^(https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)(?:\/|$)/.test(
        url || ""
      );
    return this.events
      .filter((event) => {
        if (event.method === "Runtime.exceptionThrown") return true;
        if (
          event.method === "Log.entryAdded" &&
          event.params.entry.level === "error"
        ) {
          const url = event.params.entry.url || "";
          return !url || isLocal(url);
        }
        if (event.method === "Network.loadingFailed") {
          if (event.params.canceled) return false;
          if (event.params.errorText === "net::ERR_ABORTED") return false;
          const url = this.requestUrls.get(event.params.requestId) || "";
          return isLocal(url);
        }
        return false;
      })
      .map((event) => {
        if (event.method === "Runtime.exceptionThrown") {
          return `page exception: ${
            event.params.exceptionDetails?.exception?.description ||
            event.params.exceptionDetails?.text
          }`;
        }
        if (event.method === "Log.entryAdded") {
          return `console error: ${event.params.entry.text}`;
        }
        const url = this.requestUrls.get(event.params.requestId) || "";
        return `request failed: ${event.params.errorText} ${url || event.params.requestId}`;
      });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // already closed
    }
    return fetch(`${this.endpoint}/json/close/${this.target.id}`).catch(() => {});
  }
}

function auditPage() {
  const issues = [];
  const seen = new Set();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;

  function describe(element) {
    if (!element || element === document.documentElement || element === document.body) {
      return element?.tagName?.toLowerCase() || "document";
    }
    const id = element.id ? `#${element.id}` : "";
    const classes = String(element.className || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join("");
    const text = (element.innerText || element.getAttribute("aria-label") || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
    return `${element.tagName.toLowerCase()}${id}${classes}${text ? ` “${text}”` : ""}`;
  }

  function add(level, code, element, message, details = "") {
    const key = `${code}|${describe(element)}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
      level,
      code,
      element: describe(element),
      message,
      details,
      rect: element?.getBoundingClientRect
        ? (() => {
            const rect = element.getBoundingClientRect();
            return {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })()
        : null,
    });
  }

  function visible(element) {
    const style = getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) < 0.05 ||
      element.closest("[inert]")
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDecorative(element) {
    return Boolean(
      element.closest(
        ".app-backdrop, .sr-only, [aria-hidden='true'], .picker-menu[data-state='closed']"
      )
    );
  }

  function overlayOf(element) {
    return element.closest(
      ".picker-menu[data-state='open'], .settings-dialog[open], .token-dialog, .token-gate, .message-detail"
    );
  }

  function receivesPointer(element) {
    const rect = element.getBoundingClientRect();
    const x = Math.min(
      Math.max(rect.left + rect.width / 2, 0),
      viewportWidth - 1
    );
    const y = Math.min(
      Math.max(rect.top + rect.height / 2, 0),
      viewportHeight - 1
    );
    if (rect.width < 1 || rect.height < 1) return false;
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit === element || element.contains(hit)));
  }

  if (document.documentElement.scrollWidth > viewportWidth + 1) {
    add(
      "error",
      "page-overflow-x",
      document.documentElement,
      `page scrolls horizontally (${document.documentElement.scrollWidth}px wide in ${viewportWidth}px viewport)`
    );
  }

  function insideHorizontalScroller(element) {
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      if (
        ["auto", "scroll"].includes(style.overflowX) &&
        parent.scrollWidth > parent.clientWidth + 1
      ) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  const controls = [
    ...document.querySelectorAll(
      "a[href], button, input:not([type='hidden']), select, textarea, [role='button'], [role='link'], [role='tab'], [role='radio']"
    ),
  ].filter((element) => visible(element) && !isDecorative(element));

  for (const element of controls) {
    if (element.ownerSVGElement) continue;
    const rect = element.getBoundingClientRect();
    if (
      (rect.left < -1 || rect.right > viewportWidth + 1) &&
      !insideHorizontalScroller(element)
    ) {
      add(
        "error",
        "control-outside-viewport",
        element,
        `control extends outside the viewport (${Math.round(rect.left)}–${Math.round(
          rect.right
        )}px)`
      );
    }

    const isButtonLike = element.matches(
      "button, input[type='submit'], input[type='button'], .soft-button, .glass-button, .primary-button, .portal-button-soft, .picker-trigger, .appearance-scheme, .settings-nav-item, .export-action-link"
    );
    if (
      isButtonLike &&
      !element.closest(".message-markdown") &&
      (rect.width < 24 || rect.height < 24)
    ) {
      add(
        "warning",
        "small-target",
        element,
        `interactive target is smaller than 24px (${Math.round(rect.width)}×${Math.round(
          rect.height
        )})`
      );
    }

    const name =
      (element.innerText || "").trim() ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("alt") ||
      "";
    if (!name && element.matches("button, a[href], [role='button']")) {
      add("error", "empty-action", element, "interactive control has no accessible name");
    }

    if (
      element.matches(
        ".soft-button, .glass-button, .primary-button, .portal-button-soft, .export-action-link, .settings-nav-item, .appearance-scheme, .picker-trigger, button"
      ) &&
      element.scrollWidth > element.clientWidth + 2 &&
      ["hidden", "clip"].includes(getComputedStyle(element).overflowX)
    ) {
      add("error", "clipped-action", element, "button or link label is clipped");
    }
  }

  const overlapControls = controls.filter(
    (element) => !element.ownerSVGElement && receivesPointer(element)
  );
  for (let first = 0; first < overlapControls.length; first += 1) {
    const a = overlapControls[first];
    const ra = a.getBoundingClientRect();
    for (let second = first + 1; second < overlapControls.length; second += 1) {
      const b = overlapControls[second];
      if (a.contains(b) || b.contains(a)) continue;
      const overlayA = overlayOf(a);
      const overlayB = overlayOf(b);
      if (overlayA !== overlayB && (overlayA || overlayB)) continue;
      const rb = b.getBoundingClientRect();
      const overlapX =
        Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const overlapY =
        Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (overlapX > 3 && overlapY > 3) {
        add(
          "error",
          "control-overlap",
          a,
          `overlaps ${describe(b)} by ${Math.round(overlapX)}×${Math.round(
            overlapY
          )}px`,
          describe(b)
        );
      }
    }
  }

  const groups = document.querySelectorAll(
    ".settings-path, .settings-actions, .explorer-toolbar, .export-row-primary, .export-row-secondary, .appearance-sliders, .message-embed, .export-row-actions"
  );
  for (const group of groups) {
    if (!visible(group)) continue;
    const children = [...group.children].filter(
      (child) =>
        visible(child) &&
        child.matches(
          "a[href], button, input, select, textarea, .soft-button, .glass-button, .primary-button, .portal-button-soft, .export-action-link"
        )
    );
    if (children.length < 2) continue;
    const heights = children.map((child) => child.getBoundingClientRect().height);
    const min = Math.min(...heights);
    const max = Math.max(...heights);
    if (max - min > 6) {
      add(
        "error",
        "control-height-mismatch",
        group,
        `sibling controls differ in height by ${Math.round(max - min)}px`,
        children.map((child) => `${describe(child)} ${Math.round(child.getBoundingClientRect().height)}px`).join(", ")
      );
    }
  }

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  for (const input of document.querySelectorAll("input[placeholder]")) {
    if (!visible(input) || input.value) continue;
    const style = getComputedStyle(input);
    measureContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const placeholderWidth = measureContext.measureText(
      input.getAttribute("placeholder") || ""
    ).width;
    const contentWidth =
      input.clientWidth -
      Number.parseFloat(style.paddingLeft || "0") -
      Number.parseFloat(style.paddingRight || "0");
    if (placeholderWidth > contentWidth + 2) {
      add(
        "warning",
        "placeholder-clipped",
        input,
        `placeholder is wider than the field (${Math.ceil(
          placeholderWidth
        )}px text in ${Math.round(contentWidth)}px)`
      );
    }
  }

  for (const image of document.querySelectorAll("img")) {
    if (!visible(image)) continue;
    if (!image.getAttribute("src")) {
      add("error", "image-missing-src", image, "visible image has no source");
    } else if (image.complete && image.naturalWidth === 0) {
      add("error", "broken-image", image, `image failed to load (${image.currentSrc || image.src})`);
    }
  }

  return {
    url: location.href,
    viewport: { width: viewportWidth, height: viewportHeight },
    scroll: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
    issues,
  };
}

async function runScenario(page, scenario, report, browserErrors) {
  const {
    name,
    path,
    width,
    height,
    mobile = false,
    prepare,
    keepTokenGate = false,
  } = scenario;
  await page.viewport(width, height, mobile);
  await page.navigate(`${report.baseUrl}/#${path}`);
  await page.waitFor("Boolean(document.querySelector('.shell'))");
  if (
    !keepTokenGate &&
    (await page.evaluate("Boolean(document.querySelector('.token-gate'))"))
  ) {
    await page.clickText("Browse without a token");
    await sleep(450);
  }
  if (prepare) await prepare(page);
  await sleep(700);
  await page.evaluate("document.fonts?.ready ?? Promise.resolve()");
  await page.evaluate(`Promise.race([
    Promise.all([...document.images]
      .filter((image) => image.getBoundingClientRect().top < window.innerHeight)
      .map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          }))),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ])`);
  await sleep(200);
  const audit = await page.evaluate(`(${auditPage.toString()})()`);
  const errors = page.errors();
  const file = join(SHOT_DIR, `${name}.png`);
  await page.screenshot(file);
  report.scenarios.push({
    name,
    path,
    viewport: { width, height, mobile },
    audit,
    errors,
    screenshot: join("shots", `${name}.png`),
  });
  if (errors.length) {
    browserErrors.push({ name, errors });
  }
  for (const issue of audit.issues) {
    if (issue.level === "error") report.errorCount += 1;
    else report.warningCount += 1;
  }
  log(
    `${name}: ${audit.issues.length ? `${audit.issues.length} issue(s)` : "clean"}${
      errors.length ? `, ${errors.length} browser error(s)` : ""
    }`
  );
}

async function main() {
  if (!existsSync(join(ROOT, "dist/web/server.js"))) {
    throw new Error("Build the server first: npm run build");
  }
  if (!existsSync(join(ROOT, "web/dist/index.html"))) {
    throw new Error("Build the web app first: npm --prefix web run build");
  }

  let tempRoot = null;
  let server = null;
  let browser = null;
  let baseUrl = baseUrlArg;
  let endpoint = cdpArg;
  const browserErrors = [];
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: "",
    scenarios: [],
    browserErrors,
    errorCount: 0,
    warningCount: 0,
  };

  try {
    if (!baseUrl) {
      tempRoot = await mkdtemp(join(tmpdir(), "discord-visual-"));
      const runsDir = join(tempRoot, "runs");
      const exportsDir = join(tempRoot, "exports");
      await mkdir(exportsDir, { recursive: true });
      await createFixture(exportsDir, runsDir);
      const port = await freePort();
      baseUrl = `http://127.0.0.1:${port}`;
      server = spawn(process.execPath, ["dist/web/server.js", "--port", String(port)], {
        cwd: ROOT,
        env: {
          ...process.env,
          DISCORD_MESSAGES_EXPORTER_RUNS: runsDir,
          DISCORD_MESSAGES_EXPORTER_EXPORTS: exportsDir,
          DISCORD_MESSAGES_EXPORTER_DIST: join(ROOT, "web/dist"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      server.stdout.on("data", () => {});
      server.stderr.on("data", (chunk) => {
        const text = String(chunk);
        if (/error/i.test(text)) process.stderr.write(text);
      });
      await waitForHttp(`${baseUrl}/api/status`);
    }
    report.baseUrl = baseUrl;
    await mkdir(SHOT_DIR, { recursive: true });

    // Index both fixture exports before the first screenshot so the library
    // shows the ready-card action layout rather than only the unindexed state.
    await Promise.all([
      fetch(`${baseUrl}/api/exports/${FIXTURE_ID}`).catch(() => {}),
      fetch(`${baseUrl}/api/exports/job-visualjob`).catch(() => {}),
    ]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/exports`).catch(() => null);
      if (response?.ok) {
        const data = await response.json();
        const ready = (data.exports || []).filter(
          (item) =>
            (item.id === FIXTURE_ID || item.id === "job-visualjob") &&
            item.status === "ready"
        );
        if (ready.length === 2) break;
      }
      await sleep(250);
    }

    if (!endpoint) {
      if (!CHROME) throw new Error("No Chromium binary found. Set CHROME_PATH.");
      const profile = await mkdtemp(join(tmpdir(), "discord-visual-chrome-"));
      const port = await freePort();
      browser = spawn(
        CHROME,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          `--user-data-dir=${profile}`,
          `--remote-debugging-port=${port}`,
          "about:blank",
        ],
        { stdio: "ignore" }
      );
      endpoint = `http://127.0.0.1:${port}`;
      await waitForHttp(`${endpoint}/json/version`);
    }

    const fixture = FIXTURE_ID;
    const scenarios = [
      {
        name: "token-prompt-desktop",
        path: "/",
        width: 1440,
        height: 1000,
        keepTokenGate: true,
      },
      {
        name: "token-prompt-mobile",
        path: "/",
        width: 390,
        height: 844,
        mobile: true,
        keepTokenGate: true,
      },
      { name: "dashboard-desktop", path: "/", width: 1440, height: 1000 },
      { name: "export-desktop", path: "/export", width: 1440, height: 1000 },
      { name: "explorer-desktop", path: "/explorer", width: 1440, height: 1000 },
      {
        name: "messages-desktop",
        path: `/explorer/${fixture}/messages`,
        width: 1440,
        height: 1000,
      },
      {
        name: "messages-clock-tooltip-desktop",
        path: `/explorer/${fixture}/messages`,
        width: 1440,
        height: 1000,
        prepare: async (page) => {
          const point = await page.evaluate(`(() => {
            const cell = document.querySelector(".clock-cell--interactive");
            if (!cell) return null;
            const rect = cell.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          })()`);
          if (point) {
            await page.send("Input.dispatchMouseEvent", {
              type: "mouseMoved",
              x: point.x,
              y: point.y,
            });
            await sleep(350);
          }
        },
      },
      {
        name: "messages-clock-selected-desktop",
        path: `/explorer/${fixture}/messages`,
        width: 1440,
        height: 1000,
        prepare: async (page) => {
          await page.evaluate(`(() => {
            const cell = [...document.querySelectorAll(".clock-cell--interactive")]
              .find((item) => !/0 messages/.test(item.getAttribute("aria-label") || ""));
            cell?.click();
          })()`);
          await sleep(700);
        },
      },
      {
        name: "messages-detail-desktop",
        path: `/explorer/${fixture}/messages`,
        width: 1440,
        height: 1000,
        prepare: async (page) => {
          await page.evaluate(
            "document.querySelector('.message-row')?.click()"
          );
          await sleep(350);
        },
      },
      {
        name: "messages-menu-desktop",
        path: `/explorer/${fixture}/messages`,
        width: 1440,
        height: 1000,
        prepare: async (page) => {
          await page.clickText("All authors");
          await page.waitFor(
            `Boolean(document.querySelector(".picker-menu[data-state='open']"))`
          );
        },
      },
      {
        name: "insights-desktop",
        path: `/explorer/${fixture}/insights`,
        width: 1440,
        height: 1000,
      },
      {
        name: "insights-activity-hover-desktop",
        path: `/explorer/${fixture}/insights`,
        width: 1440,
        height: 1000,
        prepare: async (page) => {
          await page.evaluate(
            "document.querySelector('.activity-chart')?.scrollIntoView({ block: 'center' })"
          );
          await sleep(500);
          const point = await page.evaluate(`(() => {
            const hit = document.querySelector(".activity-hit");
            if (!hit) return null;
            const rect = hit.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          })()`);
          if (point) {
            await page.send("Input.dispatchMouseEvent", {
              type: "mouseMoved",
              x: point.x,
              y: point.y,
            });
            await sleep(300);
          }
        },
      },
      {
        name: "insights-words-desktop",
        path: `/explorer/${fixture}/insights`,
        width: 1440,
        height: 1000,
        prepare: async (page) => {
          await page.evaluate(
            "document.querySelector('.word-cloud')?.scrollIntoView({ block: 'center' })"
          );
          await sleep(350);
        },
      },
      {
        name: "insights-reactions-desktop",
        path: `/explorer/${fixture}/insights`,
        width: 1440,
        height: 1000,
        prepare: async (page) => {
          await page.evaluate(
            "document.querySelector('.reaction-board')?.scrollIntoView({ block: 'center' })"
          );
          await sleep(350);
        },
      },
      { name: "dashboard-mobile", path: "/", width: 390, height: 844, mobile: true },
      { name: "export-mobile", path: "/export", width: 390, height: 844, mobile: true },
      { name: "explorer-mobile", path: "/explorer", width: 390, height: 844, mobile: true },
      {
        name: "messages-mobile",
        path: `/explorer/${fixture}/messages`,
        width: 390,
        height: 844,
        mobile: true,
      },
      {
        name: "insights-mobile",
        path: `/explorer/${fixture}/insights`,
        width: 390,
        height: 844,
        mobile: true,
      },
      {
        name: "insights-words-mobile",
        path: `/explorer/${fixture}/insights`,
        width: 390,
        height: 844,
        mobile: true,
        prepare: async (page) => {
          await page.evaluate(
            "document.querySelector('.word-cloud')?.scrollIntoView({ block: 'center' })"
          );
          await sleep(350);
        },
      },
      {
        name: "insights-reactions-mobile",
        path: `/explorer/${fixture}/insights`,
        width: 390,
        height: 844,
        mobile: true,
        prepare: async (page) => {
          await page.evaluate(
            "document.querySelector('.reaction-board')?.scrollIntoView({ block: 'center' })"
          );
          await sleep(350);
        },
      },
    ];

    const settingsTabs = [
      ["Account", "account"],
      ["Export", "export"],
      ["Appearance", "appearance"],
      ["Files", "files"],
      ["Updates", "updates"],
    ];
    for (const [label, tab] of settingsTabs) {
      scenarios.push({
        name: `settings-${tab}-desktop`,
        path: "/export",
        width: 1440,
        height: 1000,
        prepare: async (page) => {
          await page.clickText("Export settings");
          await page.waitFor("Boolean(document.querySelector('.settings-dialog[open]'))");
          await page.clickText(label);
          await sleep(350);
        },
      });
    }
    for (const [label, tab] of settingsTabs) {
      scenarios.push({
        name: `settings-${tab}-mobile`,
        path: "/export",
        width: 390,
        height: 844,
        mobile: true,
        prepare: async (page) => {
          await page.clickText("Export settings");
          await page.waitFor("Boolean(document.querySelector('.settings-dialog[open]'))");
          await page.clickText(label);
          await sleep(350);
        },
      });
    }

    for (const scenario of scenarios) {
      const target = await (
        await fetch(`${endpoint}/json/new?${encodeURIComponent("about:blank")}`, {
          method: "PUT",
        })
      ).json();
      const page = await new CdpPage(endpoint, target).connect();
      try {
        await runScenario(page, scenario, report, browserErrors);
      } finally {
        await page.close();
      }
    }

    report.scenarios.sort((a, b) => a.name.localeCompare(b.name));
    report.errorCount += browserErrors.reduce(
      (sum, entry) => sum + entry.errors.length,
      0
    );
    await writeFile(
      join(REPORT_DIR, "report.json"),
      JSON.stringify(report, null, 2)
    );
    await writeFile(join(REPORT_DIR, "index.html"), renderReport(report));

    log(
      `\n${report.errorCount} error(s), ${report.warningCount} warning(s). Report: ${join(
        REPORT_DIR,
        "index.html"
      )}`
    );
    if (report.errorCount > 0) process.exitCode = 1;
  } finally {
    if (server) server.kill("SIGTERM");
    if (browser) browser.kill("SIGTERM");
    if (tempRoot && !keep) await rm(tempRoot, { recursive: true, force: true });
    if (browser && !keep) {
      // Chrome removes its own profile when it exits.
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderReport(report) {
  const scenarios = report.scenarios
    .map(
      (scenario) => `
      <section class="scenario">
        <h2>${escapeHtml(scenario.name)} <small>${scenario.viewport.width}×${
          scenario.viewport.height
        }</small></h2>
        <img src="${escapeHtml(scenario.screenshot)}" alt="" loading="lazy" />
        ${
          scenario.errors.length
            ? `<ul class="browser">${scenario.errors
                .map((error) => `<li>${escapeHtml(error)}</li>`)
                .join("")}</ul>`
            : ""
        }
        ${
          scenario.audit.issues.length
            ? `<ul>${scenario.audit.issues
                .map(
                  (issue) =>
                    `<li class="${issue.level}"><strong>${issue.level}</strong> ${escapeHtml(
                      issue.code
                    )}: ${escapeHtml(issue.message)}<br /><code>${escapeHtml(
                      issue.element
                    )}</code></li>`
                )
                .join("")}</ul>`
            : "<p class=\"clean\">No layout issues detected.</p>"
        }
      </section>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Visual check · Discord Messages Exporter</title>
<style>
  body { margin: 0; padding: 24px; background: #141018; color: #f7f1f6; font: 14px/1.5 system-ui, sans-serif; }
  h1 { font-size: 1.4rem; }
  h2 { margin: 28px 0 8px; font-size: 1rem; }
  small { color: #a99aa4; font-weight: 400; }
  section { border-top: 1px solid #ffffff1f; padding-top: 8px; }
  img { display: block; width: min(100%, 980px); border: 1px solid #ffffff1f; border-radius: 6px; background: #0d0b10; }
  ul { margin: 10px 0; padding-left: 1.2rem; }
  li { margin: 6px 0; }
  li.error strong { color: #f4a0a5; }
  li.warning strong { color: #e8b86d; }
  code { color: #c9bdc2; font-size: .82em; }
  .clean { color: #9bd6a7; }
  .browser li { color: #f4a0a5; }
</style>
</head>
<body>
<h1>Visual check</h1>
<p>Generated ${escapeHtml(report.generatedAt)} · ${report.errorCount} error(s) · ${
    report.warningCount
  } warning(s) · ${escapeHtml(report.baseUrl)}</p>
${scenarios}
</body>
</html>`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
