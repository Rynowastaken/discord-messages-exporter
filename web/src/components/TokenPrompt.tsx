import { useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "../api";
import type { TokenStatus } from "../types";

interface TokenPromptProps {
  open: boolean;
  onClose: () => void;
  onConnected: (status: TokenStatus) => void;
}

export default function TokenPrompt({
  open,
  onClose,
  onConnected,
}: TokenPromptProps) {
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [token, setToken] = useState("");
  const [isBot, setIsBot] = useState(false);
  const [remember, setRemember] = useState(true);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    setError(null);
    setToken("");
    setVisible(false);
    void api
      .tokenStatus()
      .then((value) => {
        setStatus(value);
        setIsBot(value.is_bot);
        setRemember(value.storage === "os-keychain");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const shell = document.querySelector(".shell");
    shell?.setAttribute("inert", "");
    window.addEventListener("keydown", onKey);
    return () => {
      shell?.removeAttribute("inert");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const keychain = status?.storage === "os-keychain";
  const envConfigured = status?.source === "env";
  const stored = status?.source === "stored";

  async function connect() {
    if (!token.trim()) {
      setError("Paste a Discord token first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.setToken(token.trim(), isBot, remember);
      setToken("");
      onConnected(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function pasteToken() {
    try {
      const text = await navigator.clipboard.readText();
      setToken(text.trim());
      setError(null);
      inputRef.current?.focus();
    } catch {
      setError("Clipboard access was blocked. Paste with Ctrl+V instead.");
    }
  }

  async function forget() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.clearToken();
      setStatus(result);
      onConnected(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="token-gate"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="token-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tokenTitle"
        aria-describedby="tokenCopy"
        ref={dialogRef}
      >
        <div className="token-dialog-head">
          <span className="token-icon" aria-hidden="true">
            <KeyRound size={20} strokeWidth={1.5} />
          </span>
          <div>
            <span className="module-kicker">Discord connection</span>
            <h2 id="tokenTitle">Connect your account</h2>
          </div>
          <button
            type="button"
            className="token-close"
            aria-label="Close token prompt"
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <p className="token-copy" id="tokenCopy">
          The token lets the local server read the servers and messages you can
          already see. It is sent only to this machine.
        </p>

        {envConfigured ? (
          <div className="token-status-card">
            <ShieldCheck size={17} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <strong>Configured by the server</strong>
              <span>
                DISCORD_TOKEN is set. Change it in the service environment.
              </span>
            </div>
          </div>
        ) : (
          <>
            <label className="token-field" htmlFor="discordToken">
              <span className="token-field-label">
                Discord token
                <span className="token-required">required</span>
              </span>
              <span className="token-input">
                <KeyRound
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="token-input-icon"
                />
                <input
                  id="discordToken"
                  ref={inputRef}
                  type={visible ? "text" : "password"}
                  value={token}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your token"
                  aria-describedby="tokenHelp"
                  onChange={(event) => setToken(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (token.trim()) void connect();
                    }
                  }}
                />
                <button
                  type="button"
                  className="token-input-action"
                  aria-label={visible ? "Hide token" : "Show token"}
                  title={visible ? "Hide token" : "Show token"}
                  onClick={() => setVisible((value) => !value)}
                >
                  {visible ? (
                    <EyeOff size={15} strokeWidth={1.5} />
                  ) : (
                    <Eye size={15} strokeWidth={1.5} />
                  )}
                </button>
                <button
                  type="button"
                  className="token-input-action token-paste"
                  onClick={() => void pasteToken()}
                >
                  <ClipboardPaste size={14} strokeWidth={1.5} aria-hidden="true" />
                  Paste
                </button>
              </span>
              <span className="token-help" id="tokenHelp">
                Bot tokens need the Bot option. User tokens are sent as-is.
              </span>
            </label>

            <fieldset className="token-segment">
              <legend>Token type</legend>
              <div>
                <button
                  type="button"
                  aria-pressed={!isBot}
                  onClick={() => setIsBot(false)}
                >
                  User
                </button>
                <button
                  type="button"
                  aria-pressed={isBot}
                  onClick={() => setIsBot(true)}
                >
                  Bot
                </button>
              </div>
            </fieldset>

            <label
              className={`token-remember${keychain ? "" : " token-remember--disabled"}`}
              title={
                keychain
                  ? "Save in the operating system keychain"
                  : "No OS keychain is available on this server"
              }
            >
              <span className="token-remember-icon" aria-hidden="true">
                <ShieldCheck size={17} strokeWidth={1.5} />
              </span>
              <span className="token-remember-copy">
                <strong>Remember on this device</strong>
                <small>
                  {keychain
                    ? "Saved in the OS keychain"
                    : "No OS keychain — memory only"}
                </small>
              </span>
              <input
                type="checkbox"
                className="token-switch"
                checked={remember && keychain}
                disabled={!keychain}
                onChange={(event) => setRemember(event.target.checked)}
              />
            </label>

            <details className="token-help-box">
              <summary>Where do I find my token?</summary>
              <p>
                Bot token: Discord Developer Portal → your app → Bot → Reset
                Token. User token: use the token your exporter already uses.
                The browser never stores it.
              </p>
            </details>

            {stored ? (
              <div className="token-saved-row">
                <span>An existing token is saved on this device.</span>
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => void forget()}
                  disabled={loading}
                >
                  Forget saved token
                </button>
              </div>
            ) : null}

            {error ? (
              <p className="token-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="token-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void connect()}
                disabled={loading || !token.trim()}
              >
                <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" />
                {loading ? "Connecting…" : "Connect"}
              </button>
              <button
                type="button"
                className="soft-button"
                onClick={onClose}
              >
                Browse without a token
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
