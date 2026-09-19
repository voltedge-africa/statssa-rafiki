import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { GovernancePolicy, GovernanceSettings } from "@voltedge/agent-contract";
import postgres, { type Sql } from "postgres";
import { orDefault } from "../env.ts";

const DEFAULT_DATABASE_URL = "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth";
const SETTINGS_ID = "default";

function toJson(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}

interface GovernanceSettingsDbRow {
  confidenceMin: string;
  generationEnabled: boolean;
  enabledTools: string[];
  policies: GovernancePolicy[];
  incidentResponse: string[];
  updatedAt: Date;
  updatedBy: string | null;
}

const COLUMNS = `
  confidence_min AS "confidenceMin", generation_enabled AS "generationEnabled",
  enabled_tools AS "enabledTools", policies, incident_response AS "incidentResponse",
  updated_at AS "updatedAt", updated_by AS "updatedBy"
`;

/** Reads and writes the singleton governance settings row. */
@Injectable()
export class GovernanceRepository implements OnModuleDestroy {
  private readonly sql: Sql;

  constructor() {
    this.sql = postgres(orDefault("DATABASE_URL", DEFAULT_DATABASE_URL), {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async read(): Promise<GovernanceSettings | null> {
    const [row] = await this.sql<GovernanceSettingsDbRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)}
      FROM governance_settings
      WHERE id = ${SETTINGS_ID}
    `;
    return row ? toSettings(row) : null;
  }

  /** Insert the defaults once. A concurrent insert is a no-op; `read` returns the winner. */
  async insertDefaults(settings: GovernanceSettings): Promise<void> {
    await this.sql`
      INSERT INTO governance_settings (
        id, confidence_min, generation_enabled, enabled_tools, policies, incident_response
      )
      VALUES (
        ${SETTINGS_ID}, ${settings.confidenceMin}, ${settings.generationEnabled},
        ${this.sql.json(toJson(settings.enabledTools))}, ${this.sql.json(toJson(settings.policies))},
        ${this.sql.json(toJson(settings.incidentResponse))}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async update(settings: GovernanceSettings, updatedBy: string): Promise<void> {
    await this.sql`
      UPDATE governance_settings SET
        confidence_min = ${settings.confidenceMin},
        generation_enabled = ${settings.generationEnabled},
        enabled_tools = ${this.sql.json(toJson(settings.enabledTools))},
        policies = ${this.sql.json(toJson(settings.policies))},
        incident_response = ${this.sql.json(toJson(settings.incidentResponse))},
        updated_at = now(),
        updated_by = ${updatedBy}
      WHERE id = ${SETTINGS_ID}
    `;
  }
}

function toSettings(row: GovernanceSettingsDbRow): GovernanceSettings {
  return {
    confidenceMin: Number(row.confidenceMin),
    generationEnabled: row.generationEnabled,
    enabledTools: row.enabledTools ?? [],
    policies: row.policies ?? [],
    incidentResponse: row.incidentResponse ?? [],
    updatedAt: row.updatedAt?.toISOString() ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}
