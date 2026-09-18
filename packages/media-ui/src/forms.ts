export type FieldErrors = Record<string, string>;

interface IssueLike {
  path?: string | readonly { key: unknown }[];
  message?: string;
}

function issueField(issue: IssueLike): string {
  const { path } = issue;
  if (typeof path === "string") return path.split(".")[0] ?? "form";
  const key = path?.[0]?.key;
  return typeof key === "string" ? key : "form";
}

/** Collapse valibot/API issues into the first message per form field. */
export function fieldErrors(issues: readonly IssueLike[]): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of issues) {
    const field = issueField(issue);
    if (!result[field] && issue.message) result[field] = issue.message;
  }
  return result;
}
