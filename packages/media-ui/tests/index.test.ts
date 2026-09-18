import { expect, test } from "vite-plus/test";

import { deadlinePhrase, fieldErrors, formatDate } from "../src/index.ts";

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
