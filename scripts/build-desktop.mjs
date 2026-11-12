#!/usr/bin/env node
/**
 * Prepare the Tauri desktop resources.
 *
 * The desktop shell starts a bundled Node runtime, so the local server works
 * without a separate Node installation. The server and exporter are bundled
 * into one CommonJS file; the React build and that runtime sit beside it in
 * Tauri's resource directory.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDist = join(root, "web", "dist");
const buildDir = join(root, "build", "desktop");
const appDir = join(root, "src-tauri", "resources", "app");
const windows = process.platform === "win32";

if (!existsSync(join(webDist, "index.html"))) {
  throw new Error("web/dist is missing; run `npm run web:build` first");
}

rmSync(buildDir, { recursive: true, force: true });
rmSync(appDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
mkdirSync(appDir, { recursive: true });

await build({
  entryPoints: [join(root, "web", "server.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  outfile: join(appDir, "server.cjs"),
  logLevel: "warning",
  external: ["node:sqlite"],
});

const nodeName = windows ? "node.exe" : "node";
const nodeSource = realpathSync(
  process.env.NODE_DESKTOP_BINARY || process.execPath
);
const nodeTarget = join(appDir, nodeName);
copyFileSync(nodeSource, nodeTarget);
chmodSync(nodeTarget, 0o755);
cpSync(webDist, join(appDir, "web-dist"), { recursive: true });

// Keep the target-triple name around for tooling that expects it, but the
// desktop shell starts the packaged Node runtime directly from resources.
const rustc = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
const host = rustc
  .split("\n")
  .find((line) => line.startsWith("host: "))
  ?.slice("host: ".length)
  .trim();
console.log(
  `desktop resources ready in ${appDir}${host ? ` (${host})` : ""}`
);
