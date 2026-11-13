import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Clock,
  Download,
  FolderOpen,
  HardDrive,
  MessageSquare,
  Radio,
} from "lucide-react";
import Greeting from "../components/Greeting";
import SectionHeading from "../components/SectionHeading";
import { api } from "../api";
import { navigate } from "../hooks/useHashRoute";
import { exportScopeLine } from "../lib/exportView";
import { bytes, compact, plural, shortDate } from "../lib/format";
import type { UseJobs } from "../hooks/useJobs";
import type { ExportSummary, Identity } from "../types";

interface DashboardPageProps {
  jobsState: UseJobs;
  identity: Identity | null;
  identityError: string | null;
  identityLoading: boolean;
}

export default function DashboardPage({
  jobsState,
  identity,
  identityError,
  identityLoading,
}: DashboardPageProps) {
  const [exports, setExports] = useState<ExportSummary[]>([]);
  const [exportsError, setExportsError] = useState<string | null>(null);
  const activeJob = jobsState.jobs.find((job) =>
    ["queued", "resolving", "running", "stopping"].includes(job.status)
  );
  const ready = exports.filter((item) => item.status === "ready");
  const totalMessages = ready.reduce(
    (sum, item) => sum + (item.message_count ?? 0),
    0
  );
  const totalSize = ready.reduce((sum, item) => sum + item.size_bytes, 0);
  const latest = ready[0] ?? exports[0];

  useEffect(() => {
    let cancelled = false;
    api
      .exports()
      .then((data) => {
        if (!cancelled) {
          setExports(data.exports);
          setExportsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setExportsError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="dashboard">
      <Greeting
        identity={identity}
        identityError={identityError}
        identityLoading={identityLoading}
        serverToken={jobsState.serverToken}
        statusLoading={jobsState.loading}
        serverOnline={jobsState.serverOnline}
      />

      <section className="dashboard-glance" aria-label="At a glance">
        <div className="insight-stat">
          <FolderOpen size={16} strokeWidth={1.5} aria-hidden="true" />
          <strong>{compact(exports.length)}</strong>
          <span>{exports.length === 1 ? "export" : "exports"}</span>
        </div>
        <div className="insight-stat">
          <MessageSquare size={16} strokeWidth={1.5} aria-hidden="true" />
          <strong>{compact(totalMessages)}</strong>
          <span>messages indexed</span>
        </div>
        <div className="insight-stat">
          <HardDrive size={16} strokeWidth={1.5} aria-hidden="true" />
          <strong>{bytes(totalSize)}</strong>
          <span>on disk</span>
        </div>
        <div className="insight-stat">
          <Clock size={16} strokeWidth={1.5} aria-hidden="true" />
          <strong>{latest ? shortDate(latest.modified_at) : "—"}</strong>
          <span>last export</span>
        </div>
      </section>

      <section className="section" aria-labelledby="modulesHeading">
        <div className="section-heading">
          <SectionHeading id="modulesHeading" title="Modules" />
        </div>

        <div className="module-grid">
          <a className="module-card" href="#/export">
            <span className="module-icon" aria-hidden="true">
              <Radio size={18} strokeWidth={1.5} />
            </span>
            <span className="module-kicker">Export</span>
            <h2 className="module-title">
              {activeJob ? "Export in progress" : "Create an export"}
            </h2>
            <p className="module-copy">Save an author, a channel, or a server.</p>
            <span className="module-meta">
              {activeJob
                ? activeJob.stage || "Running"
                : jobsState.jobs.length
                  ? `${compact(jobsState.jobs.length)} export${
                      jobsState.jobs.length === 1 ? "" : "s"
                    } this session`
                  : "Nothing running"}
            </span>
            <ArrowUpRight
              className="module-arrow"
              size={18}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </a>

          <a className="module-card" href="#/explorer">
            <span className="module-icon" aria-hidden="true">
              <FolderOpen size={18} strokeWidth={1.5} />
            </span>
            <span className="module-kicker">Explorer</span>
            <h2 className="module-title">
              {exports.length ? "Browse your archive" : "Load an export"}
            </h2>
            <p className="module-copy">
              Search messages, authors, and channels.
            </p>
            <span className="module-meta">
              {exports.length
                ? `${plural(exports.length, "export", "exports")} · ${plural(
                    totalMessages,
                    "message",
                    "messages"
                  )} indexed`
                : "Load a JSON file to begin"}
            </span>
            <ArrowUpRight
              className="module-arrow"
              size={18}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </a>

          <a
            className="module-card module-card--insights"
            href={
              latest
                ? `#/explorer/${encodeURIComponent(latest.id)}/insights`
                : "#/explorer"
            }
          >
            <span className="module-icon" aria-hidden="true">
              <BarChart3 size={18} strokeWidth={1.5} />
            </span>
            <span className="module-kicker">Insights</span>
            <h2 className="module-title">Open insights</h2>
            <p className="module-copy">
              Activity, posting clock, and top authors.
            </p>
            <span className="module-meta">
              {latest
                ? `Latest: ${latest.name} · ${
                    latest.message_count === null
                      ? "not indexed yet"
                      : plural(latest.message_count, "message", "messages")
                  }`
                : "Open an export to see its insights"}
            </span>
            <ArrowUpRight
              className="module-arrow"
              size={18}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </a>
        </div>

        {exportsError ? (
          <p className="console-error" role="alert">
            Export library: {exportsError}
          </p>
        ) : null}
      </section>

      <section className="section" aria-labelledby="recentHeading">
        <div className="section-heading">
          <SectionHeading
            id="recentHeading"
            title="Recent exports"
            meta={
              exports.length
                ? "Open the message browser or the insights page."
                : "Exports appear here after a job finishes or you load a file."
            }
          />
          {exports.length ? (
            <a className="glass-button" href="#/explorer">
              Open Explorer
            </a>
          ) : (
            <a className="glass-button" href="#/explorer">
              <Download size={16} strokeWidth={1.5} aria-hidden="true" />
              Load export
            </a>
          )}
        </div>

        {exports.length ? (
          <div className="recent-exports">
            {exports.slice(0, 6).map((item) => (
              <div
                className="recent-export"
                key={item.id}
                role="link"
                tabIndex={0}
                title={`Open ${item.name}`}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a, button")) {
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
                <div className="recent-export-main">
                  <span className="recent-export-name">{item.name}</span>
                  <span className="recent-export-source">
                    {exportScopeLine(item)}
                  </span>
                  <span className="recent-export-meta">
                    {item.kind === "job" ? "Exported here" : "Imported file"} ·{" "}
                    {bytes(item.size_bytes)} ·{" "}
                    {item.message_count === null
                      ? item.status
                      : plural(item.message_count, "message", "messages")}

                  </span>
                </div>
                <span className="recent-export-date">
                  {shortDate(item.modified_at)}
                </span>
                <div className="recent-export-actions">
                  <a
                    className="soft-button"
                    href={`#/explorer/${encodeURIComponent(item.id)}/messages`}
                  >
                    Messages
                  </a>
                  <a
                    className="soft-button"
                    href={`#/explorer/${encodeURIComponent(item.id)}/insights`}
                  >
                    Insights
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="module-empty">
            <p>
              No exports yet. Run an export or load an existing messages JSON
              into the Explorer.
            </p>
            <a className="soft-button" href="#/explorer">
              Go to Explorer
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
