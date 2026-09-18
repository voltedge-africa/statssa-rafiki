import { del, get, set } from "idb-keyval";
import type { ChatMessage, SourceItem, ToolRun, UiBlock } from "@voltedge/agent-contract";

/**
 * IndexedDB persistence for public chat sessions. The store keeps full-fidelity
 * chats in memory; this module decides what is worth writing and enforces the
 * byte and count budgets. Browser storage quotas are typically hundreds of MB
 * for IndexedDB, but an unbounded chat history is still a bad neighbour, so the
 * limits below stay deliberately modest.
 */

export const CHAT_STORAGE_KEY = "rafiki.chats.v1";
/** Legacy `localStorage` key from before chats were stored. */
export const LEGACY_SESSION_KEY = "rafiki.session";

/** Total bytes all saved chats may occupy. */
export const CHAT_STORAGE_LIMIT_BYTES = 8 * 1024 * 1024;
/** Newest chats beyond this count are dropped even if bytes remain. */
export const MAX_STORED_CHATS = 100;
/** Only the most recent messages of a long chat are kept. */
export const MAX_STORED_MESSAGES = 300;
export const MAX_MESSAGE_CHARS = 40_000;
export const MAX_THINKING_CHARS = 8_000;
export const MAX_TOOL_SUMMARY_CHARS = 4_000;
export const MAX_TOOL_ARGS_CHARS = 4_000;
export const MAX_DOCUMENT_CHARS = 16_000;
export const MAX_SNIPPET_CHARS = 800;
export const MAX_SOURCES = 16;

const ENVELOPE_OVERHEAD = 48;

export interface StoredChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ChatStorageStats {
  /** Bytes the active chat occupies once persisted. */
  chatBytes: number;
  /** Bytes all persisted chats occupy. */
  usedBytes: number;
  /** Total budget shared by every chat. */
  limitBytes: number;
  /** Number of chats currently persisted. */
  chats: number;
  /** `usedBytes / limitBytes`, clamped to 0..1. */
  ratio: number;
  /** True when the last write had to trim content or drop old chats. */
  trimmed: boolean;
}

export const EMPTY_STORAGE_STATS: ChatStorageStats = {
  chatBytes: 0,
  usedBytes: 0,
  limitBytes: CHAT_STORAGE_LIMIT_BYTES,
  chats: 0,
  ratio: 0,
  trimmed: false,
};

interface StoredEnvelope {
  version: 1;
  activeId: string | null;
  chats: StoredChat[];
}

interface FittedChats {
  chats: StoredChat[];
  trimmed: boolean;
  usedBytes: number;
}

const byteCache = new WeakMap<StoredChat, number>();

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function encodeBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

export function titleFromMessage(text: string): string {
  const firstLine = text.trim().split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "New chat";
  return clip(firstLine, 60);
}

function sanitizeArgs(args: unknown): unknown {
  try {
    const json = JSON.stringify(args);
    if (json && json.length > MAX_TOOL_ARGS_CHARS) return clip(json, MAX_TOOL_ARGS_CHARS);
    return args;
  } catch {
    return undefined;
  }
}

function sanitizeSource(item: SourceItem): SourceItem {
  return { ...item, snippet: clip(item.snippet, MAX_SNIPPET_CHARS) };
}

function sanitizeBlock(block: UiBlock): UiBlock {
  switch (block.component) {
    case "document":
      return { ...block, text: clip(block.text, MAX_DOCUMENT_CHARS) };
    case "sources":
      return { ...block, items: block.items.slice(0, MAX_SOURCES).map(sanitizeSource) };
    default:
      return block;
  }
}

function sanitizeTool(tool: ToolRun): ToolRun {
  return {
    id: tool.id,
    name: tool.name,
    args: sanitizeArgs(tool.args),
    summary: clip(tool.summary, MAX_TOOL_SUMMARY_CHARS),
    state: tool.state,
    hasBlock: tool.hasBlock,
  };
}

function sanitizeMessage(message: ChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: clip(message.text, MAX_MESSAGE_CHARS),
    thinking: clip(message.thinking, MAX_THINKING_CHARS),
    tools: message.tools.map(sanitizeTool),
    blocks: message.blocks.map(sanitizeBlock),
    ...(message.error ? { error: clip(message.error, 1_000) } : {}),
  };
}

/** Trim a chat to the persistable subset: recent messages, small attachments, no tool details. */
export function sanitizeChat(chat: StoredChat): StoredChat {
  return {
    ...chat,
    messages: chat.messages.slice(-MAX_STORED_MESSAGES).map(sanitizeMessage),
  };
}

/** Serialized size of the chat as it would be written. Cached per immutable chat object. */
export function estimateChatBytes(chat: StoredChat): number {
  const cached = byteCache.get(chat);
  if (cached !== undefined) return cached;
  const bytes = encodeBytes(sanitizeChat(chat));
  byteCache.set(chat, bytes);
  return bytes;
}

function isStoredChat(value: unknown): value is StoredChat {
  if (!value || typeof value !== "object") return false;
  const chat = value as Partial<StoredChat>;
  return (
    typeof chat.id === "string" &&
    typeof chat.title === "string" &&
    typeof chat.createdAt === "number" &&
    typeof chat.updatedAt === "number" &&
    Array.isArray(chat.messages)
  );
}

/**
 * Newest-first, within both the chat-count and byte budgets. The protected chat
 * (the one being written) is always kept, and its oldest messages are dropped if
 * it alone exceeds the budget.
 */
export function fitChats(chats: StoredChat[], protectId?: string): FittedChats {
  const ordered = [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_STORED_CHATS);

  let trimmed = ordered.length < chats.length;
  let kept: StoredChat[] = [];
  let usedBytes = 0;

  for (const chat of ordered) {
    const bytes = estimateChatBytes(chat);
    if (
      chat.id === protectId ||
      usedBytes + bytes + ENVELOPE_OVERHEAD <= CHAT_STORAGE_LIMIT_BYTES
    ) {
      kept.push(chat);
      usedBytes += bytes + ENVELOPE_OVERHEAD;
    } else {
      trimmed = true;
    }
  }

  const protectedIndex = kept.findIndex((chat) => chat.id === protectId);
  if (protectedIndex !== -1 && usedBytes > CHAT_STORAGE_LIMIT_BYTES) {
    const protectedChat = kept[protectedIndex];
    const messages = [...protectedChat.messages];
    let bytes = estimateChatBytes(protectedChat);
    while (messages.length > 2) {
      messages.shift();
      const candidate = sanitizeChat({ ...protectedChat, messages });
      bytes = encodeBytes(candidate);
      if (bytes + ENVELOPE_OVERHEAD <= CHAT_STORAGE_LIMIT_BYTES) break;
    }
    kept = [...kept];
    kept[protectedIndex] = sanitizeChat({ ...protectedChat, messages });
    usedBytes = kept.reduce(
      (total, chat) => total + estimateChatBytes(chat) + ENVELOPE_OVERHEAD,
      0,
    );
    trimmed = true;
  }

  return { chats: kept, trimmed, usedBytes };
}

/** Persist chats to IndexedDB, shedding the oldest if the browser rejects the write. */
export async function writeChats(
  chats: StoredChat[],
  activeId: string | null,
): Promise<FittedChats> {
  let fitted = fitChats(chats, activeId ?? undefined);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const envelope: StoredEnvelope = { version: 1, activeId, chats: fitted.chats };
      await set(CHAT_STORAGE_KEY, envelope);
      return fitted;
    } catch {
      if (fitted.chats.length <= 1) return fitted;
      fitted = fitChats(fitted.chats.slice(0, -1));
      fitted.trimmed = true;
    }
  }

  return fitted;
}

export async function readChats(): Promise<{
  chats: StoredChat[];
  activeId: string | null;
  stored: boolean;
}> {
  try {
    const envelope = await get<StoredEnvelope>(CHAT_STORAGE_KEY);
    if (!envelope || !Array.isArray(envelope.chats)) {
      return { chats: [], activeId: null, stored: false };
    }
    const chats = envelope.chats.filter(isStoredChat).map(sanitizeChat);
    const { chats: fitted } = fitChats(chats);
    const activeId =
      typeof envelope.activeId === "string" && fitted.some((chat) => chat.id === envelope.activeId)
        ? envelope.activeId
        : (fitted[0]?.id ?? null);
    return { chats: fitted, activeId, stored: true };
  } catch {
    return { chats: [], activeId: null, stored: false };
  }
}

export async function clearPersistedChats(): Promise<void> {
  try {
    await del(CHAT_STORAGE_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

export function readLegacySessionId(): string | null {
  try {
    return localStorage.getItem(LEGACY_SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearLegacySessionId(): void {
  try {
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // Ignore.
  }
}

export function storageStats(
  chats: StoredChat[],
  activeId: string | null,
  usedBytes = chats.reduce((total, chat) => total + estimateChatBytes(chat), 0),
  trimmed = false,
): ChatStorageStats {
  const active = chats.find((chat) => chat.id === activeId);
  return {
    chatBytes: active ? estimateChatBytes(active) : 0,
    usedBytes,
    limitBytes: CHAT_STORAGE_LIMIT_BYTES,
    chats: chats.length,
    ratio: Math.min(1, usedBytes / CHAT_STORAGE_LIMIT_BYTES),
    trimmed,
  };
}
