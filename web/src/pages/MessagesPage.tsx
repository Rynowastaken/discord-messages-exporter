import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Paperclip,
  Search,
  Smile,
  X,
} from "lucide-react";
import AttachmentGrid from "../components/AttachmentGrid";
import Avatar from "../components/Avatar";
import ExportHeader from "../components/ExportHeader";
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
  ExportDetailResponse,
  ExportFilters,
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
    bot?: boolean;
  };
  attachments?: RawAttachment[];
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    type?: string;
  }>;
  reactions?: Array<{
    emoji?: { name?: string | null; id?: string | null };
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

function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
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
  const total = page?.total ?? 0;
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterActive = Boolean(
    filters.q ||
      filters.author ||
      filters.channel ||
      filters.from ||
      filters.to
  );
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
        <label className="search-field">
          <Search size={17} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Search message text</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            placeholder="Search message text…"
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
        <button
          type="button"
          className="glass-button order-button"
          onClick={() => setOrder((current) => (current === "desc" ? "asc" : "desc"))}
        >
          {order === "desc" ? (
            <ArrowDown size={16} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <ArrowUp size={16} strokeWidth={1.5} aria-hidden="true" />
          )}
          {order === "desc" ? "Newest first" : "Oldest first"}
        </button>
        {filterActive ? (
          <button type="button" className="soft-button" onClick={clearFilters}>
            Clear
          </button>
        ) : null}
      </section>

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
                        className="message-content"
                      />
                    ) : (
                      <span className="message-content message-empty">
                        no text content
                      </span>
                    )}
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
                      {message.reaction_count ? (
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
                    className="message-detail-content"
                  />
                ) : (
                  <p className="message-detail-content message-empty">
                    no text content
                  </p>
                )}

                {selected.attachments?.length ? (
                  <div className="message-detail-block">
                    <h3>Attachments</h3>
                    <AttachmentGrid attachments={selected.attachments} />
                    <p className="note-line">
                      Attachment bytes are not archived. Signed Discord links
                      expire, so a photo that cannot load stays as an
                      unavailable card instead of opening a dead page.
                    </p>
                  </div>
                ) : null}

                {selected.reactions?.length ? (
                  <div className="message-detail-block">
                    <h3>Reactions</h3>
                    <div className="reaction-list">
                      {selected.reactions.map((reaction, index) => (
                        <span key={index}>
                          {reaction.emoji?.name ?? ":"}
                          {reaction.count ? ` ×${fmt(reaction.count)}` : ""}
                        </span>
                      ))}
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
                    <h3>Embeds</h3>
                    <ul className="embed-list">
                      {selected.embeds.map((embed, index) => {
                        const href = safeHref(embed.url);
                        return (
                          <li key={index}>
                            {href ? (
                              <a href={href} target="_blank" rel="noreferrer">
                                {embed.title || embed.url}
                              </a>
                            ) : (
                              <strong>
                                {embed.title || embed.type || "embed"}
                              </strong>
                            )}
                            {embed.description ? (
                              <MessageMarkdown
                                content={embed.description}
                                className="embed-content"
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
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
              <span className="module-kicker">Message</span>
              <p>Select a message to read the full record.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
