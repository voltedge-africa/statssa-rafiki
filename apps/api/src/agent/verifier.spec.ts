import { describe, expect, it } from "vite-plus/test";
import { collectToolGroundTruth, extractNumbers, verifyNumbers } from "./verifier.ts";

describe("extractNumbers", () => {
  it("normalises South African decimals and thousands", () => {
    expect(extractNumbers("Inflation was 2,6% and 1 000 000 people")).toEqual(["2.6", "1000000"]);
  });

  it("strips citation markers before extracting", () => {
    expect(extractNumbers("3.2% in July [cpi-index#4]")).toEqual(["3.2"]);
  });

  it("handles ranges and years without a phantom negative", () => {
    expect(extractNumbers("2002-2025 and 11,4")).toEqual(["2002", "2025", "11.4"]);
  });
});

describe("verifyNumbers", () => {
  it("passes when every number is grounded", () => {
    const result = verifyNumbers("Inflation was 2,6% in 2025.", ["2.6", "2025"]);
    expect(result.status).toBe("verified");
    expect(result.unverified).toEqual([]);
  });

  it("passes when the answer contains no numbers", () => {
    const result = verifyNumbers("The report discusses the weighting methodology.", []);
    expect(result.status).toBe("verified");
  });

  it("flags numbers that appear in no source", () => {
    const result = verifyNumbers("Inflation was 4.1% in 2025.", ["2.6", "2025"]);
    expect(result.status).toBe("unverified");
    expect(result.unverified).toEqual(["4.1"]);
  });
});

describe("collectToolGroundTruth", () => {
  it("collects passage numbers from search hits", () => {
    const set = new Set<string>();
    collectToolGroundTruth("search_statssa", { hits: [{ text: "Rate was 3,2%." }] }, set);
    expect(set.has("3.2")).toBe(true);
  });

  it("collects row values from factstore results", () => {
    const set = new Set<string>();
    collectToolGroundTruth("query_factstore", { rows: [{ value: 42.5 }, { label: "2025" }] }, set);
    expect(set.has("42.5")).toBe(true);
    expect(set.has("2025")).toBe(true);
  });

  it("collects calculate results", () => {
    const set = new Set<string>();
    collectToolGroundTruth("calculate", { result: 6.25 }, set);
    expect(set.has("6.25")).toBe(true);
  });
});
