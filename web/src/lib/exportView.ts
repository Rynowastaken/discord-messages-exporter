import type {
  ExportMetadata,
  ExportSummary,
  ExplorerMessage,
} from "../types";

type InferredMode = "author" | "channel" | "server" | null;

function inferredMode(metadata: ExportMetadata | null | undefined): InferredMode {
  if (!metadata) return null;
  if (metadata.mode) return metadata.mode;
  if (metadata.target_user_id) return "author";
  if ((metadata.channels?.length ?? 0) > 0) return "server";
  if (metadata.channel?.id || metadata.channel?.name) return "channel";
  return null;
}

export function exportModeLabel(item: ExportSummary): string {
  const mode = inferredMode(item.metadata);
  if (mode === "server") {
    return item.metadata?.guild?.name
      ? `Server · ${item.metadata.guild.name}`
      : "Whole server";
  }
  if (mode === "channel") {
    return item.metadata?.channel?.name
      ? `Channel · #${item.metadata.channel.name}`
      : "Whole channel";
  }
  if (mode === "author") {
    const channel = item.metadata?.channel?.name;
    return channel ? `Author · ${channel}` : "One author";
  }
  return item.kind === "job" ? "Exported here" : "Imported file";
}

export function exportScopeLine(item: ExportSummary): string {
  const metadata = item.metadata;
  if (!metadata) return item.kind === "job" ? "Exported here" : "Imported file";
  if (inferredMode(metadata) === "server") {
    const channels = metadata.channels?.length ?? 0;
    return `${metadata.guild?.name ?? "Server"}${
      channels ? ` · ${channels} channels` : ""
    }`;
  }
  if (metadata.channel?.name) {
    return `#${metadata.channel.name}${
      metadata.guild?.name ? ` · ${metadata.guild.name}` : ""
    }`;
  }
  return exportModeLabel(item);
}

export function authorLabel(message: ExplorerMessage): string {
  return (
    message.author_global_name ||
    message.author_name ||
    message.author_id ||
    "unknown"
  );
}

export function messageTimestamp(iso: string): string {
  if (!iso) return "no timestamp";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function discordMessageUrl(
  metadata: ExportMetadata | null,
  channelId: string | null,
  messageId: string
): string | null {
  const guildId = metadata?.guild?.id;
  if (!guildId || !channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}
