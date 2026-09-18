import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  deadlinePhrase,
  fieldErrors,
  formatDate,
  listMyMediaRequests,
  listOfficialResponses,
} from "../src/index.ts";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(payload: unknown): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

test("builds the owner list query string", async () => {
  const calls = stubFetch({ requests: [], total: 0 });
  await listMyMediaRequests({ q: "inflation", status: "approved", limit: 10, offset: 5 });
  expect(calls[0]).toBe("/api/media/requests/mine?q=inflation&status=approved&limit=10&offset=5");
});

test("builds the official responses feed query", async () => {
  const calls = stubFetch({ responses: [], total: 0 });
  await listOfficialResponses({ limit: 5 });
  expect(calls[0]).toBe("/api/media/requests/feed?limit=5");
});

test("fieldErrors keeps the first message per field", () => {
  const errors = fieldErrors([
    { path: [{ key: "claim" }], message: "Describe the claim in at least 10 characters." },
    { path: [{ key: "claim" }], message: "The second message is dropped." },
    { path: "deadline", message: "Enter a valid date and time." },
  ]);
  expect(errors).toEqual({
    claim: "Describe the claim in at least 10 characters.",
    deadline: "Enter a valid date and time.",
  });
});

test("deadlinePhrase reports open and closed deadlines", () => {
  const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
  expect(deadlinePhrase(future, "awaiting_review")).toBe("Deadline in 3 days");
  expect(deadlinePhrase(future, "approved")).toContain("2026");
  expect(deadlinePhrase(null, "submitted")).toBe("No deadline given");
});

test("formatDate renders an em dash for empty values", () => {
  expect(formatDate(null)).toBe("—");
});
