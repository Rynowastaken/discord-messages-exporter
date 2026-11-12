# discord-messages-exporter

Export every message one author posted in a Discord channel to a single
chronological JSON file, resumably. Attachment metadata is recorded by default
and the files themselves can be archived alongside the JSON. It also exports a
whole channel or every text channel in a server.

TypeScript and Node.js 24+, no runtime dependencies. The built-in SQLite module
powers the Explorer's local search index.

## Install

```bash
npm install
npm --prefix web install
npm run build
npm link          # optional: puts the commands on PATH
```

That gives you three commands:

| Command | What it is |
|---|---|
| `discord-messages-exporter-tui` | interactive terminal launcher |
| `discord-messages-exporter` | scriptable CLI (`info`, `export`) |
| `discord-messages-exporter-web` | self-hosted web console (`--host`, `--port`) |

From a checkout, without installing:

```bash
./launchers/discord-messages-exporter-tui.sh          # Linux / macOS
launchers\discord-messages-exporter-tui.cmd           # Windows

node dist/src/cli.js info --channel … --author …
npm run dev:tui                                   # run the TUI from source
npm run dev:cli -- info --channel … --author …    # run the CLI from source
```

## Token

The CLI and TUI read the token from `DISCORD_TOKEN`, or prompt for it with
echo disabled. The web console prompts on the first page load. Tokens are never
written to browser storage or logs.

On Linux, **Remember in the OS keychain** stores the token through Secret
Service (`secret-tool`), so the server can restore it after a restart. Without
a system keychain, the token stays in server memory only. `DISCORD_TOKEN`
takes precedence over a remembered token. Add `--bot` for a bot token (`Bot `
prefix); user tokens must be sent unqualified.

## TUI

![menu](docs/menu.txt)

Run `discord-messages-exporter-tui` (or `npm run dev:tui`). It asks for the token
on the first screen, before anything else, and verifies it against Discord so a
bad token is caught immediately rather than halfway through a crawl. Input is
hidden and never written to disk; pressing Enter uses `DISCORD_TOKEN` if that
is set.

Menu keys:

- **1 — Look up author**: reports how many messages that author has, and their
  first and last timestamps, without crawling anything.
- **2 — Export**: crawls, shows a live progress bar with rate and ETA, and
  writes the JSON. Ctrl-C pauses and keeps all progress; running Export again
  resumes exactly where it stopped.
- **3 — Settings**: channel, author, dates, output path, workers, pace, ranges.
  Saved to `~/.discord-messages-exporter.json` (no token).
- **4 — Open output folder**.

## Web console

A bundled local web UI can run exports, stream progress, and download the JSON.
It is a React + TypeScript app served by a Node + TypeScript server
(`web/server.ts`) that runs the same crawler in-process.

```bash
npm install
npm --prefix web install
npm run web:start
# open http://127.0.0.1:8788
```

`npm run web:start` builds both the exporter and the frontend, then runs the
server from `dist/`. During development, run the API and Vite separately:

```bash
npm run web:server     # API on :8788
npm --prefix web run dev   # Vite on :5174, proxies /api to :8788
```

The server binds to `127.0.0.1` by default. It reads the token from
`DISCORD_TOKEN`, or prompts for one in the console and can remember it in the
OS keychain; set `DISCORD_TOKEN_IS_BOT=1` when the server token belongs to a
bot. The browser never stores the token. The greeting shows the token's own
Discord user or bot.
See [`web/README.md`](web/README.md) for the API and deployment notes.

### Modules

The web console opens on a dashboard with links to:

- **Export** — the crawl console: author, whole channel, or whole server;
  live progress, stop/resume, and JSON download.
- **Explorer** — finished job exports and JSON files you load. Each export is
  indexed locally (SQLite) and gets separate **Messages** and **Insights**
  pages. Messages supports full-text search plus author, channel, and date
  filters. Message text renders Discord markdown — bold, italics, inline and
  fenced code, quotes, lists, links, mentions, spoilers, timestamps — and
  custom emoji, with a detail pane for attachments, reactions, replies, and
  embeds.
  Insights has behavior rates (night owl, replies, attachments, links, median
  length), archive records (busiest day/hour, longest quiet stretch, longest
  streak), activity over time, a weekday-by-hour posting clock, a clickable word
  cloud, top authors/channels, message-length mix, attachment types, link
  domains, reactions, and first/last/longest-message bookends.
- **Insights** — the dashboard card links to the most recent export's charts.

An export is only read, never modified. Loaded files are copied to
`web/exports/`; job exports are indexed beside their run directory. Set
`DISCORD_MESSAGES_EXPORTER_EXPORTS` to relocate loaded exports and
`DISCORD_MESSAGES_EXPORTER_RUNS` to relocate job runs.

## Desktop app

The same console can be wrapped as a Tauri desktop application. The desktop
shell starts a bundled Node runtime and the local server, so users do not need
Node installed.

Prerequisites: Rust stable, the Tauri system dependencies for your OS
(WebKitGTK on Linux), and a built frontend.

```bash
npm run desktop:prepare      # web build + bundled Node/server resources
npm run desktop:dev          # debug desktop window
npm run desktop:build        # platform installers under src-tauri/target/release/bundle
```

On Linux, `npx tauri build --bundles deb` produces a Debian package directly.
The app stores runs and imported exports under the OS application-data
directory, and the token still comes from the OS keychain or the in-app prompt.

The bundled Node runtime is copied from the machine that builds the package.
Set `NODE_DESKTOP_BINARY=/path/to/node` when building a distributable against a
portable Node release.

## CLI

```bash
# what is there?
node dist/src/cli.js info --channel 1120284155578691676 --author 810409750625386497

# crawl it
node dist/src/cli.js export \
    --channel 1120284155578691676 \
    --author 810409750625386497 \
    --out messages.json

# limit the window and tune throughput
node dist/src/cli.js export --channel … --author … \
    --since 2025-01-01 --until 2025-06-01 \
    --workers 8 --rate 6 --check-total
```

`export` discovers the author's first message automatically when `--since` is
omitted, so there is no dead range to scan.

Exit codes: `0` success, `1` nothing to export, `2` Discord or usage error,
`3` some ranges failed (re-run to retry only those), `130` interrupted.

## Output

```json
{
  "export_metadata": {
    "channel": {"id": "...", "name": "..."},
    "guild": {"id": "...", "name": "..."},
    "target_user_id": "...",
    "ordering": "chronological (oldest first)",
    "attachments_note": "Attachment binaries were NOT downloaded…",
    "crawl": {"ranges": 140, "workers": 8, "pages": 6700, "...": "..."}
  },
  "messages": [
    {
      "id": "…", "channel_id": "…", "timestamp": "…", "edited_timestamp": null,
      "type": 0, "pinned": false, "content": "…",
      "author": {"id": "…", "username": "…", "global_name": "…", "bot": false},
      "attachments": [{"id": "…", "filename": "…", "size": 1234,
                       "content_type": "image/png", "width": 1, "height": 1,
                       "url": "https://cdn.discordapp.com/…"}],
      "embeds": [], "sticker_items": [], "reactions": [],
      "message_reference": null, "referenced_message": null,
      "thread": null, "flags": 0
    }
  ]
}
```

Messages are strictly ascending by id, which is also ascending by time. That
is asserted during assembly — a duplicate or gap aborts the write rather than
producing a quietly wrong file.

A whole-server export merges one JSONL file per channel by id, so channels
interleave chronologically and every message keeps its own `channel_id`.

**Attachments are optional.** By default the export records metadata only.
The `url` and `proxy_url` values are signed CDN links that expire, so treat
them as a record of what was attached, not a durable link. `--no-attachments`
drops the records; `--download-attachments` copies the bytes into
`<work>/attachments/` and writes a manifest there. In the console, the same
choice is under **Export settings → Output**: metadata only, download files,
or exclude attachments.

## How it works

**Ranges, not one cursor.** History is served at roughly 8–10 requests/second
per channel. A single `before=` cursor leaves most of that idle waiting on
latency, so the id space is split into contiguous ranges that several workers
pull at once. Ids are monotonic, so ranges tile time exactly and the results
concatenate in order. Snowflakes stay `BigInt` throughout.

**`before` only — never `before` and `after` together.** With both present,
Discord honours `after`, ignores `before`, and keeps returning the same first
page while the cursor appears to advance. That silently duplicates thousands
of records instead of failing. Every walk here uses exactly one cursor, and
the low edge of a range is enforced by filtering (`id >= lo`).

**Pacing.** These routes return no `X-RateLimit-*` headers, so the rate is
paced client-side and shared by all workers, because the limit is per route
rather than per worker. `--rate` defaults to 6/s; the practical ceiling is
around 8–10/s, and pushing past it earns 429s with 0.3s penalties.

**Resume.** Every finished range writes a marker under `work/done/`. Re-running
the same command skips finished ranges and only fetches what is missing. A work
directory is bound to its channel, author, start point, range count, and mode;
a run whose settings differ is refused rather than mixing pages from two
exports.

## Verification

```bash
npm run typecheck      # exporter, server, and tests
npm test               # 46 TypeScript tests, no network
npm run web:build      # typecheck + production frontend bundle
```

Covers range tiling (no gaps, no overlaps, every id owned once), snowflake
conversion, the attachment-metadata policy, assembly ordering including the
failure case, whole-server job merging and partial resumes, the API picker
endpoints, token redaction, and the Explorer's export discovery, indexing,
search, filters, facets, stats, imports, and malformed-file handling.

## Caveats

- **User tokens are self-botting.** Automating a user account violates
  Discord's Terms of Service and can get the account flagged or banned. This
  tool only reads history the account can already see, but the risk is real
  and is yours to weigh. Prefer a bot token where possible.
- **Single-message fetch is bot-only.** `GET /channels/{id}/messages/{id}`
  returns `403 "Only bots can use this endpoint"` for user tokens, so the
  crawler can only work from history pages and search.
- **Counts can disagree with search.** Discord's search endpoint reports a
  total that sometimes exceeds what the history endpoint returns — typically
  deleted messages still sitting in the search index. `--check-total` prints
  the difference rather than hiding it.
- **Search offset caps at ~5000.** Deeper result sets need to be split by
  `min_id`/`max_id`; the crawler does not rely on search for the crawl itself.
- **The export is a snapshot.** It ends at the newest message at crawl time;
  re-running extends it.
