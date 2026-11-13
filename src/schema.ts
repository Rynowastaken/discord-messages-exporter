/**
 * Shape raw API messages into a stable, self-contained record.
 *
 * Attachment entries carry metadata; the optional archiver can copy their bytes
 * into the job folder later, while the CDN URLs remain signed and expire.
 */
import type {
  DiscordAttachment,
  DiscordMessage,
  DiscordUser,
} from "./api.js";

export const ATTACHMENT_FIELDS = [
  "id",
  "filename",
  "size",
  "content_type",
  "width",
  "height",
  "url",
  "proxy_url",
] as const;

export interface SlimUser {
  id?: string;
  username?: string;
  global_name?: string | null;
  display_name?: string | null;
  bot?: boolean;
  avatar_url?: string | null;
}

export type SlimAttachment = Record<
  (typeof ATTACHMENT_FIELDS)[number],
  string | number | null | undefined
>;

export interface SlimMessage {
  id: string | undefined;
  channel_id: string | undefined;
  timestamp: string | undefined;
  edited_timestamp: string | null | undefined;
  type: number | undefined;
  pinned: boolean | undefined;
  content: string | undefined;
  author: SlimUser | null;
  mentions: SlimUser[];
  attachments: SlimAttachment[];
  embeds: unknown[];
  sticker_items: Array<{
    id: string | undefined;
    name: string | undefined;
    format_type: number | undefined;
  }>;
  reactions: Array<{
    emoji: string | null | undefined;
    emoji_id: string | null | undefined;
    count: number | undefined;
  }>;
  message_reference: unknown;
  referenced_message: {
    id: string | undefined;
    author: SlimUser | null;
    content: string | undefined;
  } | null;
  thread: { id: string | undefined; name: string | undefined } | null;
  flags: number | undefined;
}

function avatarUrl(user: DiscordUser): string | null {
  if (user.avatar) {
    const extension = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
  }
  try {
    const index = Number((BigInt(user.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return null;
  }
}

export function slimUser(user?: DiscordUser | null): SlimUser | null {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    global_name: user.global_name,
    display_name:
      (user as DiscordUser & { display_name?: string | null }).display_name,
    bot: user.bot ?? false,
    avatar_url: avatarUrl(user),
  };
}

export function slimAttachment(
  attachment: DiscordAttachment
): SlimAttachment {
  const record = {} as SlimAttachment;
  for (const field of ATTACHMENT_FIELDS) {
    record[field] = attachment[field];
  }
  return record;
}

export function slimMessage(
  message: DiscordMessage,
  options: { includeAttachments?: boolean } = {}
): SlimMessage {
  const includeAttachments = options.includeAttachments !== false;
  const reference = message.referenced_message;
  return {
    id: message.id,
    channel_id: message.channel_id,
    timestamp: message.timestamp,
    edited_timestamp: message.edited_timestamp,
    type: message.type,
    pinned: message.pinned,
    content: message.content,
    author: slimUser(message.author),
    mentions: (message.mentions ?? [])
      .map((user) => slimUser(user))
      .filter((user): user is SlimUser => Boolean(user)),
    attachments: includeAttachments
      ? (message.attachments ?? []).map(slimAttachment)
      : [],
    embeds: message.embeds ?? [],
    sticker_items: (message.sticker_items ?? []).map((item) => {
      const sticker = item as {
        id?: string;
        name?: string;
        format_type?: number;
      };
      return {
        id: sticker.id,
        name: sticker.name,
        format_type: sticker.format_type,
      };
    }),
    reactions: (message.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji?.name,
      emoji_id: reaction.emoji?.id,
      count: reaction.count,
    })),
    message_reference: message.message_reference,
    referenced_message: reference
      ? {
          id: reference.id,
          author: slimUser(reference.author),
          content: reference.content,
        }
      : null,
    thread: message.thread
      ? { id: message.thread.id, name: message.thread.name }
      : null,
    flags: message.flags,
  };
}
