import { describe, expect, it } from "vite-plus/test";
import { parseCsv, toCsv } from "./factstore-csv.ts";

describe("toCsv", () => {
  it("quotes fields containing commas, quotes or newlines", () => {
    expect(
      toCsv([
        ["a", "b,c"],
        ['say "hi"', "line\nbreak"],
      ]),
    ).toBe('a,"b,c"\r\n"say ""hi""","line\nbreak"\r\n');
  });
});

describe("parseCsv", () => {
  it("round-trips quoted cells", () => {
    const rows = [
      ["table_name", "description"],
      ["demo", 'By province, "urban" and rural'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("drops blank trailing lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
