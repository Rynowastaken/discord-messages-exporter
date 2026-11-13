import { useMemo, useState } from "react";
import { fmt } from "../lib/format";

interface Bucket {
  label: string;
  count: number;
}

interface ActivityChartProps {
  days: Array<{ day: string; count: number }>;
}

function bucketsFor(days: Array<{ day: string; count: number }>): Bucket[] {
  const sorted = [...days]
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.day))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!sorted.length) return [];
  const counts = new Map(sorted.map((entry) => [entry.day, entry.count]));
  const first = sorted[0].day;
  const last = sorted[sorted.length - 1].day;
  const firstMs = Date.parse(`${first}T00:00:00Z`);
  const lastMs = Date.parse(`${last}T00:00:00Z`);
  const spanDays = Math.round((lastMs - firstMs) / 86_400_000) + 1;
  if (spanDays <= 260) {
    const buckets: Bucket[] = [];
    for (
      let cursor = firstMs;
      cursor <= lastMs;
      cursor += 86_400_000
    ) {
      const label = new Date(cursor).toISOString().slice(0, 10);
      buckets.push({ label, count: counts.get(label) ?? 0 });
    }
    return buckets;
  }
  const months: Bucket[] = [];
  const start = new Date(firstMs);
  const end = new Date(lastMs);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  while (
    year < end.getUTCFullYear() ||
    (year === end.getUTCFullYear() && month <= end.getUTCMonth())
  ) {
    const label = `${year}-${String(month + 1).padStart(2, "0")}`;
    let count = 0;
    for (const entry of sorted) {
      if (entry.day.startsWith(`${label}-`)) count += entry.count;
    }
    months.push({ label, count });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

export default function ActivityChart({ days }: ActivityChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => bucketsFor(days), [days]);
  const width = 720;
  const height = 190;
  const pad = 8;
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const step = buckets.length > 1 ? width / (buckets.length - 1) : width;
  const points = buckets.map((bucket, index) => ({
    x: buckets.length > 1 ? index * step : width / 2,
    y: height - (bucket.count / max) * (height - pad * 2) - pad,
    bucket,
  }));
  const line = points
    .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const selected = hover !== null ? buckets[hover] : null;
  const monthly = buckets[0]?.label.length === 7;
  const peak = buckets.reduce(
    (best, bucket) => (bucket.count > best.count ? bucket : best),
    buckets[0] ?? { label: "—", count: 0 }
  );

  if (!buckets.length) {
    return (
      <div className="chart-empty">
        <p>No dated messages for this selection.</p>
      </div>
    );
  }

  return (
    <article className="insight-panel insight-panel--wide">
      <header className="insight-panel-head">
        <div>
          <span className="module-kicker">Activity</span>
          <h2>Messages over time</h2>
        </div>
        <p>
          {monthly ? "Monthly buckets" : "Daily buckets"} · peak{" "}
          <strong>{fmt(peak.count)}</strong> on {peak.label}
        </p>
      </header>

      {buckets.length === 1 ? (
        <div className="activity-single">
          <span className="activity-single-bar" aria-hidden="true" />
          <div>
            <strong>{fmt(buckets[0].count)}</strong>
            <span>{buckets[0].label}</span>
          </div>
        </div>
      ) : (
        <div className="activity-chart">
          <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Messages over time. Peak ${peak.count} on ${peak.label}.`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="activity-fill-start" />
              <stop offset="100%" className="activity-fill-end" />
            </linearGradient>
          </defs>
          <line
            x1="0"
            y1={height - pad}
            x2={width}
            y2={height - pad}
            className="activity-axis"
          />
          <path d={area} fill="url(#activityFill)" />
          <path d={line} className="activity-line" />
          {buckets.length <= 60
            ? points.map((point) => (
                <circle
                  key={`dot-${point.bucket.label}`}
                  cx={point.x}
                  cy={point.y}
                  r="2.2"
                  className="activity-point"
                />
              ))
            : null}
          {points.map((point, index) => (
            <g key={point.bucket.label}>
              <rect
                x={Math.max(0, point.x - step / 2)}
                y={0}
                width={Math.max(2, step)}
                height={height}
                className="activity-hit"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                role="button"
                aria-label={`${point.bucket.label}: ${point.bucket.count} messages`}
              />
              {hover === index ? (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  className="activity-dot"
                />
              ) : null}
            </g>
          ))}
        </svg>
        <div className="activity-readout" aria-live="polite">
          {selected
            ? `${selected.label} · ${fmt(selected.count)} messages`
            : `${buckets[0]?.label} → ${buckets[buckets.length - 1]?.label}`}
        </div>
        </div>
      )}

      <details className="chart-data">
        <summary>Bucket-by-bucket</summary>
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                <th scope="col">{monthly ? "Month" : "Day"}</th>
                <th scope="col">Messages</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.label}>
                  <td>{bucket.label}</td>
                  <td>{fmt(bucket.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}
