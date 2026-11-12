---
name: Discord Messages Exporter Console
description: "The Tinted Glass Console — a flat tinted-glass crawl desk for archiving one author, channel, or server from Discord."
colors:
  primary: "#f0a8c8"
  primary-soft: "rgba(240, 168, 200, .14)"
  primary-ring: "rgba(240, 168, 200, .42)"
  danger: "#f07178"
  danger-ink: "#f4a0a5"
  canvas: "#141018"
  foreground: "#f7f1f6"
  muted: "rgba(247, 241, 246, .72)"
  faint: "rgba(247, 241, 246, .62)"
  glass: "rgba(18, 15, 22, .46)"
  glass-edge: "rgba(255, 255, 255, .12)"
  glass-edge-hover: "rgba(255, 255, 255, .24)"
  hairline: "rgba(255, 255, 255, .08)"
  control-text: "#17121b"
  settings-panel: "rgba(14, 12, 16, .94)"
  picker-menu: "rgba(31, 26, 36, .98)"
  backdrop-rose: "rgba(240, 168, 200, .24)"
  backdrop-teal: "rgba(111, 195, 189, .16)"
  backdrop-plum: "rgba(81, 49, 74, .68)"
typography:
  display:
    fontFamily: '"Albert Sans", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", system-ui, sans-serif'
    fontSize: "clamp(2.75rem, 7.5vw, 6.5rem)"
    fontWeight: 300
    lineHeight: 0.92
    letterSpacing: "-0.04em"
  title:
    fontFamily: '"Albert Sans", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", system-ui, sans-serif'
    fontSize: "clamp(1.35rem, 2.4vw, 1.75rem)"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Albert Sans", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
    fontFeature: '"tnum" 1'
  label:
    fontFamily: '"Albert Sans", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", system-ui, sans-serif'
    fontSize: ".72rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: ".01em"
  stat:
    fontFamily: '"Albert Sans", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", system-ui, sans-serif'
    fontSize: ".95rem"
    fontWeight: 300
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: '"tnum" 1'
  mono:
    fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'
    fontSize: ".68rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  chip: "3px"
  inner: "4px"
  control: "5px"
  tile: "6px"
  overlay: "8px"
  pill: "999px"
spacing:
  container: "72rem"
  control: "42px"
  section: "clamp(2.25rem, 5vw, 3.5rem)"
  grid: "14px"
  field: "12px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.control-text}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-glass:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "42px"
  button-danger:
    backgroundColor: "color-mix(in srgb, #f07178 14%, transparent)"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-primary-blocked:
    backgroundColor: "rgba(255, 255, 255, .04)"
    textColor: "{colors.faint}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  link-button:
    textColor: "{colors.primary}"
    rounded: "2px"
    padding: "0"
  connection-callout:
    backgroundColor: "rgba(255, 255, 255, .03)"
    rounded: "{rounded.inner}"
    padding: "12px"
  connection-icon:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.tile}"
    size: "32px"
  mode-option:
    backgroundColor: "rgba(255, 255, 255, .05)"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "44px"
  mode-option-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "44px"
  portal-button-soft:
    backgroundColor: "rgba(255, 255, 255, .05)"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "34px"
  picker-trigger:
    backgroundColor: "rgba(255, 255, 255, .075)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
    height: "44px"
  picker-option:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.inner}"
    padding: "9px 12px"
    height: "42px"
  channel-progress-row:
    backgroundColor: "rgba(255, 255, 255, .03)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.inner}"
    padding: "7px 10px"
  channel-progress-dot:
    backgroundColor: "{colors.faint}"
    rounded: "{rounded.pill}"
    size: "6px"
  picker-menu:
    backgroundColor: "{colors.picker-menu}"
    rounded: "{rounded.tile}"
    padding: "6px"
  member-chip:
    backgroundColor: "rgba(255, 255, 255, .04)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "42px"
  avatar:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.inner}"
    size: "20px"
  avatar-round:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    size: "20px"
  button-icon:
    backgroundColor: "rgba(255, 255, 255, .07)"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    size: "40px"
  input-field:
    backgroundColor: "rgba(0, 0, 0, .22)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "42px"
  input-dialog:
    backgroundColor: "rgba(255, 255, 255, .07)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "46px"
  settings-panel:
    backgroundColor: "{colors.settings-panel}"
    rounded: "{rounded.overlay}"
    padding: "16px"
  settings-check-card:
    backgroundColor: "rgba(255, 255, 255, .045)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "12px"
  status-chip:
    backgroundColor: "rgba(255, 255, 255, .04)"
    textColor: "{colors.muted}"
    rounded: "{rounded.chip}"
    padding: ".15rem .45rem"
  status-chip-live:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.chip}"
    padding: ".15rem .45rem"
  range-cell:
    backgroundColor: "rgba(255, 255, 255, .07)"
    rounded: "{rounded.chip}"
    size: "24px"
  progress-track:
    backgroundColor: "rgba(255, 255, 255, .08)"
    rounded: "{rounded.pill}"
    height: "8px"
    width: "100%"
  progress-fill:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    height: "100%"
  panel:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.tile}"
    padding: "14px 16px 16px"
  job-row-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.inner}"
    padding: "8px 10px"
---

# Design System: Discord Messages Exporter Console

## Overview

**Creative North Star: "The Tinted Glass Console"**

The NUTC portal's tinted-glass wall, turned into a working archive desk. A dashboard is the way in: the greeting names the token's own Discord user or bot, then three module cards lead to Export, Explorer, and the latest export's Insights. Export is a compact glass form on the left and the live job monitor on the right. Explorer is a local library of finished job exports and loaded JSON files, each with a message browser and a separate Insights page. The export form leads with a connection block — a bordered callout when a token is missing, a bare status line once connected — then a three-way scope switch and its ePortal listbox pickers (or typed IDs), a three-row export-settings summary, and the gated actions. Settings does not leave the room — it opens the portal's own settings menu: a transparent native dialog, a dimmed and blurred wall, and one dark rounded panel with an icon-tile header, icon-labeled sections, and a footer with a glass Cancel beside the single pink commit.

The voice is precise, quiet, and data-first. The largest thing on the page is the lowercase greeting; the brightest thing is the live dot; the one warm fill is the primary action. There is no ornament for its own sake. Color is spent sparingly — pink for what is live, active, selected, focused, or primary, coral for failure and destruction — and everything else stays glass over the plum field. The working crawl is the thesis; the token's identity in the greeting is the sign-in.

Density is compact and desk-like. Controls are 42px on the page and 46px in the dialog, labels .68–.78rem, figures always tabular. A single 72rem column holds the top bar, the greeting, the console, and the footer, and it stacks cleanly to a phone. In-flow depth is material, never cast: a 20px backdrop blur and one hairline do the work, with halos reserved for focus rings and status dots. The Settings panel and the floating picker menus are the deliberate exceptions — the ePortal's own modal and popover material, lifted off the wall by soft cast shadows. Motion is quiet and one-directional: the page rises once on load, the dialog fades and settles, live figures interpolate, and the only loops are 1.8s pulses: the live dot, the checking token dot, and a running channel's dot.

**Key Characteristics:**
- Dashboard with three module cards, recent exports, and a persistent Dashboard / Export / Explorer nav.
- Export: a two-column crawl console (form left, job monitor right), with Messages and Insights as separate pages under an export.
- Explorer: a source-badged library with a drag-and-drop load zone; each export gets a searchable message browser and a chart page.
- The form leads with a connection block that collapses from a bordered callout to a status line; export settings collapse to a three-row definition list.
- Three export scopes — one author, whole channel, whole server — switch the field set, lookup copy, requirement line, stats, and live visualization.
- The form is list-first when a token is ready: server and channel listboxes and a recent-author picker; typed IDs are the escape hatch and the automatic fallback when a browse call fails.
- Flat tinted glass over a plum field lit by a rose glow (top-left) and a teal glow (top-right).
- One pink accent for live, active, selected, focused, and primary-action states; coral only for failure and destruction.
- Albert Sans Light throughout; every number, duration, and date is tabular.
- Radius ladder 3 / 4 / 5 / 6 / 8 / 999px; 1px hairline edges; no shadows on in-flow glass.
- The Settings dialog is ePortal-faithful: transparent `<dialog>`, one dark 8px panel with a cast shadow, icon-tile header, icon-labeled sections, 46px glass inputs, bordered checkbox cards, a glass Cancel and one pink Save.
- Motion is entrance and state only — a 420/460ms page rise, a 180/220ms dialog settle, 450ms progress and 320ms throughput interpolation — and is disabled entirely under reduced motion.
- The greeting is the token's identity — `hello, <global_name || username>` — falling back to `hello, please log in` when no token is verified.

## Colors

A dark plum ground with a near-white foreground, one rose accent, and a coral error; the material is translucent, so most surfaces are glass rather than a solid fill.

### Primary
- **Theme Primary / Rose Pink** (`#f0a8c8`): the one accent that can claim a state. It fills the live dot and the running/queued/resolving/stopping status chip, the progress fill, the primary button, focus rings, selection, the selected job row's border and wash, the ready and checking token dots, running and done channel dots, the selected scope button's wash and ring, the selected listbox option, the Settings icon tile and section icons, the checkbox accent, the Clear link, and the greeting name. Range cells and throughput bars are tinted with it for the live job. Its soft (`rgba(240, 168, 200, .14)`) and ring (`rgba(240, 168, 200, .42)`) derivatives build tinted fills and halos.
- **Ink on Pink** (`#17121b`): the text color on every pink fill; never white.

### Semantic
- **Alert Coral** (`#f07178`): the error and destructive family. Failed status, the Stop button's tinted fill and border, the rejected or offline token dot, failed channel dots, and the connection error line.
- **Coral Ink** (`#f4a0a5`): error text on glass — inline form errors, the Stop label, failed and partial status chips, the unverified-token greeting line and the connection error line, the Settings identity error, and the server error line.

### Neutral
- **Deep Plum Canvas** (`#141018`): the page ground and `theme-color`. The fixed backdrop field layers a rose radial (`rgba(240, 168, 200, .24)`) top-left, a teal radial (`rgba(111, 195, 189, .16)`) top-right, a plum radial (`rgba(81, 49, 74, .68)`) bottom, and a dark vertical shade over it.
- **Rose White** (`#f7f1f6`): headings, values, and body text.
- **Muted Ink** (`rgba(247, 241, 246, .72)`): labels, secondary text, status text at rest, hints, connection lines, and export-settings rows.
- **Faint Ink** (`rgba(247, 241, 246, .62)`): section meta, job ids, notes, placeholders, footer meta. Raised from the portal's .38 so text clears 4.5:1 on the canvas.
- **Glass** (`rgba(18, 15, 22, .46)`): the pane fill for the form, panels, and glass buttons.
- **Glass Edge** (`rgba(255, 255, 255, .12)`): the 1px border on glass and controls; hover lifts it to `rgba(255, 255, 255, .24)`.
- **Hairline** (`rgba(255, 255, 255, .08)`): internal dividers — the export-settings rule, stat rows, panel feet, job-list rows, channel-progress row borders, the footer top.
- **Dialog Panel** (`rgba(14, 12, 16, .94)`): the Settings panel fill, darker and nearly opaque so the form reads clearly over the dimmed page. Dialog section dividers step up to `rgba(255, 255, 255, .10)`.
- **Picker Menu** (`rgba(31, 26, 36, .98)`): the floating server/channel and recent-author menus. Slightly warmer and more opaque than the dialog panel so option rows read over any field below.

### Named Rules
**The One Live Accent Rule.** Pink is the only accent and the only color that can claim a live, active, selected, focused, or primary-action state. Coral is never a state accent — it belongs to failure and destruction.
**The Live Only Pink Rule.** Pink marks what is live, active, selected, or focused, plus primary actions and the app identity. A surface that merely exists stays glass; a stopped or completed job is neutral glass with muted text.

## Typography

**Display Font:** Albert Sans (with Noto Sans TC, PingFang TC, Microsoft JhengHei, Noto Sans CJK TC, system-ui)
**Body Font:** Albert Sans
**Label/Mono Font:** system monospace stack (`ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono`)

**Character:** one light, slightly geometric humanist sans carries the entire console; hierarchy comes from size and weight (300 for display and section titles, 400 for body and panel titles, 500 for labels, 600 for buttons and dialog headings), never from a second family. Mono appears only on the job id.

### Hierarchy
- **Display** (300, `clamp(2.75rem, 7.5vw, 6.5rem)`, line-height .92, letter-spacing -.04em, lowercase): the greeting, the only display moment and the first thing under the top bar. The name span carries pink at 400 and keeps its original case, so a global name like "Ryno" stays "Ryno" inside "hello, ".
- **Title** (300, `clamp(1.35rem, 2.4vw, 1.75rem)`, line-height 1.15, -.025em): the "Export console" section heading. Panel titles and the form title step down to 1.05rem at 400; the job identity line is 1rem at 400; the Settings title is 1.125rem at 600.
- **Body** (400, 1rem, line-height 1.65): paragraphs and notes; the greeting sub copy is 1rem/1.75 and maxes at 62ch. Notes step down to .7–.78rem at line-height 1.5–1.7.
- **Label** (500, .72rem, line-height 1.4, letter-spacing .01em, sentence case): field labels, connection and export-settings rows, status text, lookup keys. Chips and job stats step down to .68rem; picker triggers are .8rem/600, option rows .8rem/500, soft and scope buttons .75rem/600; the section meta is .75rem at 400 in faint ink. In the Settings dialog labels are .875rem at 600 and hints .75rem at 400.
- **Stat** (300, .95rem, line-height 1.2, -.01em, tabular): the job-monitor values — pages, matched (messages in server scope), scanned, channels in server scope, 429s, elapsed, and output; six in author/channel scope, seven in server scope.
- **Mono** (400, .68rem, line-height 1.4): the job id and date line only.

### Named Rules
**The Tabular Time Rule.** Every number, duration, date, and byte count is tabular. The body sets `font-variant-numeric: tabular-nums` and `"tnum" 1` globally, so live figures never shift width as they update; proportional figures are never used for data.

## Layout

A 96rem shell with a 224px sidebar and a flexible content column. The sidebar holds the 40px identity tile and Archive Console lockup, a vertical Dashboard / Export / Explorer nav, and a small local/ MIT footer pinned to the bottom. The active module takes a pink-washed row with a pink ring. Below 900px the sidebar becomes a horizontal strip above the content. The page no longer carries a global footer.

**The dashboard.** A large lowercase greeting (top margin `clamp(2.5rem, 6vw, 4.5rem)`, bottom `clamp(1.75rem, 4vw, 3rem)`, sub copy 18px below, meta 10px below), then three module cards. Each card is flat tinted glass with a top-right arrow, an icon tile, a numbered kicker, a 300-weight title, a short copy line, and a meta line pinned to the bottom; hover lifts 2px and warms the edge. A recent-exports panel follows: one row per export with source badge, name, scope, size, message count, date, and Messages / Insights buttons.

**Export.** The export console section sits under its own heading: a 300-weight title and a .75rem faint meta line. Below it, a two-column grid of `minmax(0, 1.05fr) minmax(0, 1.15fr)` with a 14px gap — glass form left, job monitor right — collapsing to one column at 980px.

**Explorer.** The heading carries Refresh and a pink Load export; a dashed drop zone sits below it. The library is a stack of glass rows with a Job/Loaded badge, ready/indexing/failed status, scope/size/count/date, an indexing progress track, and Messages, Insights, JSON, Retry, and Remove actions.

**Export pages.** A back link, source badge, large export name, scope line, Download JSON, and a Messages / Insights segmented nav. Messages is a filter bar (search, author, channel, date range, order) over a paged message list and a sticky detail pane; the detail pane carries the full text, attachments, reactions, reply context, embeds, and a Discord jump. Insights is the same filter bar plus a Whole export / Current filter scope switch, a nine-tile stat strip, and a two-column chart grid: full-width activity, posting clock, top authors, channels, and attachment types.

**The form.** 18px padding. A head holds the title and one line of sub copy. The connection block comes first: a bordered callout when a token is missing, otherwise a bare status line. A three-way scope switch follows — the ePortal scheme grid: three separate 44px bordered glass buttons with a 6px gap; the selected option takes the pink wash, pink ring border, and foreground text rather than a pink fill, hover lifts 1px over white .09, and focus draws the 4px pink ring. The sub copy and lookup label follow the scope. The scope is list-first when a token is usable: an ePortal listbox for Server from the token's guilds; author scope adds a Channel listbox and a recent-author combobox; channel scope adds the Channel listbox; server scope is the Server listbox alone. With no usable token the manual fields show instead. Server and Channel sit two columns (one at 560px), and the author picker spans both. Each listbox is a 44px bordered glass trigger with a 16px chevron over an animated dark menu (7px below, 6px padding, 6px radius, `rgba(31, 26, 36, .98)`, 1px white .17 border, `0 18px 44px` cast shadow) that flips above when the viewport below is tight. Server options and the selected server carry 20px rounded-square guild icons with an initial fallback; the author menu carries 24px round avatars (22px on the selected chip). Choosing a server clears the channel and author selections, and choosing a channel clears the author; a stored ID that is missing from the fetched list stays as an extra option until it is re-picked. The author list is the channel's recent authors from about its last 300 messages, deduped and filtered locally by name, username, or ID; a chosen author becomes a bordered chip with a Clear link, and a stored author ID shows the same chip with the ID until it is re-picked. A .68rem hint under a list reports loading, an empty list, or no local match. **Enter IDs manually** at the right is a soft button that swaps the whole form back to text fields; **Choose from lists** swaps it back after clearing the failed query and errors. A failed list call flips it automatically and shows the reason with **Try lists again**. The manual fields keep the previous layout: one author shows Channel ID and Author ID, whole channel shows Channel ID alone, whole server shows Server ID alone; each visible ID is marked required, and changing the manual server ID clears the channel and author. A hairline "Export settings" block follows (14px above, 12px below the rule): a head with a .68rem muted label and a 34px soft Edit button, then a three-row definition list (64px label column, 10px gap) for Window, Crawl, and Output. The actions row sits 14px below (8px gap), with the muted requirement line under it. Notes and errors follow. A lookup result opens under a hairline as a two-column key/value grid (8px × 14px) that collapses at 560px: author lookup adds the author, message count, first and last; channel lookup shows the guild and channel; server lookup shows the guild, channel count, and the first channel names. At 480px the missing-token callout stretches and Add token goes full width; the actions stack and both buttons go full width.

**The monitor column.** The job monitor and the recent-jobs list stack with a 12px gap. The monitor itself is flat content on the page — no pane — and its inner blocks are separated by 12px and hairlines. The empty state is a dashed glass tile at least 180px tall. The job list holds up to eight rows with a 4px gap. A whole-server job replaces the range map with a scrollable per-channel list (6px dot, channel name, ranges done/total, status); the dot is pink for running/done, coral for failed, faint for pending/empty.

**The Settings dialog.** A native `<dialog>` sized `calc(100% - 1.5rem)` wide, max 36rem, max-height 90vh, with its own vertical scroll; the dialog element itself is transparent and the form is the panel. The panel is a 16px-padded flex column (20px from 640px) with a 16px gap. Sections stack in a single column: token, date window, crawl, output. Date window uses a two-column grid; crawl uses three columns; both collapse to one column at 560px. The footer is right-aligned above a `rgba(255,255,255,.10)` rule: a glass Cancel beside the one pink Save settings. On a phone the panel runs nearly edge to edge and scrolls within the viewport while the page behind is locked.

Rhythm is 14px between major blocks, 12px inside the form and monitor, `clamp(2.25rem, 5vw, 3.5rem)` between page sections. The footer closes the page with a hairline top and 24px/40px padding.

## Elevation & Depth

In-flow surfaces are flat by construction: the form, panels, and glass buttons all declare `box-shadow: none`. Depth is material, not cast — `backdrop-filter: blur(20px) saturate(160%)` over the fixed gradient field, a 1px glass edge, and hairline dividers. Hover moves a border, a fill, or 1px; it never adds a shadow.

The Settings dialog and the floating picker menus are the surfaces that leave the wall. The dialog follows the ePortal's own settings menu: a `rgba(0,0,0,.65)` backdrop with `blur(4px)`, and a single dark panel at `rgba(14, 12, 16, .94)` with `blur(22px) saturate(170%)` and a soft cast shadow. The listbox and recent-author menus are the ePortal's popover material: `rgba(31, 26, 36, .98)`, `blur(18px)`, a 1px white .17 border, 6px radius, and `0 18px 44px rgba(0,0,0,.42)`. Those shadows are the portal's modal and popover material, not a pane treatment to spread elsewhere. The pink Save carries a 1px ambient shadow; the glass Cancel stays flat.

### Shadow Vocabulary
- **Pane** (`none`): every in-flow glass surface, at rest and on hover.
- **Focus halo** (`0 0 0 4px rgba(240, 168, 200, .42)`): buttons, links, rows, range cells, and dialog fields on keyboard focus, layered under the 2px pink outline where one is drawn.
- **Live halo** (`0 0 0 3px rgba(240, 168, 200, .14)`): the live dot and the running channel dot.
- **Token halo** (`0 0 0 2px rgba(240, 168, 200, .14)`): the ready token dot in the connection block.
- **Dialog lift** (`0 24px 80px rgba(0, 0, 0, .46)`): the Settings panel only.
- **Dialog button** (`0 1px 2px rgba(0, 0, 0, .05)`): the Settings footer's pink Save only.
- **Picker lift** (`0 18px 44px rgba(0, 0, 0, .42)`): the floating server/channel and recent-author menus only.
- **Token error halo** (`0 0 0 2px color-mix(in srgb, #f07178 18%, transparent)`): the rejected or offline token dot.

### Named Rules
**The No Pane Shadow Rule.** In-flow glass is matte: no drop shadow, no inset highlight, no gloss or gradient sheen. Only the native Settings panel and the floating picker menus cast a shadow, because they are the portal's modal and popover material.
**The Flat By Default Rule.** In-flow surfaces are flat at rest and stay flat in every state. Halos belong to focus rings and status dots; hover moves a border, a fill, or 1px — never a shadow.

## Shapes

Corners step by nesting depth: chips and range cells 3px; nested elements (job messages, job rows, chart tables, channel rows, listbox options) 4px; controls (buttons, inputs, the icon button, checkbox cards, scope buttons, soft buttons, picker triggers, member chip) 5px; the listbox menu, form, range and throughput panels, icon tile, and empty state 6px; the Settings panel 8px; the progress track 999px. Every surface carries exactly one 1px border — glass edge on panes and controls, hairline on internal rules, `rgba(255,255,255,.10)` on dialog section rules — and nothing carries a second border or an offset outline.

Range cells are squares (`aspect-ratio: 1`, min 24px) so the map reads as a tiling, not a list; channel-progress dots are 6px circles. Guild icons are 20px rounded squares (5px); user avatars are 20px in the trigger, 24px in menu rows, and 22px on the selected chip, all circles with a pink initial fallback. A dashed 1px glass edge marks absence: the empty job monitor. The 40px top-bar icon tile and the 44px Settings icon tile share the same recipe — soft pink fill, pink ring border, 6px radius, 1.5-stroke pink icon. The connection callout is a 4px flat block; its 32px KeyRound tile joins the icon-tile recipe at 6px.

## Components

### Buttons
- **Shape:** 42px tall, 5px radius, 1px border, 16px stroke icon with a 7–8px gap, .8rem/600 label.
- **Primary:** pink fill with `#17121b` ink, `padding: 0 16px`. Hover lightens the fill and border (82% primary, 18% white) and lifts 1px (150ms); disabled drops to .55 opacity. Start export, Add token, Resume, and the Settings footer's single Save at 44px and .875rem.
- **Blocked Start:** glass edge, white .04 fill, faint ink, opacity 1, no shadow. It marks a Start unavailable for setup reasons; busy or submitting keeps the normal pink at .55.
- **Glass:** glass fill, glass-edge border, foreground text, `0 14px`, .8rem/500. Hover brightens the edge and adds a white .06 fill; used for Look up author, Download JSON, and the Settings footer's Cancel at 44px and .875rem. Disabled it keeps its glass shape at .5 opacity.
- **Soft:** 34px tall, 5px radius, 1px glass edge, white .05 fill, muted .75rem/600 label. Used for Change, Recheck, Details, Enter IDs manually, Choose from lists, Try lists again, Edit, and Forget token; hover lifts 1px and raises the fill to white .09 with foreground text, and focus draws the 4px pink ring with no outline. Disabled drops to .5.
- **Link:** pink underlined .75rem text, used for Clear; inside the error or offline connection it turns coral. Focus draws the 2px pink outline at offset 2.
- **Danger:** coral at 14% fill, 40% border, `#f4a0a5` text; hover deepens to 22%. Reserved for Stop.
- **Icon:** the dialog close is a 40px square, 5px radius, white .07 fill on a white .12 border, muted ink; hover raises the fill to .10 and the ink to foreground.
- **Focus:** 2px pink outline, offset 2, plus the 4px ring halo. The icon button uses the halo alone.

### Fields
- **Console field:** 42px tall, 5px radius, near-black `.22` fill, glass-edge border, .85rem tabular text, `0 10px` padding; label .72rem/500 muted with a 5px gap above. The manual ID inputs use this recipe; the author search and listbox triggers reuse its border and focus but step to 44px, white .075 fill, and 600 weight. Each visible ID or picker carries `aria-required="true"` — channel and author in author scope, channel alone in channel scope, server alone in server scope. Hover brightens the edge; focus draws the 2px pink outline at offset 2; disabled drops to .55.
- **Dialog field:** 46px tall, 5px radius, white `.07` fill on a white `.12` border, .875rem/600 foreground label with an 8px gap. Hover moves to `.09` fill and `.20` border; focus removes the outline, turns the border pink, and draws the 4px ring. Date and number inputs keep `color-scheme: dark`.
- **Checkbox cards:** the dialog's checkboxes are 12px-padded bordered cards (5px radius, white .045 fill) with the label and a small explanation on the left and a 20px pink-accented checkbox on the right; `:focus-within` turns the border pink and adds the ring.

### Listbox Picker
Server and Channel use the ePortal listbox, not a native select. The trigger is a 44px bordered glass button: 1px white .16 border, white .075 fill, `blur(14px)`, 5px radius, 9px 13px padding, .8rem/600 foreground label, and a 16px chevron that rotates 180° when open. The menu is absolute, 7px below the trigger: 6px padding, 1px white .17 border, 6px radius, `rgba(31,26,36,.98)`, `blur(18px)`, `0 18px 44px rgba(0,0,0,.42)`, max-height min(280px, 50vh), scrollable. It animates from opacity 0 and `translateY(-8px) scale(.985)` to rest over 200–220ms. `data-placement="top"` flips it above with a bottom transform origin when less than 260px remains below and more space is above. Options are 42px rows with 9px 12px padding, 4px radius, .8rem/500; hover and focus take white .10; the selected row takes the pink wash, pink ring border, pink text, and 600 weight. An empty menu reads "No options". Keyboard: arrows/Home/End open and move, Enter picks, Escape closes and returns focus to the trigger, Tab closes. Server options and the selected server show 20px rounded-square guild icons at `cdn.discordapp.com/icons/{id}/{hash}.{png|gif}?size=64`, with a pink initial fallback. Server lists come from `POST /api/browse` kind `guilds` sorted by name; Channel lists come from kind `channels`, text and announcement channels sorted by position. The endpoint accepts optional `server`, `query`, `token`, and `is_bot`; the server token is used when no session token is supplied. Placeholders read "Choose a server…" / "Choose a channel…" and "Choose a server first…"; loading reads "Loading servers…" / "Loading channels…". A stored ID missing from the list is kept as an extra option; empty lists read "No servers found. Use IDs instead." / "No text channels found. Use IDs instead." Hover raises the trigger fill to white .12 and its border to white .22; disabled drops to .45. Choosing a server, or changing the manual server ID, clears channel and author; choosing a channel clears the author.

### Recent Authors
Author scope's third control spans both columns (`.picker-wide`). It lists recent authors from the selected channel rather than searching guild members, so user tokens and bots with channel history access both work. The input is a 44px glass search field ("Choose a channel first…" until a channel is chosen, then "Search recent authors…") with combobox semantics; focusing or typing opens the list. The list comes from `POST /api/browse` kind `authors`, which reads about the channel's last 300 messages in three 100-message batches, dedupes by user, and returns up to 100 authors with name, username, bot marker, and avatar. Filtering is local by name, username, or ID. Results open in the same dark listbox menu as the server/channel pickers (7px gap, 6px padding, 6px radius, `rgba(31,26,36,.98)`, white .17 border, `0 18px 44px` shadow), flipping above when less than 280px remains below. Rows are 42px with a 24px round avatar (fallback initial), name, @username, and bot marker, hover white .10; Enter picks the first match, Escape closes. A chosen author becomes a 42px bordered chip (5px radius, white .04 fill) with a 22px round avatar, name, @username, bot marker, and a right-aligned Clear link; a stored author ID shows the same bordered chip as an "Author ID <id>" row without an avatar, until re-picked. Avatars use `cdn.discordapp.com/avatars/...` or `/embed/avatars/{index}.png`. Hints read "Loading users…", "No recent authors found here. Use IDs instead.", or "No users match." A failed list call flips to manual, shows the reason, and offers Try lists again.

### Connection Block (signature)
The form's first block, and its only token surface. Missing token: a flat callout — 4px radius, 1px glass edge, white .03 fill, 12px padding — with a 32px pink KeyRound tile, a .875rem/500 foreground "Discord token needed", a .75rem muted memory-only line, and one pink Add token button. Connected states collapse to a bare line: no border, no fill, no padding, .72rem muted, 6px gaps. "Checking the server…" while the status poll is unresolved; a coral "Server unreachable." when the server is offline; a pulsing pink dot with "Checking token…" or "Checking server token…"; a pink ready dot with "Token ready" and a soft Change button (session); "Server token · bot/user" with no action (server); or a coral error dot with "Server token rejected — check DISCORD_TOKEN." and soft Recheck and Details buttons. The dot is 6px; checking pulses at 1.8s and stops under reduced motion; error takes the coral fill and coral halo; the dot cross-fades over 200ms. The unknown and offline states come from the status poll's loading and serverOnline flags. Add, Change, and Details open Settings at the token section; Recheck re-runs `/api/me`. The block carries `tabindex="-1"` so it can receive the fallback focus. It reports readiness and recovery only — identity belongs to the greeting, and a failed session save stays in the dialog rather than appearing here.

### Export Settings Summary
A hairline block, not a card: a 12px top rule, a head with a .68rem/500 muted "Export settings" label and a 34px soft Edit button, and a three-row definition list (64px label column, 10px gap, 4px row gap). Window reads "Full history", "Since <date>", "Until <date>", or "<date> → <date>"; Crawl reads "<n> ranges · <n> workers · <rate> req/s" with singular forms ("<n> ranges per channel" in server scope); Output joins "Attachment metadata" or "No attachments" to "Total check" or "No total check" with a middle dot; total check is author scope only, so channel and server read "No total check". Labels are .68rem muted; values .78rem foreground tabular. Edit opens Settings at the Date window section and focuses Since. No sentence, no chips, no token row.

### Actions and Requirement
The actions row pairs the glass lookup button with the primary Start export; the label follows the scope — Look up author, Look up channel, or Look up server. Look up is disabled at .5 glass until the token is usable and the scope's IDs are present; Start is disabled until the same. When setup is blocked for a connection reason, Start takes the blocked glass treatment at full opacity; while a job is busy or a submit is in flight, Start keeps the pink at .55. A muted .7rem requirement line under the row names what is missing and follows the input mode: list-first reads "Choose a channel and author to continue.", "Choose a channel to continue.", "Choose an author to continue.", or "Choose a server to continue."; manual reads "Add the channel ID to continue.", "Add the author ID to continue.", "Add a channel ID and author ID to continue.", or "Add the server ID to continue." It stays visible while a job runs and is suppressed only when the connection block owns the reason. Both buttons point `aria-describedby` at the reason that applies.

### Settings Dialog (signature)
The ePortal's settings menu rebuilt on a native `<dialog>` opened with `showModal()`. The element is transparent and scrolls (`max-height: 90vh`); the form is the one dark panel: `rgba(14, 12, 16, .94)`, 8px radius, 1px white .12 border, `0 24px 80px rgba(0,0,0,.46)`, `blur(22px) saturate(170%)`. The header pairs a 44px pink icon tile (Settings2, 20px) with a 1.125rem/600 title and .75rem/500 sub copy, and a 40px close button. Four icon-labeled sections follow — Discord token (KeyRound), Date window (CalendarDays), Crawl (Gauge), Output (FileOutput) — each headed by a 16px pink icon and a .875rem/600 title, separated by `rgba(255,255,255,.10)` rules (the first section has no rule). Hints are .75rem muted. The footer pairs a glass Cancel with the single pink Save settings, right-aligned; only Save carries the 1px ambient shadow. The dialog fades in over 180ms and settles from `translateY(10px) scale(.985)` over 220ms with `cubic-bezier(.22, 1, .36, 1)`; the backdrop fades over 180ms. `@starting-style` plus `display`/`overlay` `allow-discrete` make the open and the close discrete rather than stuck frames. Escape and the close button cancel; focus returns to the opener natively; the page behind is scroll-locked; `aria-labelledby` points at the title. Callers can open it at a named section: Add, Change, and Details scroll to the token section and focus the token input (or the section heading when the server token hides the input); Edit scrolls to Date window and focuses Since. The dialog reuses the existing heading ids, so no duplicate ids are introduced. After a token save closes the dialog, focus returns into the form — Add token when the token was cleared, else the first empty visible ID (server, then channel, then author), else Start, else the connection block.

**Token section.** With a server token configured, the input is replaced by a hint that the server's `DISCORD_TOKEN` is in use, its bot/user type, and that the token itself is never sent to the browser. Otherwise the section shows a password input, a bordered "Bot token" checkbox card, the memory-only hint, the identity line (verified username and bot/user marker, "Checking the token…", "Token not verified yet.", "No token configured.", or a coral rejection), and a soft "Forget token" button when a token is present. Saving a changed token verifies it through `/api/me` before the dialog closes; a rejection keeps the dialog open with the coral error and does not save, and never produces a row in the form. A rejected server token shows the server's full message in coral, naming `DISCORD_TOKEN` and `DISCORD_TOKEN_IS_BOT`. A configured server token takes precedence over any session token: the app clears the session token when the status poll reports one, the form omits it from lookup and start requests, and the dialog shows the server-token hint instead of an input.

### Greeting (signature)
The identity surface, and the first thing under the top bar; it rises 420ms on load. `hello, ` in foreground 300 with the name in pink 400; the name is the token's `global_name`, else its `username`, else `there`. With no verified identity the title reads `hello, please log in`, in the same pink as the name. One sentence of sub copy follows, then a .78rem faint meta line with `aria-live="polite"`: "Signed in as @username · user|bot" when verified; "Checking the token…" while resolving; a coral "The token could not be verified." or "The server token could not be verified." on rejection; "Using the server token" before verification; "Checking the server…" while the status poll is unresolved; a coral "Server unreachable." when the server is offline; and "No token configured." when there is none. The order puts a configured server token ahead of the status states, so it never flashes the no-token line. There are no "open Settings" instructions — the connection block carries the action. It is the only place identity appears; the connection block reports readiness instead.

### Job Monitor and Progress (signature)
The live job is the only flooded state, and it sits directly on the page rather than in a pane. Header identity follows the scope: `@username · channel` in author scope, `#channel` in channel scope, and `guild · N channels` in server scope, with a mono job id and date and a status chip whose live dot pulses at 1.8s (opacity .55 → 1). Progress: a percentage and `done/total ranges` line (plus `done/total channels` in server scope), an 8px pill track (`rgba(255,255,255,.08)`, hairline border) filled in pink with a 450ms `cubic-bezier(.22, 1, .36, 1)` width transition, then pages · matched (or messages in server scope) · p/s and ETA. Stats sit in a 3-column grid (2 at 560px) between hairlines, values .95rem/300 tabular: pages, matched/messages, scanned, 429s, elapsed, and output, plus a channels stat in server scope. Actions: Stop (danger) while active, Resume (primary) when stopped/partial/failed and a token exists, Download JSON (glass) when an output exists (done or partial); the download filename follows the scope. Without a token, the Resume button is replaced by the muted note "Add a token in the export form to resume this job." Message blocks are hairline-bordered white .03 fills; failed errors tint coral 8% and stopped/partial messages stay neutral; a done or partial assembly reports messages, channel count in server scope, attachment records, size, and exit 0 or partial. A resolving job with no range markers yet shows a scope-aware note instead of an empty map. In server scope a scrollable per-channel list (280px max height) replaces the range map: each row is a 4px hairline block with a 6px dot, the channel name, and `ranges done/total · status`; running dots pulse pink with the 3px halo, done dots are pink, failed dots coral, and pending/empty dots faint. The whole monitor fades in over 220ms.

### Status Chips
3px radius, `.15rem .45rem`, .68rem/500, always lowercase. Running, queued, resolving, and stopping take a pink 32% border, the pink wash, and pink text; done and stopped are neutral glass with muted text; failed and partial take a coral 32% border with coral ink at 14% and 10% fills. The neutral chip is the base for panel headers and the recent-jobs rows. Color, background, and border cross-fade over 150ms as a job changes state.

### Recent Jobs
Up to eight rows under the monitor, 4px apart. Each row is a transparent full-width button with a hairline bottom, a mode-aware label (@username, #channel, or guild name) and status on the first line, and ranges, pages, and date — plus channels in server scope — in .7rem muted tabular meta. Hover adds a white .04 fill; the selected row takes the pink border and pink wash; focus gets the 2px outline and 4px ring. An active job's row carries the live dot beside its label. No rows means no list at all.

### Range Map (signature)
The crawl's mechanism for author and channel scopes, drawn as a tiling inside a 6px glass panel; server scope replaces it with the channel list. One button per contiguous ID range in an `auto-fill, minmax(24px, 1fr)` grid with a 4px gap; each square is tinted `rgba(runTint, .1 + .55 × share)` so busier ranges read darker — pink for the live job. The grid is one tab stop: arrow keys move between cells, Home/End jump to the edges, and focus drives the detail strip. Cells fade in over 220ms on mount, their background interpolates over 220ms as shares change, and hover lifts 1px over 150ms. Hover and keyboard focus draw a 1px foreground outline (120ms); the selected cell draws a 2px pink outline at offset 2. A hairline-separated detail strip reports Range, ID window (snowflake dates), Pages, and Matched in four columns (two at 640px) and is `aria-live`. A footer legend steps six swatches from .1 to .65 between "fewer pages" and "more pages", beside the "No gaps, no overlaps" note. Cells are `aria-pressed` buttons; the panel also carries an sr-only summary.

### Throughput Chart
Pages per minute as thin bars (2px gap, 2px top radius) tinted 42% of the job's tint on a 180px field with a hairline baseline. A dashed 35% white line marks the configured pace (`rate × 60`), labelled with the actual req/s and pages/min; when the pace is not recorded, the line is omitted. Average pages/min, peak pages/min, and rate-limit hits sit above the bars ("not recorded" when absent), and a "Minute-by-minute" details table carries the text alternative. The foot records elapsed, pages in the workdir, workers, and pace. Bars interpolate height over 320ms and the pace line moves with the same 320ms `cubic-bezier(.22, 1, .36, 1)`; hover brightens 25% and lifts 1px over 140ms. Nothing else is interactive.

### Panels
- **Corner Style:** 6px.
- **Background:** neutral glass with a 20px blur.
- **Border:** 1px glass edge.
- **Internal Padding:** head 14px 16px 0, body 14px 16px 16px, foot 10px 16px 12px above a hairline.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Usage:** the range map and throughput chart are the only panels on the shipped page; server scope shows the throughput panel without the range map. The console form uses the same material at 18px padding. Do not nest a panel inside a panel.

### Empty State
The no-job monitor is a dashed 1px glass-edge tile, 6px radius, at least 180px tall, its copy vertically centered: a .9rem/500 foreground title ("No export running") over a .8rem muted line — "Start one above to watch progress and throughput here." It fades in over 220ms. It is absence made visible, not a card with content.

### Footer
A hairline top, 24px top and 40px bottom padding, a .75rem muted line about the local server and memory-only token, and a .68rem faint `discord-messages-exporter · MIT` meta.

### Motion
Motion is entrance and state only, never decoration. On load the greeting rises 420ms from 10px down and the console section follows 40ms later at 460ms, both on `cubic-bezier(.22, 1, .36, 1)`; the job monitor and empty state cross-fade in 220ms. The Settings dialog fades over 180ms and settles from `translateY(10px) scale(.985)` over 220ms, with a 180ms backdrop fade and a discrete close. Live data interpolates: progress width 450ms, throughput bar height and pace line 320ms, range-cell background 220ms plus a 220ms mount fade, token dot 200ms, job status 150ms, checkbox cards 150ms hover/press. Listbox menus fade over 200ms and settle from `translateY(-8px) scale(.985)` in 220ms with `cubic-bezier(.22, 1, .36, 1)`; the chevron turns 180° over 200ms; scope and soft buttons lift on a 150ms transition. The live dot, the checking token dot, and a running channel dot are the only loops (1.8s, opacity .55 → 1). The page rise, dialog, progress, throughput, range-cell, token-dot, status, and checkbox motion is disabled under `prefers-reduced-motion: reduce`.

### Named Rules
**The List First Rule.** When a token is usable the form chooses from Discord lists — server and channel listboxes and the channel's recent authors — and falls back to typed IDs only on request or when a list call fails. A retry clears the failed query and errors first; a failed list names why, offers Try lists again, and leaves the manual grid as the same form, not a second one.
**The Scope Switch Rule.** The three-way switch is the first control after the connection block. It owns the field set, the sub copy, the lookup label, the requirement line, the stats, and the live visualization: author = channel + recent author, channel = channel, server = server + per-channel progress. Never hard-code author language into a scope-aware surface.
**The Connection First Rule.** The form opens with the connection block. A missing token is a bordered callout with one pink action; every connected state collapses to a bare status line. Identity never appears here.
**The Motion Explains State Rule.** Motion is entrance or state change: the page rises once, the dialog settles, live figures interpolate, hover lifts 1px. The live, checking, and running-channel pulses are the only loops, and reduced motion must remove all of them.

## Do's and Don'ts

### Do:
- **Do** reserve pink for live, active, selected, focused, and primary-action states; keep coral for failure and destruction (One Live Accent, Live Only Pink).
- **Do** set every number, duration, date, and byte count in tabular figures (Tabular Time).
- **Do** build in-flow depth from `blur(20px) saturate(160%)` plus one hairline; keep halos for focus rings and status dots (Flat By Default).
- **Do** keep the radius ladder: 3px chips and range cells, 4px nested, 5px controls, 6px tiles, 8px dialog panel, 999px tracks.
- **Do** use Albert Sans at 300 for display and section titles, 400 for body and panel titles, 500 at .68–.78rem for labels, 600 for buttons and dialog headings, all sentence case.
- **Do** use 1.5-stroke icons at 16–20px, as the build does.
- **Do** keep the top bar to the identity lockup; server state lives in the connection block and the greeting.
- **Do** open Settings as a native `<dialog>` with `showModal()`, one dark ePortal panel, icon-labeled sections, 46px glass inputs, bordered checkbox cards, and a right-aligned glass Cancel beside one pink Save; let the dialog scroll inside 90vh.
- **Do** let the scope switch own the field set and every scope-aware label — sub copy, lookup button, requirement line, stats, and download filename (Scope Switch).
- **Do** show author scope with Channel ID + Author ID, channel scope with Channel ID alone, and server scope with Server ID alone; mark each visible ID required.
- **Do** keep "Check total against search" author-only and read "No total check" in channel and server scopes.
- **Do** replace the range map with the scrollable per-channel list and a channels stat in server scope; read "messages" instead of "matched".
- **Do** keep the form list-first when a token is ready: server and channel listboxes and the recent-author picker; keep **Enter IDs manually** as the escape hatch and **Choose from lists** as the return, clearing the failed query and errors first (List First).
- **Do** use the ePortal listbox for Server and Channel — 44px glass trigger, 16px chevron, animated dark menu, selected pink wash — and let it flip above when the viewport below is tight.
- **Do** use the ePortal scheme grid for the three scopes: three 44px bordered buttons, 6px gap, selected pink wash + pink ring + foreground, hover -1px.
- **Do** use the 34px soft button for Change, Recheck, Details, Enter IDs manually, Choose from lists, Try lists again, Edit, and Forget token; reserve the underlined link for Clear.
- **Do** show guild icons as 20px rounded squares and user avatars as circles at 20px in the trigger, 24px in menu rows, and 22px on the selected chip, with a pink initial fallback.
- **Do** keep the listbox and recent-author menus as the one floating cast-shadow exception in the form — the ePortal popover material.
- **Do** clear channel and author when the server changes, keep a stored ID as an extra option while its list loads or misses it, and let the manual server input clear the same selections.
- **Do** auto-fall back to manual fields on a failed browse call, show the reason, and offer **Try lists again** after clearing the failed query and errors.
- **Do** lead the form with the connection block — a bordered callout only when a token is missing, a bare status line once connected — and keep identity in the greeting (Connection First).
- **Do** gate Start: the blocked setup state is glass with faint ink at full opacity, busy or submitting keeps the .55 pink, and disabled Look up stays glass at .5.
- **Do** let the muted requirement line name the missing IDs, stay visible while a job runs, and yield to the connection block when the token is the reason.
- **Do** open Settings at the token or Date window section and focus its first control, or the heading when the input is hidden; return focus into the form only after the dialog closes.
- **Do** let a configured server token win over any session token, and name `DISCORD_TOKEN` and `DISCORD_TOKEN_IS_BOT` when the server token is rejected.
- **Do** let motion explain entrance and state only — 420/460ms page rise, 180/220ms dialog settle, 450ms progress, 320ms throughput — and disable every transition, animation, and hover lift, including the running channel dot, under `prefers-reduced-motion` (Motion Explains State).
- **Do** name the token's own Discord user in the greeting and fall back to `hello, please log in` when no identity is verified.
- **Do** keep the token in memory only; persist non-secret settings and never the token.
- **Do** give every chart a text alternative: sr-only summaries, a minute-by-minute table, per-cell aria labels, and reduced-motion support.
- **Do** keep chrome English and data verbatim; unrecorded values read "—" or "not recorded".

### Don't:
- **Don't** add a status pill or server-status row to the top bar; the connection block and greeting own server state.
- **Don't** add a drop shadow, inset highlight, or gloss to in-flow glass; only the Settings panel lifts.
- **Don't** introduce a second accent for status, or mark a stopped/partial job in pink; stopped is neutral glass, partial and failed are coral.
- **Don't** fill a resting content surface with pink; tint washes stay at or below 20%.
- **Don't** introduce a second display face or uppercase labels; hierarchy is size and weight in Albert Sans.
- **Don't** set data in proportional figures or animate a numeral's width.
- **Don't** add a chart, badge, or ornament that carries no measured value.
- **Don't** nest a glass panel inside another glass panel; inner groups use hairlines and flat blocks.
- **Don't** show the token's identity in the connection block; readiness and recovery belong there, identity belongs to the greeting.
- **Don't** paint a rejected or offline token dot pink; it is coral.
- **Don't** put a Settings button in the form head, a token row in Export settings, or a session-token error row in the form; failed session saves stay in the dialog.
- **Don't** give the blocked Start a pink fill or reduced opacity; it is glass with faint ink at full opacity.
- **Don't** tell the user to open Settings from the greeting; the connection block carries the action.
- **Don't** hard-code author language into the scope-aware sub copy, lookup label, requirement line, stats, or download filename; they follow the scope.
- **Don't** enable the Channel listbox before a server is chosen or the recent-author picker without a channel; show the "Choose a server first…" / "Choose a channel first…" state instead.
- **Don't** use native selects, a pink fill for the selected scope, or underlined links for the secondary action bar; use the listbox, the scheme grid, and the soft button.
- **Don't** require a privileged member intent for the author picker; read the channel's recent authors instead.
- **Don't** give any in-flow pane a cast shadow; only the Settings panel and the floating picker menus lift.
- **Don't** drop a stored ID from a picker because the fetched list does not contain it.
- **Don't** show a total check in channel or server scope, or render the range map for a whole-server job; use the channel list.
- **Don't** paint pending/empty channel dots pink or failed dots pink; pending/empty are faint and failed is coral.
- **Don't** add looping motion beyond the live, checking, and running-channel dots, scroll-triggered motion, or parallax; the page rises once.
- **Don't** persist the token, put it in a URL, log it, or return it from the server.
- **Don't** invent a verified identity before `/api/me` answers; show the checking, server-token, or no-token state instead.
- **Don't** add navigation or more pages; the one console is the product.
