import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { fmt, runTint, snowflakeDate } from "../lib/format";
import type { ChartRun } from "../types";

// Swatch tints run from the quietest cell (10%) to the busiest (65%).
const LEGEND_TINTS = [0.1, 0.21, 0.32, 0.43, 0.54, 0.65];

function cellAlpha(share?: number): number {
  const s = Number.isFinite(share) ? Math.min(Math.max(share ?? 0, 0), 1) : 0;
  return 0.1 + s * 0.55;
}

interface RangeMapProps {
  run: ChartRun;
}

export default function RangeMap({ run }: RangeMapProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const cellRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const tint = runTint(run) === "primary" ? "var(--primary)" : "var(--accent)";
  const tintAt = (alpha: number) =>
    `color-mix(in srgb, ${tint} ${Math.round(alpha * 100)}%, transparent)`;
  const ranges = run.ranges ?? [];
  const activeRange =
    activeIndex === null
      ? null
      : ranges.find((range) => range.index === activeIndex) ?? null;
  const titleId = `range-map-title-${run.id}`;

  function moveFocus(next: number) {
    if (!ranges.length) return;
    const clamped = Math.max(0, Math.min(ranges.length - 1, next));
    setFocusIndex(clamped);
    setActiveIndex(clamped);
    cellRefs.current.get(clamped)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(ranges.length - 1);
    }
  }

  return (
    <article className="panel" aria-labelledby={titleId}>
      <header className="panel-head">
        <div>
          <h3 className="panel-title" id={titleId}>
            {run.author_username}
          </h3>
          <p className="panel-sub">
            {run.ranges_done}/{run.ranges_total} ranges · {fmt(run.pages)} pages
          </p>
        </div>
        <span className="run-status">{run.status ?? "not recorded"}</span>
      </header>

      <div className="panel-body">
        {ranges.length > 0 ? (
          <div
            className="range-grid"
            role="group"
            aria-label={`ID ranges for ${run.author_username ?? "this run"}`}
          >
            {ranges.map((range) => {
              const isActive = range.index === activeIndex;
              return (
                <button
                  key={range.index}
                  type="button"
                  ref={(node) => {
                    if (node) cellRefs.current.set(range.index, node);
                    else cellRefs.current.delete(range.index);
                  }}
                  className={`range-cell${isActive ? " range-cell--active" : ""}`}
                  style={{
                    background: tintAt(cellAlpha(range.share)),
                  }}
                  aria-label={`Range ${range.index + 1}: ${fmt(
                    range.pages
                  )} pages, ${fmt(range.matched)} matched`}
                  aria-pressed={isActive}
                  tabIndex={range.index === focusIndex ? 0 : -1}
                  onKeyDown={(event) => onKeyDown(event, range.index)}
                  onMouseEnter={() => setActiveIndex(range.index)}
                  onFocus={() => {
                    setFocusIndex(range.index);
                    setActiveIndex(range.index);
                  }}
                  onClick={() => {
                    setFocusIndex(range.index);
                    setActiveIndex(range.index);
                  }}
                />
              );
            })}
          </div>
        ) : (
          <p className="note-line">No ranges recorded for this run.</p>
        )}

        <div className="range-detail" aria-live="polite" aria-atomic="true">
          {activeRange ? (
            <div className="range-detail-grid">
              <div>
                <span className="range-key">Range</span>
                <span className="range-value">
                  {activeRange.index + 1} of {run.ranges_total}
                </span>
              </div>
              <div>
                <span className="range-key">ID window</span>
                <span className="range-value">
                  {snowflakeDate(activeRange.lo)} → {snowflakeDate(activeRange.hi)}
                </span>
              </div>
              <div>
                <span className="range-key">Pages</span>
                <span className="range-value">{fmt(activeRange.pages)}</span>
              </div>
              <div>
                <span className="range-key">Matched</span>
                <span className="range-value">{fmt(activeRange.matched)}</span>
              </div>
            </div>
          ) : (
            <p className="note-line">Select or focus a range to inspect it.</p>
          )}
        </div>
      </div>

      <div className="panel-foot">
        <div className="range-legend">
          <span className="legend-label">fewer pages</span>
          {LEGEND_TINTS.map((alpha) => (
            <span
              key={alpha}
              className="legend-swatch"
              style={{ background: tintAt(alpha) }}
              aria-hidden="true"
            />
          ))}
          <span className="legend-label">more pages</span>
        </div>
        <p className="note-line">
          No gaps, no overlaps — every id belongs to exactly one range.
        </p>
      </div>

      <p className="sr-only">
        Range map for {run.author_username ?? "this run"}: {fmt(run.ranges_total)}{" "}
        contiguous ID ranges covering {fmt(run.pages)} pages,{" "}
        {fmt(run.ranges_done)} of them done. The grid is one tab stop; use the
        arrow keys to move between ranges, Home and End to jump to the edges. The
        detail strip follows focus.
      </p>
    </article>
  );
}
