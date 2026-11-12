# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 18 + TypeScript + Vite 6 for the UI, a Node + TypeScript server (`web/server.ts`) for the API. The server runs the exporter's own `Crawler` in-process, so jobs use the same range markers and assembly path as the CLI. Finished exports and loaded JSON files are indexed locally with Node's built-in SQLite/FTS5.

## Users

The owner and anyone running `discord-messages-exporter`: a person archiving Discord
messages. They open the console, sign in with the token, choose a scope (one
author, a whole channel, or a whole server), configure a crawl, watch it
progress, stop and resume it, and download the finished JSON.

## Product Purpose

A self-hosted web console for `discord-messages-exporter`. It turns the exporter into a usable local service: token identity, scope lookup, three export scopes (one author, whole channel, whole server), crawl configuration in Settings, live range/page progress, stop/resume, and a downloadable JSON.

## Positioning

The console runs the actual TypeScript exporter, not a mock: jobs share the CLI's `work/pages`, `work/done` markers, pacing, and strict assembly. It is a local tool with no external service, no analytics, and no attachment downloads.

## Operating Context

- Run: `npm install && npm --prefix web install && npm run web:start`, then open `http://127.0.0.1:8788`.
- Development: `npm run web:server` plus `npm --prefix web run dev` (Vite proxies `/api`).
- The server token comes from `DISCORD_TOKEN` when set. Otherwise the console prompts immediately and can save the token in the OS keychain (Secret Service on Linux); without one it stays in server memory.
- Used at a desk and on a phone; every chart is keyboard reachable and has a text summary.

## Capabilities and Constraints

- Dashboard with modules for Export, Explorer, and Insights; the export console is its own page, and an export's Messages and Insights are separate pages under the Explorer.
- Explorer lists finished job exports and loaded JSON files, indexes them locally, and offers full-text search, author/channel/date filters, paged messages, and a detail pane. Loaded files can be removed; job outputs are read-only.
- Insights page: filter-aware totals, activity over time, weekday-by-hour posting clock, top authors/channels, and attachment types.
- Greeting resolves the token's own Discord user via `/api/me` and shows a time-based greeting with their display name and a username/bot marker.
- Three export scopes: one author in a channel, every message in one channel, or every message in every text/announcement channel of a server. Whole-server exports merge channels into one chronological JSON and record each channel's status.
- Scope pickers read the token's servers (with icons), the selected server's text channels, and — in author scope — the people who recently posted in the chosen channel (with avatars). IDs remain available through **Enter IDs manually**, and a list failure falls back to IDs with the reason shown.
- The main form holds the scope switch, the IDs that scope needs, a Discord connection state, and a read-only settings summary. The date window, ranges, workers, pace, attachment metadata, total check, and the token live in a native Settings dialog.
- Non-secret settings persist in `localStorage`; the token never does. It is held server-side in memory or the OS keychain and is never logged, returned by the API, or serialized to the browser.
- Scope lookup via Discord (`/api/info`): author, channel, or server.
- Picker lists via Discord (`/api/browse`): servers, channels, and recent channel authors; server icons and user avatars come from Discord's CDN. A channel whose history the token cannot read falls back to the ID fields.
- Live job monitor: ranges done, pages, scanned/matched, rate, 429s, ETA, live range map, live throughput, stop/resume, download. Whole-server jobs show per-channel progress instead of a range map.
- Jobs keep `web/runs/<id>/work/`; a server job keeps one subdirectory per channel. The job list is in memory and resets on server restart, while work directories persist.
- Server binds `127.0.0.1` by default; exposing it requires an authenticated reverse proxy.
- English UI chrome.
- No Discord API calls from the browser, no attachment bytes, no tokens in URLs. Picker icons and avatars are public Discord CDN images.

## Brand Commitments

Visual world inherited from Personal-NUTC-Eportal: flat tinted-glass panes over a dark plum canvas, Albert Sans Light, 6 px tile shoulders, hairline edges, one pink primary (`#f0a8c8`) owning live/current/focus states, tabular numerals everywhere.

## Evidence on Hand

- The exporter's two sample exports remain on disk at `/home/ryno/discord-export/` for CLI verification; the console does not display them.
- No attachment binaries exist; CDN URLs are expired metadata only.

## Product Principles

1. The console runs the real exporter; every progress figure comes from a file or request the tool made.
2. The main screen is the job, not a wall of configuration. Advanced options and credentials belong in Settings.
3. The greeting is the token's identity, not a generic label.
4. The active job is the only flooded state; everything else stays glass.
5. Never expose the token to the browser or logs; persistence is opt-in through the OS keychain, and localhost remains the default.
6. No invented progress: unrecorded values say "not recorded" or "—".

## Accessibility & Inclusion

Reduced-motion support, keyboard-reachable range cells and chart summaries, text alternatives for every visualization, labeled form controls, a native modal Settings dialog with Escape and focus return, and contrast that holds on the glass ground.
