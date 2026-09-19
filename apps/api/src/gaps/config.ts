import { numberOrDefault } from "../env.ts";

/**
 * Cosine similarity at which an ungrounded query joins an existing category
 * instead of opening a new one. Local multilingual embeddings place paraphrases
 * ("gbv death toll" / "gender-based violence deaths") well above this floor.
 */
export const CATEGORY_SIMILARITY_MIN = numberOrDefault("GAP_CATEGORY_SIMILARITY", 0.82);

/** Stored query text cap — bounds both the row and the embedding input. */
export const MAX_GAP_QUERY_CHARS = numberOrDefault("GAP_MAX_QUERY_CHARS", 2000);

/** The summary window, in days. */
export const DEFAULT_DAYS = numberOrDefault("GAP_DEFAULT_DAYS", 30);
export const MIN_DAYS = 7;
export const MAX_DAYS = 365;

/** How many model-labelled categories one sweep may upgrade. */
export const LABEL_BATCH = numberOrDefault("GAP_LABEL_BATCH", 5);
