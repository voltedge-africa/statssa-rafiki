import type {
  ApproveMediaRequestInput,
  CreateMediaNoteInput,
  MediaOfficialResponseListResponse,
  MediaRequestListResponse,
  MediaRequestPublic,
  MediaRequestStaffDetail,
  MediaRequestStatus,
  MediaRequestSummaryListResponse,
  MediaRequestTracking,
  RejectMediaRequestInput,
  SubmitMediaRequestInput,
  UpdateMediaRequestInput,
} from "@voltedge/media-contract";

const API_PREFIX = "/api/media";

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
    throw new ApiError(0, "Could not reach the media desk. Check your connection and try again.");
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

export function submitMediaRequest(input: SubmitMediaRequestInput) {
  return request<{ request: MediaRequestPublic }>("/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface MediaOwnerListParams {
  q?: string;
  status?: MediaRequestStatus;
  limit?: number;
  offset?: number;
}

function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value !== "") search.set(key, value);
    else if (typeof value === "number") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listMyMediaRequests(params: MediaOwnerListParams = {}) {
  return request<MediaRequestSummaryListResponse>(`/requests/mine${queryString(params)}`);
}

export interface MediaFeedParams {
  limit?: number;
  offset?: number;
}

/** Every approved official response, for the signed-in media-room feed. */
export function listOfficialResponses(params: MediaFeedParams = {}) {
  return request<MediaOfficialResponseListResponse>(`/requests/feed${queryString(params)}`);
}

export function getMyMediaRequest(reference: string) {
  return request<{ request: MediaRequestTracking }>(
    `/requests/mine/${encodeURIComponent(reference)}`,
  );
}

export function withdrawMediaRequest(reference: string) {
  return request<{ request: MediaRequestPublic }>(
    `/requests/${encodeURIComponent(reference)}/withdraw`,
    { method: "POST" },
  );
}

export interface MediaQueueParams {
  status?: MediaRequestStatus;
  assigned?: string;
  q?: string;
}

export function listMediaRequests(params: MediaQueueParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return request<MediaRequestListResponse>(`/requests${query ? `?${query}` : ""}`);
}

export function getMediaRequest(reference: string) {
  return request<{ request: MediaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}`,
  );
}

export function updateMediaRequest(reference: string, input: UpdateMediaRequestInput) {
  return request<{ request: MediaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function approveMediaRequest(reference: string, input: ApproveMediaRequestInput) {
  return request<{ request: MediaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}/approve`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function rejectMediaRequest(reference: string, input: RejectMediaRequestInput) {
  return request<{ request: MediaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}/reject`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function regenerateMediaRequest(reference: string) {
  return request<{ request: MediaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}/regenerate`,
    { method: "POST" },
  );
}

export function addMediaNote(reference: string, input: CreateMediaNoteInput) {
  return request<{ request: MediaRequestStaffDetail }>(
    `/requests/${encodeURIComponent(reference)}/notes`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
