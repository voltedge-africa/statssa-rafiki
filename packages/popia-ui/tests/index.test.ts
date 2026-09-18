import { expect, test } from "vite-plus/test";

import { duePhrase, fieldErrors, formatDate } from "../src/index.ts";

test("fieldErrors keeps the first message per field", () => {
  const errors = fieldErrors([
    { path: [{ key: "email" }], message: "Enter a valid email address." },
    { path: [{ key: "email" }], message: "The second message is dropped." },
    { path: "details", message: "too short" },
  ]);
  expect(errors).toEqual({
    email: "Enter a valid email address.",
    details: "too short",
  });
});

test("duePhrase reports open and closed deadlines", () => {
  const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
  expect(duePhrase(future, "in_review")).toBe("Due in 3 days");
  expect(duePhrase(future, "completed")).toContain("Closed");
});

test("formatDate renders an em dash for empty values", () => {
  expect(formatDate(null)).toBe("—");
});
