import { randomUUID } from "node:crypto";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Agent, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import { createModels, type AssistantMessage, type Model } from "@earendil-works/pi-ai";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import type { SpanAttributes } from "@earendil-works/pi-telemetry";
import type { AgentStatus, ChatEvent, ChatRequest } from "@voltedge/agent-contract";
import { GovernanceService } from "../admin/governance.service.ts";
import { hasProviderKey, MODEL, PROVIDER } from "./config.ts";
import { guardedFetch } from "./offline.ts";
import { SpanHandle, TelemetryService } from "./telemetry.service.ts";
import { TOOLS } from "./tools.ts";
import { extractUiBlock } from "./ui/blocks.ts";

export const SYSTEM_PROMPT = [
  "You are Rafiki, an assistant for Statistics South Africa (Stats SA).",
  "You help analysts find, interpret and compute with official South African statistics.",
  "For any question about published statistics, first call search_statssa and answer from the passages it returns.",
  "Cite every figure you take from the corpus using its [source#chunk] id, and never state a statistic that is not in the returned passages.",
  "If the corpus does not cover the question, say so explicitly and name the Stats SA release or series that would answer it.",
  "You can also present results visually: show_table for tabular comparisons, show_chart for trends (line) or comparisons (bar).",
  "Only tabulate or chart figures that appear in passages returned by search_statssa, and set the source field to the [source#chunk] ids you used.",
  "Call show_document when the user asks to see or open a specific indexed document, using the exact source path from search results.",
  "After a visual tool call, give a one-line interpretation instead of repeating the data in prose.",
  "Use the other tools when they help: calculate for arithmetic, current_time for date-sensitive questions.",
  "Be explicit about what you know, what you are assuming, and what data would be required to answer definitively.",
  "Answer concisely and prefer South African English.",
].join("\n");

const MAX_SESSIONS = 100;
const USER_AGENT = "rafiki-statssa-agent/0.1";

function toolSummary(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
}

function stopReasonAttr(reason: string): string {
  return reason === "toolUse" ? "tool_use" : reason;
}

/**
 * Where an AI call came from: the feature that triggered it and the portal/role
 * that reached the API. Deliberately excludes user identity (POPIA): governance
 * sees "an Admin used chat", never which Admin.
 */
export interface TelemetryOrigin {
  feature: string;
  clientRole?: string;
  clientOrigin?: string;
}

function originAttributes(origin: TelemetryOrigin | undefined): SpanAttributes {
  if (!origin) return {};
  return {
    "rafiki.feature": origin.feature,
    ...(origin.clientRole ? { "rafiki.client.role": origin.clientRole } : {}),
    ...(origin.clientOrigin ? { "rafiki.client.origin": origin.clientOrigin } : {}),
  };
}

interface AssistantStats {
  startedAt: number;
  chunkCount: number;
  firstChunkAt?: number;
}

function usageAttributes(message: AssistantMessage, stats: AssistantStats): SpanAttributes {
  const usage = message.usage;
  return {
    "pi.ai.response.model": message.responseModel ?? message.model,
    ...(message.responseId ? { "pi.ai.response.id": message.responseId } : {}),
    "pi.ai.response.stop_reason": stopReasonAttr(message.stopReason),
    "pi.ai.usage.input_tokens": usage.input,
    "pi.ai.usage.output_tokens": usage.output,
    "pi.ai.usage.cache_read_tokens": usage.cacheRead,
    "pi.ai.usage.cache_write_tokens": usage.cacheWrite,
    ...(usage.reasoning === undefined ? {} : { "pi.ai.usage.reasoning_tokens": usage.reasoning }),
    "pi.ai.usage.total_tokens": usage.totalTokens,
    "pi.ai.usage.cost": usage.cost.total,
    "pi.ai.stream.chunk_count": stats.chunkCount,
    ...(stats.firstChunkAt === undefined
      ? {}
      : { "pi.ai.stream.time_to_first_chunk_ms": stats.firstChunkAt - stats.startedAt }),
  };
}

/**
 * Owns the model catalog and per-session pi agents, and translates the agent
 * event stream into the shared `ChatEvent` SSE contract.
 *
 * Sessions are in-process; a multi-replica deployment needs a shared session
 * store (see the plan).
 */
@Injectable()
export class AgentService implements OnModuleInit {
  private catalog: ReturnType<typeof createModels> | undefined;
  private readonly sessions = new Map<string, Agent>();

  constructor(
    private readonly telemetry: TelemetryService,
    private readonly governance: GovernanceService,
  ) {}

  onModuleInit(): void {
    void this.warmUp();
  }

  /** Load the embedding model in the background so the first search is not a cold start. */
  private async warmUp(): Promise<void> {
    try {
      const { warmUp } = await import("./rag/embed.js");
      await warmUp();
      Logger.log("Embedding model ready", "AgentService");
    } catch (error) {
      Logger.warn(
        `Embedding model warm-up failed: ${error instanceof Error ? error.message : String(error)}`,
        "AgentService",
      );
    }
  }

  private models() {
    if (!this.catalog) {
      this.catalog = createModels();
      this.catalog.setProvider(opencodeGoProvider());
    }
    return this.catalog;
  }

  private resolveModel(): Model<any> {
    const model = this.models().getModel(PROVIDER.id, MODEL);
    if (!model) {
      throw new Error(`Unknown model "${MODEL}" for provider "${PROVIDER.id}"`);
    }
    return model;
  }

  providerStatus(): AgentStatus {
    return {
      provider: PROVIDER.id,
      label: PROVIDER.label,
      envKey: PROVIDER.envKey,
      hasEnvKey: hasProviderKey(),
      model: MODEL,
      toolCount: TOOLS.length,
    };
  }

  /**
   * Run a single, tool-free completion with a caller-supplied system prompt.
   *
   * Used by features (like the media room draft) that do their own retrieval and
   * only need the model to turn supplied passages into prose. Returns the text,
   * the model that produced it, and any provider error instead of throwing, so
   * callers can surface an information gap rather than a 500.
   *
   * Emits the same `rafiki.turn` + `pi.ai.request` telemetry as chat so
   * governance sees every model call, regardless of feature.
   */
  async complete(input: { system: string; user: string; feature?: string }): Promise<{
    text: string;
    model: string;
    error?: string;
  }> {
    const model = this.resolveModel();
    const label = `${model.provider}/${model.id}`;

    if (!hasProviderKey()) {
      return { text: "", model: label, error: `The ${PROVIDER.label} API key is not configured.` };
    }

    const collection = this.models();
    const sessionId = `completion-${randomUUID()}`;
    const agent = new Agent({
      sessionId,
      initialState: {
        systemPrompt: input.system,
        model,
        tools: [],
      },
      streamFn: (current, context, options) =>
        collection.streamSimple(current, context, {
          ...options,
          telemetryContext: this.telemetry,
          fetch: guardedFetch,
          headers: {
            ...options?.headers,
            "x-opencode-session": sessionId,
            "User-Agent": USER_AGENT,
          },
        }),
    });

    const turnSpan = this.telemetry.begin("rafiki.completion", {
      "session.id": sessionId,
      "rafiki.feature": input.feature ?? "completion",
    });

    let assistantSpan: SpanHandle | undefined;
    let assistantStartedAt = 0;
    let chunkCount = 0;
    let firstChunkAt: number | undefined;
    let text = "";
    let failure: string | undefined;

    const unsubscribe = agent.subscribe((event) => {
      if (event.type === "message_start" && event.message.role === "assistant") {
        const message = event.message as AssistantMessage;
        assistantStartedAt = Date.now();
        chunkCount = 0;
        firstChunkAt = undefined;
        assistantSpan = this.telemetry.begin(
          "pi.ai.request",
          {
            "pi.ai.operation": "stream",
            "pi.ai.provider": message.provider,
            "pi.ai.model": message.model,
            "pi.ai.api": message.api,
            "pi.ai.streaming": true,
            "session.id": sessionId,
            "rafiki.feature": input.feature ?? "completion",
          },
          turnSpan.id,
        );
        return;
      }

      if (event.type === "message_update") {
        const update = event.assistantMessageEvent;
        if (
          update.type === "text_delta" ||
          update.type === "thinking_delta" ||
          update.type === "toolcall_delta"
        ) {
          chunkCount += 1;
          firstChunkAt ??= Date.now();
        }
        if (update.type === "text_delta") text += update.delta;
        return;
      }

      if (event.type === "message_end" && event.message.role === "assistant" && assistantSpan) {
        const message = event.message as AssistantMessage;
        assistantSpan.setAttributes(
          usageAttributes(message, { startedAt: assistantStartedAt, chunkCount, firstChunkAt }),
        );
        if (message.stopReason === "error" || message.stopReason === "aborted") {
          assistantSpan.end({
            status: "error",
            error: {
              name: message.stopReason,
              message: message.errorMessage ?? "Request did not complete",
            },
          });
        } else {
          assistantSpan.end();
        }
        assistantSpan = undefined;
      }
    });

    try {
      await agent.prompt(input.user);
      failure = agent.state.errorMessage || undefined;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      unsubscribe();
      assistantSpan?.end({ status: "error" });
      turnSpan.end(
        failure ? { status: "error", error: { name: "AgentError", message: failure } } : undefined,
      );
    }

    return { text: text.trim(), model: label, ...(failure ? { error: failure } : {}) };
  }

  private async buildAgent(sessionId: string): Promise<Agent> {
    const collection = this.models();
    const model = this.resolveModel();

    const streamFn: StreamFn = (current, context, options) =>
      collection.streamSimple(current, context, {
        ...options,
        telemetryContext: this.telemetry,
        fetch: guardedFetch,
        headers: {
          ...options?.headers,
          "x-opencode-session": sessionId,
          "User-Agent": USER_AGENT,
        },
      });

    // The governance allowlist is applied when a session is built, so a tool that is
    // switched off is simply not offered to the model. Existing sessions keep their
    // tools until they are reset; new sessions pick up the change immediately.
    const enabled = new Set(await this.governance.enabledTools());
    const tools = TOOLS.filter((tool) => enabled.has(tool.name));

    return new Agent({
      sessionId,
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        tools: tools as AgentTool<any, any>[],
      },
      streamFn,
    });
  }

  private async getSession(sessionId: string): Promise<Agent> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.sessions.delete(sessionId);
      this.sessions.set(sessionId, existing);
      return existing;
    }

    const agent = await this.buildAgent(sessionId);
    this.sessions.set(sessionId, agent);

    while (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }

    return agent;
  }

  resetSession(sessionId: string): boolean {
    const agent = this.sessions.get(sessionId);
    if (!agent) return false;
    agent.reset();
    this.sessions.delete(sessionId);
    return true;
  }

  async runChat(
    request: ChatRequest,
    onEvent: (event: ChatEvent) => void,
    origin?: TelemetryOrigin,
  ): Promise<void> {
    const agent = await this.getSession(request.sessionId);

    if (agent.state.isStreaming) {
      onEvent({ type: "error", message: "This session is already generating a response." });
      onEvent({ type: "done" });
      return;
    }

    const activeModel = agent.state.model;
    let turnSpan: SpanHandle | undefined;
    let assistantSpan: SpanHandle | undefined;
    let assistantStartedAt = 0;
    let chunkCount = 0;
    let firstChunkAt: number | undefined;
    let toolCallCount = 0;
    const toolSpans = new Map<string, SpanHandle>();

    const unsubscribe = agent.subscribe((event) => {
      switch (event.type) {
        case "agent_start":
          turnSpan = this.telemetry.begin("rafiki.turn", {
            "session.id": request.sessionId,
            "pi.ai.provider": activeModel.provider,
            "pi.ai.model": activeModel.id,
            "turn.prompt_length": request.message.length,
            ...originAttributes(origin),
          });
          break;

        case "message_start":
          if (event.message.role === "assistant") {
            const message = event.message as AssistantMessage;
            assistantStartedAt = Date.now();
            chunkCount = 0;
            firstChunkAt = undefined;
            assistantSpan = this.telemetry.begin(
              "pi.ai.request",
              {
                "pi.ai.operation": "stream",
                "pi.ai.provider": message.provider,
                "pi.ai.model": message.model,
                "pi.ai.api": message.api,
                "pi.ai.streaming": true,
                "session.id": request.sessionId,
                ...originAttributes(origin),
              },
              turnSpan?.id ?? null,
            );
          }
          break;

        case "message_update": {
          const update = event.assistantMessageEvent;
          if (
            update.type === "text_delta" ||
            update.type === "thinking_delta" ||
            update.type === "toolcall_delta"
          ) {
            chunkCount += 1;
            firstChunkAt ??= Date.now();
          }
          if (update.type === "text_delta") onEvent({ type: "text", delta: update.delta });
          else if (update.type === "thinking_delta")
            onEvent({ type: "thinking", delta: update.delta });
          break;
        }

        case "message_end":
          if (event.message.role === "assistant" && assistantSpan) {
            const message = event.message as AssistantMessage;
            assistantSpan.setAttributes(
              usageAttributes(message, {
                startedAt: assistantStartedAt,
                chunkCount,
                firstChunkAt,
              }),
            );
            if (message.stopReason === "error" || message.stopReason === "aborted") {
              assistantSpan.end({
                status: "error",
                error: {
                  name: message.stopReason,
                  message: message.errorMessage ?? "Request did not complete",
                },
              });
            } else {
              assistantSpan.end();
            }
            assistantSpan = undefined;
          }
          break;

        case "tool_execution_start": {
          toolCallCount += 1;
          const span = this.telemetry.begin(
            "rafiki.tool",
            {
              "tool.name": event.toolName,
              "tool.call_id": event.toolCallId,
              "session.id": request.sessionId,
              ...originAttributes(origin),
            },
            turnSpan?.id ?? null,
          );
          toolSpans.set(event.toolCallId, span);
          onEvent({
            type: "tool_start",
            name: event.toolName,
            args: event.args,
            toolCallId: event.toolCallId,
          });
          break;
        }

        case "tool_execution_end": {
          const span = toolSpans.get(event.toolCallId);
          if (span) {
            span.setAttributes({ "tool.is_error": event.isError });
            const summary = toolSummary(event.result);
            span.end(
              event.isError
                ? {
                    status: "error",
                    error: { name: "ToolError", message: summary || "Tool returned an error" },
                  }
                : undefined,
            );
            toolSpans.delete(event.toolCallId);
          }

          const details = (event.result as { details?: unknown } | undefined)?.details;
          const block = event.isError ? undefined : extractUiBlock(details);
          if (block) onEvent({ type: "ui", block, toolCallId: event.toolCallId });

          onEvent({
            type: "tool_end",
            name: event.toolName,
            isError: event.isError,
            summary: toolSummary(event.result),
            toolCallId: event.toolCallId,
            ...(details === undefined ? {} : { details }),
          });
          break;
        }

        default:
          break;
      }
    });

    let failure: string | undefined;
    try {
      await agent.prompt(request.message);
      failure = agent.state.errorMessage;
      if (failure) onEvent({ type: "error", message: failure });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      onEvent({ type: "error", message: failure });
    } finally {
      unsubscribe();
      for (const span of toolSpans.values()) span.end({ status: "error" });
      assistantSpan?.end({ status: "error" });
      if (turnSpan) {
        turnSpan.setAttributes({
          "turn.tool_calls": toolCallCount,
          ...(failure ? { "turn.error": failure } : {}),
        });
        turnSpan.end(
          failure
            ? { status: "error", error: { name: "AgentError", message: failure } }
            : undefined,
        );
      }
      onEvent({ type: "done" });
    }
  }
}
