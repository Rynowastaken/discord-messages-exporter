# Web console

A local, self-hosted console for `discord-messages-exporter`. Node.js 24+ is
required for the built-in SQLite index. It is a dashboard
with three modules: **Export** runs the crawler from the browser, **Explorer**
reads finished job exports and loaded JSON files, and **Insights** turns an
export into charts and statistics. Advanced crawl options, filters, and the
token stay in the relevant module, and the greeting shows the Discord user or
bot the token belongs to.

The console is a React + TypeScript app (`src/`, Vite) served by a Node +
TypeScript server (`server.ts`) that runs the exporter's own `Crawler`
in-process, so stopping and resuming uses the same `work/done/` markers the CLI
uses. The Explorer builds a local SQLite/FTS5 index beside each export; it never
modifies the exported file.

## Run

From the repository root:

```bash
npm install
npm --prefix web install
npm run web:start
```

Open <http://127.0.0.1:8788>. `web:start` builds the exporter and the frontend,
then serves `dist/web/server.js`. To run an already-built checkout without
rebuilding:

```bash
DISCORD_TOKEN=… node dist/web/server.js
```

The server binds to `127.0.0.1` by default. If you expose it, put it behind an
authenticated reverse proxy (Cloudflare Access, a VPN, or similar): anyone who
can reach the port can start exports with the server's token.

Work directories default to `web/runs/`. Set `DISCORD_MESSAGES_EXPORTER_RUNS` to a
writable path when the package directory is read-only (for example, a global
install).

## Settings and identity

The main form holds the export scope, the IDs that scope needs, the Discord
connection state, and a read-only summary of the current settings. Everything
editable is in the Settings dialog:

- export save folder (finished jobs are copied there as a named folder)
- date window
- ranges, workers, and pace
- metadata-only, downloaded-files, or excluded attachment handling, plus the
  search-total check
- the Discord token, when the server has none

**Export scope**

- **One author** — choose a server, channel, and user; only that author's
  messages.
- **Whole channel** — choose a server and channel; every message in it.
- **Whole server** — choose a server; every message in every text and
  announcement channel the token can see. Threads, voice channels, categories,
  and forums are not included. The channels are crawled one after another and
  merged into one chronological JSON; each message keeps its `channel_id`.

The server list comes from the token (`/users/@me/guilds`) with each server's
icon; choosing a server loads its text channels, and One author mode lists the
people who recently posted in the chosen channel (with avatars). Users who have
not posted recently can be pasted by ID. **Enter IDs manually** switches the
whole form back to text fields at any time.

Non-secret settings are saved in the browser's `localStorage`. The token is
never saved there, logged, or included in an API response.

The console prompts for a token immediately when no credential is configured,
and the sidebar's token control reopens the prompt. On Linux, **Remember in the
OS keychain** stores it through Secret Service (`secret-tool`) and restores it
on restart; without a keychain it stays in server memory. `DISCORD_TOKEN`
takes precedence. The browser never stores the token in `localStorage` or
`sessionStorage`.

The console calls `GET /api/token` to resolve the credential source and
`POST /api/me` once to resolve the token's own Discord user, then shows
`good evening, <display name>` with `Signed in as @username · bot/user`.
When the server provides the token, configure its type once:

```bash
DISCORD_TOKEN=… DISCORD_TOKEN_IS_BOT=1 node dist/web/server.js
```

Tick **Bot token** in Settings for a pasted bot token. User tokens are
self-botting and carry the risks described in the main README; prefer a bot
token.

## Development

Two terminals, from the repository root:

```bash
npm run web:server            # API on :8788 (tsx, no build needed)
npm --prefix web run dev      # Vite on :5174, proxies /api to :8788
```

`npm run web:build` type-checks with `tsc --noEmit` before bundling;
`npm --prefix web run typecheck` runs the check alone. `npm test` at the root
runs the exporter and server test suites.

## Explorer

The Explorer lists `runs/<id>/messages.json` from finished jobs even after the
server restarts, plus files loaded through **Load export** (picker or
drag-and-drop). A loaded file is copied to `exports/<id>/messages.json`; the
original is untouched.

Each export is indexed once into `explorer.sqlite` beside it. The index stores
message previews, author/channel IDs and names, timestamps, attachment-type
counts, and the raw record for the detail pane. Indexing streams the JSON
`messages` array, so large exports do not have to fit in memory. A source file
whose size or modification time changed is re-indexed; a failed index can be
retried.

- **Messages** supports FTS5 content search plus author, channel, and date
  filters, with 100-message pages, Discord markdown, reaction chips, inline
  photo previews when files were archived, and a detail pane for attachments,
  reactions, replies, and embeds.
- **Insights** computes behavior rates, archive records, activity over time, a
  weekday-by-hour posting clock, a clickable word cloud, top authors/channels,
  message-length mix, attachment types, link domains, reactions, and
  first/last/longest-message bookends. **Whole export / Current filter**
  controls whether everything follows the filter bar.

Work directories and loaded exports can be relocated with
`DISCORD_MESSAGES_EXPORTER_RUNS` and `DISCORD_MESSAGES_EXPORTER_EXPORTS`.
`DISCORD_MESSAGES_EXPORTER_MAX_BYTES` caps an upload (default 2 GiB).

## Jobs

Each job gets `runs/<id>/`:

- `runs/<id>/work/pages/` — fetched pages
- `runs/<id>/work/done/` — completion markers (the resume unit)
- `runs/<id>/messages.json` — the assembled export
- `runs/<id>/explorer.sqlite` — the Explorer index, created on first open

Stopping a job keeps all of it; **Resume** starts the same job again and the
crawler skips finished ranges. The job list is in memory and resets when the
server restarts; the work directories do not.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/status` | server token presence/type, source, keychain availability, and job summaries |
| GET | `/api/token` | token configured/source/storage (never the token) |
| POST | `/api/token` | verify and hold a token (`token`, `is_bot`, `remember`) |
| DELETE | `/api/token` | forget the remembered token |
| POST | `/api/me` | the token's Discord user (`token`, optional `is_bot`) |
| POST | `/api/info` | scope lookup (`mode`, `channel`, `author`, `server`, optional `token`) |
| POST | `/api/browse` | picker lists (`kind`: `guilds`, `channels`, `authors`, `members`; optional `server`, `channel`, `query`, `token`) |
| POST | `/api/jobs` | start an export (`mode`: `author`, `channel`, or `server`) |
| GET | `/api/jobs/{id}` | full job state, ranges, throughput |
| POST | `/api/jobs/{id}/stop` | request a stop |
| POST | `/api/jobs/{id}/resume` | resume the same job |
| GET | `/api/jobs/{id}/download` | the finished JSON |
| GET | `/api/exports` | available job exports and loaded files, with index status |
| POST | `/api/exports/import` | stream a JSON file as the raw body (`X-Filename` names it) |
| GET | `/api/exports/{id}` | export summary, metadata, and author/channel facets |
| GET | `/api/exports/{id}/messages` | paged messages (`q`, `author`, `channel`, `from`, `to`, `order`, `offset`, `limit`) |
| GET | `/api/exports/{id}/messages/{messageId}` | one full message record |
| GET | `/api/exports/{id}/stats` | filter-aware totals, activity, clock, leaderboards, attachment types |
| GET | `/api/exports/{id}/attachments/{attachmentId}` | an archived attachment byte stream when the job downloaded files |
| GET | `/api/exports/{id}/download` | the original export JSON |
| POST | `/api/exports/{id}/reindex` | rebuild a failed or stale index |
| DELETE | `/api/exports/{id}` | remove a loaded export and its index (not job exports) |

## Notes

- The Explorer index is local-only. It is built from the export file and never
  sends message text to Discord or anywhere else. Loaded files can be removed
  from the Explorer; job outputs are only read.
- One export at a time is the intended use; the form disables Start while a
  job is active.
- Picker lists are read from Discord with the same token as the export and are
  never cached on disk. One author lists recent authors from channel history;
  if the token cannot read that channel, use the ID fields. Server icons and
  user avatars load from Discord's CDN (public URLs, no token attached).
- Whole-server jobs keep one work directory per channel, so a stop or a failed
  channel can be resumed without refetching the channels that finished.
- The UI has no analytics; the font is self-hosted. Picker icons and avatars
  are the only external images, loaded from Discord's CDN.
- The server token, when set, is shared by everyone who can reach the console;
  the per-session token in Settings takes over only when the server has none.
