import { Injectable, Logger } from "@nestjs/common";
import { AgentService } from "../agent/agent.service.ts";
import { GovernanceService } from "../admin/governance.service.ts";
import { LABEL_BATCH } from "./config.ts";
import { GapsService } from "./gaps.service.ts";

export const GAP_LABEL_SYSTEM_PROMPT = [
  "You name topic categories for Statistics South Africa's knowledge-gap log.",
  "You are given one representative query the approved Stats SA corpus could not answer.",
  "Reply with a short topic label (2 to 6 words) that would group paraphrases of the same information need.",
  "Examples: 'GBV death statistics', 'Municipal water access', 'Unemployment by province', 'Crime victimisation rates'.",
  "Reply with the label only: no quotes, no trailing punctuation, no explanation.",
].join("\n");

/**
 * Reduce a model reply to a safe category label, or null when there is nothing
 * usable. Keeps the first non-empty line, strips wrapping quotes and trailing
 * punctuation, and caps the length at 80 characters.
 */
export function cleanCategoryLabel(raw: string): string | null {
  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;

  const label = firstLine
    .replace(/^["'`\s-]+/, "")
    .replace(/["'`\s.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (label.length < 3) return null;
  return label.slice(0, 80);
}

/**
 * Upgrades deterministic auto-labels to model-written category names.
 *
 * The deterministic label is written at record time and is always safe to show;
 * this sweep only improves it. It is bounded per pass and silently skips on any
 * provider problem, so a model outage can never block the log. Lives in the
 * agent's module because it needs the model service.
 */
@Injectable()
export class GapsLabellingService {
  private readonly logger = new Logger(GapsLabellingService.name);

  constructor(
    private readonly gaps: GapsService,
    private readonly agent: AgentService,
    private readonly governance: GovernanceService,
  ) {}

  async labelPending(limit: number = LABEL_BATCH): Promise<number> {
    let pending: { id: string; label: string }[];
    try {
      pending = await this.gaps.pendingCategories(limit);
    } catch (error) {
      this.logger.warn(
        `Could not load pending gap categories: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
    if (pending.length === 0) return 0;
    if (!(await this.governance.isGenerationEnabled())) return 0;

    let labelled = 0;
    for (const category of pending) {
      try {
        const result = await this.agent.complete({
          system: GAP_LABEL_SYSTEM_PROMPT,
          user: category.label,
          feature: "gap_label",
        });
        if (result.error) continue;

        const label = cleanCategoryLabel(result.text);
        if (!label || label.toLowerCase() === category.label.toLowerCase()) continue;

        await this.gaps.applyLabel(category.id, label);
        labelled += 1;
      } catch (error) {
        this.logger.warn(
          `Could not label gap category ${category.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return labelled;
  }
}
