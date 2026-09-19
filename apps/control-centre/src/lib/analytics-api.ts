import type { AnalyticsSnapshot } from "@voltedge/analytics-contract";

const API_PREFIX = "/api/analytics";

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
    throw new ApiError(0, "Could not reach the analytics service. Try again shortly.");
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

/** The cross-desk snapshot for the last `days` days. AI usage is included for Admins only. */
export function getAnalytics(days: number) {
  return request<AnalyticsSnapshot>(`?days=${days}`);
}
