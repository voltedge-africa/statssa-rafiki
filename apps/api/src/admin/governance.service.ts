import { Injectable } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import type {
  GovernanceSettings,
  GovernanceSettingsResponse,
  GovernanceSettingsUpdateInput,
} from "@voltedge/agent-contract";
import { availableToolNames, defaultGovernanceSettings } from "./governance.defaults.ts";
import { GovernanceRepository } from "./governance.repository.ts";

/**
 * The single read/write seam for AI governance settings. Enforcement points call
 * the narrow accessors (`isGenerationEnabled`, `confidenceMin`, `enabledTools`),
 * so the storage shape never leaks into the chat, draft or gate code.
 */
@Injectable()
export class GovernanceService {
  constructor(private readonly repo: GovernanceRepository) {}

  async get(): Promise<GovernanceSettingsResponse> {
    return { settings: await this.ensure(), availableTools: availableToolNames() };
  }

  async update(
    input: GovernanceSettingsUpdateInput,
    user: AuthUser,
  ): Promise<GovernanceSettingsResponse> {
    const current = await this.ensure();
    const next: GovernanceSettings = {
      confidenceMin: input.confidenceMin ?? current.confidenceMin,
      generationEnabled: input.generationEnabled ?? current.generationEnabled,
      enabledTools: input.enabledTools ?? current.enabledTools,
      policies: input.policies ?? current.policies,
      incidentResponse: input.incidentResponse ?? current.incidentResponse,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };
    await this.repo.update(next, user.id);
    return this.get();
  }

  async settings(): Promise<GovernanceSettings> {
    return this.ensure();
  }

  async isGenerationEnabled(): Promise<boolean> {
    return (await this.ensure()).generationEnabled;
  }

  async confidenceMin(): Promise<number> {
    return (await this.ensure()).confidenceMin;
  }

  async enabledTools(): Promise<string[]> {
    return (await this.ensure()).enabledTools;
  }

  /** Read the row, seeding the defaults on first use. */
  private async ensure(): Promise<GovernanceSettings> {
    const stored = await this.repo.read();
    if (stored) return stored;
    const defaults = defaultGovernanceSettings();
    await this.repo.insertDefaults(defaults);
    return (await this.repo.read()) ?? defaults;
  }
}
