import { useEffect, useState } from "react";
import {
  Archive,
  Download,
  FolderOpen,
  LayoutDashboard,
  Radio,
} from "lucide-react";
import { api } from "../api";
import { exportScopeLine } from "../lib/exportView";
import { compact } from "../lib/format";
import type { ExportSummary, UpdateInfo } from "../types";

interface TopBarProps {
  section: "dashboard" | "export" | "explorer";
  exportId?: string;
  tokenSet: boolean;
  onTokenClick: () => void;
}

const LINKS = [
  {
    key: "dashboard",
    href: "#/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  { key: "export", href: "#/export", label: "Export", icon: Radio },
  { key: "explorer", href: "#/explorer", label: "Explorer", icon: FolderOpen },
] as const;

export default function TopBar({
  section,
  exportId,
  tokenSet,
  onTokenClick,
}: TopBarProps) {
  const [exports, setExports] = useState<ExportSummary[]>([]);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .update()
      .then((data) => {
        if (!cancelled) setUpdate(data.update);
      })
      .catch(() => {
        // Update checks are optional and never block the console.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .exports()
      .then((data) => {
        if (!cancelled) setExports(data.exports.slice(0, 4));
      })
      .catch(() => {
        // The sidebar shortcut list is optional.
      });
    return () => {
      cancelled = true;
    };
  }, [section]);

  return (
    <aside className="sidebar">
      <a className="identity" href="#/" aria-label="Dashboard">
        <span className="avatar-tile" aria-hidden="true">
          <Archive size={20} strokeWidth={1.5} />
        </span>
        <span className="identity-copy">
          <span className="identity-name">Message Exporter</span>
        </span>
      </a>

      <nav className="side-nav" aria-label="Modules">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.key}
              href={link.href}
              className="side-link"
              aria-current={section === link.key ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
              <span>{link.label}</span>
            </a>
          );
        })}
      </nav>

      {exports.length ? (
        <div className="sidebar-recent">
          <span className="sidebar-label">Recent exports</span>
          {exports.map((item) => (
            <a
              key={item.id}
              className={`sidebar-export${
                item.id === exportId ? " sidebar-export--active" : ""
              }`}
              href={`#/explorer/${encodeURIComponent(item.id)}/messages`}
              aria-current={item.id === exportId ? "page" : undefined}
              title={`${item.name} · ${exportScopeLine(item)}`}
            >
              <span>{item.name}</span>
              <span className="sidebar-export-source">
                {exportScopeLine(item)}
              </span>
              <span>
                {item.message_count === null
                  ? item.status
                  : `${compact(item.message_count)} messages`}
              </span>
            </a>
          ))}
          <a className="sidebar-all" href="#/explorer">
            All exports
          </a>
        </div>
      ) : null}

      <div className="sidebar-foot">
        {update?.update_available ? (
          <a
            className="sidebar-update"
            href={update.release_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            title="Open the latest GitHub release"
          >
            <Download size={13} strokeWidth={1.5} aria-hidden="true" />
            Update v{update.latest_version}
          </a>
        ) : null}
        <button
          type="button"
          className="sidebar-token"
          onClick={onTokenClick}
          title={tokenSet ? "Manage Discord token" : "Connect a Discord token"}
        >
          <span
            className={`token-dot${tokenSet ? " token-dot--on" : ""}`}
            aria-hidden="true"
          />
          {tokenSet ? "Token connected" : "Set token"}
        </button>
        <span>MIT</span>
      </div>
    </aside>
  );
}
