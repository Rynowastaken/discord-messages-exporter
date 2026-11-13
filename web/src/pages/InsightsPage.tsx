import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileText,
  Flame,
  Link2,
  MessageSquare,
  Moon,
  Paperclip,
  Reply,
  Search,
  Timer,
  Users,
  X,
} from "lucide-react";
import ActivityChart from "../charts/ActivityChart";
import PostingClock from "../charts/PostingClock";
import RankBars from "../charts/RankBars";
import WordCloud from "../charts/WordCloud";
import ExportHeader from "../components/ExportHeader";
import SelectMenu from "../components/SelectMenu";
import { api } from "../api";
import { messageTimestamp } from "../lib/exportView";
import { compact, dateSpan, fmt, shortDate } from "../lib/format";
import type {
  ExportDetailResponse,
  ExportFilters,
  ExportStats,
} from "../types";

interface InsightsPageProps {
  exportId: string;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function ReactionEmoji({
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
        className="reaction-image"
        src={`https://cdn.discordapp.com/emojis/${emojiId}.png?size=32`}
        alt=""
        title={emoji}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span>{emoji}</span>;
}


function emptyFilters(): ExportFilters {
  return { q: "", author: "", channel: "", from: "", to: "" };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function gapLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function InsightsPage({ exportId }: InsightsPageProps) {
  const [detail, setDetail] = useState<ExportDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ExportFilters>(emptyFilters);
  const [scope, setScope] = useState<"all" | "filtered">("all");
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
    const timer = window.setTimeout(() => {
      setFilters((current) =>
        current.q === search ? current : { ...current, q: search }
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const activeFilters = scope === "filtered" ? filters : emptyFilters();
  const filterKey = JSON.stringify(activeFilters);

  useEffect(() => {
    if (detail?.export.status !== "ready") return undefined;
    let cancelled = false;
    api
      .exportStats(exportId, activeFilters)
      .then((data) => {
        if (cancelled) return;
        setStats(data.stats);
        setStatsError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setStatsError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.export.status, exportId, filterKey]);

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
    setScope("filtered");
  }

  function clearFilters() {
    setSearch("");
    setFilters(emptyFilters());
    setScope("all");
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
        <ExportHeader item={item} active="insights" />
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
        <ExportHeader item={item} active="insights" />
        <div className="indexing-panel" role="status">
          <span className="module-kicker">Indexing</span>
          <h2>Building the archive's story</h2>
          <p>
            {compact(item.indexed)} messages indexed. The records, charts, and
            word cloud appear when the pass finishes.
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
  const hasFilter = Boolean(
    filters.q ||
      filters.author ||
      filters.channel ||
      filters.from ||
      filters.to
  );

  return (
    <div className="export-view insights-page">
      <ExportHeader item={item} active="insights" />

      <section className="explorer-toolbar" aria-label="Insights filters">
        <label className="search-field">
          <Search size={17} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Search message text</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            placeholder="Search message text…"
            onChange={(event) => {
              setSearch(event.target.value);
              setScope("filtered");
            }}
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
          id="insightAuthorFilter"
          label="Author"
          value={filters.author ?? ""}
          options={authorOptions}
          onChange={(value) => changeFilter({ author: value })}
        />
        {serverScope ? (
          <SelectMenu
            id="insightChannelFilter"
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
        <div className="scope-toggle" role="group" aria-label="Stats scope">
          <button
            type="button"
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            Whole export
          </button>
          <button
            type="button"
            aria-pressed={scope === "filtered"}
            onClick={() => setScope("filtered")}
          >
            Current filter
          </button>
        </div>
        {hasFilter ? (
          <button type="button" className="soft-button" onClick={clearFilters}>
            Clear
          </button>
        ) : null}
      </section>

      {statsError ? (
        <p className="console-error" role="alert">
          {statsError}
        </p>
      ) : null}

      {!stats ? (
        <div className="module-empty">
          <p>Computing the archive's statistics…</p>
        </div>
      ) : stats.total === 0 ? (
        <div className="module-empty">
          <p>No messages match this filter.</p>
          <button type="button" className="soft-button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <section className="stat-strip" aria-label="Archive behavior">
            <div className="insight-stat">
              <MessageSquare size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{compact(stats.total)}</strong>
              <span>{stats.total === 1 ? "message" : "messages"}</span>
            </div>
            <div className="insight-stat">
              <Users size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{compact(stats.authors)}</strong>
              <span>{stats.authors === 1 ? "author" : "authors"}</span>
            </div>
            <div className="insight-stat">
              <CalendarDays size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{compact(stats.active_days)}</strong>
              <span>{stats.active_days === 1 ? "active day" : "active days"}</span>
            </div>
            <div className="insight-stat">
              <Activity size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{stats.messages_per_active_day.toFixed(1)}</strong>
              <span>messages / active day</span>
            </div>
            <div className="insight-stat">
              <Moon size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{percent(stats.night_share)}</strong>
              <span>posted 00:00–06:00</span>
            </div>
            <div className="insight-stat">
              <Reply size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{percent(stats.reply_rate)}</strong>
              <span>are replies</span>
            </div>
            <div className="insight-stat">
              <Paperclip size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{percent(stats.attachment_rate)}</strong>
              <span>have attachments</span>
            </div>
            <div className="insight-stat">
              <Link2 size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{percent(stats.link_rate)}</strong>
              <span>contain links</span>
            </div>
            <div className="insight-stat">
              <FileText size={16} strokeWidth={1.5} aria-hidden="true" />
              <strong>{fmt(stats.median_length)}</strong>
              <span>median characters</span>
            </div>
          </section>

          <section className="record-grid" aria-label="Archive records">
            <div className="record-card">
              <Flame size={17} strokeWidth={1.5} aria-hidden="true" />
              <span className="record-kicker">Busiest day</span>
              <strong>
                {stats.busiest_day
                  ? shortDate(stats.busiest_day.day)
                  : "—"}
              </strong>
              <span>
                {stats.busiest_day
                  ? `${fmt(stats.busiest_day.count)} ${
                      stats.busiest_day.count === 1 ? "message" : "messages"
                    }`
                  : "no dated messages"}
              </span>
            </div>
            <div className="record-card">
              <Clock3 size={17} strokeWidth={1.5} aria-hidden="true" />
              <span className="record-kicker">Busiest hour</span>
              <strong>
                {stats.busiest_hour
                  ? `${WEEKDAYS[stats.busiest_hour.weekday]} ${String(
                      stats.busiest_hour.hour
                    ).padStart(2, "0")}:00`
                  : "—"}
              </strong>
              <span>
                {stats.busiest_hour
                  ? `${fmt(stats.busiest_hour.count)} ${
                      stats.busiest_hour.count === 1 ? "message" : "messages"
                    } · UTC`
                  : "no dated messages"}
              </span>
            </div>
            <div className="record-card">
              <Timer size={17} strokeWidth={1.5} aria-hidden="true" />
              <span className="record-kicker">Longest quiet stretch</span>
              <strong>
                {stats.longest_gap
                  ? gapLength(stats.longest_gap.seconds)
                  : "—"}
              </strong>
              <span>
                {stats.longest_gap
                  ? `${shortDate(stats.longest_gap.from)} → ${shortDate(
                      stats.longest_gap.to
                    )}`
                  : "not enough messages"}
              </span>
            </div>
            <div className="record-card">
              <CalendarDays size={17} strokeWidth={1.5} aria-hidden="true" />
              <span className="record-kicker">Longest daily streak</span>
              <strong>
                {fmt(stats.longest_streak_days)}{" "}
                {stats.longest_streak_days === 1 ? "day" : "days"}
              </strong>
              <span>consecutive days with messages</span>
            </div>
          </section>

          <p className="insight-scope-line">
            {scope === "filtered" && hasFilter
              ? "Everything below reflects the current filter."
              : "Everything below covers the whole export."}{" "}
            {stats.first_timestamp && stats.last_timestamp
              ? `${dateSpan(stats.first_timestamp, stats.last_timestamp)} · ${fmt(
                  stats.total
                )} ${stats.total === 1 ? "message" : "messages"} · ${fmt(
                  stats.channels
                )} ${stats.channels === 1 ? "channel" : "channels"}`
              : `${fmt(stats.total)} ${
                  stats.total === 1 ? "message" : "messages"
                } · ${fmt(stats.channels)} ${
                  stats.channels === 1 ? "channel" : "channels"
                }`}
          </p>

          <div className="insight-grid">
            <ActivityChart days={stats.activity} />
            <PostingClock cells={stats.clock} />
            <WordCloud exportId={exportId} words={stats.top_words} />
            <RankBars
              kicker="Authors"
              title="Who posted the most"
              items={stats.top_authors}
              unit="messages"
            />
            {serverScope ? (
              <RankBars
                kicker="Channels"
                title="Busiest channels"
                items={stats.top_channels}
                unit="messages"
              />
            ) : null}
            <RankBars
              kicker="Message length"
              title="How long posts run"
              items={stats.length_buckets.map((bucket) => ({
                name: `${bucket.label} chars`,
                count: bucket.count,
              }))}
              unit="messages"
              limit={5}
            />
            <RankBars
              kicker="Attachments"
              title="What was attached"
              items={stats.attachment_types.map((row) => ({
                name: row.type,
                count: row.count,
              }))}
              unit="attachments"
            />
            <RankBars
              kicker="Links"
              title="Where people pointed"
              items={stats.top_domains.map((row) => ({
                name: row.domain,
                count: row.count,
              }))}
              unit="links"
            />
            {stats.top_reactions.length ? (
              <article className="insight-panel">
                <header className="insight-panel-head">
                  <div>
                    <span className="module-kicker">Reactions</span>
                    <h2>How people reacted</h2>
                  </div>
                  <p>{fmt(stats.reactions)} reactions in total</p>
                </header>
                <div className="reaction-board">
                  {stats.top_reactions.map((reaction) => (
                    <span
                      className="reaction-tile"
                      key={`${reaction.emoji_id ?? reaction.emoji}`}
                      title={reaction.emoji}
                    >
                      <span aria-hidden="true">
                        <ReactionEmoji
                          emoji={reaction.emoji}
                          emojiId={reaction.emoji_id}
                        />
                      </span>
                      <strong>{compact(reaction.count)}</strong>
                    </span>
                  ))}
                </div>
                {stats.top_reactions.some(
                  (reaction) => reaction.emoji_id
                ) ? (
                  <div
                    className="message-warning reaction-warning"
                    role="note"
                  >
                    <AlertTriangle
                      size={15}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <p>
                      Custom emoji images are loaded from Discord, not stored
                      in this export. They may be unavailable offline or
                      without access to the source server; the reaction name
                      is shown instead.
                    </p>
                  </div>
                ) : null}
              </article>
            ) : null}
          </div>

          {(stats.first_message || stats.last_message) && (
            <section className="bookends" aria-label="Archive bookends">
              <div className="section-heading">
                <h2 className="section-title">Bookends</h2>
                <p className="section-meta">
                  The oldest and newest message in this selection.
                </p>
              </div>
              <div className="bookend-grid">
                {[
                  ["First message", stats.first_message] as const,
                  ["Last message", stats.last_message] as const,
                ].map(([label, message]) =>
                  message ? (
                    <article className="bookend-card" key={label}>
                      <span className="module-kicker">{label}</span>
                      <strong className="bookend-author">
                        {message.author_name}
                      </strong>
                      <span className="bookend-date">
                        {messageTimestamp(message.timestamp)}
                      </span>
                      <p>{message.content || "no text content"}</p>
                    </article>
                  ) : null
                )}
              </div>
            </section>
          )}

          {stats.longest_message ? (
            <section
              className="longest-message"
              aria-label="Longest message"
            >
              <span className="module-kicker">Longest message</span>
              <strong>
                {fmt(stats.longest_message.length)} characters by{" "}
                {stats.longest_message.author_name}
              </strong>
              <p>{stats.longest_message.content}</p>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
