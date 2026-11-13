import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Search,
  Smile,
  X,
} from "lucide-react";
import AttachmentGrid from "../components/AttachmentGrid";
import Avatar from "../components/Avatar";
import ExportHeader from "../components/ExportHeader";
import MessageEmbeds from "../components/MessageEmbeds";
import MessageStickers from "../components/MessageStickers";
import PostingClock, { type ClockSelection } from "../charts/PostingClock";
import MessageMarkdown from "../components/MessageMarkdown";
import SelectMenu from "../components/SelectMenu";
import { api } from "../api";
import {
  authorLabel,
  discordMessageUrl,
  messageTimestamp,
} from "../lib/exportView";
import { compact, fmt } from "../lib/format";
import type {
  ExplorerEmbed,
  ExportDetailResponse,
  ExportFilters,
  MessageContentKind,
  MessagePage,
} from "../types";

interface MessagesPageProps {
  exportId: string;
  initialQuery?: string;
}

interface RawAttachment {
  id?: string;
  filename?: string;
  size?: number;
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
  url?: string;
  proxy_url?: string;
}

interface RawMessage {
  id?: string;
  channel_id?: string;
  timestamp?: string;
  edited_timestamp?: string | null;
  content?: string;
  author?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar_url?: string | null;
    bot?: boolean;
  };
  mentions?: Array<{
    id?: string;
    username?: string;
    global_name?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  }>;
  attachments?: RawAttachment[];
  sticker_items?: Array<{
    id?: string;
    name?: string | null;
    format_type?: number | null;
  }>;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    type?: string;
    provider?: { name?: string };
    author?: { name?: string };
    thumbnail?: { url?: string };
    image?: { url?: string };
    video?: { url?: string };
  }>;
  reactions?: Array<{
    emoji?: string | { name?: string | null; id?: string | null } | null;
    emoji_id?: string | null;
    count?: number;
  }>;
  referenced_message?: {
    id?: string;
    author?: {
      id?: string;
      username?: string;
      global_name?: string | null;
    };
    content?: string;
  } | null;
  thread?: { id?: string; name?: string } | null;
}

const PAGE_SIZE = 100;

const CONTENT_LABELS: Array<{ id: MessageContentKind; label: string }> = [
  { id: "text", label: "Text" },
  { id: "media", label: "Media" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "files", label: "Files" },
  { id: "code", label: "Code blocks" },
  { id: "links", label: "Links" },
  { id: "stickers", label: "Stickers" },
];

function detailMentions(
  mentions: RawMessage["mentions"]
): Array<{ id: string; name: string; avatar_url: string | null }> {
  return (mentions ?? [])
    .map((mention) => ({
      id: mention.id ?? "",
      name:
        mention.global_name ||
        mention.username ||
        mention.display_name ||
        mention.id ||
        "",
      avatar_url: mention.avatar_url ?? null,
    }))
    .filter((mention) => mention.id);
}

function detailEmbeds(
  embeds: RawMessage["embeds"]
): ExplorerEmbed[] {
  return (embeds ?? []).map((embed) => ({
    type: embed.type ?? null,
    title: embed.title ?? null,
    description: embed.description ?? null,
    url: embed.url ?? null,
    provider: embed.provider?.name ?? null,
    author: embed.author?.name ?? null,
    thumbnail_url: embed.thumbnail?.url ?? null,
    image_url: embed.image?.url ?? null,
    video_url: embed.video?.url ?? null,
  }));
}

function ReactionGlyph({
  emoji,
  emojiId,
}: {
  emoji: string;
  emojiId: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (emojiId && !failed) {
    return (
      <img
        className="reaction-emoji-img"
        src={`https://cdn.discordapp.com/emojis/${emojiId}.png?size=32`}
        alt=""
        width={14}
        height={14}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span aria-hidden="true">{emoji}</span>;
}

function ReactionChip({
  emoji,
  emojiId,
  count,
}: {
  emoji: string;
  emojiId: string | null;
  count: number;
}) {
  return (
    <span className="message-reaction" title={emoji}>
      <ReactionGlyph emoji={emoji} emojiId={emojiId} />
      {fmt(count)}
    </span>
  );
}

function rawReaction(
  reaction: NonNullable<RawMessage["reactions"]>[number]
): { name: string; emojiId: string | null } {
  const raw = reaction.emoji;
  if (typeof raw === "string") {
    return { name: raw || "?", emojiId: reaction.emoji_id ?? null };
  }
  return {
    name: raw?.name || raw?.id || "?",
    emojiId: raw?.id ?? reaction.emoji_id ?? null,
  };
}

function emptyFilters(): ExportFilters {
  return { q: "", author: "", channel: "", from: "", to: "" };
}

export default function MessagesPage({
  exportId,
  initialQuery,
}: MessagesPageProps) {
  const [detail, setDetail] = useState<ExportDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [page, setPage] = useState<MessagePage | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialQuery ?? "");
  const [filters, setFilters] = useState<ExportFilters>(() => ({
    ...emptyFilters(),
    q: initialQuery ?? "",
  }));
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RawMessage | null>(null);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [clockCells, setClockCells] = useState<
    Array<{ weekday: number; hour: number; count: number }>
  >([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(async () => {
    try {
      const data = await api.exportDetail(exportId);
      setDetail(data);
      setDetailError(null);
      return data;
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [exportId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      const data = await loadDetail();
      if (cancelled || !data) return;
      if (
        data.export.status === "indexing" ||
        data.export.status === "unindexed"
      ) {
        timer = window.setTimeout(() => void poll(), 1200);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [loadDetail, pollKey]);

  useEffect(() => {
    if (detail?.export.status !== "ready") {
      setClockCells([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .exportStats(exportId, {
          q: filters.q,
          author: filters.author,
          channel: filters.channel,
          from: filters.from,
          to: filters.to,
          content: filters.content,
        })
        .then((data) => {
          if (!cancelled) setClockCells(data.stats.clock);
        })
        .catch(() => {
          if (!cancelled) setClockCells([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    exportId,
    detail?.export.status,
    filters.q,
    filters.author,
    filters.channel,
    filters.from,
    filters.to,
    filters.content,
  ]);

  useEffect(() => {
    if (initialQuery === undefined) return;
    setSearch(initialQuery);
    setFilters((current) =>
      current.q === initialQuery ? current : { ...current, q: initialQuery }
    );
    setOffset(0);
  }, [initialQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) =>
        current.q === search ? current : { ...current, q: search }
      );
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (detail?.export.status !== "ready") return undefined;
    let cancelled = false;
    api
      .exportMessages(exportId, filters, offset, PAGE_SIZE, order)
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        setPageError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setPageError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.export.status, exportId, filters, offset, order]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return undefined;
    }
    let cancelled = false;
    setSelected(null);
    setSelectedError(null);
    api
      .exportMessage(exportId, selectedId)
      .then((data) => {
        if (!cancelled) setSelected(data.message as RawMessage);
      })
      .catch((err) => {
        if (!cancelled) {
          setSelectedError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [exportId, selectedId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = document.activeElement?.tagName ?? "";
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function changeFilter(patch: Partial<ExportFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setOffset(0);
    setSelectedId(null);
  }

  function clearFilters() {
    setSearch("");
    setFilters(emptyFilters());
    setOffset(0);
    setSelectedId(null);
  }

  function selectClock(selection: ClockSelection | null) {
    setFilters((current) => {
      const next = { ...current };
      if (selection) {
        next.weekday = selection.weekday;
        next.hour = selection.hour;
      } else {
        delete next.weekday;
        delete next.hour;
      }
      return next;
    });
    setOffset(0);
    setSelectedId(null);
  }

  async function retry() {
    setRetrying(true);
    setDetailError(null);
    try {
      await api.reindexExport(exportId);
      setPollKey((value) => value + 1);
      await loadDetail();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  }

  if (!detail && !detailError) {
    return (
      <div className="module-empty">
        <p>Opening the export index…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="module-empty">
        <p className="console-error" role="alert">
          {detailError}
        </p>
        <a className="soft-button" href="#/explorer">
          Back to Explorer
        </a>
      </div>
    );
  }

  const item = detail.export;
  if (item.status === "failed") {
    return (
      <div className="export-view">
        <ExportHeader item={item} active="messages" />
        <div className="module-empty">
          <p className="console-error" role="alert">
            {item.error ?? "Indexing failed."}
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => void retry()}
            disabled={retrying}
          >
            {retrying ? "Retrying…" : "Retry indexing"}
          </button>
        </div>
      </div>
    );
  }

  if (item.status !== "ready") {
    return (
      <div className="export-view">
        <ExportHeader item={item} active="messages" />
        <div className="indexing-panel" role="status">
          <span className="module-kicker">Indexing</span>
          <h2>Reading the export into a searchable index</h2>
          <p>
            {compact(item.indexed)} messages indexed. This is a one-time pass;
            the original file is untouched.
          </p>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Indexing export"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(item.progress * 100)}
          >
            <div
              className="progress-fill"
              style={{ width: `${Math.max(2, Math.round(item.progress * 100))}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  const facets = detail.facets;
  const authorOptions = [
    { value: "", label: "All authors" },
    ...(facets?.authors ?? []).map((author) => ({
      value: author.id,
      label: `${author.name} (${fmt(author.count)})`,
    })),
  ];
  const channelOptions = [
    { value: "", label: "All channels" },
    ...(facets?.channels ?? []).map((channel) => ({
      value: channel.id,
      label: `#${channel.name} (${fmt(channel.count)})`,
    })),
  ];
  const serverScope =
    item.metadata?.mode === "server" || (facets?.channels.length ?? 0) > 1;
  const contentCounts = new Map(
    (facets?.content ?? []).map((facet) => [facet.id, facet.count])
  );
  const contentOptions = [
    { value: "", label: "Any content" },
    ...CONTENT_LABELS.filter(
      (entry) => (contentCounts.get(entry.id) ?? 0) > 0
    ).map((entry) => ({
      value: entry.id,
      label: `${entry.label} · ${fmt(contentCounts.get(entry.id) ?? 0)}`,
    })),
  ];
  const total = page?.total ?? 0;
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterActive = Boolean(
    filters.q ||
      filters.author ||
      filters.channel ||
      filters.from ||
      filters.to ||
      filters.content ||
      filters.weekday !== undefined ||
      filters.hour !== undefined
  );
  const clockSelection: ClockSelection | null =
    filters.weekday !== undefined && filters.hour !== undefined
      ? { weekday: filters.weekday, hour: filters.hour }
      : null;
  const jumpUrl = selected
    ? discordMessageUrl(
        item.metadata,
        selected.channel_id ?? null,
        selected.id ?? ""
      )
    : null;

  return (
    <div className="export-view">
      <ExportHeader item={item} active="messages" />

      <section className="explorer-toolbar" aria-label="Message filters">
        <div className="field filter-search">
          <span className="field-label">Search</span>
          <label className="search-field">
            <Search size={17} strokeWidth={1.5} aria-hidden="true" />
            <span className="sr-only">Search message text</span>
            <input
              ref={searchRef}
              type="search"
              value={search}
              placeholder="Message text…"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            ) : (
              <kbd className="search-key">/</kbd>
            )}
          </label>
        </div>

        <SelectMenu
          id="authorFilter"
          label="Author"
          value={filters.author ?? ""}
          options={authorOptions}
          onChange={(value) => changeFilter({ author: value })}
        />
        {serverScope ? (
          <SelectMenu
            id="channelFilter"
            label="Channel"
            value={filters.channel ?? ""}
            options={channelOptions}
            onChange={(value) => changeFilter({ channel: value })}
          />
        ) : null}
        <SelectMenu
          id="contentFilter"
          label="Content"
          value={filters.content ?? ""}
          options={contentOptions}
          onChange={(value) =>
            changeFilter({
              content: value ? (value as MessageContentKind) : undefined,
            })
          }
        />
        <label className="field filter-date">
          <span className="field-label">From</span>
          <input
            className="field-input"
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => changeFilter({ from: event.target.value })}
          />
        </label>
        <label className="field filter-date">
          <span className="field-label">To</span>
          <input
            className="field-input"
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => changeFilter({ to: event.target.value })}
          />
        </label>
        <div className="field filter-order">
          <span className="field-label">Order</span>
          <button
            type="button"
            className="glass-button order-button"
            onClick={() =>
              setOrder((current) => (current === "desc" ? "asc" : "desc"))
            }
          >
            {order === "desc" ? (
              <ArrowDown size={16} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <ArrowUp size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
            {order === "desc" ? "Newest first" : "Oldest first"}
          </button>
        </div>
        {filterActive ? (
          <div className="filter-action">
            <button type="button" className="soft-button" onClick={clearFilters}>
              Clear
            </button>
          </div>
        ) : null}
      </section>

      {detail.export.status === "ready" && clockCells.length ? (
        <section className="message-clock" aria-label="Filter by posting time">
          <PostingClock
            cells={clockCells}
            selected={clockSelection}
            onSelect={selectClock}
          />
        </section>
      ) : null}

      <div className="message-summary">
        <span>
          <strong>{fmt(total)}</strong>{" "}
          {total === 1 ? "message" : "messages"}
          {filterActive ? " in this filter" : ""}
        </span>
        <span>
          Page {fmt(pageNumber)} of {fmt(pageCount)}
        </span>
      </div>

      {pageError ? (
        <p className="console-error" role="alert">
          {pageError}
        </p>
      ) : null}

      <div className="message-layout">
        <div className="message-list-column">
          {page?.messages.length ? (
            <div className="message-list">
              {page.messages.map((message) => (
                <div
                  key={message.id}
                  role="button"
                  tabIndex={0}
                  className={`message-row${
                    selectedId === message.id ? " message-row--active" : ""
                  }`}
                  onClick={() => setSelectedId(message.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(message.id);
                    }
                  }}
                  aria-pressed={selectedId === message.id}
                >
                  <Avatar
                    src={message.author_avatar_url}
                    name={authorLabel(message)}
                    round
                  />
                  <div className="message-row-body">
                    <div className="message-row-head">
                      <strong>{authorLabel(message)}</strong>
                      {message.author_bot ? (
                        <span className="message-badge">bot</span>
                      ) : null}
                      <span className="message-time">
                        {messageTimestamp(message.timestamp)}
                      </span>
                      {serverScope && message.channel_name ? (
                        <span className="message-channel">
                          #{message.channel_name}
                        </span>
                      ) : null}
                    </div>
                    {message.content ? (
                      <MessageMarkdown
                        content={message.content}
                        mentions={message.mentions}
                        className="message-content"
                      />
                    ) : message.stickers?.length ||
                      message.embeds?.length ? null : (
                      <span className="message-content message-empty">
                        no text content
                      </span>
                    )}
                    {message.stickers?.length ? (
                      <MessageStickers stickers={message.stickers} />
                    ) : null}
                    {message.embeds?.length ? (
                      <MessageEmbeds embeds={message.embeds} />
                    ) : null}
                    <div className="message-row-foot">
                      {message.attachment_count ? (
                        <span>
                          <Paperclip
                            size={13}
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          {fmt(message.attachment_count)}
                        </span>
                      ) : null}
                      {message.reactions?.length ? (
                        <span className="message-reactions">
                          {message.reactions.slice(0, 6).map((reaction, i) => (
                            <ReactionChip
                              key={`${reaction.emoji_id ?? reaction.emoji}-${i}`}
                              emoji={reaction.emoji}
                              emojiId={reaction.emoji_id}
                              count={reaction.count}
                            />
                          ))}
                          {message.reactions.length > 6 ? (
                            <span className="message-reaction">
                              +{message.reactions.length - 6}
                            </span>
                          ) : null}
                        </span>
                      ) : message.reaction_count ? (
                        <span>
                          <Smile
                            size={13}
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          {fmt(message.reaction_count)}
                        </span>
                      ) : null}
                      {message.reply_to_id ? <span>reply</span> : null}
                      {message.edited ? <span>edited</span> : null}
                      {message.content_length > 1200 ? (
                        <span>
                          {fmt(message.content_length)} chars
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="module-empty">
              <p>
                {filterActive
                  ? "No messages match this filter."
                  : "This export has no messages."}
              </p>
              {filterActive ? (
                <button
                  type="button"
                  className="soft-button"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}

          <div className="message-pager">
            <button
              type="button"
              className="glass-button"
              disabled={offset === 0}
              onClick={() => {
                setOffset(Math.max(0, offset - PAGE_SIZE));
                setSelectedId(null);
              }}
            >
              <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
              Previous
            </button>
            <span>
              {fmt(offset + 1)}–
              {fmt(Math.min(offset + PAGE_SIZE, total))} of {fmt(total)}
            </span>
            <button
              type="button"
              className="glass-button"
              disabled={!page?.has_more}
              onClick={() => {
                setOffset(offset + PAGE_SIZE);
                setSelectedId(null);
              }}
            >
              Next
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        <aside className="message-detail" aria-live="polite">
          {selectedId ? (
            selected ? (
              <>
                <div className="message-detail-head">
                  <Avatar
                    src={selected.author?.avatar_url}
                    name={
                      selected.author?.global_name ||
                      selected.author?.username ||
                      selected.author?.id ||
                      "?"
                    }
                    round
                  />
                  <div>
                    <strong>
                      {selected.author?.global_name ||
                        selected.author?.username ||
                        selected.author?.id}
                    </strong>
                    <span>
                      {messageTimestamp(selected.timestamp ?? "")}
                      {selected.edited_timestamp ? " · edited" : ""}
                    </span>
                  </div>
                  {jumpUrl ? (
                    <a
                      className="soft-button"
                      href={jumpUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink
                        size={14}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      Discord
                    </a>
                  ) : null}
                </div>

                {selected.content ? (
                  <MessageMarkdown
                    content={selected.content}
                    mentions={detailMentions(selected.mentions)}
                    className="message-detail-content"
                  />
                ) : (
                  <p className="message-detail-content message-empty">
                    no text content
                  </p>
                )}

                {selected.sticker_items?.length ? (
                  <div className="message-detail-block">
                    <h3>Stickers</h3>
                    <MessageStickers stickers={selected.sticker_items} />
                  </div>
                ) : null}

                {selected.mentions?.length ? (
                  <div className="message-detail-block">
                    <h3>Mentioned</h3>
                    <div className="message-mentions">
                      {detailMentions(selected.mentions).map((mention) => (
                        <span
                          className="message-mention"
                          key={mention.id}
                        >
                          <Avatar
                            src={mention.avatar_url}
                            name={mention.name}
                            round
                          />
                          {mention.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selected.attachments?.length ? (
                  <div className="message-detail-block">
                    <h3>Attachments</h3>
                    <AttachmentGrid
                      attachments={selected.attachments}
                      exportId={exportId}
                      localAttachments={Boolean(detail.export.has_attachments)}
                    />
                    {detail.export.has_attachments ? (
                      <p className="note-line">
                        Files in this export are served from local storage.
                        Anything that failed to download falls back to the
                        signed Discord link.
                      </p>
                    ) : (
                      <div className="message-warning" role="note">
                        <AlertTriangle
                          size={15}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        <p>
                          <strong>Attachment bytes are not archived.</strong>{" "}
                          Signed Discord links expire, so a photo that cannot
                          load stays as an unavailable card instead of opening
                          a dead page.
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}

                {selected.reactions?.length ? (
                  <div className="message-detail-block">
                    <h3>Reactions</h3>
                    <div className="reaction-list">
                      {selected.reactions.map((reaction, index) => {
                        const glyph = rawReaction(reaction);
                        return (
                          <span key={index} title={glyph.name}>
                            <ReactionGlyph
                              emoji={glyph.name}
                              emojiId={glyph.emojiId}
                            />
                            {reaction.count
                              ? ` ×${fmt(reaction.count)}`
                              : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {selected.referenced_message ? (
                  <div className="message-detail-block">
                    <h3>Replying to</h3>
                    <blockquote className="referenced-message">
                      <strong>
                        {selected.referenced_message.author?.global_name ||
                          selected.referenced_message.author?.username ||
                          selected.referenced_message.author?.id}
                      </strong>
                      {selected.referenced_message.content ? (
                        <MessageMarkdown
                          content={selected.referenced_message.content}
                          className="referenced-content"
                        />
                      ) : (
                        <p>no text</p>
                      )}
                    </blockquote>
                  </div>
                ) : null}

                {selected.embeds?.length ? (
                  <div className="message-detail-block">
                    <h3>Link previews</h3>
                    <MessageEmbeds
                      embeds={detailEmbeds(selected.embeds)}
                      limit={4}
                      className="message-embeds--detail"
                    />
                  </div>
                ) : null}

                {selected.thread ? (
                  <p className="note-line">
                    Thread: {selected.thread.name ?? selected.thread.id}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="module-empty">
                {selectedError ?? "Loading message…"}
              </p>
            )
          ) : (
            <div className="message-detail-empty">
              <span className="message-detail-empty-icon" aria-hidden="true">
                <MessageSquare size={20} strokeWidth={1.5} />
              </span>
              <span className="module-kicker">Message</span>
              <strong>Select a message</strong>
              <p>
                Read its full text, attachments, reactions, and reply context
                here.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
