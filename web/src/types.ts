export type ExportMode = "author" | "channel" | "server";

export type JobStatus =
  | "queued"
  | "resolving"
  | "running"
  | "stopping"
  | "stopped"
  | "done"
  | "partial"
  | "failed"
  | "empty";

export interface Identity {
  id?: string;
  username: string;
  global_name?: string | null;
  bot: boolean;
  avatar?: string | null;
}

export interface Fields {
  mode: ExportMode;
  channel: string;
  author: string;
  server: string;
  since: string;
  until: string;
  ranges: number | string;
  workers: number | string;
  rate: number | string;
  include_attachments: boolean;
  download_attachments: boolean;
  check_total: boolean;
  is_bot: boolean;
}

export interface JobConfig {
  mode: ExportMode;
  channel: string;
  author: string;
  server: string;
  since?: string;
  until?: string;
  ranges: number;
  workers: number;
  rate: number;
  include_attachments: boolean;
  download_attachments: boolean;
  check_total: boolean;
  is_bot?: boolean;
  output_dir?: string;
}

export interface JobStats {
  ranges_total?: number;
  ranges_done?: number;
  pages?: number;
  messages_scanned?: number;
  messages_matched?: number;
  rate_limited?: number;
  elapsed?: number;
  pages_per_second?: number;
  errors?: number;
  channels_total?: number;
  channels_done?: number;
}

export interface RangeInfo {
  index: number;
  lo: number;
  hi: number;
  pages: number;
  matched: number;
  share?: number;
}

export interface ThroughputSample {
  t: number;
  pages: number;
}

export interface ThroughputPoint {
  minute: number;
  pages: number;
}

export interface ChannelProgress {
  id: string;
  name: string;
  status: string;
  ranges_total: number;
  ranges_done: number;
  pages: number;
  matched: number;
  scanned: number;
}

export interface AssemblyInfo {
  total: number;
  wrong_author: number;
  attachments: number;
  size_bytes: number;
  oldest_timestamp: string | null;
  newest_timestamp: string | null;
  duplicate_ids: number;
}

export interface JobOutput {
  download_url: string;
  download_name?: string;
  size_bytes: number;
}

export interface GuildRef {
  id: string;
  name?: string | null;
}

export interface AuthorRef {
  id?: string;
  username?: string | null;
  global_name?: string | null;
}

export interface LookupInfo {
  total_results?: number | null;
  first_timestamp?: string | null;
  first_id?: string | null;
  last_timestamp?: string | null;
  last_id?: string | null;
}

export interface Job {
  id: string;
  status: JobStatus;
  stage: string;
  mode?: ExportMode;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  config: JobConfig;
  token_source?: string;
  channel?: GuildRef | null;
  guild?: GuildRef | null;
  author?: AuthorRef | null;
  channels?: ChannelProgress[];
  info?: LookupInfo | null;
  stats?: JobStats;
  eta_seconds?: number | null;
  assembly?: AssemblyInfo | null;
  attachment_download?: AttachmentDownloadInfo | null;
  attachment_error?: string | null;
  saved_to?: string | null;
  save_error?: string | null;
  error?: string | null;
  errors?: string[];
  output?: JobOutput | null;
  ranges?: RangeInfo[];
  throughput?: ThroughputSample[];
}

export interface StatusResponse {
  ok: boolean;
  version?: string;
  server_token: boolean;
  server_token_is_bot: boolean;
  token_source?: "env" | "stored" | "none";
  token_storage?: "os-keychain" | "memory";
  jobs: Job[];
}

export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  published_at: string | null;
  assets: UpdateAsset[];
  checked_at: string;
  repository: string;
  error: string | null;
}

export interface UpdateResponse {
  update: UpdateInfo;
  version: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  home: string;
  entries: DirectoryEntry[];
  truncated: boolean;
  error: string | null;
}

export interface DirectoryListingResponse {
  listing: DirectoryListing;
}

export type ColorScheme =
  | "content"
  | "expressive"
  | "fidelity"
  | "monochrome"
  | "neutral"
  | "tonalSpot"
  | "vibrant"
  | "rainbow"
  | "fruitSalad";

export interface AppearanceSettings {
  scheme: ColorScheme;
  colorfulness: number;
  brightness: number;
  background_brightness: number;
  background_blur: number;
}

export interface AppSettings {
  output_dir: string;
  appearance: AppearanceSettings;
  background_url: string | null;
  background_type: string | null;
}

export interface AppSettingsResponse {
  settings: AppSettings;
}

export interface TokenStatus {
  configured: boolean;
  source: "env" | "stored" | "none";
  is_bot: boolean;
  storage: "os-keychain" | "memory";
  remembered?: boolean;
  user?: Identity;
}

export interface JobResponse {
  job: Job;
}

export interface IdentityResponse {
  user: Identity;
}

export interface GuildOption {
  id: string;
  name: string;
  icon_url?: string | null;
}

export interface ChannelOption {
  id: string;
  name: string;
}

export interface UserOption {
  id: string;
  username: string;
  global_name?: string | null;
  nick?: string | null;
  bot: boolean;
  avatar_url?: string | null;
}

export interface GuildsResponse {
  guilds: GuildOption[];
}

export interface ChannelsResponse {
  channels: ChannelOption[];
}

export interface AuthorsResponse {
  authors: UserOption[];
}

export interface MembersResponse {
  members: UserOption[];
}

export interface InfoResponse {
  mode?: ExportMode;
  channel?: GuildRef;
  guild?: GuildRef;
  author?: AuthorRef;
  info?: LookupInfo;
  channels?: ChannelOption[];
  channel_count?: number;
}

export interface InfoRequest {
  mode?: ExportMode;
  channel?: string;
  author?: string;
  server?: string;
  token?: string;
  is_bot?: boolean;
}

export interface BrowsePayload {
  kind: "guilds" | "channels" | "authors" | "members";
  server?: string;
  channel?: string;
  query?: string;
  token?: string;
  is_bot?: boolean;
}

export interface BrowseResponse {
  guilds?: GuildOption[];
  channels?: ChannelOption[];
  authors?: UserOption[];
  members?: UserOption[];
}

export interface AttachmentDownloadInfo {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
  bytes: number;
  complete: boolean;
}

export interface StartPayload {
  mode: ExportMode;
  channel?: string;
  author?: string;
  server?: string;
  since?: string;
  until?: string;
  ranges?: number;
  workers?: number;
  rate?: number;
  include_attachments?: boolean;
  download_attachments?: boolean;
  check_total?: boolean;
  is_bot?: boolean;
  token?: string;
}

export interface ChartRun {
  id: string;
  tint?: "primary" | "accent" | null;
  author_username?: string;
  label?: string;
  status?: string;
  ranges: RangeInfo[];
  ranges_total: number;
  ranges_done: number;
  pages: number;
  pages_in_workdir: number;
  elapsed: number;
  rate_limited?: number | null;
  configured?: {
    workers?: number | null;
    rate?: number | null;
  };
  throughput: ThroughputPoint[];
  throughput_peak?: number;
  throughput_avg?: number;
}

export interface SelectOption {
  value: string;
  label: string;
  avatar?: {
    src?: string | null;
    name?: string;
    round?: boolean;
  } | null;
}

// --------------------------------------------------------------- explorer

export type ExportKind = "job" | "import";
export type ExportStatus = "unindexed" | "indexing" | "ready" | "failed";

export interface ExportMetadata {
  mode?: ExportMode;
  channel?: { id?: string; name?: string | null };
  guild?: { id?: string; name?: string | null };
  target_user_id?: string | null;
  target_username?: string | null;
  author?: {
    id?: string;
    name?: string | null;
    global_name?: string | null;
  } | null;
  ordering?: string;
  attachments_note?: string;
  channels?: Array<{ id?: string; name?: string; status?: string }>;
  window?: { since?: string | null; until?: string | null };
  crawl?: Record<string, unknown>;
}

export interface ExportSummary {
  id: string;
  kind: ExportKind;
  name: string;
  status: ExportStatus;
  progress: number;
  indexed: number;
  message_count: number | null;
  size_bytes: number;
  created_at: string;
  modified_at: string;
  metadata: ExportMetadata | null;
  error: string | null;
  has_attachments: boolean;
}

export interface FacetValue {
  id: string;
  name: string;
  count: number;
}

export interface ExportFacets {
  authors: FacetValue[];
  channels: FacetValue[];
  first_timestamp: string | null;
  last_timestamp: string | null;
}

export interface ExplorerMessage {
  id: string;
  timestamp: string;
  author_id: string | null;
  author_name: string | null;
  author_global_name: string | null;
  author_bot: boolean;
  channel_id: string | null;
  channel_name: string | null;
  content: string;
  content_length: number;
  attachment_count: number;
  reaction_count: number;
  reactions: Array<{
    emoji: string;
    emoji_id: string | null;
    count: number;
  }>;
  reply_to_id: string | null;
  edited: boolean;
}

export interface MessagePage {
  messages: ExplorerMessage[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  export: ExportSummary;
}

export interface ExportStats {
  scope: "all" | "filtered";
  total: number;
  authors: number;
  channels: number;
  first_timestamp: string | null;
  last_timestamp: string | null;
  active_days: number;
  attachments: number;
  reactions: number;
  edited: number;
  replies: number;
  average_length: number;
  median_length: number;
  messages_per_active_day: number;
  night_share: number;
  reply_rate: number;
  edit_rate: number;
  attachment_rate: number;
  link_rate: number;
  longest_streak_days: number;
  busiest_day: { day: string; count: number } | null;
  busiest_hour: { weekday: number; hour: number; count: number } | null;
  longest_gap: { seconds: number; from: string; to: string } | null;
  longest_message: {
    id: string;
    author_name: string;
    length: number;
    content: string;
  } | null;
  first_message: {
    id: string;
    timestamp: string;
    author_name: string;
    content: string;
  } | null;
  last_message: {
    id: string;
    timestamp: string;
    author_name: string;
    content: string;
  } | null;
  activity: Array<{ day: string; count: number }>;
  clock: Array<{ weekday: number; hour: number; count: number }>;
  top_authors: FacetValue[];
  top_channels: FacetValue[];
  attachment_types: Array<{ type: string; count: number }>;
  top_reactions: Array<{ emoji: string; count: number }>;
  top_domains: Array<{ domain: string; count: number }>;
  top_words: Array<{ word: string; count: number }>;
  length_buckets: Array<{ label: string; count: number }>;
}

export interface ExportFilters {
  q?: string;
  author?: string;
  channel?: string;
  from?: string;
  to?: string;
}

export interface ExportsResponse {
  exports: ExportSummary[];
}

export interface ExportDetailResponse {
  export: ExportSummary;
  facets: ExportFacets | null;
}

export interface ExportStatsResponse {
  stats: ExportStats;
  export: ExportSummary;
}
