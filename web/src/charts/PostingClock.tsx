import { useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { fmt } from "../lib/format";

export interface ClockSelection {
  /** SQLite weekday: 0 = Sunday … 6 = Saturday. */
  weekday: number;
  hour: number;
}

interface PostingClockProps {
  cells: Array<{ weekday: number; hour: number; count: number }>;
  selected?: ClockSelection | null;
  onSelect?: (selection: ClockSelection | null) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function sqliteWeekday(row: number): number {
  return row === 6 ? 0 : row + 1;
}

export default function PostingClock({
  cells,
  selected = null,
  onSelect,
}: PostingClockProps) {
  const [hover, setHover] = useState<{
    row: number;
    hour: number;
    count: number;
  } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
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
  const interactive = Boolean(onSelect);
  const selectedRow = selected
    ? (selected.weekday + 6) % 7
    : null;
  const selectedCount =
    selectedRow === null || !selected
      ? null
      : grid.values[selectedRow][selected.hour] ?? 0;
  const selectedLabel = selected
    ? `${WEEKDAYS[(selected.weekday + 6) % 7]} ${String(
        selected.hour
      ).padStart(2, "0")}:00 UTC`
    : null;
  const readout = hover
    ? `${WEEKDAYS[hover.row]} ${String(hover.hour).padStart(
        2,
        "0"
      )}:00 UTC · ${fmt(hover.count)} ${
        hover.count === 1 ? "message" : "messages"
      }`
    : selectedLabel
      ? `${selectedLabel} · ${fmt(selectedCount ?? 0)} ${
          selectedCount === 1 ? "message" : "messages"
        }${interactive ? " · click again to clear" : ""}`
      : interactive
        ? "Click a cell to show messages from that weekday and hour."
        : "Hover a cell to read its message count.";

  return (
    <article className="insight-panel clock-panel">
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

      <p className="clock-caption">
        Each cell is one hour of the week. Brighter cells have more messages.
        Times are UTC.
      </p>

      <div className="clock-scroll">
        <div
          className="clock-grid"
          role={interactive ? "group" : "img"}
          aria-label="Messages by weekday and hour, UTC"
        >
          <span className="clock-axis-title">UTC</span>
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="clock-hour">
              {hour % 3 === 0 || hour === 23
                ? String(hour).padStart(2, "0")
                : ""}
            </span>
          ))}
          {grid.values.map((row, weekday) => (
            <div className="clock-row" key={WEEKDAYS[weekday]}>
              <span className="clock-day">{WEEKDAYS[weekday]}</span>
              {row.map((count, hour) => {
                const ratio = count / grid.max;
                const isSelected =
                  selectedRow === weekday && selected?.hour === hour;
                const style = {
                  background:
                    count === 0
                      ? "rgba(255,255,255,.035)"
                      : `color-mix(in srgb, var(--primary) ${Math.round(
                          (0.12 + ratio * 0.78) * 100
                        )}%, transparent)`,
                };
                const title = `${WEEKDAYS[weekday]} ${String(
                  hour
                ).padStart(2, "0")}:00 UTC · ${fmt(count)} messages`;
                const shared = {
                  className: `clock-cell${
                    interactive ? " clock-cell--interactive" : ""
                  }${isSelected ? " clock-cell--selected" : ""}`,
                  style,
                  onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => {
                    setHover({ row: weekday, hour, count });
                    setPointer({ x: event.clientX, y: event.clientY });
                  },
                  onMouseMove: (event: ReactMouseEvent<HTMLElement>) => {
                    setPointer({ x: event.clientX, y: event.clientY });
                  },
                  onMouseLeave: () => {
                    setHover(null);
                    setPointer(null);
                  },
                };
                if (!interactive) {
                  return (
                    <span key={hour} {...shared} aria-hidden="true" />
                  );
                }
                return (
                  <button
                    key={hour}
                    type="button"
                    {...shared}
                    aria-pressed={isSelected}
                    aria-label={`${title}${isSelected ? ", selected" : ""}`}
                    onFocus={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setHover({ row: weekday, hour, count });
                      setPointer({
                        x: rect.left + rect.width / 2,
                        y: rect.bottom,
                      });
                    }}
                    onBlur={() => {
                      setHover(null);
                      setPointer(null);
                    }}
                    onClick={() =>
                      onSelect?.(
                        isSelected
                          ? null
                          : { weekday: sqliteWeekday(weekday), hour }
                      )
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="clock-legend">
        <span>fewer</span>
        <span className="clock-legend-bar" aria-hidden="true" />
        <span>more messages</span>
        <span className="clock-legend-note">per hour · UTC</span>
      </div>
      <p className="clock-readout" aria-live="polite">
        {readout}
      </p>
      <p className="sr-only">
        Busiest hour is {WEEKDAYS[busiest.weekday]} at{" "}
        {String(busiest.hour).padStart(2, "0")}:00 with {busiest.count}{" "}
        messages.
      </p>
      {hover && pointer
        ? createPortal(
            <div
              className="clock-tooltip"
              role="tooltip"
              style={{
                left: Math.min(pointer.x + 12, window.innerWidth - 190),
                top: Math.min(pointer.y + 14, window.innerHeight - 76),
              }}
            >
              <strong>
                {WEEKDAYS[hover.row]} {String(hover.hour).padStart(2, "0")}:00
                UTC
              </strong>
              <span>
                {fmt(hover.count)}{" "}
                {hover.count === 1 ? "message" : "messages"}
              </span>
              {interactive ? <em>Click to filter</em> : null}
            </div>,
            document.body
          )
        : null}
    </article>
  );
}
