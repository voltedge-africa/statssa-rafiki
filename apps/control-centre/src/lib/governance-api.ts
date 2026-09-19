import type {
  GovernanceSettingsResponse,
  GovernanceSettingsUpdateInput,
} from "@voltedge/agent-contract";

const API_PREFIX = "/api/admin/governance";

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

async function request<T>(init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_PREFIX, {
      headers: { accept: "application/json", "content-type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError(0, "Could not reach the governance service. Try again shortly.");
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

export function getGovernance() {
  return request<GovernanceSettingsResponse>();
}

export function updateGovernance(input: GovernanceSettingsUpdateInput) {
  return request<GovernanceSettingsResponse>({ method: "PATCH", body: JSON.stringify(input) });
}
