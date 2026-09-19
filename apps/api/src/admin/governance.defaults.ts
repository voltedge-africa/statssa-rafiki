import { DRAFT_CONFIDENCE_MIN } from "@voltedge/media-contract";
import type { GovernancePolicy, GovernanceSettings } from "@voltedge/agent-contract";
import { TOOLS } from "../agent/tools.ts";

/**
 * The governance defaults, used the first time the singleton settings row is read.
 * These are the operator's starting point, not hard limits: every value here is
 * editable from the control centre and read back by the enforcement points.
 */

export const DEFAULT_POLICIES: GovernancePolicy[] = [
  {
    area: "Retrieval",
    rule: "Answers draw only on approved, indexed Stats SA passages.",
    enforcement:
      "The draft service returns an information gap and makes no model call when retrieval finds nothing.",
  },
  {
    area: "Grounding",
    rule: "Every figure is cited as [source#chunk].",
    enforcement:
      "The post-generation gate blocks release unless the text cites at least one retrieved passage, and only retrieved ones.",
  },
  {
    area: "Confidence",
    rule: "Weak retrieval escalates to a human.",
    enforcement:
      "The weakest cited passage similarity must clear the confidence floor; below it the release action is disabled.",
  },
  {
    area: "Human approval",
    rule: "Nothing is released without a communications official.",
    enforcement:
      "Only an approve call moves a request to approved; there is no automated publish path.",
  },
  {
    area: "Reviewer guidance",
    rule: "Guidance steers emphasis, never invents facts.",
    enforcement:
      "Reviewer guidance is subordinate to the passages in the prompt and cannot introduce unsupported claims.",
  },
  {
    area: "Labelling",
    rule: "AI content is always identifiable.",
    enforcement:
      "The draft card is structurally badged AI-generated and not approved; the requester never sees drafts.",
  },
  {
    area: "Data minimisation",
    rule: "Telemetry records behaviour, not content.",
    enforcement: "Persisted spans strip prompts, completions, tool arguments and outputs.",
  },
  {
    area: "Access",
    rule: "Least privilege by role.",
    enforcement:
      "Press, Staff and Admin capabilities are separated at the API guard and the app proxies.",
  },
];

export const DEFAULT_INCIDENT_RESPONSE: string[] = [
  "Rotate the provider key to revoke model access immediately; drafting surfaces an information gap rather than failing open.",
  "Turn off generation in the governance settings to disable chat and drafting across every portal at once.",
  "Remove the corpus index to force every request to an information gap and out of automated drafting.",
  "Every action is observable in the telemetry view, and no prompt or completion content is retained.",
];

/** The full tool catalogue, i.e. every capability the agent could be allowed to use. */
export function availableToolNames(): string[] {
  return TOOLS.map((tool) => tool.name);
}

export function defaultGovernanceSettings(): GovernanceSettings {
  return {
    confidenceMin: DRAFT_CONFIDENCE_MIN,
    generationEnabled: true,
    enabledTools: availableToolNames(),
    policies: DEFAULT_POLICIES,
    incidentResponse: DEFAULT_INCIDENT_RESPONSE,
    updatedAt: null,
    updatedBy: null,
  };
}
