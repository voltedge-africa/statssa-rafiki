import type {
  CreatePopiaNoteInput,
  PopiaRequestListResponse,
  PopiaRequestPublic,
  PopiaRequestStaffDetail,
  PopiaRequestTracking,
  SubmitPopiaRequestInput,
  TrackPopiaRequestInput,
  UpdatePopiaRequestInput,
} from "@voltedge/popia-contract";

const API_PREFIX = "/api/popia";

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    response = await fetch(`${API_PREFIX}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Could not reach the request desk. Check your connection and try again.");
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

export function submitPopiaRequest(input: SubmitPopiaRequestInput) {
  return request<{ request: PopiaRequestPublic }>("/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function trackPopiaRequest(input: TrackPopiaRequestInput) {
  return request<{ request: PopiaRequestTracking }>("/requests/track", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listMyRequests() {
  return request<{ requests: PopiaRequestTracking[] }>("/requests/mine");
}

export interface CaseQueueParams {
  status?: string;
  type?: string;
  assigned?: string;
  q?: string;
}

export function listCaseRequests(params: CaseQueueParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return request<PopiaRequestListResponse>(`/requests${query ? `?${query}` : ""}`);
}

export function getCaseRequest(reference: string) {
  return request<{ request: PopiaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}`,
  );
}

export function updateCaseRequest(reference: string, input: UpdatePopiaRequestInput) {
  return request<{ request: PopiaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function addCaseNote(reference: string, input: CreatePopiaNoteInput) {
  return request<{ request: PopiaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}/notes`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
