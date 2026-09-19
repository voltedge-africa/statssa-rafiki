#!/usr/bin/env node
/**
 * OpenWA mention relay.
 *
 * Subscribes to the gateway's live `message.received` events over Socket.IO. When the bot is
 * @mentioned in a specific group, it strips the tag from the message, asks the Rafiki AI API
 * (`POST /api/chat/final`), which runs the public chat agent and formats the result server-side,
 * and posts the returned answer back into the group as ONE reply that quotes the trigger and tags
 * whoever tagged the bot.
 *
 * The API owns separating the model's working from its final answer; WhatsApp only ever gets the
 * finished reply.
 *
 * Run modes:
 *   node relay.mjs                 # socket relay (live)
 *   node relay.mjs ask "question"  # ask the AI once and print the final dump (no WhatsApp)
 *
 * This exists because OpenWA's built-in automation rules only send a fixed `replyText` (no
 * variables, no dynamic mentions) — see OpenWA/src/modules/automation/automation-rules.service.ts.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { io } from "socket.io-client";

const env = process.env;

const BASE_URL = (env.OPENWA_BASE_URL ?? "http://localhost:2785").replace(/\/$/, "");
const SESSION_ID = env.OPENWA_SESSION_ID ?? "cfc65e89-4e2d-4d2d-847e-2181987155c2";
const GROUP_ID = env.OPENWA_GROUP_ID ?? "120363429350688194@g.us";
const MAX_REPLY_CHARS = 4096;
/** Per-chat floor between replies, so a burst cannot turn into a runaway reply storm. */
const MIN_REPLY_GAP_MS = Number(env.OPENWA_MIN_REPLY_GAP_MS ?? 2000);

// Rafiki AI API (apps/api). `/api/chat/final` returns one finished answer as JSON.
const AI_BASE_URL = (env.OPENWA_AI_URL ?? "http://localhost:3001").replace(/\/$/, "");
const AI_ENABLED = (env.OPENWA_AI_ENABLED ?? "true") !== "false";
/** `sender` keeps a separate conversation thread per person; `group` shares one for the whole chat. */
const AI_SESSION_SCOPE = env.OPENWA_AI_SESSION_SCOPE === "group" ? "group" : "sender";
const AI_TIMEOUT_MS = Number(env.OPENWA_AI_TIMEOUT_MS ?? 120_000);
const AI_KEEP_CITATIONS = (env.OPENWA_AI_KEEP_CITATIONS ?? "false") === "true";

/** Normalize a WID so `@c.us`, `@s.whatsapp.net` and `:<device>@lid` forms compare equal. */
function normalizeWid(wid) {
  if (typeof wid !== "string") return "";
  let value = wid.split(":")[0];
  if (value.endsWith("@s.whatsapp.net")) value = value.replace("@s.whatsapp.net", "@c.us");
  return value;
}

/**
 * Drop `@<digits>` tokens whose number is in `tokens`.
 *
 * A WhatsApp @mention is a `@<number>` token in the body; the bot's own LID (and the sender's)
 * appear in the body text of the triggering message. The clean remainder is what we send to the AI.
 */
function stripMentionTokens(body, tokens) {
  if (!body || tokens.size === 0) return body.trim();
  return body
    .replace(/@(\d+)/g, (match, digits) => (tokens.has(digits) ? "" : match))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Build the prompt sent to the AI from one tagged message.
 *
 * Sources, in order: the message being replied to (when the tag is a reply) and then the tagger's
 * own words. Either alone is valid — a plain tag with no quote yields just their text, and a quote
 * with no extra text yields just the quoted body. Bot @tokens are stripped from both. A quoted
 * part identical to the tagger's text is dropped so quoting-and-repeating does not duplicate it.
 */
export function composePrompt(data, stripTokens) {
  const rawBody = typeof data?.body === "string" ? data.body : "";
  const question = stripMentionTokens(rawBody, stripTokens);
  const quotedBody =
    data?.quotedMessage && typeof data.quotedMessage.body === "string"
      ? data.quotedMessage.body
      : "";
  const quoted = stripMentionTokens(quotedBody, stripTokens);

  const parts = [];
  if (quoted && quoted !== question) parts.push(quoted);
  if (question) parts.push(question);
  const prompt = parts.join("\n\n") || rawBody.trim() || "Hello";
  return { prompt, question, quoted };
}

const BOT_WIDS = new Set(
  (env.OPENWA_BOT_WIDS ?? "27729332671@c.us,19555623690423@lid")
    .split(",")
    .map((part) => normalizeWid(part.trim()))
    .filter(Boolean),
);

function loadApiKey() {
  if (env.OPENWA_API_KEY) return env.OPENWA_API_KEY.trim();
  const candidates = [
    env.OPENWA_KEY_FILE,
    resolve(process.cwd(), "OpenWA/data/.api-key"),
    resolve(import.meta.dirname, "../../OpenWA/data/.api-key"),
    "/app/data/.api-key",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const key = readFileSync(candidate, "utf8").trim();
      if (key) return key;
    } catch {
      // try the next candidate
    }
  }
  // The key file is 0600 and owned by the container user, so a host user often cannot read the
  // bind-mounted copy. Reading it through the running container works whenever Docker is available.
  try {
    const key = execFileSync(
      "docker",
      ["exec", env.OPENWA_CONTAINER ?? "openwa-api", "cat", "/app/data/.api-key"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10_000,
      },
    ).trim();
    if (key) return key;
  } catch {
    // fall through to the error below
  }
  throw new Error("No API key found. Set OPENWA_API_KEY (or OPENWA_KEY_FILE) before starting.");
}

function log(...args) {
  console.log(new Date().toISOString(), "[mention-relay]", ...args);
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "X-API-Key": API_KEY,
      "content-type": "application/json",
      ...options.headers,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status} ${text}`);
  }
  return body;
}

/** Best-effort @lid -> phone resolution; returns digits or null. */
async function resolvePhone(wid) {
  try {
    const result = await api(
      `/api/sessions/${SESSION_ID}/contacts/${encodeURIComponent(wid)}/phone`,
    );
    return typeof result?.phone === "string" && result.phone ? result.phone : null;
  } catch (error) {
    log("phone resolution failed for", wid, "-", error.message);
    return null;
  }
}

let API_KEY = null;

// ---------------------------------------------------------------------------
// Rafiki AI
// ---------------------------------------------------------------------------

function sessionIdFor(sender) {
  return AI_SESSION_SCOPE === "group"
    ? `openwa-${GROUP_ID}`
    : `openwa-${GROUP_ID}-${sender.split("@")[0]}`;
}

/**
 * Ask the Rafiki API for one finished reply.
 *
 * `POST /api/chat/final` runs the public chat agent and then the small reply formatter server-side,
 * and returns JSON `{ answer, grounded, formatterModel, usedFallback, error? }`. The API owns the
 * streaming, the thinking separation and the grounding check; the relay only sends the message and
 * takes the single final answer, so the bot needs no formatting or access logic of its own.
 */
async function askRafiki(message, sessionId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(`${AI_BASE_URL}/api/chat/final`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`AI ${response.status}: ${body?.error ?? body?.message ?? "request failed"}`);
    }
    if (body?.error && !body?.answer) throw new Error(body.error);
    if (typeof body?.answer !== "string") throw new Error("AI returned no answer");
    return {
      answer: body.answer,
      tables: Array.isArray(body.tables) ? body.tables : [],
      outOfScope: body.outOfScope === true,
      normalizedQuery: typeof body.normalizedQuery === "string" ? body.normalizedQuery : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Turn the Markdown-ish answer into something readable in a WhatsApp bubble. */
function toWhatsAppText(text) {
  let out = text;
  if (!AI_KEEP_CITATIONS) {
    // Inline grounding markers, in either form the model uses: `[source#12]`,
    // `[ghs-2025-statistical-release.md#214]` and `[factstore:table_name]`.
    out = out.replace(/\s*\[[^[\]]+#\d+\]/g, "").replace(/\s*\[factstore:[^[\]]+\]/g, "");
  }
  return out
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // Markdown bold -> WhatsApp bold
    .replace(/^#{1,6}\s+/gm, "") // drop heading hashes
    .replace(/^\s*[-*]\s+/gm, "• ") // bullets
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Render a table UI block as a padded, monospace WhatsApp block.
 *
 * WhatsApp has no table support at all, so the only way columns line up is a fixed-width ``` block
 * with every cell space-padded to its column's widest value.
 */
export function renderTable(table) {
  const columns = Array.isArray(table?.columns) ? table.columns.map((value) => String(value)) : [];
  const rows = Array.isArray(table?.rows)
    ? table.rows.map((row) =>
        (Array.isArray(row) ? row : []).map((cell) =>
          cell === null || cell === undefined ? "" : String(cell),
        ),
      )
    : [];
  if (columns.length === 0) return "";

  const all = [columns, ...rows];
  const widths = columns.map((_, index) =>
    Math.max(...all.map((row) => (row[index] ?? "").length)),
  );
  const line = (row) =>
    row
      .map((cell, index) => (cell ?? "").padEnd(widths[index]))
      .join("  ")
      .trimEnd();
  const body = [line(columns), ...rows.map(line)].join("\n");
  const title = table.title ? `${table.title}\n` : "";
  return `${title}\`\`\`\n${body}\n\`\`\``;
}

/**
 * Split text into WhatsApp-sized chunks on paragraph, then line, then hard boundaries. The first
 * chunk is sent as the quoted reply; the rest follow as continuations, so a long answer is never
 * silently truncated.
 */
export function splitForWhatsApp(text, limit) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n\n", limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/** Serialize AI turns per session: the API allows one in-flight turn per sessionId. */
const chains = new Map();
function enqueue(sessionId, task) {
  const previous = chains.get(sessionId) ?? Promise.resolve();
  const next = previous.then(task, task);
  chains.set(
    sessionId,
    next.catch(() => undefined),
  );
  return next;
}

async function logAiStatus() {
  try {
    const status = await (await fetch(`${AI_BASE_URL}/api/status`)).json();
    log("AI status:", status.provider, status.model, `hasEnvKey=${status.hasEnvKey}`);
  } catch {
    log("AI not reachable at", AI_BASE_URL, "- replies will fall back to an error message");
  }
}

// ---------------------------------------------------------------------------
// WhatsApp mention handling
// ---------------------------------------------------------------------------

const seen = new Set();
const lastReplyAt = new Map();

async function handleInbound(data) {
  if (!data || data.chatId !== GROUP_ID || data.fromMe === true) return;

  const messageId = typeof data.id === "string" ? data.id : null;
  if (!messageId || seen.has(messageId)) return;
  if (seen.size > 5000) seen.clear();

  const mentioned = Array.isArray(data.mentionedIds) ? data.mentionedIds : [];
  const botTagged = mentioned.some((wid) => BOT_WIDS.has(normalizeWid(wid)));
  if (!botTagged) return;

  seen.add(messageId);

  const sender = normalizeWid(data.author ?? data.from);
  if (!sender) return;

  // Never answer the bot's own messages. The reply tags whoever sent the trigger, so if that were
  // the bot we would tag ourselves back into the trigger set and loop forever.
  if (BOT_WIDS.has(sender)) {
    log("skip: trigger sender is the bot itself", sender);
    return;
  }

  // Per-chat floor: collapse a burst of mentions into one reply per window.
  const now = Date.now();
  const previous = lastReplyAt.get(GROUP_ID) ?? 0;
  if (now - previous < MIN_REPLY_GAP_MS) {
    log("skip: within", MIN_REPLY_GAP_MS, "ms reply cooldown");
    return;
  }
  lastReplyAt.set(GROUP_ID, now);

  let mentionWid = sender;
  let token = sender.split("@")[0];
  let resolvedPhone = null;
  if (sender.endsWith("@lid")) {
    resolvedPhone = await resolvePhone(sender);
    if (resolvedPhone) {
      mentionWid = `${resolvedPhone}@c.us`;
      token = resolvedPhone;
    }
  }
  // Final belt-and-braces: if resolution somehow produced the bot's own WID, do not mention it.
  if (BOT_WIDS.has(normalizeWid(mentionWid))) {
    log("skip: resolved mention target is the bot itself", mentionWid);
    return;
  }

  // Strip the bot's and sender's @tokens so the AI receives just the question. The reply re-adds
  // the sender's live tag below.
  const stripTokens = new Set([...BOT_WIDS].map((wid) => wid.split("@")[0]));
  stripTokens.add(sender.split("@")[0]);
  if (resolvedPhone) stripTokens.add(resolvedPhone);

  const { prompt, question, quoted } = composePrompt(data, stripTokens);
  if (quoted) log("including quoted message in prompt");

  let answer;
  let tables = [];
  if (AI_ENABLED) {
    try {
      const aiSession = sessionIdFor(sender);
      const result = await enqueue(aiSession, () => askRafiki(prompt, aiSession));
      if (result.outOfScope) log("normalizer: out of scope");
      else if (result.normalizedQuery)
        log("normalizer:", JSON.stringify(result.normalizedQuery).slice(0, 200));
      answer = toWhatsAppText(result.answer) || "I could not find this in the Stats SA documents.";
      tables = result.tables;
    } catch (error) {
      log("AI request failed:", error.message);
      answer = "Sorry, I could not reach the Stats SA assistant just now. Please try again.";
    }
  } else {
    answer = question; // echo fallback when the AI is disabled
  }

  // Tables the agent rendered via show_table are not in the prose; append them as monospace blocks.
  const tableText = tables.map(renderTable).filter(Boolean).join("\n\n");
  const full = [answer, tableText].filter(Boolean).join("\n\n");

  // Tag the sender on the first chunk only; a long answer continues as plain follow-up messages
  // rather than being truncated.
  const prefix = `@${token} `;
  const chunks = splitForWhatsApp(full, MAX_REPLY_CHARS - prefix.length);
  const [first = "", ...continuations] = chunks;

  try {
    const result = await api(`/api/sessions/${SESSION_ID}/messages/reply`, {
      method: "POST",
      body: JSON.stringify({
        chatId: GROUP_ID,
        quotedMessageId: messageId,
        text: `${prefix}${first}`.trim(),
        mentions: [mentionWid],
      }),
    });
    log("replied to", sender, "message", messageId, "-> sent", result?.messageId ?? "(no id)");

    for (const chunk of continuations) {
      await sleep(300); // keep the continuation order
      const sent = await api(`/api/sessions/${SESSION_ID}/messages/send-text`, {
        method: "POST",
        body: JSON.stringify({ chatId: GROUP_ID, text: chunk }),
      });
      log("sent continuation ->", sent?.messageId ?? "(no id)");
    }
  } catch (error) {
    log("reply failed for", messageId, "-", error.message);
  }
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

function startRelay() {
  API_KEY = loadApiKey();
  void logAiStatus();

  const socket = io(`${BASE_URL}/events`, {
    auth: { apiKey: API_KEY },
    extraHeaders: { "X-API-Key": API_KEY },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    log("connected", socket.id, "-> subscribing to", SESSION_ID, "message.received");
    socket.emit(
      "message",
      { type: "subscribe", sessionId: SESSION_ID, events: ["message.received"] },
      (ack) => log("subscribe ack:", ack?.type ?? ack),
    );
  });

  socket.on("disconnect", (reason) => log("disconnected:", reason));
  socket.on("connect_error", (error) => log("connect error:", error.message));

  socket.on("message", async (frame) => {
    if (!frame || typeof frame.type !== "string") return;
    if (frame.type === "subscribed") {
      log("subscribed to", Array.isArray(frame.events) ? frame.events.join(", ") : frame.events);
      return;
    }
    if (frame.type === "error") {
      log("server error:", frame.code, frame.message);
      return;
    }
    if (frame.type !== "event" || !frame.payload) return;

    const { event, sessionId, data } = frame.payload;
    if (sessionId !== SESSION_ID || event !== "message.received") return;

    try {
      await handleInbound(data);
    } catch (error) {
      log("handler error:", error?.stack ?? error);
    }
  });

  log("watching group", GROUP_ID, "for mentions of", [...BOT_WIDS].join(", "));

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      log("shutting down");
      socket.close();
      process.exit(0);
    });
  }
}

const [, , command, ...rest] = process.argv;

// Only run when invoked directly, so the prompt logic can be imported and tested in isolation.
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  if (command === "ask") {
    const question = rest.join(" ") || "How many households have access to the internet?";
    askRafiki(question, `openwa-cli-${Date.now()}`)
      .then((result) => {
        const tables = (result.tables ?? []).map(renderTable).filter(Boolean).join("\n\n");
        console.log(
          [toWhatsAppText(result.answer), tables].filter(Boolean).join("\n\n") || "(empty answer)",
        );
        process.exit(0);
      })
      .catch((error) => {
        console.error("ask failed:", error.message);
        process.exit(1);
      });
  } else {
    startRelay();
  }
}
