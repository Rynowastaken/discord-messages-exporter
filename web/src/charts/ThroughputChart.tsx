import { duration, fmt, runTint } from "../lib/format";
import type { ChartRun } from "../types";

// The configured pace, not a fixed reference: 6 req/s is 360 pages/min, but
// the console allows 0.5–10 req/s.
const BAR_ALPHA = 0.42;

interface ThroughputChartProps {
  run: ChartRun;
}

export default function ThroughputChart({ run }: ThroughputChartProps) {
  const points = run.throughput ?? [];
  const peak =
    run.throughput_peak ??
    points.reduce((max, point) => Math.max(max, point.pages), 0);
  const configured = run.configured ?? {};
  const rate = Number(configured.rate);
  const reference = Number.isFinite(rate) && rate > 0 ? rate * 60 : null;
  const maxY = Math.max(peak, reference || 0) * 1.08;
  const tint = runTint(run) === "primary" ? "var(--primary)" : "var(--accent)";
  const barColor = `color-mix(in srgb, ${tint} ${Math.round(
    BAR_ALPHA * 100
  )}%, transparent)`;
  const refBottom = reference ? (reference / maxY) * 100 : null;
  const rateLimited = run.rate_limited;
  const pagesInWorkdir = run.pages_in_workdir ?? run.pages;
  const titleId = `throughput-title-${run.id}`;
  const rateLimitedRecorded = rateLimited !== null && rateLimited !== undefined;

  return (
    <article className="panel" aria-labelledby={titleId}>
      <header className="panel-head">
        <div>
          <h3 className="panel-title" id={titleId}>
            {run.author_username}
          </h3>
          <p className="panel-sub">
            {fmt(run.pages)} pages over {duration(run.elapsed)}
          </p>
        </div>
        <span className="run-status">{run.status ?? "not recorded"}</span>
      </header>

      <div className="panel-body">
        <div className="throughput-stats">
          <div className="throughput-stat">
            <span>average pages/min</span>
            <strong>{fmt(run.throughput_avg)}</strong>
          </div>
          <div className="throughput-stat">
            <span>peak pages/min</span>
            <strong>{fmt(peak)}</strong>
          </div>
          <div className="throughput-stat">
            <span>rate-limit hits</span>
            <strong>
              {rateLimitedRecorded ? fmt(rateLimited) : "not recorded"}
            </strong>
          </div>
        </div>

        {points.length > 0 ? (
          <div className="throughput-bars">
            {points.map((point) => (
              <span
                key={point.minute}
                className="throughput-bar"
                style={{
                  height: `${(point.pages / maxY) * 100}%`,
                  background: barColor,
                }}
                title={`minute ${point.minute}: ${fmt(point.pages)} pages`}
              />
            ))}
            {reference && refBottom !== null ? (
              <span
                className="throughput-ref"
                style={{ bottom: `${refBottom}%` }}
              >
                {rate} req/s · {fmt(reference)} pages/min
              </span>
            ) : null}
          </div>
        ) : (
          <p className="note-line">No throughput samples recorded for this run.</p>
        )}

        <div className="throughput-axis">
          <span>0 min</span>
          <span>{points.length} min</span>
        </div>

        {points.length > 0 ? (
          <details className="chart-data">
            <summary>Minute-by-minute</summary>
            <div className="chart-table-wrap">
              <table className="chart-table">
                <caption className="sr-only">
                  Pages per minute for {run.author_username ?? "this run"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Minute</th>
                    <th scope="col">Pages</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.minute}>
                      <td>{point.minute}</td>
                      <td>{fmt(point.pages)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </div>

      <div className="panel-foot">
        <p className="note-line">
          {duration(run.elapsed)} elapsed · {fmt(pagesInWorkdir)} pages in workdir ·{" "}
          {configured.workers ?? "—"} workers at {configured.rate ?? "—"} req/s
        </p>
        <p className="sr-only">
          Throughput for {run.author_username ?? "this run"}: average{" "}
          {fmt(run.throughput_avg)} pages per minute, peak {fmt(peak)} pages per
          minute.{" "}
          {rateLimitedRecorded
            ? `${fmt(rateLimited)} rate-limit hits were recorded.`
            : "Rate-limit hits were not recorded."}{" "}
          {fmt(pagesInWorkdir)} pages are in the work directory; the run used{" "}
          {configured.workers ?? "an unrecorded number of"} workers at{" "}
          {configured.rate ?? "an unrecorded"} requests per second.
        </p>
      </div>
    </article>
  );
}
