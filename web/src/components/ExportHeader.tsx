import { ArrowLeft, Download } from "lucide-react";
import { api } from "../api";
import { bytes, compact, shortDate } from "../lib/format";
import { exportModeLabel } from "../lib/exportView";
import type { ExportSummary } from "../types";

interface ExportHeaderProps {
  item: ExportSummary;
  active: "messages" | "insights";
}

export default function ExportHeader({ item, active }: ExportHeaderProps) {
  const base = `#/explorer/${encodeURIComponent(item.id)}`;
  return (
    <>
      <header className="export-page-head">
        <div className="export-page-title">
          <div className="export-page-topline">
            <a className="back-link" href="#/explorer">
              <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
              Explorer
            </a>
            <span className="export-kind">
              {item.kind === "job" ? "Job" : "Loaded"}
            </span>
          </div>
          <h1 className="export-page-name">{item.name}</h1>
          <p className="export-page-meta">
            {exportModeLabel(item)}
            {item.metadata?.mode === "author" &&
            item.metadata?.target_user_id
              ? ` · user ${item.metadata.target_user_id}`
              : ""}
            {item.metadata?.mode === "server" &&
            item.metadata.channels?.length
              ? ` · ${item.metadata.channels.length} ${
                  item.metadata.channels.length === 1
                    ? "channel"
                    : "channels"
                }`
              : ""}{" "}
            · {bytes(item.size_bytes)} ·{" "}
            {item.message_count === null
              ? item.status
              : `${compact(item.message_count)} messages`}{" "}
            · modified {shortDate(item.modified_at)}
          </p>
        </div>
        <a
          className="glass-button"
          href={api.exportDownloadUrl(item.id)}
          download
        >
          <Download size={16} strokeWidth={1.5} aria-hidden="true" />
          Download JSON
        </a>
      </header>

      <nav className="export-subnav" aria-label="Export views">
        <a
          href={`${base}/messages`}
          aria-current={active === "messages" ? "page" : undefined}
        >
          Messages
        </a>
        <a
          href={`${base}/insights`}
          aria-current={active === "insights" ? "page" : undefined}
        >
          Insights
        </a>
      </nav>
    </>
  );
}
