import { fmt, shortDate } from "../lib/format";
import type { Job, JobStatus } from "../types";

const ACTIVE = new Set<JobStatus>([
  "queued",
  "resolving",
  "running",
  "stopping",
]);

interface JobListProps {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function JobList({ jobs, selectedId, onSelect }: JobListProps) {
  if (!jobs.length) {
    return <div className="job-empty">No jobs yet this session.</div>;
  }

  return (
    <div className="job-list" aria-label="Recent jobs">
      {jobs.slice(0, 8).map((job) => {
        const stats = job.stats ?? {};
        const config = job.config;
        const active = ACTIVE.has(job.status);
        const mode = job.mode ?? config.mode ?? "author";
        const username = job.author?.username ?? config.author;
        const label =
          mode === "server"
            ? job.guild?.name || `server ${config.server}`
            : mode === "channel"
              ? `#${job.channel?.name || config.channel}`
              : `@${username}`;
        return (
          <button
            key={job.id}
            type="button"
            className={`job-row ${
              selectedId === job.id ? "job-row--active" : ""
            }`}
            aria-pressed={selectedId === job.id}
            onClick={() => onSelect(job.id)}
          >
            <span className="job-row-main">
              <strong>
                {active ? <span className="live-dot" aria-hidden="true" /> : null}
                {label}
              </strong>
              <span>{job.status}</span>
            </span>
            <span className="job-row-meta">
              <span>
                {fmt(stats.ranges_done ?? 0)}/
                {fmt(stats.ranges_total ?? config.ranges)} ranges
              </span>
              {mode === "server" ? (
                <span>
                  {fmt(stats.channels_done ?? 0)}/
                  {fmt(stats.channels_total ?? 0)} channels
                </span>
              ) : null}
              <span>{fmt(stats.pages ?? 0)} pages</span>
              <span>{shortDate(job.created_at)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
