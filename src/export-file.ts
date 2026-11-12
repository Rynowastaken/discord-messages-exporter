/**
 * Streaming reader for the exporter's JSON format.
 *
 * The console indexes exports and the attachment archiver scans the same file,
 * so the token-level parser lives in the core package rather than the web UI.
 */
import { createReadStream } from "node:fs";

export interface ScanCallbacks {
  onMetadata: (metadata: Record<string, unknown>) => void;
  onMessage: (message: Record<string, unknown>, index: number) => void;
  onProgress?: (bytes: number, indexed: number) => void;
  signal?: AbortSignal;
}

export async function scanExportFile(
  sourcePath: string,
  callbacks: ScanCallbacks
): Promise<void> {
  const stream = createReadStream(sourcePath, {
    encoding: "utf8",
    highWaterMark: 1024 * 1024,
  });
  let bytes = 0;
  let messages = 0;
  let depth = 0;
  let rootStarted = false;
  let inString = false;
  let escaped = false;
  let expectingKey = false;
  let keyCapture: string | null = null;
  let currentKey: string | null = null;
  let inMessages = false;
  let sawMessages = false;
  let capture: string | null = null;
  let captureBase = 0;
  let captureKind: "metadata" | "message" | null = null;

  const feed = (char: string): void => {
    if (capture !== null) {
      capture += char;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        return;
      }
      if (char === '"') {
        inString = true;
        return;
      }
      if (char === "{" || char === "[") {
        depth += 1;
        return;
      }
      if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === captureBase) {
          const value = capture;
          const kind = captureKind;
          capture = null;
          captureKind = null;
          if (kind === "metadata") {
            callbacks.onMetadata(JSON.parse(value) as Record<string, unknown>);
          } else if (kind === "message") {
            callbacks.onMessage(
              JSON.parse(value) as Record<string, unknown>,
              messages
            );
            messages += 1;
          }
        }
      }
      return;
    }

    if (inString) {
      if (keyCapture !== null) keyCapture += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        inString = false;
        if (keyCapture !== null) {
          currentKey = JSON.parse(keyCapture) as string;
          keyCapture = null;
          expectingKey = false;
        }
      }
      return;
    }

    if (char === '"') {
      inString = true;
      if (depth === 1 && expectingKey) keyCapture = '"';
      return;
    }
    if (char === "{" || char === "[") {
      if (!rootStarted && depth === 0 && char === "{") {
        rootStarted = true;
        depth = 1;
        expectingKey = true;
        return;
      }
      if (depth === 1 && currentKey === "export_metadata" && char === "{") {
        capture = "{";
        captureBase = 1;
        captureKind = "metadata";
        depth = 2;
        return;
      }
      if (inMessages && depth === 2 && char === "{") {
        capture = "{";
        captureBase = 2;
        captureKind = "message";
        depth = 3;
        return;
      }
      if (depth === 1 && currentKey === "messages" && char === "[") {
        inMessages = true;
        sawMessages = true;
        depth = 2;
        return;
      }
      depth += 1;
      return;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      if (inMessages && depth === 1 && char === "]") {
        inMessages = false;
        currentKey = null;
      }
      return;
    }
    if (char === "," && depth === 1) {
      expectingKey = true;
      currentKey = null;
    }
  };

  for await (const chunk of stream) {
    if (callbacks.signal?.aborted) throw new Error("indexing cancelled");
    bytes += Buffer.byteLength(chunk);
    for (let index = 0; index < chunk.length; index += 1) {
      feed(chunk[index]);
    }
    callbacks.onProgress?.(bytes, messages);
  }
  if (!rootStarted) {
    throw new Error("the file is not a JSON object");
  }
  if (!sawMessages) {
    throw new Error("the file has no messages array");
  }
  if (depth !== 0) {
    throw new Error("the export file is not complete JSON");
  }
  if (capture !== null || inString) {
    throw new Error("the export file ends inside a JSON value");
  }
}

