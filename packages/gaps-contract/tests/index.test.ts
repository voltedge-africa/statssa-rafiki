import { safeParse } from "valibot";
import { describe, expect, it } from "vite-plus/test";
import {
  GAP_SURFACE_LABELS,
  gapCategoryListQuerySchema,
  isGapSurface,
  labelFromQuery,
  share,
} from "../src/index.ts";

describe("gap surfaces", () => {
  it("guards known surfaces and labels them", () => {
    expect(isGapSurface("chat")).toBe(true);
    expect(isGapSurface("media_draft")).toBe(true);
    expect(isGapSurface("analysis_brief")).toBe(false);
    expect(GAP_SURFACE_LABELS.chat).toBe("Public chat");
  });
});

describe("labelFromQuery", () => {
  it("takes the first sentence, title-cased and trimmed", () => {
    expect(labelFromQuery("what is the gbv death toll in south africa? It matters.")).toBe(
      "What is the gbv death toll in south africa",
    );
  });

  it("collapses whitespace and caps the label length", () => {
    const label = labelFromQuery(`  a   very ${"long ".repeat(20)}query  `);
    expect(label.length).toBeLessThanOrEqual(60);
    expect(label).not.toContain("  ");
  });

  it("falls back for an empty query", () => {
    expect(labelFromQuery("   ")).toBe("Uncategorised query");
  });
});

describe("gapCategoryListQuerySchema", () => {
  it("trims the search term and caps its length", () => {
    const parsed = safeParse(gapCategoryListQuerySchema, { q: "  gbv  " });
    expect(parsed.success && parsed.output.q).toBe("gbv");

    expect(safeParse(gapCategoryListQuerySchema, { q: "x".repeat(201) }).success).toBe(false);
  });
});

describe("share", () => {
  it("returns null for an empty whole and a ratio otherwise", () => {
    expect(share(0, 0)).toBeNull();
    expect(share(1, 4)).toBe(0.25);
  });
});
