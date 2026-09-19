/** Minimal RFC 4180 CSV writer and parser, shared by the fact-store derive and load scripts. */

function needsQuoting(field: string): boolean {
  return /[",\r\n]/.test(field);
}

function quote(field: string): string {
  return needsQuoting(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** Serialise a grid of string cells to a CSV document (CRLF line endings). */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
}

/** Parse a CSV document into a grid of string cells, honouring quoted fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Swallow; the following \n terminates the row.
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.length > 0));
}
