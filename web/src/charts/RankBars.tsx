import { compact, fmt } from "../lib/format";

interface RankBarsProps {
  kicker: string;
  title: string;
  items: Array<{ id?: string; name: string; count: number }>;
  unit: string;
  limit?: number;
}

export default function RankBars({
  kicker,
  title,
  items,
  unit,
  limit = 8,
}: RankBarsProps) {
  const rows = items.slice(0, limit);
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return null;
  return (
    <article className="insight-panel">
      <header className="insight-panel-head">
        <div>
          <span className="module-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="rank-list">
        {rows.map((row, index) => (
          <div className="rank-row" key={row.id ?? `${row.name}-${index}`}>
            <span className="rank-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="rank-label" title={row.name}>
              {row.name}
            </span>
            <span className="rank-track">
              <span
                className="rank-fill"
                style={{ width: `${row.count === 0 ? 0 : Math.max(3, (row.count / max) * 100)}%` }}
              />
            </span>
            <span className="rank-value">
              {compact(row.count)}
              <span className="sr-only"> {unit}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="insight-foot">
        {fmt(rows.reduce((sum, row) => sum + row.count, 0))} {unit} shown
      </p>
    </article>
  );
}
