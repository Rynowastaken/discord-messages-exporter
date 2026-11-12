import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  FileUp,
  MessageSquare,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import SectionHeading from "../components/SectionHeading";
import { api } from "../api";
import { navigate } from "../hooks/useHashRoute";
import { bytes, compact, plural, shortDate } from "../lib/format";
import type { ExportSummary } from "../types";

function modeLabel(item: ExportSummary): string {
  const mode =
    item.metadata?.mode ??
    (item.metadata?.target_user_id
      ? "author"
      : (item.metadata?.channels?.length ?? 0) > 0
        ? "server"
        : item.metadata?.channel
          ? "channel"
          : undefined);
  if (mode === "server") {
    return item.metadata?.guild?.name
      ? `Server · ${item.metadata.guild.name}`
      : "Whole server";
  }
  if (mode === "channel") {
    return item.metadata?.channel?.name
      ? `Channel · #${item.metadata.channel.name}`
      : "Whole channel";
  }
  if (mode === "author") {
    const channel = item.metadata?.channel?.name;
    return channel ? `Author · ${channel}` : "One author";
  }
  return item.kind === "job" ? "Job export" : "Loaded file";
}

export default function ExplorerPage() {
  const [exports, setExports] = useState<ExportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasIndexing = exports.some((item) => item.status === "indexing");
  const readyCount = exports.filter((item) => item.status === "ready").length;
  const loadedCount = exports.filter((item) => item.kind === "import").length;
  const totalMessages = exports.reduce(
    (sum, item) => sum + (item.message_count ?? 0),
    0
  );
  const totalBytes = exports.reduce((sum, item) => sum + item.size_bytes, 0);
  const largest = [...exports]
    .sort((a, b) => b.size_bytes - a.size_bytes)
    .slice(0, 6);
  const largestBytes = largest[0]?.size_bytes ?? 0;

  const refresh = useCallback(async () => {
    try {
      const data = await api.exports();
      setExports(data.exports);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hasIndexing) return undefined;
    const timer = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [hasIndexing, refresh]);

  async function upload(file: File | undefined | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const data = await api.importExport(file);
      await refresh();
      navigate(
        `/explorer/${encodeURIComponent(data.export.id)}/messages`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function reindex(item: ExportSummary) {
    setBusyId(item.id);
    try {
      await api.reindexExport(item.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: ExportSummary) {
    if (
      !window.confirm(
        `Remove “${item.name}” from the Explorer? The imported file and its index will be deleted.`
      )
    ) {
      return;
    }
    setBusyId(item.id);
    try {
      await api.deleteExport(item.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="explorer-page">
      <section className="section" aria-labelledby="explorerHeading">
        <div className="section-heading">
          <SectionHeading
            id="explorerHeading"
            title="Explorer"
            meta="Finished job exports and loaded JSON files, indexed locally for search and charts."
          />
          <div className="section-actions">
            <button
              type="button"
              className="glass-button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={16} strokeWidth={1.5} aria-hidden="true" />
              {uploading ? "Loading…" : "Load export"}
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            void upload(file);
          }}
        />

        {error ? (
          <p className="console-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <div className="explorer-layout">
      <section className="explorer-library" aria-labelledby="libraryHeading">
        <div className="section-heading">
          <SectionHeading
            id="libraryHeading"
            title="Export library"
            meta={
              exports.length
                ? `${compact(exports.length)} available${
                    hasIndexing ? " · indexing" : ""
                  }`
                : "Nothing here yet"
            }
          />
        </div>

        {loading ? (
          <div className="module-empty">
            <p>Reading the export library…</p>
          </div>
        ) : exports.length ? (
          <div className="export-list">
            {exports.map((item) => (
              <article
                className="export-row"
                key={item.id}
                role="link"
                tabIndex={0}
                aria-label={`Open ${item.name}`}
                onClick={(event) => {
                  if (
                    (event.target as HTMLElement).closest("a, button")
                  ) {
                    return;
                  }
                  navigate(
                    `/explorer/${encodeURIComponent(item.id)}/messages`
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(
                      `/explorer/${encodeURIComponent(item.id)}/messages`
                    );
                  }
                }}
              >
                <div className="export-row-head">
                  <div className="export-row-title">
                    <span className="export-kind">
                      {item.kind === "job" ? "Job" : "Loaded"}
                    </span>
                    <h3>{item.name}</h3>
                  </div>
                  <span
                    className="job-status"
                    data-status={item.status}
                  >
                    {item.status === "ready" ? "ready" : item.status}
                  </span>
                </div>

                <p className="export-row-meta">
                  {modeLabel(item)} · {bytes(item.size_bytes)} ·{" "}
                  {item.message_count === null
                    ? "not indexed"
                    : plural(item.message_count, "message", "messages")}{" "}
                  · modified {shortDate(item.modified_at)}
                </p>

                {item.status === "indexing" ? (
                  <div className="export-progress">
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
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </div>
                    <span>
                      {compact(item.indexed)} messages indexed
                    </span>
                  </div>
                ) : null}

                {item.status === "failed" ? (
                  <p className="console-error" role="alert">
                    {item.error ?? "Indexing failed."}
                  </p>
                ) : null}

                <div className="export-row-actions">
                  <a
                    className="soft-button"
                    href={`#/explorer/${encodeURIComponent(item.id)}/messages`}
                  >
                    <MessageSquare
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Messages
                  </a>
                  <a
                    className="soft-button"
                    href={`#/explorer/${encodeURIComponent(item.id)}/insights`}
                  >
                    <BarChart3
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Insights
                  </a>
                  <a
                    className="soft-button"
                    href={api.exportDownloadUrl(item.id)}
                    download
                  >
                    JSON
                  </a>
                  {item.status === "failed" ? (
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() => void reindex(item)}
                      disabled={busyId === item.id}
                    >
                      Retry index
                    </button>
                  ) : null}
                  {item.kind === "import" ? (
                    <button
                      type="button"
                      className="soft-button soft-button--danger"
                      onClick={() => void remove(item)}
                      disabled={busyId === item.id}
                    >
                      <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="module-empty">
            <p>
              No exports yet. Finish an export in the Export module or load a
              messages JSON above.
            </p>
            <a className="soft-button" href="#/export">
              Go to Export
            </a>
          </div>
        )}

        {exports.length ? (
          <div className="export-storage">
            <div className="export-storage-head">
              <span>Storage by export</span>
              <span>{bytes(totalBytes)}</span>
            </div>
            <div className="export-storage-rows">
              {largest.map((item) => (
                <a
                  className="export-storage-row"
                  key={item.id}
                  href={`#/explorer/${encodeURIComponent(item.id)}/messages`}
                >
                  <span className="export-storage-name">{item.name}</span>
                  <span className="export-storage-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${
                          largestBytes
                            ? Math.max(
                                2,
                                Math.round((item.size_bytes / largestBytes) * 100)
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </span>
                  <span className="export-storage-size">
                    {bytes(item.size_bytes)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <aside className="explorer-rail">
        <div
          className={`drop-zone drop-zone--rail${dragging ? " drop-zone--active" : ""}${
            uploading ? " drop-zone--busy" : ""
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void upload(event.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <FileUp size={20} strokeWidth={1.5} aria-hidden="true" />
          <strong>
            {uploading ? "Uploading and indexing…" : "Import a messages JSON"}
          </strong>
          <span>
            {uploading
              ? "This can take a moment for large files."
              : "Drop the file here, or click to choose one."}
          </span>
          <span className="drop-zone-note">
            Copied into the export library and indexed locally.
          </span>
        </div>

        <section
          className="explorer-glance"
          aria-labelledby="glanceHeading"
        >
          <span className="module-kicker">Archive</span>
          <h3 id="glanceHeading">At a glance</h3>
          <dl>
            <div>
              <dt>Exports</dt>
              <dd>{exports.length}</dd>
            </div>
            <div>
              <dt>Indexed</dt>
              <dd>
                {readyCount} of {exports.length}
              </dd>
            </div>
            <div>
              <dt>Messages</dt>
              <dd>{compact(totalMessages)}</dd>
            </div>
            <div>
              <dt>On disk</dt>
              <dd>{bytes(totalBytes)}</dd>
            </div>
            <div>
              <dt>Loaded</dt>
              <dd>{loadedCount}</dd>
            </div>
          </dl>
          <p>
            Indexes live inside this console. Imported originals are never
            modified.
          </p>
        </section>
      </aside>
      </div>
    </div>
  );
}
