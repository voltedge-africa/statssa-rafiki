import { describe, expect, it } from "vite-plus/test";
import { REFUSAL_ANSWER, isRefusalAnswer } from "./refusal.ts";

describe("isRefusalAnswer", () => {
  it("matches the mandated refusal exactly", () => {
    expect(isRefusalAnswer(REFUSAL_ANSWER)).toBe(true);
    expect(isRefusalAnswer(`  ${REFUSAL_ANSWER}  `)).toBe(true);
    expect(isRefusalAnswer(REFUSAL_ANSWER.replace(/\.$/, ""))).toBe(true);
  });

  it("does not match a grounded answer that quotes the refusal", () => {
    expect(
      isRefusalAnswer(`The survey covers access, not inflation. ${REFUSAL_ANSWER} for the CPI.`),
    ).toBe(false);
  });

  it("does not match an empty or unrelated answer", () => {
    expect(isRefusalAnswer("")).toBe(false);
    expect(
      isRefusalAnswer("Sanitation access rose to 84.0% [ghs-2025-statistical-release.md#4]."),
    ).toBe(false);
  });
});
