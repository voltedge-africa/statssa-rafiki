import { safeParse } from "valibot";
import { describe, expect, it } from "vite-plus/test";
import {
  analysisBriefContentSchema,
  briefCitations,
  briefHighlightCount,
  briefText,
  createAnalysisBriefSchema,
  extractJsonObject,
  parseBriefContent,
  toBriefSummary,
  type AnalysisBrief,
  type AnalysisBriefContent,
} from "../src/index.ts";

const content: AnalysisBriefContent = {
  summary: "Household access to services improved, with sanitation at 84.0% [ghs#4].",
  keyFindings: [
    { title: "Sanitation", detail: "Access rose to 84.0% [ghs#4]." },
    { title: "Electricity", detail: "Grid access held at 94.1% [factstore:household_assets]." },
  ],
  statistics: [
    {
      label: "Improved sanitation",
      value: "84.0%",
      period: "2025",
      context: "Up from 82.5% [ghs#4].",
    },
  ],
  trends: [{ title: "Service delivery", direction: "up", detail: "Steady improvement [ghs#4]." }],
  insights: [],
  context: [{ title: "Survey scope", detail: "National, 2025 [ghs#9]." }],
};

describe("createAnalysisBriefSchema", () => {
  it("requires at least one document and rejects an empty list", () => {
    expect(safeParse(createAnalysisBriefSchema, { sources: [] }).success).toBe(false);
    expect(
      safeParse(createAnalysisBriefSchema, { sources: ["ghs-2025-statistical-release.md"] })
        .success,
    ).toBe(true);
  });

  it("caps the document scope at ten", () => {
    const sources = Array.from({ length: 11 }, (_, index) => `doc-${index}.md`);
    expect(safeParse(createAnalysisBriefSchema, { sources }).success).toBe(false);
    expect(safeParse(createAnalysisBriefSchema, { sources: sources.slice(0, 10) }).success).toBe(
      true,
    );
  });

  it("trims the title and focus", () => {
    const parsed = safeParse(createAnalysisBriefSchema, {
      sources: ["a.md"],
      title: "  GHS angles  ",
      focus: "  media  ",
    });
    expect(parsed.success && parsed.output).toMatchObject({ title: "GHS angles", focus: "media" });
  });
});

describe("extractJsonObject", () => {
  it("returns the first balanced JSON object", () => {
    const text = 'Here is the brief:\n```json\n{"summary":"ok","keyFindings":[]}\n```\nDone.';
    expect(extractJsonObject(text)).toBe('{"summary":"ok","keyFindings":[]}');
  });

  it("ignores braces inside strings and escaped quotes", () => {
    const text = '{"summary":"a } b \\" { c"}';
    expect(extractJsonObject(text)).toBe(text);
  });

  it("returns null when no object is present", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject('{"summary":')).toBeNull();
  });
});

describe("parseBriefContent", () => {
  it("parses and validates a JSON string", () => {
    const parsed = parseBriefContent(JSON.stringify(content));
    expect(parsed?.summary).toContain("84.0%");
    expect(parsed?.keyFindings).toHaveLength(2);
  });

  it("accepts an object and drops unknown fields", () => {
    const parsed = parseBriefContent({ ...content, model: "sneaky" });
    expect(parsed).not.toBeNull();
    expect(parsed && "model" in parsed).toBe(false);
  });

  it("rejects content that fails the schema", () => {
    expect(parseBriefContent('{"summary":""}')).toBeNull();
    expect(parseBriefContent("not json")).toBeNull();
  });

  it("validates against the exported schema directly", () => {
    expect(analysisBriefContentSchema).toBeTruthy();
  });
});

describe("brief helpers", () => {
  it("flattens the brief for citation extraction", () => {
    const text = briefText(content);
    expect(text).toContain("Sanitation");
    expect(text).toContain("84.0%");
    expect(text).toContain("National, 2025 [ghs#9].");
  });

  it("extracts passage ids and fact-store tables", () => {
    expect(briefCitations(content)).toEqual({ chunkIds: [4, 9], tables: ["household_assets"] });
  });

  it("counts findings plus statistics", () => {
    expect(briefHighlightCount(content)).toBe(3);
  });

  it("summarises a persisted brief without its content", () => {
    const brief: AnalysisBrief = {
      id: "brief-1",
      title: "GHS 2025 media angles",
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      content,
      references: [],
      verification: { status: "verified", unverified: [] },
      model: "test/model",
      createdByLabel: "staff@example.co.za",
      createdAt: "2026-09-19T08:00:00.000Z",
    };

    expect(toBriefSummary(brief)).toEqual({
      id: "brief-1",
      title: "GHS 2025 media angles",
      sources: ["ghs-2025-statistical-release.md"],
      createdAt: "2026-09-19T08:00:00.000Z",
      createdByLabel: "staff@example.co.za",
      highlights: 3,
    });
  });
});
