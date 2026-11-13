import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  SyntheticEvent,
} from "react";
import {
  CalendarDays,
  Download,
  FileOutput,
  FolderOutput,
  Gauge,
  ImageMinus,
  ImageUp,
  Image as ImageIcon,
  KeyRound,
  Palette,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { api } from "../api";
import FolderBrowser from "./FolderBrowser";
import { humanizeError } from "../lib/errors";
import {
  applyAppearance,
  COLOR_SCHEME_ORDER,
  COLOR_SCHEMES,
  DEFAULT_APPEARANCE,
  paletteFor,
  prepareBackgroundImage,
} from "../lib/appearance";
import type {
  AppearanceSettings,
  Fields,
  Identity,
  UpdateInfo,
} from "../types";

type Section = "token" | "window" | null;
type SettingsTab = "account" | "export" | "appearance" | "files" | "updates";

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof KeyRound;
}> = [
  { id: "account", label: "Account", icon: KeyRound },
  { id: "export", label: "Export", icon: CalendarDays },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "files", label: "Files", icon: FolderOutput },
  { id: "updates", label: "Updates", icon: RefreshCw },
];

const PALETTE_ROLES = ["Primary", "Accent", "Secondary", "Danger", "Neutral"];

function rangeFill(value: number, min: number, max: number): string {
  const percent = ((value - min) / (max - min)) * 100;
  return `${Math.min(100, Math.max(0, percent))}%`;
}

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
  const [outputDir, setOutputDir] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const folderBrowserRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<SettingsTab>("export");
  const panelsRef = useRef<HTMLDivElement>(null);
  const tabButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [appearance, setAppearance] =
    useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [stagedBackground, setStagedBackground] = useState<string | null>(null);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const appliedAppearance = useRef<{
    appearance: AppearanceSettings;
    backgroundUrl: string | null;
  }>({
    appearance: DEFAULT_APPEARANCE,
    backgroundUrl: null,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !wasOpen.current) {
      setDraft(fields);
      setDraftToken(token || "");
      setError(null);
      setSettingsLoading(true);
      setSettingsReady(false);
      setFolderBrowserOpen(false);
      setStagedBackground(null);
      setRemoveBackground(false);
      setBackgroundBusy(false);
      setTab(initialSection === "token" ? "account" : "export");
      void api
        .settings()
        .then((data) => {
          setOutputDir(data.settings.output_dir);
          setAppearance(data.settings.appearance);
          setBackgroundUrl(data.settings.background_url);
          appliedAppearance.current = {
            appearance: data.settings.appearance,
            backgroundUrl: data.settings.background_url,
          };
          applyAppearance(
            data.settings.appearance,
            data.settings.background_url
          );
          setSettingsReady(true);
        })
        .catch((err: unknown) => setError(humanizeError(err)))
        .finally(() => setSettingsLoading(false));
      void checkUpdates();
      if (!dialog.open) {
        dialog.showModal();
        dialog.scrollTop = 0;
        if (!initialSection) {
          requestAnimationFrame(() => {
            const cancel = dialog.querySelector<HTMLButtonElement>(
              ".settings-actions .glass-button"
            );
            if (cancel) {
              cancel.focus({ preventScroll: true });
            } else {
              dialog.focus();
            }
          });
        }
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

  useEffect(() => {
    if (!folderBrowserOpen) return;
    requestAnimationFrame(() => {
      folderBrowserRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }, [folderBrowserOpen]);

  useEffect(() => {
    if (!open || !settingsReady) return;
    const preview = stagedBackground ?? (removeBackground ? null : backgroundUrl);
    applyAppearance(appearance, preview);
  }, [
    open,
    settingsReady,
    appearance,
    stagedBackground,
    removeBackground,
    backgroundUrl,
  ]);

  async function checkUpdates(force = false) {
    setUpdateLoading(true);
    try {
      const data = await api.update(force);
      setUpdate(data.update);
    } catch (err) {
      setUpdate({
        current_version: "",
        latest_version: null,
        update_available: false,
        release_url: null,
        published_at: null,
        assets: [],
        checked_at: "",
        repository: "",
        error: humanizeError(err),
      });
    } finally {
      setUpdateLoading(false);
    }
  }

  function updateAssetLabel(name: string): string {
    const lower = name.toLowerCase();
    if (lower.endsWith(".zip")) return "Windows portable";
    if (lower.endsWith(".appimage")) return "Linux AppImage";
    if (lower.endsWith(".deb")) return "Linux .deb";
    if (lower.endsWith(".rpm")) return "Linux .rpm";
    if (lower.endsWith(".msi")) return "Windows .msi";
    if (lower.endsWith(".exe")) return "Windows installer";
    return name;
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
    if (!saving) dismiss();
  }

  function dismiss() {
    applyAppearance(
      appliedAppearance.current.appearance,
      appliedAppearance.current.backgroundUrl
    );
    onClose();
  }

  function selectTab(next: SettingsTab) {
    setTab(next);
    requestAnimationFrame(() => {
      panelsRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  function handleTabKey(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    const forward =
      event.key === "ArrowDown" || event.key === "ArrowRight";
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!forward && !backward && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    let nextIndex = forward ? index + 1 : index - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = SETTINGS_TABS.length - 1;
    if (nextIndex < 0) nextIndex = SETTINGS_TABS.length - 1;
    if (nextIndex >= SETTINGS_TABS.length) nextIndex = 0;
    const next = SETTINGS_TABS[nextIndex];
    selectTab(next.id);
    tabButtonsRef.current[nextIndex]?.focus();
  }

  function handleNativeClose() {
    if (open) onClose();
  }

  async function chooseBackgroundImage(file: File | undefined) {
    if (!file) return;
    setBackgroundBusy(true);
    setError(null);
    try {
      const prepared = await prepareBackgroundImage(file);
      setStagedBackground(prepared);
      setRemoveBackground(false);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setBackgroundBusy(false);
      if (backgroundInputRef.current) backgroundInputRef.current.value = "";
    }
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
      if (settingsReady) {
        const payload: {
          output_dir: string;
          appearance: AppearanceSettings;
          background_data_url?: string | null;
        } = {
          output_dir: outputDir.trim(),
          appearance,
        };
        if (stagedBackground) {
          payload.background_data_url = stagedBackground;
        } else if (removeBackground) {
          payload.background_data_url = null;
        }
        const saved = await api.saveSettings(payload);
        appliedAppearance.current = {
          appearance: saved.settings.appearance,
          backgroundUrl: saved.settings.background_url,
        };
        setAppearance(saved.settings.appearance);
        setBackgroundUrl(saved.settings.background_url);
        setStagedBackground(null);
        setRemoveBackground(false);
        applyAppearance(
          saved.settings.appearance,
          saved.settings.background_url
        );
      }
      await onSave(normalized, serverToken ? "" : draftToken);
      onClose();
    } catch (err) {
      setError(humanizeError(err));
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

  const backgroundPreview =
    stagedBackground ?? (removeBackground ? null : backgroundUrl);
  const pendingRemoval = removeBackground && Boolean(backgroundUrl);
  const activePalette = paletteFor(appearance);

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
                Export defaults, appearance, and the token behind them.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={dismiss}
            disabled={saving}
            aria-label="Close settings"
          >
            <X size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div className="settings-body">
          <nav
            className="settings-nav"
            role="tablist"
            aria-label="Settings categories"
            aria-orientation="vertical"
          >
            {SETTINGS_TABS.map((item, index) => {
              const Icon = item.icon;
              const selected = tab === item.id;
              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    tabButtonsRef.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`settings-tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`settings-panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  className="settings-nav-item"
                  onClick={() => selectTab(item.id)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                >
                  <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="settings-panels" ref={panelsRef}>
        {tab === "account" ? (
        <div
          className="settings-panel"
          role="tabpanel"
          id="settings-panel-account"
          aria-labelledby="settings-tab-account"
        >
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
        </div>
        ) : null}

        {tab === "export" ? (
        <div
          className="settings-panel"
          role="tabpanel"
          id="settings-panel-export"
          aria-labelledby="settings-tab-export"
        >
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
            Leave both empty to use the crawl&apos;s full available history.
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
        </div>
        ) : null}

        {tab === "appearance" ? (
        <div
          className="settings-panel"
          role="tabpanel"
          id="settings-panel-appearance"
          aria-labelledby="settings-tab-appearance"
        >
        <section
          className="settings-section"
          aria-labelledby="settings-theme"
        >
          <div className="settings-section-head">
            <Palette size={16} strokeWidth={1.5} aria-hidden="true" />
            <h3 className="settings-section-title" id="settings-theme">
              Color scheme
            </h3>
            <span className="appearance-live-note">
              <span className="appearance-live-dot" aria-hidden="true" />
              Live preview
            </span>
          </div>
          <div
            className="appearance-schemes"
            role="radiogroup"
            aria-label="Color scheme"
          >
            {COLOR_SCHEME_ORDER.map((id) => {
              const selected = appearance.scheme === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`appearance-scheme${selected ? " is-active" : ""}`}
                  onClick={() => {
                    setAppearance((current) => ({ ...current, scheme: id }));
                    setError(null);
                  }}
                >
                  {COLOR_SCHEMES[id].name}
                </button>
              );
            })}
          </div>
          <div
            className="appearance-preview"
            role="img"
            aria-label={`Generated palette: ${PALETTE_ROLES.map(
              (role, index) => `${role} ${activePalette[index]}`
            ).join(", ")}`}
          >
            {activePalette.map((color, index) => (
              <span
                key={`${color}-${index}`}
                style={{ backgroundColor: color }}
                title={PALETTE_ROLES[index]}
              />
            ))}
          </div>

          <div className="appearance-sliders">
            <label className="appearance-slider">
              <span className="appearance-slider-head">
                <span>Colorfulness</span>
                <output>{appearance.colorfulness.toFixed(2)}</output>
              </span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={appearance.colorfulness}
                style={
                  {
                    "--fill": rangeFill(appearance.colorfulness, 0.5, 1.5),
                  } as CSSProperties
                }
                onChange={(event) => {
                  setAppearance((current) => ({
                    ...current,
                    colorfulness: Number(event.target.value),
                  }));
                  setError(null);
                }}
              />
            </label>
            <label className="appearance-slider">
              <span className="appearance-slider-head">
                <span>Brightness</span>
                <output>{appearance.brightness.toFixed(2)}</output>
              </span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={appearance.brightness}
                style={
                  {
                    "--fill": rangeFill(appearance.brightness, 0.5, 1.5),
                  } as CSSProperties
                }
                onChange={(event) => {
                  setAppearance((current) => ({
                    ...current,
                    brightness: Number(event.target.value),
                  }));
                  setError(null);
                }}
              />
            </label>
          </div>
        </section>

        <section
          className="settings-section"
          aria-labelledby="settings-backdrop"
        >
          <div className="settings-section-head">
            <ImageIcon size={16} strokeWidth={1.5} aria-hidden="true" />
            <h3 className="settings-section-title" id="settings-backdrop">
              Backdrop
            </h3>
          </div>
          <div className="settings-subsection">
            <div className="appearance-background-card">
              <div
                className={`appearance-background-preview${
                  backgroundPreview ? "" : " is-empty"
                }`}
                style={
                  backgroundPreview
                    ? { backgroundImage: `url("${backgroundPreview}")` }
                    : undefined
                }
              >
                <span className="appearance-background-badge">
                  {backgroundBusy
                    ? "Preparing image…"
                    : backgroundPreview
                      ? "Custom image"
                      : "Palette gradient"}
                </span>
              </div>
              <div className="appearance-background-bar">
                <span className="appearance-background-note">
                  {backgroundPreview
                    ? "Saved with settings on this server"
                    : "Generated from this palette"}
                </span>
                <div className="appearance-background-actions">
                  <input
                    ref={backgroundInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) =>
                      void chooseBackgroundImage(event.target.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    className="portal-button-soft"
                    disabled={backgroundBusy}
                    onClick={() => backgroundInputRef.current?.click()}
                  >
                    <ImageUp size={14} strokeWidth={1.5} aria-hidden="true" />
                    {backgroundBusy
                      ? "Preparing…"
                      : backgroundPreview
                        ? "Change image"
                        : "Choose image"}
                  </button>
                  {backgroundPreview ? (
                    <button
                      type="button"
                      className="portal-button-soft"
                      disabled={backgroundBusy}
                      onClick={() => {
                        setStagedBackground(null);
                        setRemoveBackground(true);
                        setError(null);
                      }}
                    >
                      <ImageMinus
                        size={14}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      Remove
                    </button>
                  ) : pendingRemoval ? (
                    <button
                      type="button"
                      className="portal-button-soft"
                      onClick={() => setRemoveBackground(false)}
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {backgroundPreview ? (
              <div className="appearance-sliders">
                <label className="appearance-slider">
                  <span className="appearance-slider-head">
                    <span>Background brightness</span>
                    <output>{appearance.background_brightness}%</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    value={appearance.background_brightness}
                    style={
                      {
                        "--fill": rangeFill(
                          appearance.background_brightness,
                          0,
                          200
                        ),
                      } as CSSProperties
                    }
                    onChange={(event) => {
                      setAppearance((current) => ({
                        ...current,
                        background_brightness: Number(event.target.value),
                      }));
                      setError(null);
                    }}
                  />
                </label>
                <label className="appearance-slider">
                  <span className="appearance-slider-head">
                    <span>Background blur</span>
                    <output>{appearance.background_blur}%</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={appearance.background_blur}
                    style={
                      {
                        "--fill": rangeFill(
                          appearance.background_blur,
                          0,
                          100
                        ),
                      } as CSSProperties
                    }
                    onChange={(event) => {
                      setAppearance((current) => ({
                        ...current,
                        background_blur: Number(event.target.value),
                      }));
                      setError(null);
                    }}
                  />
                </label>
              </div>
            ) : null}
            <p className="settings-hint">
              PNG, JPEG, or WebP. Scaled to 1280px and saved with the other
              settings.
              {backgroundPreview
                ? " Lower brightness deepens the overlay; blur softens it behind the glass."
                : ""}
            </p>
          </div>
        </section>
        </div>
        ) : null}

        {tab === "updates" ? (
        <div
          className="settings-panel"
          role="tabpanel"
          id="settings-panel-updates"
          aria-labelledby="settings-tab-updates"
        >
        <section
          className="settings-section"
          aria-labelledby="settings-updates"
        >
          <h3 className="sr-only" id="settings-updates">
            Updates
          </h3>
          <div className="update-panel">
            <div className="update-copy">
              <strong>
                {updateLoading
                  ? "Checking GitHub…"
                  : update?.update_available
                    ? `Version ${update.latest_version} is available`
                    : update?.error
                      ? "Could not check for updates"
                      : update?.latest_version
                        ? `Up to date — v${update.current_version}`
                        : `Version ${update?.current_version || "…"}`}
              </strong>
              <span>
                {update?.error
                  ? update.error
                  : update?.update_available
                    ? `You have v${update.current_version}. A newer release is on GitHub.`
                    : "Checks the latest GitHub release. Nothing is installed automatically."}
              </span>
            </div>
            <button
              type="button"
              className="soft-button"
              onClick={() => void checkUpdates(true)}
              disabled={updateLoading}
            >
              <RefreshCw
                size={14}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {updateLoading ? "Checking…" : "Check now"}
            </button>
          </div>
          {update?.update_available ? (
            <div className="update-actions">
              {update.release_url ? (
                <a
                  className="primary-button"
                  href={update.release_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={15} strokeWidth={1.5} aria-hidden="true" />
                  Open release
                </a>
              ) : null}
              {update.assets
                .filter((asset) =>
                  /\.(zip|appimage|deb|rpm|msi|exe)$/i.test(asset.name)
                )
                .slice(0, 4)
                .map((asset) => (
                  <a
                    className="soft-button"
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    key={asset.name}
                  >
                    <span title={asset.name}>
                      {updateAssetLabel(asset.name)}
                    </span>
                  </a>
                ))}
            </div>
          ) : null}
          <p className="settings-hint">
            Private repositories need a server-side <code>GITHUB_TOKEN</code>{" "}
            for update checks.
          </p>
        </section>
        </div>
        ) : null}

        {tab === "files" ? (
        <div
          className="settings-panel"
          role="tabpanel"
          id="settings-panel-files"
          aria-labelledby="settings-tab-files"
        >
        <section
          className="settings-section"
          aria-labelledby="settings-location"
        >
          <div className="settings-section-head">
            <FolderOutput size={16} strokeWidth={1.5} aria-hidden="true" />
            <h3 className="settings-section-title" id="settings-location">
              Save location
            </h3>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="settings-output-dir">
              Export folder
            </label>
            <div className="settings-path">
              <FolderOutput size={15} strokeWidth={1.5} aria-hidden="true" />
              <input
                id="settings-output-dir"
                className="field-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  settingsLoading
                    ? "Loading…"
                    : "Default job folder"
                }
                value={outputDir}
                disabled={settingsLoading}
                onChange={(event) => {
                  setOutputDir(event.target.value);
                  setError(null);
                }}
              />
              <button
                type="button"
                className="settings-path-browse"
                onClick={() => setFolderBrowserOpen(true)}
                disabled={settingsLoading}
              >
                Browse
              </button>
            </div>
            {outputDir ? (
              <button
                type="button"
                className="settings-path-reset"
                onClick={() => setOutputDir("")}
              >
                Use the default job folder
              </button>
            ) : null}
          </div>
          {folderBrowserOpen ? (
            <div ref={folderBrowserRef}>
              <FolderBrowser
                initialPath={outputDir || undefined}
                onClose={() => setFolderBrowserOpen(false)}
                onSelect={(path) => {
                  setOutputDir(path);
                  setFolderBrowserOpen(false);
                  setError(null);
                }}
              />
            </div>
          ) : null}
          <p className="settings-hint">
            Finished JSON files and downloaded attachments are copied into a
            named folder here. Leave it blank to keep everything inside the
            job folder. <code>~/Exports</code> is accepted.
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
        </div>
        ) : null}
          </div>
        </div>

        {error ? (
          <p className="console-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="settings-actions">
          <button
            type="button"
            className="glass-button"
            onClick={dismiss}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={saving || settingsLoading}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
