/**
 * The exact answer the system prompt mandates when the approved sources cannot
 * support a response. Shared so the chat controller can detect a refusal and
 * record it in the knowledge-gap log.
 */
export const REFUSAL_ANSWER =
  "The provided Stats SA documentation does not contain this information.";

function normalise(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "");
}

/**
 * True only when the whole answer is the mandated refusal (trailing punctuation
 * tolerated). A grounded answer that merely quotes the sentence must not be
 * logged as an ungrounded query.
 */
export function isRefusalAnswer(text: string): boolean {
  return normalise(text) === normalise(REFUSAL_ANSWER);
}
