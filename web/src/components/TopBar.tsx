import { useEffect, useState } from "react";
import {
  Archive,
  FolderOpen,
  LayoutDashboard,
  Radio,
} from "lucide-react";
import { api } from "../api";
import { compact } from "../lib/format";
import type { ExportSummary } from "../types";

interface TopBarProps {
  section: "dashboard" | "export" | "explorer";
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
  tokenSet,
  onTokenClick,
}: TopBarProps) {
  const [exports, setExports] = useState<ExportSummary[]>([]);

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
          <span className="identity-eyebrow">discord-messages-exporter</span>
          <span className="identity-name">Archive Console</span>
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
              className="sidebar-export"
              href={`#/explorer/${encodeURIComponent(item.id)}/messages`}
              title={item.name}
            >
              <span>{item.name}</span>
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
