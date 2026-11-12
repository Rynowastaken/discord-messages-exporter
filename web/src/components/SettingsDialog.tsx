import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode, SyntheticEvent } from "react";
import { CalendarDays, FileOutput, Gauge, KeyRound, Settings2, X } from "lucide-react";
import type { Fields, Identity } from "../types";

type Section = "token" | "window" | null;

interface SettingsDialogProps {
  open: boolean;
  fields: Fields;
  token: string;
  serverToken: boolean;
  serverTokenIsBot: boolean;
  identity: Identity | null;
  identityError: string | null;
  identityLoading: boolean;
  initialSection: Section;
  onClose: () => void;
  onSave: (fields: Fields, token: string) => Promise<void>;
}

function validateDraft(draft: Fields): string | null {
  const ranges = Number(draft.ranges);
  if (!Number.isInteger(ranges) || ranges < 1 || ranges > 1000) {
    return "Ranges must be a whole number from 1 to 1000.";
  }
  const workers = Number(draft.workers);
  if (!Number.isInteger(workers) || workers < 1 || workers > 32) {
    return "Workers must be a whole number from 1 to 32.";
  }
  const rate = Number(draft.rate);
  if (!Number.isFinite(rate) || rate < 0.5 || rate > 10) {
    return "Pace must be between 0.5 and 10 requests per second.";
  }
  if (draft.since && draft.until && draft.since > draft.until) {
    return "Since must be on or before Until.";
  }
  return null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function SettingsDialog({
  open,
  fields,
  token,
  serverToken,
  serverTokenIsBot,
  identity,
  identityError,
  identityLoading,
  initialSection,
  onClose,
  onSave,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wasOpen = useRef(false);
  const [draft, setDraft] = useState<Fields>(fields);
  const [draftToken, setDraftToken] = useState(token || "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !wasOpen.current) {
      setDraft(fields);
      setDraftToken(token || "");
      setError(null);
      if (!dialog.open) {
        dialog.showModal();
        dialog.scrollTop = 0;
        if (initialSection) {
          requestAnimationFrame(() => {
            const sectionId =
              initialSection === "token" ? "settings-token" : "settings-window";
            const section = document.getElementById(sectionId);
            if (!section) return;
            section.scrollIntoView({ block: "start" });
            const inputId =
              initialSection === "token"
                ? "settings-token-input"
                : "settings-since";
            const input = document.getElementById(inputId);
            if (input) {
              input.focus({ preventScroll: true });
            } else {
              section.setAttribute("tabindex", "-1");
              section.focus({ preventScroll: true });
            }
          });
        }
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
    wasOpen.current = open;
  }, [open, fields, token, initialSection]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function set<K extends keyof Fields>(name: K, value: Fields[K]) {
    setDraft((current) => ({ ...current, [name]: value }));
    setError(null);
  }

  function chooseAttachmentMode(mode: "files" | "metadata" | "exclude") {
    setDraft((current) => ({
      ...current,
      include_attachments: mode !== "exclude",
      download_attachments: mode === "files",
    }));
    setError(null);
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!saving) onClose();
  }

  function handleNativeClose() {
    if (open) onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const normalized: Fields = {
        ...draft,
        ranges: Number(draft.ranges),
        workers: Number(draft.workers),
        rate: Number(draft.rate),
      };
      await onSave(normalized, serverToken ? "" : draftToken);
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  const tokenDraftChanged =
    !serverToken && draftToken.trim() !== (token || "").trim();

  let identityLine: ReactNode;
  if (serverToken) {
    if (identity) {
      identityLine = (
        <>
          Server token: @{identity.username}
          {identity.bot ? " · bot" : ""}
        </>
      );
    } else if (identityLoading) {
      identityLine = "Checking the server token…";
    } else if (identityError) {
      identityLine = (
        <span className="settings-identity-error">{identityError}</span>
      );
    } else {
      identityLine = "Server token configured.";
    }
  } else if (tokenDraftChanged) {
    identityLine = error
      ? "The token was not saved. Fix it and try again."
      : draftToken.trim()
        ? "The new token will be verified when you save."
        : "The saved token will be forgotten when you save.";
  } else if (identity) {
    identityLine = (
      <>
        Signed in as @{identity.username}
        {identity.bot ? " · bot" : ""}
      </>
    );
  } else if (identityLoading) {
    identityLine = "Checking the token…";
  } else if (identityError) {
    identityLine = (
      <span className="settings-identity-error">{identityError}</span>
    );
  } else if (draftToken.trim()) {
    identityLine = "Token not verified yet.";
  } else {
    identityLine = "No token configured.";
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={handleCancel}
      onClose={handleNativeClose}
    >
      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="settings-head">
          <div className="settings-heading">
            <span className="settings-icon-tile" aria-hidden="true">
              <Settings2 size={20} strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="settings-title" id="settings-title">
                Settings
              </h2>
              <p className="settings-sub">
                Export defaults and the token used to run them.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close settings"
          >
            <X size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <section className="settings-section" aria-labelledby="settings-token">
          <div className="settings-section-head">
            <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" />
            <h3 className="settings-section-title" id="settings-token">
              Discord token
            </h3>
          </div>
          {serverToken ? (
            <p className="settings-hint">
              Using the server&apos;s DISCORD_TOKEN
              {serverTokenIsBot ? " (bot token)" : " (user token)"}. Change it on
              the server; the token itself is never sent to the browser.
            </p>
          ) : (
            <>
              <label className="field" htmlFor="settings-token-input">
                <span className="field-label">Token</span>
                <input
                  id="settings-token-input"
                  className="field-input"
                  type="password"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="Bot or user token"
                  value={draftToken}
                  onChange={(event) => {
                    setDraftToken(event.target.value);
                    setError(null);
                  }}
                />
              </label>
              <label className="settings-check">
                <span className="settings-check-copy">
                  <strong>Bot token</strong>
                  <small>Send this token with the Bot prefix.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.is_bot}
                  onChange={(event) => set("is_bot", event.target.checked)}
                />
              </label>
              <p className="settings-hint">
                Held in memory for this session only — never saved or logged.
                It goes only to your local server, which uses it for Discord.
                User tokens are self-botting; prefer a bot token.
              </p>
            </>
          )}
          <p className="settings-identity">{identityLine}</p>
          {!serverToken && draftToken ? (
            <button
              type="button"
              className="portal-button-soft"
              onClick={() => {
                setDraftToken("");
                setError(null);
              }}
            >
              Forget token
            </button>
          ) : null}
        </section>

        <section className="settings-section" aria-labelledby="settings-window">
          <div className="settings-section-head">
            <CalendarDays size={16} strokeWidth={1.5} aria-hidden="true" />
            <h3 className="settings-section-title" id="settings-window">
              Date window
            </h3>
          </div>
          <div className="settings-grid settings-grid--2">
            <label className="field" htmlFor="settings-since">
              <span className="field-label">Since</span>
              <input
                id="settings-since"
                className="field-input"
                type="date"
                value={draft.since}
                onChange={(event) => set("since", event.target.value)}
              />
            </label>
            <label className="field" htmlFor="settings-until">
              <span className="field-label">Until</span>
              <input
                id="settings-until"
                className="field-input"
                type="date"
                value={draft.until}
                onChange={(event) => set("until", event.target.value)}
              />
            </label>
          </div>
          <p className="settings-hint">
            Leave both empty to export the channel&apos;s full history for this
            author.
          </p>
        </section>

        <section className="settings-section" aria-labelledby="settings-crawl">
          <div className="settings-section-head">
            <Gauge size={16} strokeWidth={1.5} aria-hidden="true" />
            <h3 className="settings-section-title" id="settings-crawl">
              Crawl
            </h3>
          </div>
          <div className="settings-grid">
            <label className="field" htmlFor="settings-ranges">
              <span className="field-label">Ranges</span>
              <input
                id="settings-ranges"
                className="field-input"
                type="number"
                min="1"
                max="1000"
                value={draft.ranges}
                onChange={(event) => set("ranges", event.target.value)}
              />
            </label>
            <label className="field" htmlFor="settings-workers">
              <span className="field-label">Workers</span>
              <input
                id="settings-workers"
                className="field-input"
                type="number"
                min="1"
                max="32"
                value={draft.workers}
                onChange={(event) => set("workers", event.target.value)}
              />
            </label>
            <label className="field" htmlFor="settings-rate">
              <span className="field-label">Pace (req/s)</span>
              <input
                id="settings-rate"
                className="field-input"
                type="number"
                min="0.5"
                max="10"
                step="0.5"
                value={draft.rate}
                onChange={(event) => set("rate", event.target.value)}
              />
            </label>
          </div>
          <p className="settings-hint">
            Ranges split the ID window; workers fetch them in parallel.
            Discord&apos;s practical ceiling is about 8–10 requests per second.
            In whole-server mode, ranges apply to each channel.
          </p>
        </section>

        <section className="settings-section" aria-labelledby="settings-output">
          <div className="settings-section-head">
            <FileOutput size={16} strokeWidth={1.5} aria-hidden="true" />
            <h3 className="settings-section-title" id="settings-output">
              Output
            </h3>
          </div>
          <div
            className="settings-checks"
            role="radiogroup"
            aria-label="Attachment handling"
          >
            <label className="settings-check">
              <span className="settings-check-copy">
                <strong>Metadata only</strong>
                <small>
                  Names, sizes, and CDN URLs. Fast and small; photos stay on
                  Discord and their links expire.
                </small>
              </span>
              <input
                type="radio"
                name="attachment-mode"
                checked={
                  draft.include_attachments && !draft.download_attachments
                }
                onChange={() => chooseAttachmentMode("metadata")}
              />
            </label>
            <label className="settings-check">
              <span className="settings-check-copy">
                <strong>Download files</strong>
                <small>
                  Copies images and other attachments into this export&apos;s
                  folder. Uses disk space and adds a download pass after the
                  crawl.
                </small>
              </span>
              <input
                type="radio"
                name="attachment-mode"
                checked={
                  draft.include_attachments && draft.download_attachments
                }
                onChange={() => chooseAttachmentMode("files")}
              />
            </label>
            <label className="settings-check">
              <span className="settings-check-copy">
                <strong>Exclude attachments</strong>
                <small>Leaves attachment records out of the JSON entirely.</small>
              </span>
              <input
                type="radio"
                name="attachment-mode"
                checked={!draft.include_attachments}
                onChange={() => chooseAttachmentMode("exclude")}
              />
            </label>
          </div>
          <p className="settings-hint">
            Downloaded files are stored with the job and served from the
            console, so photos keep working after Discord&apos;s signed links
            expire.
          </p>
          <div className="settings-checks">
            <label className="settings-check">
              <span className="settings-check-copy">
                <strong>Check total against search</strong>
                <small>
                  Adds one search request to compare the exported count.
                  Author mode only.
                </small>
              </span>
              <input
                type="checkbox"
                checked={draft.check_total}
                onChange={(event) => set("check_total", event.target.checked)}
              />
            </label>
          </div>
        </section>

        {error ? (
          <p className="console-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="settings-actions">
          <button
            type="button"
            className="glass-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
