import { randomUUID } from "node:crypto";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Agent, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import { createModels, type AssistantMessage, type Model } from "@earendil-works/pi-ai";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import type { SpanAttributes } from "@earendil-works/pi-telemetry";
import type { AgentStatus, ChatEvent, ChatRequest } from "@voltedge/agent-contract";
import { GovernanceService } from "../admin/governance.service.ts";
import {
  hasProviderKey,
  MODEL,
  MODEL_ALIASES,
  NORMALIZER_MODEL,
  PROVIDER,
  WRAPPER_MODEL,
} from "./config.ts";
import { hasFactTables } from "./factstore.ts";
import { KNOWLEDGE_COVERAGE, QUERY_GLOSSARY } from "./query-glossary.ts";
import { guardedFetch } from "./offline.ts";
import { SpanHandle, TelemetryService } from "./telemetry.service.ts";
import { TOOLS } from "./tools.ts";
import { extractUiBlock } from "./ui/blocks.ts";
import { collectToolGroundTruth, extractNumbers, verifyNumbers } from "./verifier.ts";

export const SYSTEM_PROMPT = [
  "You are Rafiki, an assistant for Statistics South Africa (Stats SA).",
  "You answer every question through exactly one of two data pipelines, chosen by what the question asks for.",
  "",
  "PIPELINE 1 — TEXT LAYER (search_statssa, the Vector DB):",
  "Use for narrative, methodology, definitions, and 'why'/'how' questions.",
  "Examples: 'How are survey weights calibrated?', 'Why did the survey switch to CAPI?'.",
  "Every factual claim you make must be immediately followed by its [source#chunk] citation id, exactly as returned by search_statssa.",
  "A passage may state a figure explicitly; you may report such a figure when no fact-store table covers it, always with its [source#chunk] citation.",
  "",
  "PIPELINE 2 — FACT STORE (list_fact_tables, then query_factstore, the SQL database):",
  "Use for questions asking for exact numbers, statistics, metrics or table values.",
  "If a user asks for a statistical figure, first call list_fact_tables to see whether a relevant table exists.",
  "When a relevant table exists, YOU MUST call query_factstore to extract the rows before answering, and cite each figure as [factstore:<table_name>].",
  "If list_fact_tables shows no relevant table, answer from figures the search_statssa passages state explicitly, with their [source#chunk] citations; do not invent a table or a figure.",
  "Never compute or estimate a figure yourself, and never answer a number question from general knowledge.",
  "Use the calculate tool only on numbers returned by query_factstore or search_statssa passages.",
  "",
  "NEGATIVE REJECTION (applies to both pipelines):",
  "Do not refuse without evidence: call search_statssa, and query_factstore when a relevant table exists, before deciding the material is missing.",
  "If the retrieved passages do not explicitly contain the facts needed to answer the question, or query_factstore returns no rows, output exactly:",
  '"The provided Stats SA documentation does not contain this information."',
  "and nothing else.",
  "Never extrapolate, interpolate, guess, infer missing values, or answer from general knowledge or training data.",
  "",
  "VISUALS AND OTHER TOOLS:",
  "You can also present results visually: show_table for tabular comparisons, show_chart for trends (line) or comparisons (bar).",
  "Only tabulate or chart figures that come from search_statssa passages or query_factstore rows, and set the source field to the ids you used.",
  "Call show_document when the user asks to see or open a specific indexed document, using the exact source path from search results.",
  "After a visual tool call, give a one-line interpretation instead of repeating the data in prose.",
  "Use current_time for date-sensitive questions.",
  "Answer concisely and prefer South African English.",
].join("\n");

/**
 * System prompt for the small "reply formatter" model. It receives the main agent's raw output —
 * which mixes step-by-step working with the final answer — and returns the single final reply.
 * It is deliberately stateless and data-free: the only input is already-grounded text, so this
 * pass can change wording but must never introduce a figure of its own.
 */
export const REPLY_FORMATTER_SYSTEM_PROMPT = [
  "You format the final reply of a WhatsApp assistant that answers questions about Statistics South Africa publications.",
  "You are given the assistant's raw output, which mixes its step-by-step working (for example 'I'll look up...', tool reasoning) with the actual answer.",
  "Produce the one final reply to send back to the user.",
  "Rules:",
  "- Output ONLY the final answer. Remove all working, tool narration, and step-by-step reasoning.",
  "- Keep every number, percentage, unit and proper noun exactly as written. Never invent, change, round, recompute or re-derive a figure.",
  "- Never add facts, opinions, greetings, disclaimers or questions that are not already in the final answer.",
  "- Remove citation markers such as [source#12], [ghs-2025-statistical-release.md#214] or [factstore:table_name].",
  "- Write natural, concise South African English suitable for a WhatsApp message. Plain text only, no Markdown.",
  "- If the raw output says the documentation does not contain the information, keep exactly that meaning.",
].join("\n");

/**
 * System prompt for the input-side query normalizer.
 *
 * It is a TRANSLATOR, not an assistant: it only maps the user's informal/slang wording onto the
 * knowledge base's vocabulary so retrieval can match it, and it flags clearly out-of-scope
 * questions. It never answers, and never adds a fact, number, metric, entity or time period. The
 * RAG system remains the sole source of every answer.
 */
export const QUERY_NORMALIZER_SYSTEM_PROMPT = [
  "You are a query translator between a user and a Statistics South Africa knowledge base. You are NOT an assistant and you NEVER answer questions.",
  "The knowledge base answers ONLY from Stats SA's General Household Survey (GHS) 2025. Your only job is to rephrase the user's question in the study's own vocabulary, with the smallest change needed for retrieval to match it.",
  "You receive a COVERAGE list (topics and published fact tables) and a GLOSSARY (informal terms mapped to the study's vocabulary).",
  "Rules:",
  "- NEVER answer the question, and never state any fact, number, figure, definition or finding.",
  "- Add NOTHING the user did not write: no facts, numbers, metrics, entities, places, dates or time periods.",
  "- Preserve the user's subject, intent, scope and metric. Translate their wording; do not solve their question.",
  "- Make the minimum edit. If the wording already uses the study's vocabulary, return it unchanged.",
  "- You may reshape the question into the form the study reports (for example, an existence question may become 'What percentage of households have ...'), but only by changing the question, never by supplying data.",
  "- If the user replied to a message, use it as context for the translation, but return a single question.",
  "- If the question is CLEARLY outside the coverage (general knowledge, current affairs, politics, sport, another country, another Stats SA release, forecasts or opinions), output one line starting exactly with OUT_OF_SCOPE: <short reason>. Do not answer it.",
  "Output ONLY the translated question, or the OUT_OF_SCOPE line. No preamble, no quotes, no explanation.",
  "If you are unsure whether something is in scope, do NOT reject — translate it as best you can.",
].join("\n");

/** Message returned when the normalizer is confident a question is outside the studies. */
export const OUT_OF_SCOPE_REPLY =
  "That falls outside the Stats SA studies I can answer from — my knowledge base is the General Household Survey (GHS) 2025. I can help with GHS topics such as households, services (water, sanitation, electricity, refuse), education, health, internet access and household assets.";

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
    await this.reportFactStoreReadiness();
  }

  /**
   * An empty fact store is a supported state — the agent falls back to corpus text for exact
   * figures — but it is otherwise silent: without this the only trace is a tool result the model
   * sees, never the operator. Surface it once at boot so a skipped `factstore:derive` /
   * `factstore:load` is visible in the logs instead of quietly degrading number answers.
   */
  private async reportFactStoreReadiness(): Promise<void> {
    try {
      if (await hasFactTables()) {
        Logger.log("Fact store ready", "AgentService");
      } else {
        Logger.warn(
          "Fact store is empty — exact-number questions will fall back to corpus text. " +
            "Load it with `vp run factstore:derive && vp run factstore:load`.",
          "AgentService",
        );
      }
    } catch (error) {
      Logger.warn(
        `Fact store readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
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

  /**
   * Resolve a model id for a one-off completion. Prefers the bundled catalog; when the provider
   * serves a newer id the catalog does not list yet, clones the catalogued sibling named in
   * MODEL_ALIASES so the request still reaches the provider (which routes by `model.provider` and
   * sends `model.id`).
   */
  private resolveModelForId(id: string): Model<any> | undefined {
    const direct = this.models().getModel(PROVIDER.id, id);
    if (direct) return direct;
    const siblingId = MODEL_ALIASES[id];
    if (!siblingId) return undefined;
    const sibling = this.models().getModel(PROVIDER.id, siblingId);
    return sibling ? { ...sibling, id, name: id } : undefined;
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
   * Run a completion with a caller-supplied system prompt, optionally with
   * tools. Used by features (like the media room draft) that do their own
   * retrieval and only need the model to turn supplied passages — and, for
   * media drafts, read-only fact-store lookups — into prose. Returns the text,
   * the model that produced it, and any provider error instead of throwing, so
   * callers can surface an information gap rather than a 500.
   *
   * Emits the same `rafiki.turn` + `pi.ai.request` telemetry as chat so
   * governance sees every model call, regardless of feature.
   */
  async complete(input: {
    system: string;
    user: string;
    feature?: string;
    tools?: AgentTool<any, any>[];
    /** Optional model id from the same provider. Defaults to PI_MODEL (the main agent's model). */
    model?: string;
  }): Promise<{
    text: string;
    model: string;
    error?: string;
  }> {
    const model = input.model ? this.resolveModelForId(input.model) : this.resolveModel();
    if (!model) {
      return {
        text: "",
        model: `${PROVIDER.id}/${input.model}`,
        error: `Unknown model "${input.model}" for provider "${PROVIDER.id}".`,
      };
    }
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
        tools: input.tools ?? [],
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

    // Ground truth for the post-turn verification: numbers the user supplied
    // plus every number retrieved by the tools during this turn.
    const groundTruthNumbers = new Set<string>();
    for (const number of extractNumbers(request.message)) groundTruthNumbers.add(number);
    let answerText = "";

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
          if (update.type === "text_delta") {
            answerText += update.delta;
            onEvent({ type: "text", delta: update.delta });
          } else if (update.type === "thinking_delta")
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
          collectToolGroundTruth(event.toolName, details, groundTruthNumbers);
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
      if (failure) {
        onEvent({ type: "error", message: failure });
      } else if (answerText.trim()) {
        const verification =
          toolCallCount === 0
            ? { status: "skipped" as const, unverified: [] as string[] }
            : verifyNumbers(answerText, groundTruthNumbers);
        onEvent({ type: "verification", ...verification });
      }
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

  /**
   * Normalize an informal/slang question onto the knowledge base's vocabulary and decide whether it
   * is in scope, using the small normalizer model. It gets no tools and only public coverage
   * metadata; it never answers and never adds a fact.
   *
   * Fail-open: if the normalizer is unavailable or returns nothing usable, the original question is
   * returned and the caller runs the normal retrieval path. Out-of-scope is reported only when the
   * model is confident (the exact `OUT_OF_SCOPE:` sentinel).
   */
  private async normalizeQuestion(
    raw: string,
  ): Promise<{ query: string; outOfScope: boolean; reason?: string }> {
    const input = [
      "COVERAGE:",
      KNOWLEDGE_COVERAGE,
      "",
      "GLOSSARY (informal -> study vocabulary):",
      QUERY_GLOSSARY,
      "",
      "USER MESSAGE:",
      raw,
    ].join("\n");

    const { text, error } = await this.complete({
      system: QUERY_NORMALIZER_SYSTEM_PROMPT,
      user: input,
      feature: "openwa_normalize",
      model: NORMALIZER_MODEL,
    });

    const normalized = text.trim();
    if (error || !normalized) return { query: raw, outOfScope: false };

    if (normalized.toUpperCase().startsWith("OUT_OF_SCOPE:")) {
      return {
        query: raw,
        outOfScope: true,
        reason: normalized.slice("OUT_OF_SCOPE:".length).trim(),
      };
    }
    // A rewrite too short to be a real question falls back to the original.
    return { query: normalized.length >= 3 ? normalized : raw, outOfScope: false };
  }

  /**
   * Non-streaming companion to runChat for automated public clients (the WhatsApp relay).
   *
   * It normalizes the question against the knowledge base's vocabulary, runs the exact same public
   * chat path and public-data tools as `POST /api/chat`, then sends the raw output through the small
   * formatter model to produce one natural final reply. Neither the normalizer nor the formatter is
   * given tools, so neither can reach any data. This method never inspects a role: its route is
   * public, so the caller is a general member of the public by construction.
   */
  async runFinalReply(
    request: ChatRequest,
    origin?: TelemetryOrigin,
  ): Promise<{
    answer: string;
    grounded: string;
    formatterModel: string;
    usedFallback: boolean;
    /** The question after normalization, when it differed from the input. */
    normalizedQuery?: string;
    /** True when the normalizer was confident the question is outside the studies. */
    outOfScope?: boolean;
    /** Any tables the agent rendered (show_table). Structured, so the caller can format for its surface. */
    tables: Array<{
      title?: string;
      columns: string[];
      rows: (string | number)[][];
      source?: string;
    }>;
    error?: string;
  }> {
    const normalized = await this.normalizeQuestion(request.message);
    if (normalized.outOfScope) {
      return {
        answer: OUT_OF_SCOPE_REPLY,
        grounded: "",
        formatterModel: NORMALIZER_MODEL,
        usedFallback: true,
        outOfScope: true,
        tables: [],
      };
    }

    // Feed the rewrite as the question, but keep the user's original wording as context so nothing
    // the normalizer dropped is lost to retrieval.
    const message =
      normalized.query && normalized.query !== request.message
        ? `${normalized.query}\n\n(User's original wording: ${request.message})`
        : request.message;

    const events: ChatEvent[] = [];
    await this.runChat({ ...request, message }, (event) => events.push(event), origin);

    // Same structural split the client used: narration lives around tool calls, the answer is the
    // last text segment. The full raw text still goes to the formatter, which can separate the two
    // semantically; this grounded segment is the safety net if it cannot.
    const segments = [""];
    let raw = "";
    let error: string | undefined;
    const tables: Array<{
      title?: string;
      columns: string[];
      rows: (string | number)[][];
      source?: string;
    }> = [];
    for (const event of events) {
      if (event.type === "text") {
        segments[segments.length - 1] += event.delta;
        raw += event.delta;
      } else if (event.type === "tool_start" || event.type === "tool_end") {
        if (segments[segments.length - 1].trim()) segments.push("");
      } else if (event.type === "ui") {
        // A show_table call renders the data as a UI block, not prose; carry it out so text-only
        // surfaces (WhatsApp) can still show it.
        if (event.block.component === "table") tables.push(event.block);
      } else if (event.type === "error") {
        error = event.message;
      }
    }
    const grounded = ([...segments].reverse().find((segment) => segment.trim()) ?? "").trim();
    const normalizedQuery = normalized.query !== request.message ? normalized.query : undefined;

    if (error && !grounded) {
      return {
        answer: error,
        grounded: "",
        formatterModel: WRAPPER_MODEL,
        usedFallback: true,
        ...(normalizedQuery ? { normalizedQuery } : {}),
        tables,
        error,
      };
    }

    const formatted = await this.formatReply(raw, grounded || raw);
    return {
      answer: formatted.text,
      grounded: grounded || raw,
      formatterModel: formatted.model,
      usedFallback: formatted.usedFallback,
      ...(normalizedQuery ? { normalizedQuery } : {}),
      tables,
    };
  }

  /**
   * Reword an already-grounded answer with the small formatter model.
   *
   * Falls back to the grounded text — never to an invented one — when the formatter is
   * unavailable, returns nothing, or introduces a number absent from its input. That last check is
   * the same deterministic number test the chat path runs, so a formatting pass can never widen
   * the set of figures the public agent grounded.
   */
  private async formatReply(
    raw: string,
    fallback: string,
  ): Promise<{ text: string; model: string; usedFallback: boolean }> {
    const safe = fallback.trim();
    if (!safe) return { text: "", model: WRAPPER_MODEL, usedFallback: true };

    const { text, model, error } = await this.complete({
      system: REPLY_FORMATTER_SYSTEM_PROMPT,
      user: raw,
      feature: "openwa_reply",
      model: WRAPPER_MODEL,
    });

    if (error || !text.trim()) {
      return { text: safe, model, usedFallback: true };
    }

    const allowed = new Set(extractNumbers(raw));
    const invented = extractNumbers(text).filter((value) => !allowed.has(value));
    if (invented.length > 0) {
      Logger.warn(
        `Reply formatter introduced ungrounded number(s) [${invented.join(", ")}]; using the grounded answer`,
        "AgentService",
      );
      return { text: safe, model, usedFallback: true };
    }

    return { text: text.trim(), model, usedFallback: false };
  }
}
