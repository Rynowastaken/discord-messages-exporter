import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  FileJson2,
  FolderOutput,
  History,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api";
import ExportForm from "../components/ExportForm";
import JobMonitor from "../components/JobMonitor";
import JobList from "../components/JobList";
import SectionHeading from "../components/SectionHeading";
import type { UseJobs } from "../hooks/useJobs";
import { compact, plural, shortDate } from "../lib/format";
import type { ExportSummary, Identity, Job, StartPayload } from "../types";

interface ConsolePageProps {
  jobsState: UseJobs;
  activeJob?: Job;
  sessionToken: string;
  sessionIsBot: boolean;
  identity: Identity | null;
  identityError: string | null;
  identityLoading: boolean;
  onStart: (payload: StartPayload) => Promise<Job>;
  onToken: (token: string, isBot: boolean) => Promise<Identity | null>;
  onRequestToken: () => void;
}

export default function ConsolePage({
  jobsState,
  activeJob,
  sessionToken,
  sessionIsBot,
  identity,
  identityError,
  identityLoading,
  onStart,
  onToken,
  onRequestToken,
}: ConsolePageProps) {
  const {
    jobs,
    serverToken,
    serverTokenIsBot,
    job,
    selectedId,
    setSelectedId,
    stopJob,
    resumeJob,
    error,
  } = jobsState;
  const [recent, setRecent] = useState<ExportSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .exports()
      .then((data) => {
        if (!cancelled) setRecent(data.exports.slice(0, 4));
      })
      .catch(() => {
        // The lower deck is a shortcut list; the Explorer stays authoritative.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section
        className="section console-page"
        id="export"
        aria-labelledby="exportHeading"
      >
        <div className="section-heading">
          <SectionHeading
            id="exportHeading"
            title="Export console"
            meta="Runs the exporter on this machine. The token is used once and never written to disk."
          />
        </div>

        {error ? (
          <p className="console-error" role="alert">
            Server: {error}
          </p>
        ) : null}

        <ExportForm
            serverToken={serverToken}
            serverTokenIsBot={serverTokenIsBot}
            sessionToken={sessionToken}
            identity={identity}
            identityError={identityError}
            identityLoading={identityLoading}
            statusLoading={jobsState.loading}
            serverOnline={jobsState.serverOnline}
            onToken={onToken}
            onStart={onStart}
          busy={Boolean(activeJob)}
          onRequestToken={onRequestToken}
        />
          {job || jobs.length ? (
            <div className="console-monitor-row">
              <JobMonitor
                job={job}
                serverToken={serverToken}
                sessionToken={sessionToken}
                sessionIsBot={sessionIsBot}
                onStop={stopJob}
                onResume={resumeJob}
              />
              {jobs.length ? (
                <JobList
                  jobs={jobs}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : null}
            </div>
          ) : null}
          {!job && !jobs.length ? (
            <div className="console-lower">
              <section
                className="console-lower-panel console-history-panel"
                aria-labelledby="historyHeading"
              >
                <header className="console-panel-head">
                  <div>
                    <span className="module-kicker">Library</span>
                    <h3 id="historyHeading">Recent exports</h3>
                  </div>
                  <History size={17} strokeWidth={1.5} aria-hidden="true" />
                </header>
                {recent.length ? (
                  <div className="console-recent-list">
                    {recent.map((item) => (
                      <a
                        className="console-recent-row"
                        key={item.id}
                        href={`#/explorer/${encodeURIComponent(item.id)}/messages`}
                      >
                        <span className="console-recent-icon" aria-hidden="true">
                          <FileJson2 size={16} strokeWidth={1.5} />
                        </span>
                        <span className="console-recent-copy">
                          <strong>{item.name}</strong>
                          <span>
                            {item.message_count === null
                              ? "not indexed"
                              : plural(item.message_count, "message", "messages")}{" "}
                            · {shortDate(item.modified_at)}
                          </span>
                        </span>
                        <span className="console-recent-count">
                          {compact(item.size_bytes)}
                          <ArrowUpRight
                            size={13}
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="console-empty-state">
                    <span className="console-empty-icon" aria-hidden="true">
                      <History size={18} strokeWidth={1.5} />
                    </span>
                    <strong>No exports yet</strong>
                    <p>
                      Start one above. Finished archives will appear here and
                      in the Explorer.
                    </p>
                  </div>
                )}
              </section>

              <aside
                className="console-lower-panel console-workspace-panel"
                aria-labelledby="workspaceHeading"
              >
                <header className="console-panel-head">
                  <div>
                    <span className="module-kicker">Workspace</span>
                    <h3 id="workspaceHeading">Where it goes</h3>
                  </div>
                  <FolderOutput size={17} strokeWidth={1.5} aria-hidden="true" />
                </header>
                <dl className="workspace-facts">
                  <div>
                    <dt>Output</dt>
                    <dd>
                      <code>web/runs/&lt;job&gt;/messages.json</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>JSON, with attachment metadata optional.</dd>
                  </div>
                  <div>
                    <dt>Resume</dt>
                    <dd>Completed ranges are reused, never fetched twice.</dd>
                  </div>
                  <div>
                    <dt>Privacy</dt>
                    <dd>
                      <ShieldCheck
                        size={13}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      The token is never written to disk.
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>
          ) : null}
      </section>
    </>
  );
}
