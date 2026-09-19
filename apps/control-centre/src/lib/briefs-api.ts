import type {
  AnalysisBriefListResponse,
  AnalysisBriefResponse,
  CreateAnalysisBriefInput,
  IndexedDocumentListResponse,
} from "@voltedge/brief-contract";

const API_PREFIX = "/api/analysis";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Could not reach the analysis service. Try again shortly.");
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

/** The indexed official documents the analysis builder can scope a brief to. */
export function listIndexedDocuments() {
  return request<IndexedDocumentListResponse>("/documents");
}

/** Generate and persist a brief from the selected documents. */
export function createAnalysisBrief(input: CreateAnalysisBriefInput) {
  return request<AnalysisBriefResponse>("/briefs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function listAnalysisBriefs(params: { q?: string; limit?: number; offset?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return request<AnalysisBriefListResponse>(`/briefs${suffix}`);
}

export function getAnalysisBrief(id: string) {
  return request<AnalysisBriefResponse>(`/briefs/${encodeURIComponent(id)}`);
}
