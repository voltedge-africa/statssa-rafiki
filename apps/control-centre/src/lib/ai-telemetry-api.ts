import type {
  AiModelCall,
  AiPage,
  AiSessionSpan,
  AiToolCall,
  AiUsageFilters,
  AiUsageSummary,
} from "@voltedge/agent-contract";

const API_PREFIX = "/api/admin/ai";

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly issues: ApiIssue[];

  constructor(status: number, message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      headers: { accept: "application/json" },
    });
  } catch {
    throw new ApiError(0, "Could not reach the AI governance service. Try again shortly.");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as { message?: unknown; issues?: unknown } | null;
    const message =
      typeof body?.message === "string" ? body.message : `Request failed (${response.status}).`;
    const issues = Array.isArray(body?.issues) ? (body.issues as ApiIssue[]) : [];
    throw new ApiError(response.status, message, issues);
  }

  return data as T;
}

/** Serialise the supported filters into query parameters (the API calls the session filter `session`). */
function params(filters: AiUsageFilters, extra: Record<string, string | number> = {}): string {
  const search = new URLSearchParams();
  if (filters.from) search.set("from", filters.from);
  if (filters.to) search.set("to", filters.to);
  if (filters.model) search.set("model", filters.model);
  if (filters.feature) search.set("feature", filters.feature);
  if (filters.role) search.set("role", filters.role);
  if (filters.tool) search.set("tool", filters.tool);
  if (filters.sessionId) search.set("session", filters.sessionId);
  for (const [key, value] of Object.entries(extra)) search.set(key, String(value));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function getAiUsage(filters: AiUsageFilters) {
  return request<AiUsageSummary>(`/usage${params(filters)}`);
}

export function listAiModelCalls(filters: AiUsageFilters, limit: number, offset: number) {
  return request<AiPage<AiModelCall>>(`/model-calls${params(filters, { limit, offset })}`);
}

export function listAiToolCalls(filters: AiUsageFilters, limit: number, offset: number) {
  return request<AiPage<AiToolCall>>(`/tool-calls${params(filters, { limit, offset })}`);
}

export function getAiSession(sessionId: string) {
  return request<{ spans: AiSessionSpan[] }>(`/sessions/${encodeURIComponent(sessionId)}`);
}
