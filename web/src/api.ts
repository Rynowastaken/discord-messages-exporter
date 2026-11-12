import type {
  AppSettingsResponse,
  BrowsePayload,
  BrowseResponse,
  ExportDetailResponse,
  ExportFilters,
  ExportStatsResponse,
  ExportSummary,
  ExportsResponse,
  IdentityResponse,
  InfoRequest,
  InfoResponse,
  JobResponse,
  JobStatus,
  MessagePage,
  TokenStatus,
  StartPayload,
  StatusResponse,
} from "./types";

const ACTIVE = new Set<JobStatus>([
  "queued",
  "resolving",
  "running",
  "stopping",
]);
const TERMINAL = new Set<JobStatus>([
  "done",
  "partial",
  "failed",
  "stopped",
  "empty",
]);

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 60000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
      ...options,
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The request timed out. Check the server and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  status: () => request<StatusResponse>("/api/status"),
  settings: () => request<AppSettingsResponse>("/api/settings"),
  saveSettings: (settings: { output_dir: string }) =>
    request<AppSettingsResponse>("/api/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  tokenStatus: () => request<TokenStatus>("/api/token"),
  setToken: (token: string, isBot: boolean, remember: boolean) =>
    request<TokenStatus>("/api/token", {
      method: "POST",
      body: JSON.stringify({ token, is_bot: isBot, remember }),
    }),
  clearToken: () =>
    request<TokenStatus>("/api/token", { method: "DELETE" }),
  me: (payload: { token?: string; is_bot?: boolean } = {}) =>
    request<IdentityResponse>("/api/me", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  info: (payload: InfoRequest) =>
    request<InfoResponse>("/api/info", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  browse: (payload: BrowsePayload) =>
    request<BrowseResponse>("/api/browse", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startJob: (payload: StartPayload) =>
    request<JobResponse>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getJob: (id: string) => request<JobResponse>(`/api/jobs/${id}`),
  stopJob: (id: string) =>
    request<JobResponse>(`/api/jobs/${id}/stop`, {
      method: "POST",
      body: "{}",
    }),
  resumeJob: (id: string, token: string, isBot: boolean) =>
    request<JobResponse>(`/api/jobs/${id}/resume`, {
      method: "POST",
      body: JSON.stringify(
        token ? { token, is_bot: Boolean(isBot) } : {}
      ),
    }),
  downloadUrl: (id: string) => `/api/jobs/${id}/download`,

  exports: () => request<ExportsResponse>("/api/exports"),
  exportDetail: (id: string) =>
    request<ExportDetailResponse>(`/api/exports/${encodeURIComponent(id)}`),
  exportMessages: (
    id: string,
    filters: ExportFilters,
    offset: number,
    limit: number,
    order: "asc" | "desc"
  ) =>
    request<MessagePage>(
      `/api/exports/${encodeURIComponent(id)}/messages?${filtersQuery(
        filters,
        { offset, limit, order }
      )}`
    ),
  exportMessage: (id: string, messageId: string) =>
    request<{ message: Record<string, unknown>; export: unknown }>(
      `/api/exports/${encodeURIComponent(id)}/messages/${encodeURIComponent(
        messageId
      )}`
    ),
  exportStats: (id: string, filters: ExportFilters) =>
    request<ExportStatsResponse>(
      `/api/exports/${encodeURIComponent(id)}/stats?${filtersQuery(filters)}`
    ),
  importExport: (file: File) =>
    request<{ export: ExportSummary }>(
      "/api/exports/import",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Filename": encodeURIComponent(file.name),
        },
        body: file,
      },
      10 * 60 * 1000
    ),
  reindexExport: (id: string) =>
    request<{ export: ExportSummary }>(
      `/api/exports/${encodeURIComponent(id)}/reindex`,
      { method: "POST", body: "{}" }
    ),
  deleteExport: (id: string) =>
    request<{ ok: boolean }>(`/api/exports/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  exportDownloadUrl: (id: string) =>
    `/api/exports/${encodeURIComponent(id)}/download`,
};

function filtersQuery(
  filters: ExportFilters,
  extra: Record<string, string | number> = {}
): string {
  const params = new URLSearchParams();
  for (const key of ["q", "author", "channel", "from", "to"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, String(value));
  }
  return params.toString();
}

export function isActive(status: JobStatus): boolean {
  return ACTIVE.has(status);
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status);
}
