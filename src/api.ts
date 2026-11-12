/**
 * HTTP client for the bits of the Discord REST API this tool needs.
 *
 * Two behaviours here are not obvious and cost real time to discover:
 *
 * - Discord returns no rate-limit headers on the channel-history route, so the
 *   request rate is paced client-side. Pacing is shared by all workers because
 *   the limit is per route, not per worker.
 * - ``before`` and ``after`` cannot be combined. When both are present Discord
 *   honours ``after``, ignores ``before``, and keeps serving the same first
 *   page, which silently duplicates thousands of records. Every walk here
 *   therefore uses exactly one cursor.
 */
import { sleep } from "./util.js";

export const API_BASE = "https://discord.com/api/v10";
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
  bot?: boolean;
  avatar?: string | null;
}

export interface DiscordAttachment {
  id?: string;
  filename?: string;
  size?: number;
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
  url?: string;
  proxy_url?: string;
}

export interface DiscordMessage {
  id: string;
  channel_id?: string;
  timestamp?: string;
  edited_timestamp?: string | null;
  type?: number;
  pinned?: boolean;
  content?: string;
  author?: DiscordUser;
  attachments?: DiscordAttachment[];
  embeds?: unknown[];
  sticker_items?: unknown[];
  reactions?: Array<{
    emoji?: { name?: string | null; id?: string | null };
    count?: number;
  }>;
  message_reference?: unknown;
  referenced_message?: {
    id?: string;
    author?: DiscordUser;
    content?: string;
  } | null;
  thread?: { id?: string; name?: string } | null;
  flags?: number;
}

export interface DiscordChannel {
  id: string;
  name?: string;
  guild_id?: string | null;
  type?: number;
  position?: number;
}

export interface DiscordGuild {
  id: string;
  name?: string;
  icon?: string | null;
}

export interface GuildSummary {
  id: string;
  name: string;
  icon?: string | null;
}

export interface DiscordMember {
  user?: DiscordUser;
  nick?: string | null;
}

export interface SearchResponse {
  total_results?: number | null;
  messages?: DiscordMessage[][];
}

export class DiscordError extends Error {
  readonly status: number;
  readonly body: string;
  readonly path: string;

  constructor(status: number, body: string, path: string) {
    super(`HTTP ${status} on ${path}: ${body.slice(0, 300)}`);
    this.name = "DiscordError";
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

/** Evenly spacing requests, shared across all workers. */
export class RateLimiter {
  private readonly interval: number;
  private next = 0;
  private started = false;

  constructor(rate: number) {
    if (rate <= 0) throw new Error("rate must be > 0");
    this.interval = 1000 / rate;
  }

  async wait(): Promise<void> {
    const now = performance.now();
    if (!this.started) {
      this.started = true;
      this.next = now;
    }
    if (this.next < now) this.next = now;
    const target = this.next;
    this.next += this.interval;
    const delay = target - performance.now();
    if (delay > 0) await sleep(delay);
  }
}

export interface DiscordClientOptions {
  rate?: number;
  timeout?: number;
  maxRetries?: number;
  isBot?: boolean;
  userAgent?: string;
}

export class DiscordClient {
  private readonly token: string;
  private readonly prefix: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly userAgent: string;
  private readonly limiter: RateLimiter;
  requests = 0;
  rateLimited = 0;

  constructor(token: string, options: DiscordClientOptions = {}) {
    if (!token) throw new Error("a Discord token is required");
    this.token = token;
    this.prefix = options.isBot ? "Bot " : "";
    this.timeoutMs = (options.timeout ?? 45) * 1000;
    this.maxRetries = options.maxRetries ?? 12;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.limiter = new RateLimiter(options.rate ?? 6);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `${this.prefix}${this.token}`,
      "User-Agent": this.userAgent,
      Accept: "*/*",
    };
  }

  async get<T>(
    path: string,
    params: Record<string, string | number | bigint | null | undefined> = {}
  ): Promise<T> {
    const url = new URL(API_BASE + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError: string | null = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      await this.limiter.wait();
      try {
        const response = await fetch(url, {
          headers: this.headers(),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.ok) {
          this.requests += 1;
          return (await response.json()) as T;
        }
        const body = await response.text();
        if (response.status === 429) {
          this.rateLimited += 1;
          await sleep(this.retryAfter(body, attempt) * 1000);
          continue;
        }
        if ([500, 502, 503, 504].includes(response.status)) {
          lastError = `HTTP ${response.status}`;
          await sleep(Math.min(1.5 * (attempt + 1), 15) * 1000);
          continue;
        }
        throw new DiscordError(response.status, body, url.toString());
      } catch (err) {
        if (err instanceof DiscordError) throw err;
        lastError = err instanceof Error ? err.message : String(err);
        await sleep(Math.min(1 * (attempt + 1), 10) * 1000);
      }
    }
    throw new DiscordError(
      0,
      `gave up after ${this.maxRetries} attempts: ${lastError ?? "unknown error"}`,
      url.toString()
    );
  }

  private retryAfter(body: string, attempt: number): number {
    try {
      const parsed = JSON.parse(body) as { retry_after?: number };
      return Number(parsed.retry_after ?? 1) + 0.3 + attempt * 0.1;
    } catch {
      return 1 + attempt * 0.5;
    }
  }

  me(): Promise<DiscordUser> {
    return this.get<DiscordUser>("/users/@me");
  }

  userGuilds(): Promise<GuildSummary[]> {
    return this.get<GuildSummary[]>("/users/@me/guilds");
  }

  channel(channelId: string | number): Promise<DiscordChannel> {
    return this.get<DiscordChannel>(`/channels/${channelId}`);
  }

  guild(guildId: string | number): Promise<DiscordGuild> {
    return this.get<DiscordGuild>(`/guilds/${guildId}`);
  }

  guildChannels(guildId: string | number): Promise<DiscordChannel[]> {
    return this.get<DiscordChannel[]>(`/guilds/${guildId}/channels`);
  }

  /** Newest-first page of channel history strictly older than ``before``. */
  messagesBefore(
    channelId: string | number,
    before?: bigint | string | number | null,
    limit = 100
  ): Promise<DiscordMessage[]> {
    return this.get<DiscordMessage[]>(`/channels/${channelId}/messages`, {
      limit,
      before: before === null || before === undefined ? undefined : String(before),
    });
  }

  search(
    guildId: string | number,
    options: {
      channelId?: string | number | null;
      authorId?: string | number | null;
      minId?: bigint | string | number | null;
      maxId?: bigint | string | number | null;
      offset?: number;
      sortOrder?: "asc" | "desc" | null;
    } = {}
  ): Promise<SearchResponse> {
    return this.get<SearchResponse>(`/guilds/${guildId}/messages/search`, {
      channel_id: options.channelId,
      author_id: options.authorId,
      min_id:
        options.minId === null || options.minId === undefined
          ? undefined
          : String(options.minId),
      max_id:
        options.maxId === null || options.maxId === undefined
          ? undefined
          : String(options.maxId),
      offset: options.offset,
      sort_order: options.sortOrder,
      sort_by: options.sortOrder ? "timestamp" : undefined,
    });
  }

  async *iterSearch(
    guildId: string | number,
    options: {
      channelId?: string | number | null;
      authorId?: string | number | null;
      minId?: bigint | string | number | null;
      maxId?: bigint | string | number | null;
    } = {}
  ): AsyncGenerator<DiscordMessage> {
    let offset = 0;
    while (offset <= 4900) {
      const page = await this.search(guildId, { ...options, offset });
      const groups = page.messages ?? [];
      if (!groups.length) return;
      for (const group of groups) {
        if (group?.[0]) yield group[0];
      }
      offset += groups.length;
      if (groups.length < 25) return;
    }
  }

  searchMembers(
    guildId: string | number,
    query: string,
    limit = 25
  ): Promise<DiscordMember[]> {
    return this.get<DiscordMember[]>(
      `/guilds/${guildId}/members/search`,
      { query, limit }
    );
  }
}
