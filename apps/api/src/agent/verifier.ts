export type VerificationStatus = "verified" | "unverified" | "skipped";

export interface VerificationResult {
  status: VerificationStatus;
  /** Canonical numeric strings claimed in the answer that appear in no retrieved source. */
  unverified: string[];
}

const NUMBER_RE = /-?\d+(?:[\s\u00A0\u202F.,]\d+)*/g;

/**
 * Reduce a matched numeric token to a canonical decimal string, using the
 * corpus's South African conventions: a comma between digits is a decimal
 * separator (`2,6` -> `2.6`), a space or thin space is a thousands separator
 * (`1 000 000` -> `1000000`), and `1,234,567` style grouping is collapsed.
 */
function canonical(raw: string): string | null {
  let token = raw.replace(/[\s\u00A0\u202F]/g, "");
  if (!token) return null;

  if (token.includes(",")) {
    if (/^\d{1,3}(,\d{3})+$/.test(token)) {
      token = token.replace(/,/g, "");
    } else if (/^\d+,\d+$/.test(token)) {
      token = token.replace(",", ".");
    } else {
      token = token.replace(/,/g, "");
    }
  }

  const value = Number(token);
  if (!Number.isFinite(value)) return null;
  return String(value);
}

/**
 * Every number in a text as canonical strings. Citation markers
 * (`[source#chunk]`, `[factstore:table]`) are stripped first so chunk ids do
 * not count as claimed figures.
 */
export function extractNumbers(text: string): string[] {
  const cleaned = text.replace(/\[[^[\]]*\]/g, " ");
  const found: string[] = [];
  for (const match of cleaned.matchAll(NUMBER_RE)) {
    const raw = match[0].replace(/^[-+]\s*/, "");
    const value = canonical(raw);
    if (value !== null) found.push(value);
  }
  return found;
}

/**
 * Pull the ground-truth numbers out of a tool result's `details` payload so
 * they can be checked against the numbers the model puts in its answer.
 */
export function collectToolGroundTruth(name: string, details: unknown, into: Set<string>): void {
  if (!details || typeof details !== "object") return;

  if (name === "search_statssa") {
    const hits = (details as { hits?: { text?: string }[] }).hits ?? [];
    for (const hit of hits) {
      if (!hit.text) continue;
      for (const number of extractNumbers(hit.text)) into.add(number);
    }
    return;
  }

  if (name === "query_factstore") {
    const rows = (details as { rows?: unknown[] }).rows ?? [];
    for (const row of rows) {
      for (const number of extractNumbers(JSON.stringify(row))) into.add(number);
    }
    return;
  }

  if (name === "calculate") {
    const result = (details as { result?: unknown }).result;
    if (typeof result === "number" && Number.isFinite(result)) into.add(String(result));
  }
}

/**
 * Deterministic, zero-cost check: every number in the assistant's answer must
 * appear (after normalisation) in the ground truth collected from the turn's
 * retrieved passages, fact-store rows, calculate results and the user's own
 * message. Numbers that do not are reported as unverified — no second model
 * call, so the check itself cannot hallucinate.
 */
export function verifyNumbers(answer: string, groundTruth: Iterable<string>): VerificationResult {
  const pool = new Set(groundTruth);
  const claimed = extractNumbers(answer);
  if (claimed.length === 0) return { status: "verified", unverified: [] };

  const unverified = [...new Set(claimed.filter((number) => !pool.has(number)))];
  return { status: unverified.length > 0 ? "unverified" : "verified", unverified };
}
