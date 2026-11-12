import { Download, Play, Square } from "lucide-react";
import RangeMap from "../charts/RangeMap";
import ThroughputChart from "../charts/ThroughputChart";
import { bytes, duration, fmt, shortDate } from "../lib/format";
import type {
  ChartRun,
  Job,
  JobStatus,
  ThroughputPoint,
  ThroughputSample,
} from "../types";

const ACTIVE = new Set<JobStatus>([
  "queued",
  "resolving",
  "running",
  "stopping",
]);
const RESUMABLE = new Set<JobStatus>(["stopped", "partial", "failed"]);

const LABELS: Record<JobStatus, string> = {
  queued: "queued",
  resolving: "resolving",
  running: "running",
  stopping: "stopping",
  stopped: "stopped",
  done: "done",
  partial: "partial",
  failed: "failed",
  empty: "empty",
};

function perMinute(samples?: ThroughputSample[]): ThroughputPoint[] {
  if (!samples?.length) return [];
  const buckets = new Map<number, number>();
  for (const sample of samples) {
    const minute = Math.floor(Number(sample.t) / 60);
    buckets.set(minute, Number(sample.pages) || 0);
  }
  const minutes = [...buckets.keys()].sort((a, b) => a - b);
  const points: ThroughputPoint[] = [];
  let previous = 0;
  for (const minute of minutes) {
    const cumulative = buckets.get(minute) ?? 0;
    points.push({ minute, pages: Math.max(0, cumulative - previous) });
    previous = cumulative;
  }
  return points;
}

interface JobMonitorProps {
  job: Job | null;
  serverToken: boolean;
  sessionToken: string;
  sessionIsBot: boolean;
  onStop: (id: string) => Promise<Job>;
  onResume: (id: string, token: string, isBot: boolean) => Promise<Job>;
}

export default function JobMonitor({
  job,
  serverToken,
  sessionToken,
  sessionIsBot,
  onStop,
  onResume,
}: JobMonitorProps) {
  if (!job) {
    return (
      <div className="job-empty">
        <span className="job-empty-title">No export running</span>
        <span>Start one above to watch progress and throughput here.</span>
      </div>
    );
  }

  const stats = job.stats ?? {};
  const config = job.config;
  const mode = job.mode ?? config.mode ?? "author";
  const active = ACTIVE.has(job.status);
  const resumable = RESUMABLE.has(job.status);
  const total =
    stats.ranges_total || (mode === "server" ? 0 : config.ranges || 0);
  const done = stats.ranges_done || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const username =
    job.author?.username || job.author?.global_name || config.author;
  const channel = job.channel?.name || config.channel;
  const channelsTotal = stats.channels_total ?? job.channels?.length ?? 0;
  const channelsDone = stats.channels_done ?? 0;
  const identityLabel =
    mode === "server"
      ? `${job.guild?.name || "server"} · ${fmt(channelsTotal)} channels`
      : mode === "channel"
        ? `#${channel}`
        : `@${username} · ${channel}`;

  const attachment = job.attachment_download;
  const attachmentDone = attachment
    ? attachment.downloaded + attachment.skipped + attachment.failed
    : 0;
  const points = perMinute(job.throughput);
  const peak = points.reduce((max, point) => Math.max(max, point.pages), 0);
  const elapsed = Number(stats.elapsed) || 0;
  const avg = elapsed ? (Number(stats.pages) || 0) / (elapsed / 60) : 0;
  const liveRun: ChartRun = {
    id: job.id,
    tint: "primary",
    author_username: username,
    label: identityLabel,
    status: job.status,
    ranges: job.ranges ?? [],
    ranges_total: total,
    ranges_done: done,
    pages: Number(stats.pages) || 0,
    pages_in_workdir: Number(stats.pages) || 0,
    elapsed,
    rate_limited: stats.rate_limited,
    configured: { workers: config.workers, rate: config.rate },
    throughput: points,
    throughput_peak: peak,
    throughput_avg: Number(avg.toFixed(1)),
  };

  return (
    <div className="job-monitor">
      <div className="job-monitor-head">
        <div className="job-identity">
          <span>{identityLabel}</span>
          <span className="job-id">
            job {job.id} · {shortDate(job.created_at)}
          </span>
        </div>
        <span className="job-status" data-status={job.status}>
          {active ? <span className="live-dot" aria-hidden="true" /> : null}
          {LABELS[job.status] || job.status}
        </span>
      </div>

      <div className="job-progress">
        <span>
          <strong>{pct}%</strong>
          <span>
            {fmt(done)}/{fmt(total)} ranges
            {mode === "server"
              ? ` · ${fmt(channelsDone)}/${fmt(channelsTotal)} channels`
              : ""}
          </span>
        </span>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Ranges completed"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span>
          <span>
            {fmt(stats.pages)} pages · {fmt(stats.messages_matched)}{" "}
            {mode === "server" ? "messages" : "matched"} ·{" "}
            {fmt(stats.pages_per_second)} p/s
          </span>
          <span>
            {active && job.eta_seconds
              ? `ETA ${duration(job.eta_seconds)}`
              : ""}
          </span>
        </span>
      </div>

      <div className="job-stats">
        <div className="job-stat">
          <span className="job-stat-value">{fmt(stats.pages)}</span>
          <span className="job-stat-label">pages</span>
        </div>
        <div className="job-stat">
          <span className="job-stat-value">{fmt(stats.messages_matched)}</span>
          <span className="job-stat-label">
            {mode === "server" ? "messages" : "matched"}
          </span>
        </div>
        <div className="job-stat">
          <span className="job-stat-value">{fmt(stats.messages_scanned)}</span>
          <span className="job-stat-label">scanned</span>
        </div>
        {mode === "server" ? (
          <div className="job-stat">
            <span className="job-stat-value">
              {fmt(channelsDone)}/{fmt(channelsTotal)}
            </span>
            <span className="job-stat-label">channels</span>
          </div>
        ) : null}
        <div className="job-stat">
          <span className="job-stat-value">{fmt(stats.rate_limited)}</span>
          <span className="job-stat-label">429s</span>
        </div>
        <div className="job-stat">
          <span className="job-stat-value">{duration(stats.elapsed)}</span>
          <span className="job-stat-label">elapsed</span>
        </div>
        <div className="job-stat">
          <span className="job-stat-value">
            {job.assembly ? bytes(job.assembly.size_bytes) : "—"}
          </span>
          <span className="job-stat-label">output</span>
        </div>
        {job.config.download_attachments ? (
          <div className="job-stat">
            <span className="job-stat-value">
              {attachment
                ? `${fmt(attachmentDone)}/${fmt(attachment.total)}`
                : "—"}
            </span>
            <span className="job-stat-label">files</span>
          </div>
        ) : null}
      </div>

      {job.stage === "attachments" && attachment ? (
        <div className="job-message" role="status">
          Archiving attachments {fmt(attachmentDone)}/{fmt(attachment.total)}{" "}
          · {bytes(attachment.bytes)}
          {attachment.failed ? ` · ${fmt(attachment.failed)} failed` : ""}
        </div>
      ) : null}

      <div className="job-actions">
        {active ? (
          <button
            type="button"
            className="danger-button"
            disabled={job.status === "stopping"}
            onClick={() => {
              onStop(job.id).catch(() => {});
            }}
          >
            <Square size={16} strokeWidth={1.5} aria-hidden="true" />
            Stop
          </button>
        ) : null}

        {resumable ? (
          serverToken || sessionToken ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                onResume(job.id, sessionToken, sessionIsBot).catch(() => {});
              }}
            >
              <Play size={16} strokeWidth={1.5} aria-hidden="true" />
              Resume
            </button>
          ) : (
            <span className="console-note">
              Add a token in the export form to resume this job.
            </span>
          )
        ) : null}

        {job.output ? (
          <>
            <a
              className="soft-button"
              href={`#/explorer/job-${encodeURIComponent(
                job.id
              )}/messages`}
            >
              Explore
            </a>
            <a
              className="glass-button"
              href={job.output.download_url}
              download={
                job.output.download_name || `messages_${config.author}.json`
              }
            >
              <Download size={16} strokeWidth={1.5} aria-hidden="true" />
              Download JSON
            </a>
          </>
        ) : null}
      </div>

      {job.attachment_error ? (
        <div className="job-message job-message--warn" role="status">
          {job.attachment_error}
        </div>
      ) : null}

      {job.error ? (
        <div
          className={`job-message ${
            job.status === "failed" ? "job-message--error" : "job-message--warn"
          }`}
          role="status"
        >
          {job.error}
          {job.errors?.length ? (
            <ul>
              {job.errors.slice(0, 5).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {(job.status === "done" || job.status === "partial") && job.assembly ? (
        <div className="job-message" role="status">
          Assembled {fmt(job.assembly.total)} messages
          {mode === "server"
            ? ` from ${fmt(
                job.channels?.filter((item) => item.status === "done").length ||
                  0
              )} channels`
            : ""}{" "}
          ·{" "}
          {job.config.download_attachments
            ? attachment
              ? `${fmt(attachment.downloaded)} files archived${
                  attachment.skipped
                    ? ` · ${fmt(attachment.skipped)} existing`
                    : ""
                }${attachment.failed ? ` · ${fmt(attachment.failed)} failed` : ""}`
              : `${fmt(job.assembly.attachments)} attachment records`
            : `${fmt(job.assembly.attachments)} attachment records (metadata only)`}{" "}
          · {bytes(job.assembly.size_bytes)}
          {job.status === "done" ? " · exit 0" : " · partial"}
        </div>
      ) : null}

      {active && !job.ranges?.length && mode !== "server" ? (
        <p className="console-note">
          {mode === "channel"
            ? "Resolving the channel. Range markers will appear as workers finish them."
            : "Resolving the author and channel. Range markers will appear as workers finish them."}
        </p>
      ) : null}

      {active && mode === "server" && !job.channels?.length ? (
        <p className="console-note">
          Resolving the server&apos;s text channels. Channel progress will appear
          as each one starts.
        </p>
      ) : null}

      {mode === "server" && job.channels?.length ? (
        <div className="channel-progress" aria-label="Channels in this export">
          {job.channels.map((item) => (
            <div
              className="channel-progress-row"
              key={item.id}
              data-status={item.status}
            >
              <span className="channel-progress-dot" aria-hidden="true" />
              <span className="channel-progress-name">#{item.name}</span>
              <span className="channel-progress-meta">
                {fmt(item.ranges_done || 0)}/{fmt(item.ranges_total || 0)} ranges
                {" · "}
                {item.status}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {job.ranges?.length || points.length > 1 ? (
        <div className="job-live">
          {job.ranges?.length ? <RangeMap run={liveRun} /> : null}
          {points.length > 1 ? <ThroughputChart run={liveRun} /> : null}
        </div>
      ) : null}
    </div>
  );
}
