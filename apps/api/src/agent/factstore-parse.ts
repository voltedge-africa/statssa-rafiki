/**
 * Curated extraction of published GHS tables from the converter's flattened
 * markdown. The PDF-to-markdown step does not emit pipe tables: a table's cells
 * land as one token per line under a `Table N.N – ...` caption. This module
 * anchors on a table's expected column labels and then reads the flattened
 * label/values stream that follows.
 *
 * The registry is deliberately small and explicit. Each entry is verified by
 * its expected column labels, and any row whose value count does not match the
 * column count is dropped and reported, so a mis-parsed table can never be
 * silently loaded. Add more tables by appending a spec.
 */

export interface TableSpec {
  /** Output factstore table name. */
  name: string;
  /** Corpus file the table lives in, relative to the corpus directory. */
  file: string;
  /** Table number as it appears in the caption, e.g. `"14.1"`. */
  table: string;
  /** Column labels expected verbatim in the source, used to locate the header. */
  columns: string[];
  /** Output columns: the row-label column first, then one per source column. */
  outColumns: string[];
  /** Human description surfaced by `list_fact_tables`. */
  description: string;
}

export const TABLE_SPECS: TableSpec[] = [
  {
    name: "internet_access_by_province",
    file: "ghs-2025-statistical-release.md",
    table: "14.1",
    columns: ["WC", "EC", "NC", "FS", "KZN", "NW", "GP", "MP", "LP", "RSA"],
    outColumns: [
      "type_of_internet_access",
      "wc",
      "ec",
      "nc",
      "fs",
      "kzn",
      "nw",
      "gp",
      "mp",
      "lp",
      "rsa",
    ],
    description:
      "Percentage of households with access to the internet by province and type of internet access, 2025 (Table 14.1).",
  },
  {
    name: "household_assets",
    file: "ghs-2025-statistical-release.md",
    table: "19.1",
    columns: ["Rural", "Urban", "Metro", "South Africa"],
    outColumns: ["asset", "rural", "urban", "metro", "south_africa"],
    description:
      "Percentage of households owning selected assets by urban/rural status, 2025 (Table 19.1).",
  },
  {
    name: "response_rates_by_province",
    file: "ghs-2025-statistical-release.md",
    table: "20.1",
    columns: ["Response Rates"],
    outColumns: ["province_metro", "response_rate"],
    description: "GHS 2025 survey response rate per province and metropolitan area (Table 20.1).",
  },
  {
    name: "higher_education_population_group",
    file: "ghs-2025-statistical-release.md",
    table: "4.3",
    columns: ["2002", "2025"],
    outColumns: ["population_group", "y2002", "y2025"],
    description:
      "Distribution of students enrolled at higher education institutions by population group, 2002 and 2025 (Table 4.3).",
  },
];

export interface ParsedRow {
  label: string;
  /** Canonical decimal strings, one per source column; `null` for missing cells. */
  values: (string | null)[];
}

export interface ParsedTable {
  spec: TableSpec;
  rows: ParsedRow[];
  /** Rows seen with a value count that did not match the spec, dropped and reported. */
  skipped: number;
}

const MISSING_CELL = /^(?:-|–|—|\.{1,2}|\*|N\/A)$/i;
const NUMERIC_CELL = /^-?\d{1,3}(?:[ \u00A0\u202F]\d{3})*(?:[.,]\d+)?%?$/;

function isCell(line: string): boolean {
  return MISSING_CELL.test(line) || NUMERIC_CELL.test(line);
}

/** Reduce a source cell to a canonical decimal string, or null when missing. */
export function cellToNumber(cell: string): string | null {
  const trimmed = cell.trim();
  if (!trimmed || MISSING_CELL.test(trimmed)) return null;

  let token = trimmed.replace(/[%\s\u00A0\u202F]/g, "");
  if (token.includes(",")) {
    if (/^\d{1,3}(,\d{3})+$/.test(token)) token = token.replace(/,/g, "");
    else if (/^\d+,\d+$/.test(token)) token = token.replace(",", ".");
    else token = token.replace(/,/g, "");
  }

  const value = Number(token);
  return Number.isFinite(value) ? String(value) : null;
}

const TERMINATOR =
  /^(Table [0-9]+\.[0-9]+|Figure [0-9]+\.[0-9]+|#{1,4} |---+|General Household Survey|STATISTICS SOUTH AFRICA|P0318|[*_]Page \d+[*_])/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract one table. A table's caption also appears in the table of contents, so
 * every `Table N.N` occurrence is tried and the one whose expected column
 * labels validate wins. Returns null when no occurrence parses, so a corpus edit
 * that moves or drops the table fails loudly rather than producing a wrong one.
 */
export function parseTable(spec: TableSpec, source: string): ParsedTable | null {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const captionRe = new RegExp(`^Table ${escapeRegExp(spec.table)}\\b`);

  for (let caption = 0; caption < lines.length; caption += 1) {
    if (!captionRe.test(lines[caption].trim())) continue;

    // Collect the table body: everything after the caption up to the next table,
    // figure, heading, page marker or survey footer.
    const body: string[] = [];
    for (let i = caption + 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (TERMINATOR.test(line)) break;
      body.push(line);
    }

    // Anchor on the expected column labels appearing consecutively.
    const headerAt = body.findIndex((_, index) =>
      spec.columns.every((column, offset) => body[index + offset] === column),
    );
    if (headerAt === -1) continue;

    const data = body.slice(headerAt + spec.columns.length);
    const rows: ParsedRow[] = [];
    let skipped = 0;
    let label: string | null = null;
    let values: string[] = [];

    const flush = () => {
      if (label === null) return;
      if (values.length === spec.columns.length) {
        rows.push({ label, values: values.map(cellToNumber) });
      } else {
        skipped += 1;
      }
      label = null;
      values = [];
    };

    for (const line of data) {
      if (!line) continue;
      if (TERMINATOR.test(line)) break;
      if (isCell(line)) {
        if (label !== null) values.push(line);
      } else {
        flush();
        label = line;
      }
    }
    flush();

    if (rows.length > 0) return { spec, rows, skipped };
  }

  return null;
}
