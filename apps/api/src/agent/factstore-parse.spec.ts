import { describe, expect, it } from "vite-plus/test";
import { cellToNumber, parseTable, type TableSpec } from "./factstore-parse.ts";

const spec: TableSpec = {
  name: "demo",
  file: "demo.md",
  table: "1.2",
  columns: ["WC", "EC", "RSA"],
  outColumns: ["item", "wc", "ec", "rsa"],
  description: "Demo table.",
};

const source = [
  "Table of contents",
  "Table 1.2 – Demo table ........................................................................ 9",
  "",
  "Table 1.2 – Demo table",
  "Item",
  "WC",
  "EC",
  "RSA",
  "Internet",
  "93,8",
  "74,5",
  "85,6",
  "Stove",
  "88,9",
  "88,9",
  "88,3",
  "",
  "Table 1.2 shows that access varies.",
].join("\n");

describe("cellToNumber", () => {
  it("normalises South African decimals and thousands separators", () => {
    expect(cellToNumber("4,3")).toBe("4.3");
    expect(cellToNumber("1 331")).toBe("1331");
    expect(cellToNumber("85,6%")).toBe("85.6");
  });

  it("returns null for missing markers", () => {
    expect(cellToNumber("-")).toBeNull();
    expect(cellToNumber("–")).toBeNull();
    expect(cellToNumber("")).toBeNull();
  });
});

describe("parseTable", () => {
  it("skips the table-of-contents caption and reads the real table", () => {
    const parsed = parseTable(spec, source);
    expect(parsed).not.toBeNull();
    expect(parsed?.rows).toEqual([
      { label: "Internet", values: ["93.8", "74.5", "85.6"] },
      { label: "Stove", values: ["88.9", "88.9", "88.3"] },
    ]);
    expect(parsed?.skipped).toBe(0);
  });

  it("returns null when the column header cannot be found", () => {
    const noHeader = source.replace("WC\nEC\nRSA", "A\nB\nC");
    expect(parseTable(spec, noHeader)).toBeNull();
  });

  it("drops a row whose value count does not match the columns", () => {
    const malformed = source.replace("Stove\n88,9\n88,9\n88,3", "Stove\n88,9\n88,3");
    const parsed = parseTable(spec, malformed);
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.skipped).toBe(1);
  });
});
