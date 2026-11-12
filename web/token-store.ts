/**
 * Token persistence through the operating system's credential store.
 *
 * Linux uses Secret Service (secret-tool). The token is written to the child's
 * stdin, never to its argv, environment, or any log. Other platforms fall back
 * to memory for the life of the server rather than writing a token to disk.
 */
import { spawn, spawnSync } from "node:child_process";

export interface StoredToken {
  token: string;
  isBot: boolean;
}

export type TokenStorage = "os-keychain" | "memory";

// Keep the original service name so tokens saved before the rename still load.
const SERVICE = "discord-author-export";
const ACCOUNT = "default";
const LABEL = "Discord Messages Exporter token";

let cachedKind: TokenStorage | null = null;

function run(
  command: string,
  args: string[],
  input?: string,
  timeoutMs = 8000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdin.on("error", () => {
      // The tool may exit before reading; the exit code drives the result.
    });
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code);
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function tokenStorage(): TokenStorage {
  if (cachedKind) return cachedKind;
  if (process.platform !== "linux") {
    cachedKind = "memory";
    return cachedKind;
  }
  const probeValue = `probe-${process.pid}-${Date.now()}`;
  const write = spawnSync(
    "secret-tool",
    [
      "store",
      "--label",
      "discord-author-export keychain probe",
      "service",
      "__discord_author_export_probe__",
      "account",
      "probe",
    ],
    { input: probeValue, stdio: ["pipe", "ignore", "ignore"], timeout: 4000 }
  );
  let works = write.error === undefined && write.status === 0;
  if (works) {
    const read = spawnSync(
      "secret-tool",
      [
        "lookup",
        "service",
        "__discord_author_export_probe__",
        "account",
        "probe",
      ],
      { encoding: "utf8", timeout: 4000 }
    );
    works =
      read.error === undefined &&
      read.status === 0 &&
      read.stdout.trim() === probeValue;
  }
  spawnSync(
    "secret-tool",
    [
      "clear",
      "service",
      "__discord_author_export_probe__",
      "account",
      "probe",
    ],
    { stdio: "ignore", timeout: 4000 }
  );
  cachedKind = works ? "os-keychain" : "memory";
  return cachedKind;
}

export async function readStoredToken(): Promise<StoredToken | null> {
  if (tokenStorage() !== "os-keychain") return null;
  const result = await run("secret-tool", [
    "lookup",
    "service",
    SERVICE,
    "account",
    ACCOUNT,
  ]);
  if (result.code !== 0) return null;
  const raw = result.stdout.replace(/\r?\n$/, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      token?: unknown;
      is_bot?: unknown;
    };
    if (typeof parsed.token !== "string" || !parsed.token) return null;
    return { token: parsed.token, isBot: Boolean(parsed.is_bot) };
  } catch {
    // Older/plain values are still a token; treat them as a user token.
    return { token: raw, isBot: false };
  }
}

export async function writeStoredToken(value: StoredToken): Promise<boolean> {
  if (tokenStorage() !== "os-keychain") return false;
  const secret = JSON.stringify({
    token: value.token,
    is_bot: value.isBot,
  });
  const result = await run(
    "secret-tool",
    ["store", "--label", LABEL, "service", SERVICE, "account", ACCOUNT],
    secret,
    15000
  );
  return result.code === 0;
}

export async function clearStoredToken(): Promise<void> {
  if (tokenStorage() !== "os-keychain") return;
  await run("secret-tool", [
    "clear",
    "service",
    SERVICE,
    "account",
    ACCOUNT,
  ]);
}
