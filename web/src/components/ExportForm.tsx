import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Crosshair,
  Hash,
  KeyRound,
  Play,
  Search,
  Server,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { api } from "../api";
import { humanizeError } from "../lib/errors";
import { fmt, shortDate } from "../lib/format";
import SettingsDialog from "./SettingsDialog";
import SelectMenu from "./SelectMenu";
import Avatar from "./Avatar";
import type {
  ChannelOption,
  ExportMode,
  Fields,
  GuildOption,
  Identity,
  InfoResponse,
  Job,
  SelectOption,
  StartPayload,
  UserOption,
} from "../types";

// Kept from the original name so saved form selections survive the rename.
const STORAGE_KEY = "discord-author-export.settings.v1";

const MODES: Array<[ExportMode, string]> = [
  ["author", "One author"],
  ["channel", "Whole channel"],
  ["server", "Whole server"],
];

const DEFAULTS: Fields = {
  mode: "author",
  channel: "",
  author: "",
  server: "",
  since: "",
  until: "",
  ranges: 140,
  workers: 8,
  rate: 6,
  include_attachments: true,
  download_attachments: false,
  check_total: true,
  is_bot: false,
};

function errorMessage(err: unknown): string {
  return humanizeError(err);
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function loadFields(): Fields {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}"
    ) as Record<string, unknown>;
    const mode: ExportMode =
      saved.mode === "author" ||
      saved.mode === "channel" ||
      saved.mode === "server"
        ? saved.mode
        : "author";
    return {
      mode,
      channel: typeof saved.channel === "string" ? saved.channel : "",
      author: typeof saved.author === "string" ? saved.author : "",
      server: typeof saved.server === "string" ? saved.server : "",
      since: typeof saved.since === "string" ? saved.since : "",
      until: typeof saved.until === "string" ? saved.until : "",
      ranges: clampNumber(saved.ranges, 140, 1, 1000),
      workers: clampNumber(saved.workers, 8, 1, 32),
      rate: clampNumber(saved.rate, 6, 0.5, 10),
      include_attachments: saved.include_attachments !== false,
      download_attachments:
        saved.download_attachments === true &&
        saved.include_attachments !== false,
      check_total: saved.check_total !== false,
      is_bot: Boolean(saved.is_bot),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function windowValue(fields: Fields): string {
  if (fields.since && fields.until) return `${fields.since} → ${fields.until}`;
  if (fields.since) return `Since ${fields.since}`;
  if (fields.until) return `Until ${fields.until}`;
  return "Full history";
}

function userLabel(member: UserOption): string {
  return member.nick || member.global_name || member.username || member.id;
}

interface ExportFormProps {
  serverToken: boolean;
  serverTokenIsBot: boolean;
  sessionToken: string;
  identity: Identity | null;
  identityError: string | null;
  identityLoading: boolean;
  statusLoading: boolean;
  serverOnline: boolean;
  onToken: (token: string, isBot: boolean) => Promise<Identity | null>;
  onStart: (payload: StartPayload) => Promise<Job>;
  onRequestToken: () => void;
  busy: boolean;
}

export default function ExportForm({
  serverToken,
  serverTokenIsBot,
  sessionToken,
  identity,
  identityError,
  identityLoading,
  statusLoading,
  serverOnline,
  onToken,
  onStart,
  onRequestToken,
  busy,
}: ExportFormProps) {
  const [fields, setFields] = useState<Fields>(loadFields);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "token" | "window" | null
  >(null);
  const [lookup, setLookup] = useState<InfoResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [focusAfterSave, setFocusAfterSave] = useState(false);
  const [manualIds, setManualIds] = useState(false);
  const [guilds, setGuilds] = useState<GuildOption[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [guildsError, setGuildsError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [members, setMembers] = useState<UserOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [userPlacement, setUserPlacement] = useState<"top" | "bottom">("bottom");
  const channelRef = useRef<HTMLInputElement>(null);
  const authorRef = useRef<HTMLInputElement>(null);
  const serverRef = useRef<HTMLInputElement>(null);
  const serverSelectRef = useRef<HTMLButtonElement>(null);
  const channelSelectRef = useRef<HTMLButtonElement>(null);
  const userInputRef = useRef<HTMLInputElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const addTokenRef = useRef<HTMLButtonElement>(null);
  const connectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
    } catch {
      // A browser with storage disabled still runs the export.
    }
  }, [fields]);

  const hasToken = Boolean(serverToken || sessionToken);
  const tokenUsable =
    hasToken && !identityLoading && !identityError && !statusLoading && serverOnline;
  const mode = fields.mode;
  const channelMissing = mode !== "server" && !fields.channel.trim();
  const authorMissing = mode === "author" && !fields.author.trim();
  const serverMissing = mode === "server" && !fields.server.trim();
  const idsReady = !channelMissing && !authorMissing && !serverMissing;
  const setupBlocked = !tokenUsable || !idsReady;

  const showManual = manualIds || !tokenUsable;

  let idRequirement: string | null = null;
  if (mode === "server") {
    idRequirement = serverMissing
      ? showManual
        ? "Add the server ID to continue."
        : "Choose a server to continue."
      : null;
  } else if (mode === "channel") {
    idRequirement = channelMissing
      ? showManual
        ? "Add the channel ID to continue."
        : "Choose a channel to continue."
      : null;
  } else if (channelMissing && authorMissing) {
    idRequirement = showManual
      ? "Add a channel ID and author ID to continue."
      : "Choose a channel and author to continue.";
  } else if (channelMissing) {
    idRequirement = showManual
      ? "Add the channel ID to continue."
      : "Choose a channel to continue.";
  } else if (authorMissing) {
    idRequirement = showManual
      ? "Add the author ID to continue."
      : "Choose an author to continue.";
  }

  const lookupLabel =
    mode === "server"
      ? "Check server"
      : mode === "channel"
        ? "Check channel"
        : "Check message count";
  const browseToken = serverToken ? undefined : sessionToken || undefined;
  const browseError = guildsError || channelsError || membersError;
  const serverOptions: SelectOption[] = guilds.map((guild) => ({
    value: guild.id,
    label: guild.name,
    avatar: { src: guild.icon_url, name: guild.name, round: false },
  }));
  if (fields.server && !guilds.some((guild) => guild.id === fields.server)) {
    serverOptions.unshift({ value: fields.server, label: fields.server });
  }
  const channelOptions: SelectOption[] = channels.map((channel) => ({
    value: channel.id,
    label: `#${channel.name}`,
  }));
  if (
    fields.channel &&
    !channels.some((channel) => channel.id === fields.channel)
  ) {
    channelOptions.unshift({ value: fields.channel, label: fields.channel });
  }
  const filteredMembers = (() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      [member.nick, member.global_name, member.username, member.id].some(
        (value) => String(value || "").toLowerCase().includes(query)
      )
    );
  })();
  const showMemberList =
    userOpen && !selectedUser && filteredMembers.length > 0;

  useEffect(() => {
    if (!tokenUsable || manualIds) return undefined;
    let cancelled = false;
    setGuildsLoading(true);
    setGuildsError(null);
    api
      .browse({
        kind: "guilds",
        token: browseToken,
        is_bot: fields.is_bot,
      })
      .then((data) => {
        if (!cancelled) setGuilds(data.guilds ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGuildsError(errorMessage(err));
          setManualIds(true);
        }
      })
      .finally(() => {
        if (!cancelled) setGuildsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tokenUsable, manualIds, browseToken, fields.is_bot]);

  useEffect(() => {
    if (!tokenUsable || manualIds || mode === "server" || !fields.server) {
      setChannelsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setChannelsLoading(true);
    setChannelsError(null);
    api
      .browse({
        kind: "channels",
        server: fields.server,
        token: browseToken,
        is_bot: fields.is_bot,
      })
      .then((data) => {
        if (!cancelled) setChannels(data.channels ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setChannelsError(errorMessage(err));
          setManualIds(true);
        }
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tokenUsable, manualIds, mode, fields.server, browseToken, fields.is_bot]);

  useEffect(() => {
    if (
      !tokenUsable ||
      manualIds ||
      mode === "server" ||
      fields.server ||
      !fields.channel.trim()
    ) {
      return undefined;
    }
    let cancelled = false;
    api
      .info({
        mode: "channel",
        channel: fields.channel.trim(),
        token: browseToken,
        is_bot: fields.is_bot,
      })
      .then((data) => {
        if (cancelled || !data.guild?.id) return;
        const server = String(data.guild.id);
        setFields((current) =>
          current.server ? current : { ...current, server }
        );
      })
      .catch(() => {
        // The ID can still be typed manually if the channel is not resolvable.
      });
    return () => {
      cancelled = true;
    };
  }, [
    tokenUsable,
    manualIds,
    mode,
    fields.server,
    fields.channel,
    browseToken,
    fields.is_bot,
  ]);

  useEffect(() => {
    if (!tokenUsable || manualIds || mode !== "author" || !fields.channel) {
      setMembers([]);
      setMembersError(null);
      setMembersLoading(false);
      return undefined;
    }
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(null);
    api
      .browse({
        kind: "authors",
        channel: fields.channel,
        token: browseToken,
        is_bot: fields.is_bot,
      })
      .then((data) => {
        if (!cancelled) setMembers(data.authors ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMembers([]);
          setMembersError(errorMessage(err));
          setManualIds(true);
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tokenUsable, manualIds, mode, fields.channel, browseToken, fields.is_bot]);

  useEffect(() => {
    if (!userOpen) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!userRef.current?.contains(event.target as Node)) setUserOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [userOpen]);

  // Restored settings and typed IDs only carry a snowflake. When the author
  // list arrives, replace the raw number with the person's name.
  useEffect(() => {
    if (selectedUser || !fields.author) return;
    const match = members.find((member) => member.id === fields.author);
    if (match) setSelectedUser(match);
  }, [members, fields.author, selectedUser]);

  const startReason = !tokenUsable
    ? "connection-state"
    : busy && !started
      ? "busy-reason"
      : !idsReady
        ? "export-requirement"
        : undefined;
  const lookupReason = !tokenUsable
    ? "connection-state"
    : !idsReady
      ? "export-requirement"
      : undefined;
  const serverName =
    guilds.find((guild) => guild.id === fields.server)?.name ||
    fields.server ||
    "";
  const channelName =
    channels.find((channel) => channel.id === fields.channel)?.name ||
    fields.channel ||
    "";
  const authorName = selectedUser
    ? userLabel(selectedUser)
    : fields.author
      ? `Author ${fields.author}`
      : "";
  const scopeTitle =
    mode === "server"
      ? "Whole server"
      : mode === "channel"
        ? "Whole channel"
        : "One author";
  const targetTitle =
    mode === "server"
      ? serverName || "Choose a server"
      : mode === "channel"
        ? channelName
          ? `#${channelName}`
          : "Choose a channel"
        : authorName
          ? authorName
          : "Choose an author";
  const targetSub =
    mode === "server"
      ? lookup?.channel_count
        ? `${fmt(lookup.channel_count)} text channels`
        : "Every text and announcement channel"
      : mode === "channel"
        ? serverName
          ? `in ${serverName}`
          : "Choose a server first"
        : selectedUser
          ? `@${selectedUser.username} · #${channelName}`
          : fields.author
            ? `ID ${fields.author}${channelName ? ` · #${channelName}` : ""}`
            : channelName
              ? `in #${channelName}`
              : "Choose a channel first";
  const targetIcon =
    mode === "server" ? Server : mode === "channel" ? Hash : UserRound;
  const TargetIcon = targetIcon;

  useEffect(() => {
    if (!focusAfterSave || settingsOpen) return;
    if (identityLoading) return;
    if (!showManual && (guildsLoading || channelsLoading)) return;
    const target = !hasToken
      ? addTokenRef.current
      : !showManual
        ? !fields.server
          ? serverSelectRef.current
          : mode !== "server" && channelMissing
            ? channelSelectRef.current
            : mode === "author" && authorMissing
              ? userInputRef.current
              : startRef.current && !startRef.current.disabled
                ? startRef.current
                : connectionRef.current
        : serverMissing
          ? serverRef.current
          : channelMissing
            ? channelRef.current
            : authorMissing
              ? authorRef.current
              : startRef.current && !startRef.current.disabled
                ? startRef.current
                : connectionRef.current;
    target?.focus();
    setFocusAfterSave(false);
  }, [
    focusAfterSave,
    settingsOpen,
    hasToken,
    identityLoading,
    showManual,
    mode,
    fields.server,
    guildsLoading,
    channelsLoading,
    serverMissing,
    channelMissing,
    authorMissing,
    busy,
  ]);

  function openSettings(section: "token" | "window" | null = null) {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  function set<K extends keyof Fields>(name: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [name]: value }));
    setStarted(false);
    setFormError(null);
    if (name === "author") setSelectedUser(null);
    if (name === "channel") {
      setSelectedUser(null);
      setMemberQuery("");
      setMembers([]);
      setUserOpen(false);
    }
    if (name === "mode") setUserOpen(false);
    if (
      name === "channel" ||
      name === "author" ||
      name === "server" ||
      name === "mode"
    ) {
      setLookup(null);
      setLookupError(null);
    }
  }

  function chooseServer(value: string) {
    setFields((current) => ({
      ...current,
      server: value,
      channel: "",
      author: "",
    }));
    setSelectedUser(null);
    setMemberQuery("");
    setMembers([]);
    setUserOpen(false);
    setStarted(false);
    setFormError(null);
    setLookup(null);
    setLookupError(null);
  }

  function chooseChannel(value: string) {
    setFields((current) => ({ ...current, channel: value }));
    setSelectedUser(null);
    setMemberQuery("");
    setMembers([]);
    setUserOpen(false);
    setStarted(false);
    setFormError(null);
    setLookup(null);
    setLookupError(null);
  }

  function chooseUser(member: UserOption) {
    setFields((current) => ({ ...current, author: member.id }));
    setSelectedUser(member);
    setMemberQuery("");
    setUserOpen(false);
    setStarted(false);
    setFormError(null);
    setLookup(null);
    setLookupError(null);
  }

  function clearUser() {
    setFields((current) => ({ ...current, author: "" }));
    setSelectedUser(null);
    setMemberQuery("");
    setUserOpen(false);
    setStarted(false);
    setFormError(null);
    setLookup(null);
    setLookupError(null);
  }

  function showLists() {
    setMemberQuery("");
    setMembers([]);
    setMembersError(null);
    setChannelsError(null);
    setGuildsError(null);
    setUserOpen(false);
    setManualIds(false);
  }

  function openUsers() {
    const rect = userInputRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setUserPlacement(
        spaceBelow < 280 && spaceAbove > spaceBelow ? "top" : "bottom"
      );
    }
    setUserOpen(true);
  }

  async function handleSettingsSave(nextFields: Fields, nextToken: string) {
    const trimmed = serverToken ? "" : String(nextToken || "").trim();
    const previous = sessionToken || "";
    const tokenTextChanged = trimmed !== previous;
    const tokenChanged =
      !serverToken &&
      (tokenTextChanged ||
        (trimmed !== "" &&
          Boolean(nextFields.is_bot) !== Boolean(fields.is_bot)));

    if (tokenChanged) {
      await onToken(trimmed, nextFields.is_bot);
    }

    setFields(nextFields);
    setStarted(false);
    setFormError(null);
    setLookup(null);
    setLookupError(null);
    if (tokenTextChanged) setFocusAfterSave(true);
  }

  async function handleLookup() {
    setLookupError(null);
    setFormError(null);
    if (!tokenUsable) {
      setLookupError("Add or fix the Discord token first.");
      return;
    }
    if (!idsReady) {
      setLookupError(idRequirement);
      return;
    }
    setLookupLoading(true);
    try {
      const payload: {
        mode: ExportMode;
        token?: string;
        is_bot: boolean;
        server?: string;
        channel?: string;
        author?: string;
      } = {
        mode,
        token: serverToken ? undefined : sessionToken || undefined,
        is_bot: fields.is_bot,
      };
      if (mode === "server") {
        payload.server = fields.server.trim();
      } else {
        payload.channel = fields.channel.trim();
        if (mode === "author") payload.author = fields.author.trim();
      }
      const data = await api.info(payload);
      setLookup(data);
    } catch (err) {
      setLookup(null);
      setLookupError(errorMessage(err));
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (setupBlocked || busy || submitting) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await onStart({
        mode,
        channel: mode === "server" ? "" : fields.channel.trim(),
        author: mode === "author" ? fields.author.trim() : "",
        server: mode === "server" ? fields.server.trim() : "",
        since: fields.since || undefined,
        until: fields.until || undefined,
        ranges: Number(fields.ranges),
        workers: Number(fields.workers),
        rate: Number(fields.rate),
        include_attachments: fields.include_attachments,
        download_attachments:
          fields.include_attachments && fields.download_attachments,
        check_total: fields.check_total,
        is_bot: fields.is_bot,
        token: serverToken ? undefined : sessionToken || undefined,
      });
      setStarted(true);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const attachmentLabel = !fields.include_attachments
    ? "JSON, no attachments"
    : fields.download_attachments
      ? "JSON + downloaded files"
      : "JSON + attachment metadata";
  const startBlockedClass =
    setupBlocked && !submitting && !busy ? " primary-button--blocked" : "";

  return (
    <>
      <form className="export-workbench" onSubmit={handleSubmit}>
        <div className="export-workbench-main">
          <header className="export-form-head">
            <span className="module-kicker">New export</span>
            <h3 className="console-title">Build an export</h3>
            <p className="console-sub">
              Pick a scope, choose the target, then start. The defaults are
              already tuned.
            </p>
          </header>

          {!tokenUsable ? (
            <div className="export-connection" id="connection-state">
              <span className="connection-icon" aria-hidden="true">
                <KeyRound size={17} strokeWidth={1.5} />
              </span>
              <div className="connection-copy">
                <strong>
                  {statusLoading
                    ? "Checking Discord…"
                    : !serverOnline
                      ? "Server unreachable"
                      : identityError
                        ? "Discord connection failed"
                        : "Connect Discord"}
                </strong>
                <span>
                  {statusLoading
                    ? "One moment."
                    : !serverOnline
                      ? "The local server is not answering."
                      : identityError
                        ? "Check the token or your connection, then reconnect."
                        : "Connect a token to browse servers, channels, and recent authors."}
                </span>
              </div>
              {!statusLoading && serverOnline ? (
                <button
                  ref={addTokenRef}
                  type="button"
                  className="primary-button"
                  onClick={onRequestToken}
                >
                  <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" />
                  {identityError ? "Reconnect" : "Connect Discord"}
                </button>
              ) : null}
            </div>
          ) : null}

          <fieldset className="scope-cards">
            <legend className="sr-only">Export scope</legend>
            {MODES.map(([value, label]) => {
              const Icon =
                value === "author"
                  ? UserRound
                  : value === "channel"
                    ? Hash
                    : Server;
              return (
                <label
                  key={value}
                  className={`scope-card${
                    mode === value ? " scope-card--active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="export-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => set("mode", value)}
                  />
                  <span className="scope-card-icon" aria-hidden="true">
                    <Icon size={17} strokeWidth={1.5} />
                  </span>
                  <strong>{label}</strong>
                  <small>
                    {value === "author"
                      ? "Every message from one person."
                      : value === "channel"
                        ? "Every message in one channel."
                        : "Every text channel in a server."}
                  </small>
                </label>
              );
            })}
          </fieldset>

          <section className="target-panel" aria-labelledby="targetHeading">
            <div className="target-head">
              <span className="step-badge" aria-hidden="true">
                <Crosshair size={15} strokeWidth={1.5} />
              </span>
              <div>
                <h4 id="targetHeading">Choose the target</h4>
                <p>
                  {showManual
                    ? "Paste the numeric IDs for this scope."
                    : "Pick a server, then a channel, then a person."}
                </p>
              </div>
            </div>

            {showManual ? (
              <>
                {mode === "server" ? (
                  <div className="field-grid field-grid--single">
                    <label className="field" htmlFor="export-server">
                      <span className="field-label">Server ID</span>
                      <input
                        id="export-server"
                        ref={serverRef}
                        className="field-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck="false"
                        placeholder="e.g. 123456789012345678"
                        aria-required="true"
                        aria-describedby={
                          browseError ? "export-browse-error" : undefined
                        }
                        value={fields.server}
                        onChange={(event) => chooseServer(event.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  <div
                    className={`field-grid${
                      mode === "channel" ? " field-grid--single" : ""
                    }`}
                  >
                    <label className="field" htmlFor="export-channel">
                      <span className="field-label">Channel ID</span>
                      <input
                        id="export-channel"
                        ref={channelRef}
                        className="field-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck="false"
                        placeholder="e.g. 123456789012345678"
                        aria-required="true"
                        aria-describedby={
                          browseError ? "export-browse-error" : undefined
                        }
                        value={fields.channel}
                        onChange={(event) => set("channel", event.target.value)}
                      />
                    </label>

                    {mode === "author" ? (
                      <label className="field" htmlFor="export-author">
                        <span className="field-label">Author ID</span>
                        <input
                          id="export-author"
                          ref={authorRef}
                          className="field-input"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          spellCheck="false"
                          placeholder="e.g. 123456789012345678"
                          aria-required="true"
                          aria-describedby={
                            browseError ? "export-browse-error" : undefined
                          }
                          value={fields.author}
                          onChange={(event) => set("author", event.target.value)}
                        />
                      </label>
                    ) : null}
                  </div>
                )}
                {browseError ? (
                  <div
                    className="inline-alert"
                    role="alert"
                    id="export-browse-error"
                    title={browseError}
                  >
                    <span className="inline-alert-icon" aria-hidden="true">
                      <AlertTriangle size={16} strokeWidth={1.5} />
                    </span>
                    <div className="inline-alert-copy">
                      <strong>
                        {guildsError
                          ? "Could not load your servers"
                          : channelsError
                            ? "Could not load this server's channels"
                            : "Could not load recent authors"}
                      </strong>
                      <span>{humanizeError(browseError)}</span>
                    </div>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={showLists}
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
                {tokenUsable ? (
                  <div className="picker-foot">
                    <button
                      type="button"
                      className="portal-button-soft"
                      onClick={showLists}
                    >
                      Choose from lists
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div
                  className={`field-grid${
                    mode === "server" ? " field-grid--single" : ""
                  }`}
                >
                  <SelectMenu
                    id="export-server-select"
                    label="Server"
                    value={fields.server}
                    options={serverOptions}
                    onChange={chooseServer}
                    placeholder="Choose a server…"
                    loadingLabel="Loading servers…"
                    loading={guildsLoading}
                    triggerRef={serverSelectRef}
                    hint={
                      !guildsLoading && !guilds.length
                        ? "No servers found. Use IDs instead."
                        : null
                    }
                  />

                  {mode !== "server" ? (
                    <SelectMenu
                      id="export-channel-select"
                      label="Channel"
                      value={fields.channel}
                      options={channelOptions}
                      onChange={chooseChannel}
                      placeholder={
                        fields.server
                          ? "Choose a channel…"
                          : "Choose a server first…"
                      }
                      loadingLabel="Loading channels…"
                      loading={channelsLoading}
                      disabled={!fields.server}
                      triggerRef={channelSelectRef}
                      hint={
                        fields.server && !channelsLoading && !channels.length
                          ? "No text channels found. Use IDs instead."
                          : null
                      }
                    />
                  ) : null}

                  {mode === "author" ? (
                    <div className="field picker-wide" ref={userRef}>
                      <label
                        className="field-label"
                        htmlFor="export-user-search"
                      >
                        User
                      </label>
                      {selectedUser ? (
                        <div className="member-selected">
                          <Avatar
                            src={selectedUser.avatar_url}
                            name={userLabel(selectedUser)}
                            round
                          />
                          <span>{userLabel(selectedUser)}</span>
                          <span className="console-note">
                            @{selectedUser.username}
                            {selectedUser.bot ? " · bot" : ""}
                          </span>
                          <button
                            type="button"
                            className="member-clear"
                            aria-label="Clear selected user"
                            title="Clear selected user"
                            onClick={clearUser}
                          >
                            <X size={14} strokeWidth={1.6} />
                          </button>
                        </div>
                      ) : fields.author ? (
                        <div className="member-selected">
                          <span>Author ID</span>
                          <span className="console-note">{fields.author}</span>
                          <button
                            type="button"
                            className="member-clear"
                            aria-label="Clear author ID"
                            title="Clear author ID"
                            onClick={clearUser}
                          >
                            <X size={14} strokeWidth={1.6} />
                          </button>
                        </div>
                      ) : (
                        <div className="member-combobox">
                          <input
                            id="export-user-search"
                            ref={userInputRef}
                            className="field-input"
                            type="search"
                            autoComplete="off"
                            spellCheck="false"
                            placeholder={
                              !fields.channel
                                ? "Choose a channel first…"
                                : "Search recent authors…"
                            }
                            value={memberQuery}
                            disabled={!fields.channel}
                            onFocus={openUsers}
                            onChange={(event) => {
                              setMemberQuery(event.target.value);
                              openUsers();
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                filteredMembers.length
                              ) {
                                event.preventDefault();
                                chooseUser(filteredMembers[0]);
                              } else if (event.key === "Escape") {
                                setUserOpen(false);
                              }
                            }}
                            role="combobox"
                            aria-expanded={showMemberList}
                            aria-controls="export-member-list"
                            aria-autocomplete="list"
                            aria-required="true"
                          />
                          {showMemberList ? (
                            <ul
                              className="member-list picker-menu"
                              id="export-member-list"
                              role="listbox"
                              data-state="open"
                              data-placement={userPlacement}
                            >
                              {filteredMembers.map((member) => (
                                <li key={member.id} role="presentation">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected="false"
                                    className="member-option"
                                    onClick={() => chooseUser(member)}
                                  >
                                    <span className="member-option-main">
                                      <Avatar
                                        src={member.avatar_url}
                                        name={userLabel(member)}
                                        round
                                      />
                                      <span>{userLabel(member)}</span>
                                    </span>
                                    <span className="console-note">
                                      @{member.username}
                                      {member.bot ? " · bot" : ""}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )}
                      {membersLoading ? (
                        <span className="field-hint">Loading users…</span>
                      ) : null}
                      {!membersLoading && fields.channel && !members.length ? (
                        <span className="field-hint">
                          No recent authors found here. Use IDs instead.
                        </span>
                      ) : null}
                      {!membersLoading &&
                      userOpen &&
                      memberQuery.trim() &&
                      members.length &&
                      !filteredMembers.length ? (
                        <span className="field-hint">No users match.</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="picker-foot">
                  <button
                    type="button"
                    className="portal-button-soft"
                    onClick={() => setManualIds(true)}
                  >
                    Enter IDs manually
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="export-preview" aria-label="Export preview">
          <span className="module-kicker">Preview</span>
          <div className="preview-target">
            <span className="preview-icon" aria-hidden="true">
              <TargetIcon size={20} strokeWidth={1.5} />
            </span>
            <div>
              <h3>{targetTitle}</h3>
              <p>{targetSub}</p>
            </div>
          </div>

          <dl className="preview-list">
            <div>
              <dt>Scope</dt>
              <dd>{scopeTitle}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>{windowValue(fields)}</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>{attachmentLabel}</dd>
            </div>
          </dl>

          {lookup ? (
            <div className="preview-result">
              {mode === "author" ? (
                <>
                  <strong>{fmt(lookup.info?.total_results)}</strong>
                  <span>messages found</span>
                  <span>
                    {shortDate(lookup.info?.first_timestamp)} →{" "}
                    {shortDate(lookup.info?.last_timestamp)}
                  </span>
                </>
              ) : mode === "server" ? (
                <>
                  <strong>
                    {fmt(lookup.channel_count ?? lookup.channels?.length ?? 0)}
                  </strong>
                  <span>text channels</span>
                  <span>{lookup.guild?.name ?? "Server ready"}</span>
                </>
              ) : (
                <>
                  <strong>{lookup.channel?.name ?? "Channel ready"}</strong>
                  <span>{lookup.guild?.name ?? "Ready to export"}</span>
                </>
              )}
            </div>
          ) : (
            <p className="preview-note">
              Check the selection to see how much will be exported.
            </p>
          )}

          <div className="preview-actions">
            <button
              type="button"
              className="glass-button"
              onClick={handleLookup}
              disabled={
                lookupLoading || submitting || !tokenUsable || !idsReady
              }
              aria-describedby={lookupReason}
            >
              <Search size={16} strokeWidth={1.5} aria-hidden="true" />
              {lookupLoading ? "Checking…" : lookupLabel}
            </button>
            <button
              ref={startRef}
              type="submit"
              className={`primary-button${startBlockedClass}`}
              disabled={submitting || busy || !tokenUsable || !idsReady}
              aria-describedby={startReason}
            >
              <Play size={16} strokeWidth={1.5} aria-hidden="true" />
              {submitting ? "Starting…" : "Start export"}
              {!submitting && !busy ? (
                <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
              ) : null}
            </button>
          </div>

          {idRequirement && tokenUsable ? (
            <p className="form-requirement" id="export-requirement">
              {idRequirement}
            </p>
          ) : null}

          {busy && !started ? (
            <p className="console-note" id="busy-reason">
              An export is already running. Stop it or wait for it to finish.
            </p>
          ) : null}

          {lookupError ? (
            <p className="console-error" role="alert">
              {lookupError}
            </p>
          ) : null}

          {formError ? (
            <p className="console-error" role="alert">
              {formError}
            </p>
          ) : null}

          {started ? (
            <p className="console-note" role="status">
              Job started. Watch it in the job monitor below.
            </p>
          ) : null}

          <button
            type="button"
            className="preview-settings"
            onClick={() => openSettings()}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={15} strokeWidth={1.5} aria-hidden="true" />
            <span>Export settings</span>
            <ChevronRight
              size={14}
              strokeWidth={1.5}
              aria-hidden="true"
              className="preview-settings-arrow"
            />
          </button>
        </aside>
      </form>

      <SettingsDialog
        open={settingsOpen}
        fields={fields}
        token={serverToken ? "" : sessionToken}
        serverToken={serverToken}
        serverTokenIsBot={serverTokenIsBot}
        identity={identity}
        identityError={identityError}
        identityLoading={identityLoading}
        initialSection={settingsSection}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSave}
      />
    </>
  );
}
