import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type {
  AiModelCall,
  AiPage,
  AiSessionSpan,
  AiToolCall,
  AiUsageBucket,
  AiUsageFilters,
  AiUsageSummary,
} from "@voltedge/agent-contract";
import postgres, { type Sql } from "postgres";
import { orDefault } from "../env.ts";
import type { AiSpanWrite } from "./telemetry.flatten.ts";

const DEFAULT_DATABASE_URL = "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth";

/** A composable SQL fragment (postgres.js tagged-template result), not an executed query. */
type SqlFragment = ReturnType<Sql>;

/** Column order for the dynamic insert; keys must match `AiSpanWrite` exactly. */
const AI_SPAN_COLUMNS: (keyof AiSpanWrite)[] = [
  "span_uid",
  "parent_uid",
  "session_id",
  "name",
  "kind",
  "feature",
  "client_role",
  "client_origin",
  "provider",
  "model",
  "response_model",
  "operation",
  "tool_name",
  "tool_call_id",
  "tool_is_error",
  "stop_reason",
  "status",
  "error_message",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "reasoning_tokens",
  "total_tokens",
  "cost_usd",
  "chunk_count",
  "time_to_first_chunk_ms",
  "duration_ms",
  "started_at",
  "ended_at",
  "attributes",
  "events",
];

interface TotalsDbRow {
  requests: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  avgDurationMs: number;
  errorCount: number;
}

interface BucketDbRow extends TotalsDbRow {
  key: string;
}

interface ModelCallDbRow extends Omit<AiModelCall, "startedAt" | "endedAt"> {
  startedAt: Date;
  endedAt: Date | null;
  total: number;
}

interface ToolCallDbRow extends Omit<AiToolCall, "startedAt" | "endedAt"> {
  startedAt: Date;
  endedAt: Date | null;
  total: number;
}

interface SessionSpanDbRow extends Omit<AiSessionSpan, "startedAt" | "endedAt"> {
  startedAt: Date;
  endedAt: Date | null;
}

function toIso(value: Date): string {
  return value.toISOString();
}

@Injectable()
export class TelemetryRepository implements OnModuleDestroy {
  private client: Sql | undefined;

  private get sql(): Sql {
    this.client ??= postgres(orDefault("DATABASE_URL", DEFAULT_DATABASE_URL), {
      max: 4,
      onnotice: () => undefined,
    });
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.end();
  }

  /**
   * Persist settled spans. Idempotent on `span_uid`, so a retried flush cannot
   * duplicate rows. Failures are the caller's to log: telemetry must never
   * affect the agent run.
   */
  async insertSpans(rows: AiSpanWrite[]): Promise<void> {
    if (rows.length === 0) return;
    await this.sql.begin(async (tx) => {
      for (const row of rows) {
        await tx`
          INSERT INTO ai_spans ${tx(row, ...AI_SPAN_COLUMNS)}
          ON CONFLICT (span_uid) DO NOTHING
        `;
      }
    });
  }

  async summary(filters: AiUsageFilters): Promise<AiUsageSummary> {
    const where = this.where(filters);
    const [totals] = await this.sql<TotalsDbRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE kind = 'model_request')::int AS "requests",
        COUNT(*) FILTER (WHERE kind = 'tool')::int AS "toolCalls",
        COALESCE(SUM(input_tokens) FILTER (WHERE kind = 'model_request'), 0)::int AS "inputTokens",
        COALESCE(SUM(output_tokens) FILTER (WHERE kind = 'model_request'), 0)::int AS "outputTokens",
        COALESCE(SUM(total_tokens) FILTER (WHERE kind = 'model_request'), 0)::int AS "totalTokens",
        COALESCE(SUM(cost_usd) FILTER (WHERE kind = 'model_request'), 0)::float AS "costUsd",
        COALESCE(AVG(duration_ms) FILTER (WHERE kind = 'model_request'), 0)::float AS "avgDurationMs",
        COUNT(*) FILTER (WHERE kind IN ('model_request', 'tool') AND status = 'error')::int AS "errorCount"
      FROM ai_spans
      WHERE ${where} AND kind IN ('model_request', 'tool')
    `;

    const [byModel, byTool, byFeature, byRole, byDay] = await Promise.all([
      this.buckets(this.sql`COALESCE(model, 'unknown')`, ["model_request"], filters, false),
      this.buckets(this.sql`COALESCE(tool_name, 'unknown')`, ["tool"], filters, false),
      this.buckets(
        this.sql`COALESCE(feature, 'unknown')`,
        ["model_request", "tool"],
        filters,
        false,
      ),
      this.buckets(
        this.sql`COALESCE(client_role, 'unknown')`,
        ["model_request", "tool"],
        filters,
        false,
      ),
      this.buckets(
        this.sql`to_char(date_trunc('day', started_at), 'YYYY-MM-DD')`,
        ["model_request", "tool"],
        filters,
        true,
      ),
    ]);

    return {
      totals: totals ?? {
        requests: 0,
        toolCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        avgDurationMs: 0,
        errorCount: 0,
      },
      byModel,
      byTool,
      byFeature,
      byRole,
      byDay,
    };
  }

  async listModelCalls(
    filters: AiUsageFilters,
    limit: number,
    offset: number,
  ): Promise<AiPage<AiModelCall>> {
    const where = this.where(filters);
    const rows = await this.sql<ModelCallDbRow[]>`
      SELECT
        span_uid AS "spanUid", parent_uid AS "parentUid", session_id AS "sessionId",
        feature, client_role AS "clientRole", client_origin AS "clientOrigin",
        provider, model, response_model AS "responseModel", operation,
        stop_reason AS "stopReason", status, error_message AS "errorMessage",
        input_tokens AS "inputTokens", output_tokens AS "outputTokens",
        cache_read_tokens AS "cacheReadTokens", cache_write_tokens AS "cacheWriteTokens",
        reasoning_tokens AS "reasoningTokens", total_tokens AS "totalTokens",
        cost_usd::float AS "costUsd", chunk_count AS "chunkCount",
        time_to_first_chunk_ms AS "timeToFirstChunkMs", duration_ms AS "durationMs",
        started_at AS "startedAt", ended_at AS "endedAt",
        COUNT(*) OVER()::int AS "total"
      FROM ai_spans
      WHERE ${where} AND kind = 'model_request'
      ORDER BY started_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return {
      items: rows.map(({ total: _total, startedAt, endedAt, ...row }) => ({
        ...row,
        startedAt: toIso(startedAt),
        endedAt: endedAt ? toIso(endedAt) : null,
      })),
      total: rows[0]?.total ?? 0,
    };
  }

  async listToolCalls(
    filters: AiUsageFilters,
    limit: number,
    offset: number,
  ): Promise<AiPage<AiToolCall>> {
    const where = this.where(filters);
    const rows = await this.sql<ToolCallDbRow[]>`
      SELECT
        span_uid AS "spanUid", parent_uid AS "parentUid", session_id AS "sessionId",
        feature, client_role AS "clientRole", tool_name AS "toolName",
        tool_call_id AS "toolCallId", tool_is_error AS "toolIsError", status,
        error_message AS "errorMessage", duration_ms AS "durationMs",
        started_at AS "startedAt", ended_at AS "endedAt",
        COUNT(*) OVER()::int AS "total"
      FROM ai_spans
      WHERE ${where} AND kind = 'tool'
      ORDER BY started_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return {
      items: rows.map(({ total: _total, startedAt, endedAt, ...row }) => ({
        ...row,
        startedAt: toIso(startedAt),
        endedAt: endedAt ? toIso(endedAt) : null,
      })),
      total: rows[0]?.total ?? 0,
    };
  }

  async sessionSpans(sessionId: string): Promise<AiSessionSpan[]> {
    const rows = await this.sql<SessionSpanDbRow[]>`
      SELECT
        span_uid AS "spanUid", parent_uid AS "parentUid", session_id AS "sessionId",
        name, kind, feature, client_role AS "clientRole", provider, model, operation,
        tool_name AS "toolName", tool_call_id AS "toolCallId", tool_is_error AS "toolIsError",
        status, error_message AS "errorMessage", duration_ms AS "durationMs",
        started_at AS "startedAt", ended_at AS "endedAt", attributes, events
      FROM ai_spans
      WHERE session_id = ${sessionId}
      ORDER BY started_at ASC, id ASC
    `;

    return rows.map(({ startedAt, endedAt, ...row }) => ({
      ...row,
      startedAt: toIso(startedAt),
      endedAt: endedAt ? toIso(endedAt) : null,
    }));
  }

  private async buckets(
    group: SqlFragment,
    kinds: string[],
    filters: AiUsageFilters,
    ascending: boolean,
  ): Promise<AiUsageBucket[]> {
    const where = this.where(filters);
    const rows = await this.sql<BucketDbRow[]>`
      SELECT
        ${group} AS key,
        COUNT(*) FILTER (WHERE kind = 'model_request')::int AS "requests",
        COUNT(*) FILTER (WHERE kind = 'tool')::int AS "toolCalls",
        COALESCE(SUM(input_tokens) FILTER (WHERE kind = 'model_request'), 0)::int AS "inputTokens",
        COALESCE(SUM(output_tokens) FILTER (WHERE kind = 'model_request'), 0)::int AS "outputTokens",
        COALESCE(SUM(total_tokens) FILTER (WHERE kind = 'model_request'), 0)::int AS "totalTokens",
        COALESCE(SUM(cost_usd) FILTER (WHERE kind = 'model_request'), 0)::float AS "costUsd",
        COALESCE(AVG(duration_ms) FILTER (WHERE kind = 'model_request'), 0)::float AS "avgDurationMs",
        COUNT(*) FILTER (WHERE status = 'error')::int AS "errorCount"
      FROM ai_spans
      WHERE ${where} AND kind IN ${this.sql(kinds)}
      GROUP BY 1
      ORDER BY 1 ${ascending ? this.sql`ASC` : this.sql`DESC`}
    `;

    return rows.map((row) => ({ ...row, key: String(row.key) }));
  }

  private where(filters: AiUsageFilters): SqlFragment {
    const conditions: SqlFragment[] = [];
    if (filters.from) conditions.push(this.sql`started_at >= ${filters.from}`);
    if (filters.to) conditions.push(this.sql`started_at < ${filters.to}`);
    if (filters.model) conditions.push(this.sql`model = ${filters.model}`);
    if (filters.feature) conditions.push(this.sql`feature = ${filters.feature}`);
    if (filters.role) conditions.push(this.sql`client_role = ${filters.role}`);
    if (filters.tool) conditions.push(this.sql`tool_name = ${filters.tool}`);
    if (filters.sessionId) conditions.push(this.sql`session_id = ${filters.sessionId}`);
    return conditions.reduce(
      (query, condition) => this.sql`${query} AND ${condition}`,
      this.sql`true`,
    );
  }
}
