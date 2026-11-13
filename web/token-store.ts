/**
 * Token persistence through the operating system's protected storage.
 *
 * Linux uses Secret Service (secret-tool). Windows uses DPAPI, which encrypts
 * the token for the current Windows user and writes the ciphertext to a file.
 * Other platforms keep the token in memory for the life of the server. The
 * token itself is always written to a child process's stdin, never to its
 * argv, environment, or any log.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RUNS_DIR } from "./paths.js";

export interface StoredToken {
  token: string;
  isBot: boolean;
}

export type TokenStorage = "os-keychain" | "encrypted-file" | "memory";

// Keep the original service name so tokens saved before the rename still load.
const SERVICE = "discord-author-export";
const ACCOUNT = "default";
const LABEL = "Discord Messages Exporter token";
const TOKEN_PATH = join(dirname(RUNS_DIR), "token.enc");
const DPAPI_ENTROPY = "discord-messages-exporter";
const POWERSHELL_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

const DPAPI_PROTECT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$plain = [Console]::In.ReadToEnd()
$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')
$bytes = [Text.Encoding]::UTF8.GetBytes($plain)
$encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($encrypted)
`;

const DPAPI_UNPROTECT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')
$encoded = [Console]::In.ReadToEnd()
$encrypted = [Convert]::FromBase64String($encoded.Trim())
$plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Text.Encoding]::UTF8.GetString($plain)
`;

const DPAPI_PROBE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')
$bytes = [Text.Encoding]::UTF8.GetBytes('probe')
$encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Text.Encoding]::UTF8.GetString($plain)
`;

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
      windowsHide: true,
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

function runPowerShell(
  script: string,
  input: string,
  timeoutMs: number
): ReturnType<typeof run> {
  return run(
    "powershell.exe",
    [...POWERSHELL_ARGS, script],
    input,
    timeoutMs
  );
}

function linuxKeychainWorks(): boolean {
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
  return works;
}

function windowsDpapiWorks(): boolean {
  const probe = spawnSync(
    "powershell.exe",
    [...POWERSHELL_ARGS, DPAPI_PROBE],
    { encoding: "utf8", timeout: 10000, windowsHide: true }
  );
  return (
    probe.error === undefined &&
    probe.status === 0 &&
    probe.stdout.trim() === "probe"
  );
}

export function tokenStorage(): TokenStorage {
  if (cachedKind) return cachedKind;
  if (process.platform === "linux") {
    cachedKind = linuxKeychainWorks() ? "os-keychain" : "memory";
    return cachedKind;
  }
  if (process.platform === "win32") {
    cachedKind = windowsDpapiWorks() ? "encrypted-file" : "memory";
    return cachedKind;
  }
  cachedKind = "memory";
  return cachedKind;
}

function parseStoredToken(raw: string): StoredToken | null {
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

async function readKeychainToken(): Promise<StoredToken | null> {
  const result = await run("secret-tool", [
    "lookup",
    "service",
    SERVICE,
    "account",
    ACCOUNT,
  ]);
  if (result.code !== 0) return null;
  return parseStoredToken(result.stdout.replace(/\r?\n$/, ""));
}

async function readEncryptedToken(): Promise<StoredToken | null> {
  let encoded: string;
  try {
    encoded = await readFile(TOKEN_PATH, "utf8");
  } catch {
    return null;
  }
  if (!encoded.trim()) return null;
  const result = await runPowerShell(DPAPI_UNPROTECT, encoded, 20000);
  if (result.code !== 0) return null;
  return parseStoredToken(result.stdout.replace(/\r?\n$/, ""));
}

export async function readStoredToken(): Promise<StoredToken | null> {
  const kind = tokenStorage();
  if (kind === "os-keychain") return readKeychainToken();
  if (kind === "encrypted-file") return readEncryptedToken();
  return null;
}

async function writeKeychainToken(value: StoredToken): Promise<boolean> {
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

async function writeEncryptedToken(value: StoredToken): Promise<boolean> {
  const secret = JSON.stringify({
    token: value.token,
    is_bot: value.isBot,
  });
  const result = await runPowerShell(DPAPI_PROTECT, secret, 20000);
  if (result.code !== 0) return false;
  const encoded = result.stdout.trim();
  if (!encoded) return false;
  try {
    await mkdir(dirname(TOKEN_PATH), { recursive: true });
    const temp = `${TOKEN_PATH}.tmp`;
    await writeFile(temp, encoded, { encoding: "utf8", mode: 0o600 });
    await rm(TOKEN_PATH, { force: true });
    await rename(temp, TOKEN_PATH);
    return true;
  } catch {
    return false;
  }
}

export async function writeStoredToken(value: StoredToken): Promise<boolean> {
  const kind = tokenStorage();
  if (kind === "os-keychain") return writeKeychainToken(value);
  if (kind === "encrypted-file") return writeEncryptedToken(value);
  return false;
}

export async function clearStoredToken(): Promise<void> {
  const kind = tokenStorage();
  if (kind === "os-keychain") {
    await run("secret-tool", [
      "clear",
      "service",
      SERVICE,
      "account",
      ACCOUNT,
    ]);
    return;
  }
  if (kind === "encrypted-file") {
    await rm(TOKEN_PATH, { force: true });
  }
}
