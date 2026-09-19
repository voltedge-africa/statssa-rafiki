import type {
  GapCategoryListResponse,
  GapQueryListResponse,
  GapSummary,
} from "@voltedge/gaps-contract";

const API_PREFIX = "/api/gaps";

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
    response = await fetch(`${API_PREFIX}${path}`, { headers: { accept: "application/json" } });
  } catch {
    throw new ApiError(0, "Could not reach the knowledge-gap service. Try again shortly.");
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

/** The knowledge-gap rollup for the last `days` days. */
export function getGapSummary(days: number) {
  return request<GapSummary>(`/summary?days=${days}`);
}

/** Categorised ungrounded queries, newest activity first. */
export function listGapCategories(params: { q?: string; limit?: number; offset?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return request<GapCategoryListResponse>(`/categories${suffix}`);
}

/** The individual queries behind one category. */
export function listGapQueries(
  categoryId: string,
  params: { limit?: number; offset?: number } = {},
) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return request<GapQueryListResponse>(
    `/categories/${encodeURIComponent(categoryId)}/queries${suffix}`,
  );
}
