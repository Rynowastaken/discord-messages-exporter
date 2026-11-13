import { useMemo } from "react";
import { fmt } from "../lib/format";

interface PostingClockProps {
  cells: Array<{ weekday: number; hour: number; count: number }>;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function PostingClock({ cells }: PostingClockProps) {
  const grid = useMemo(() => {
    const values = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const cell of cells) {
      const row = (cell.weekday + 6) % 7; // SQLite: 0 = Sunday.
      if (row < 0 || row > 6 || cell.hour < 0 || cell.hour > 23) continue;
      values[row][cell.hour] = cell.count;
      if (cell.count > max) max = cell.count;
    }
    return { values, max: Math.max(1, max) };
  }, [cells]);

  const total = grid.values.flat().reduce((sum, value) => sum + value, 0);
  if (!total) {
    return (
      <div className="chart-empty">
        <p>No dated messages for this selection.</p>
      </div>
    );
  }

  const busiest = grid.values.reduce(
    (best, row, weekday) =>
      row.reduce(
        (rowBest, count, hour) =>
          count > rowBest.count ? { weekday, hour, count } : rowBest,
        best
      ),
    { weekday: 0, hour: 0, count: 0 }
  );

  return (
    <article className="insight-panel">
      <header className="insight-panel-head">
        <div>
          <span className="module-kicker">Posting clock</span>
          <h2>When the archive is active</h2>
        </div>
        <p>
          Busiest {WEEKDAYS[busiest.weekday]} at{" "}
          {String(busiest.hour).padStart(2, "0")}:00 UTC ·{" "}
          {fmt(busiest.count)}{" "}
          {busiest.count === 1 ? "message" : "messages"}
        </p>
      </header>

      <div className="clock-scroll">
        <div className="clock-grid" role="img" aria-label="Messages by weekday and hour">
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="clock-hour">
              {hour % 6 === 0 ? String(hour).padStart(2, "0") : ""}
            </span>
          ))}
          {grid.values.map((row, weekday) => (
            <div className="clock-row" key={WEEKDAYS[weekday]}>
              <span className="clock-day">{WEEKDAYS[weekday]}</span>
              {row.map((count, hour) => {
                const ratio = count / grid.max;
                return (
                  <span
                    key={hour}
                    className="clock-cell"
                    style={{
                      background:
                        count === 0
                          ? "rgba(255,255,255,.035)"
                          : `color-mix(in srgb, var(--primary) ${Math.round(
                              (0.12 + ratio * 0.78) * 100
                            )}%, transparent)`,
                    }}
                    title={`${WEEKDAYS[weekday]} ${String(hour).padStart(
                      2,
                      "0"
                    )}:00 · ${fmt(count)} messages`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="clock-legend">
        <span>quiet</span>
        <span className="clock-legend-bar" aria-hidden="true" />
        <span>busy</span>
      </div>
      <p className="sr-only">
        Busiest hour is {WEEKDAYS[busiest.weekday]} at{" "}
        {String(busiest.hour).padStart(2, "0")}:00 with {busiest.count}{" "}
        messages.
      </p>
    </article>
  );
}
