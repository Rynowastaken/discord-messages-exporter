/**
 * Stream page files into one chronological JSON document, or merge per-channel
 * JSONL files for a whole-server export.
 *
 * Pages are written by workers in whatever order they finish, so ordering is
 * reconstructed from the naming scheme: ``r<range>_<seq>.json``. Range numbers
 * ascend with time; within a range ``seq`` starts at the newest page and grows
 * toward older messages, and each page is newest-first.
 */
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, readFile, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { toSnowflake } from "./util.js";
import type { SlimMessage } from "./schema.js";

const PAGE_PATTERN = /^r(\d+)_(\d+)\.json$/;

export class AssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssemblyError";
  }
}

export interface AssemblyResult {
  total: number;
  wrongAuthor: number;
  attachments: number;
  sizeBytes: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  duplicateIds: number;
  ids: bigint[];
}

function emptyResult(): AssemblyResult {
  return {
    total: 0,
    wrongAuthor: 0,
    attachments: 0,
    sizeBytes: 0,
    oldestTimestamp: null,
    newestTimestamp: null,
    duplicateIds: 0,
    ids: [],
  };
}

async function rangeDir(
  pagesDir: string
): Promise<Map<number, Array<[number, string]>>> {
  const ranges = new Map<number, Array<[number, string]>>();
  let names: string[];
  try {
    names = await readdir(pagesDir);
  } catch {
    throw new AssemblyError(`no pages directory at ${pagesDir}`);
  }
  for (const name of names) {
    const match = PAGE_PATTERN.exec(name);
    if (!match) continue;
    const rangeIndex = Number(match[1]);
    const sequence = Number(match[2]);
    const rows = ranges.get(rangeIndex) ?? [];
    rows.push([sequence, name]);
    ranges.set(rangeIndex, rows);
  }
  return ranges;
}

async function* iterMessages(pagesDir: string): AsyncGenerator<SlimMessage> {
  const ranges = await rangeDir(pagesDir);
  const indices = [...ranges.keys()].sort((a, b) => a - b);
  for (const rangeIndex of indices) {
    const rows = [...(ranges.get(rangeIndex) ?? [])].sort(
      (a, b) => b[0] - a[0]
    );
    for (const [, name] of rows) {
      const raw = await readFile(join(pagesDir, name), "utf8");
      const messages = JSON.parse(raw) as SlimMessage[];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        yield messages[index];
      }
    }
  }
}

interface EmitState {
  previousId: bigint;
  seen: Set<string> | null;
}

function emit(
  message: SlimMessage,
  result: AssemblyResult,
  state: EmitState,
  authorId: string | null
): void {
  if (message.id === undefined) {
    throw new AssemblyError("message has no id");
  }
  const messageId = toSnowflake(message.id);
  if (messageId <= state.previousId) {
    throw new AssemblyError(
      `ordering violation: ${messageId} after ${state.previousId}`
    );
  }
  if (authorId !== null && message.author?.id !== authorId) {
    result.wrongAuthor += 1;
  }
  result.attachments += message.attachments?.length ?? 0;
  if (result.total === 0) result.oldestTimestamp = message.timestamp ?? null;
  result.newestTimestamp = message.timestamp ?? null;
  if (state.seen) {
    if (state.seen.has(message.id)) result.duplicateIds += 1;
    state.seen.add(message.id);
    result.ids.push(messageId);
  }
  state.previousId = messageId;
  result.total += 1;
}

function metadataPrefix(metadata: Record<string, unknown>): string {
  const serialized = JSON.stringify({ export_metadata: metadata }, null, 2);
  return serialized.slice(0, -2) + ',\n  "messages": [\n';
}

async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function assemble(
  workdir: string,
  outPath: string,
  metadata: Record<string, unknown>,
  authorId: string | null,
  options: { keepIds?: boolean } = {}
): Promise<AssemblyResult> {
  const pagesDir = join(workdir, "pages");
  const ranges = await rangeDir(pagesDir);
  if (!ranges.size) throw new AssemblyError(`no page files in ${pagesDir}`);

  const result = emptyResult();
  const state: EmitState = {
    previousId: 0n,
    seen: options.keepIds ? new Set() : null,
  };
  const tmpPath = `${outPath}.tmp`;
  await ensureParent(outPath);
  const handle = await open(tmpPath, "w");
  let first = true;
  try {
    await handle.write(metadataPrefix(metadata));
    for await (const message of iterMessages(pagesDir)) {
      emit(message, result, state, authorId);
      if (!first) await handle.write(",\n");
      await handle.write("    " + JSON.stringify(message));
      first = false;
    }
    await handle.write("\n  ]\n}\n");
  } finally {
    await handle.close();
  }
  await rename(tmpPath, outPath);
  result.sizeBytes = (await stat(outPath)).size;
  return result;
}

export async function assembleLines(
  workdir: string,
  outPath: string,
  authorId: string | null
): Promise<AssemblyResult> {
  const pagesDir = join(workdir, "pages");
  const ranges = await rangeDir(pagesDir);
  if (!ranges.size) throw new AssemblyError(`no page files in ${pagesDir}`);
  const result = emptyResult();
  const state: EmitState = { previousId: 0n, seen: null };
  const tmpPath = `${outPath}.tmp`;
  await ensureParent(outPath);
  const handle = await open(tmpPath, "w");
  try {
    for await (const message of iterMessages(pagesDir)) {
      emit(message, result, state, authorId);
      await handle.write(JSON.stringify(message) + "\n");
    }
  } finally {
    await handle.close();
  }
  await rename(tmpPath, outPath);
  result.sizeBytes = (await stat(outPath)).size;
  return result;
}

async function* readLines(path: string): AsyncGenerator<SlimMessage> {
  const reader = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of reader) {
    const text = line.trim();
    if (text) yield JSON.parse(text) as SlimMessage;
  }
}

interface HeapEntry {
  id: bigint;
  message: SlimMessage;
  iterator: AsyncGenerator<SlimMessage>;
}

function less(a: HeapEntry, b: HeapEntry): boolean {
  return a.id < b.id;
}

function heapPush(heap: HeapEntry[], entry: HeapEntry): void {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!less(heap[index], heap[parent])) break;
    [heap[index], heap[parent]] = [heap[parent], heap[index]];
    index = parent;
  }
}

function heapPop(heap: HeapEntry[]): HeapEntry | undefined {
  if (!heap.length) return undefined;
  const top = heap[0];
  const last = heap.pop();
  if (heap.length && last) {
    heap[0] = last;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && less(heap[left], heap[smallest])) {
        smallest = left;
      }
      if (right < heap.length && less(heap[right], heap[smallest])) {
        smallest = right;
      }
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return top;
}

/**
 * Merge per-channel JSONL files into one chronological export. Snowflakes are
 * globally monotonic, so ordering by message id interleaves channels. Equal
 * ids are counted as duplicates and skipped.
 */
export async function mergeLines(
  paths: string[],
  outPath: string,
  metadata: Record<string, unknown>
): Promise<AssemblyResult> {
  const result = emptyResult();
  const state: EmitState = { previousId: 0n, seen: null };
  const heap: HeapEntry[] = [];
  for (const path of paths) {
    const iterator = readLines(path);
    const first = await iterator.next();
    if (!first.done) {
      heapPush(heap, {
        id: toSnowflake(first.value.id ?? "0"),
        message: first.value,
        iterator,
      });
    }
  }

  const tmpPath = `${outPath}.tmp`;
  await ensureParent(outPath);
  const handle = await open(tmpPath, "w");
  let first = true;
  try {
    await handle.write(metadataPrefix(metadata));
    while (heap.length) {
      const entry = heapPop(heap);
      if (!entry) break;
      const messageId = toSnowflake(entry.message.id ?? "0");
      if (messageId === state.previousId) {
        result.duplicateIds += 1;
      } else {
        emit(entry.message, result, state, null);
        if (!first) await handle.write(",\n");
        await handle.write("    " + JSON.stringify(entry.message));
        first = false;
      }
      const next = await entry.iterator.next();
      if (!next.done) {
        heapPush(heap, {
          id: toSnowflake(next.value.id ?? "0"),
          message: next.value,
          iterator: entry.iterator,
        });
      }
    }
    await handle.write("\n  ]\n}\n");
  } finally {
    await handle.close();
  }
  await rename(tmpPath, outPath);
  result.sizeBytes = (await stat(outPath)).size;
  return result;
}
