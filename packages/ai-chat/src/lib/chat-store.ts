import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ChatEvent, ChatMessage, ChatStatus } from "@voltedge/agent-contract";
import {
  clearLegacySessionId,
  clearPersistedChats,
  EMPTY_STORAGE_STATS,
  readChats,
  readLegacySessionId,
  storageStats,
  titleFromMessage,
  writeChats,
  type ChatStorageStats,
  type StoredChat,
} from "./chat-persistence.ts";

/** Minimum gap between IndexedDB writes while a response is streaming. */
const SAVE_INTERVAL_MS = 500;

export interface ChatState {
  chats: StoredChat[];
  activeId: string | null;
  status: ChatStatus;
  /** Estimate of what is actually persisted, refreshed after every write. */
  storage: ChatStorageStats;
  /** False until the IndexedDB read completes. */
  hydrated: boolean;
  apiBase: string;
}

export interface ChatActions {
  /** Point the store at an agent API. Safe to call repeatedly. */
  configure: (apiBase: string) => void;
  /** Load persisted chats. Safe to call from every mounting surface. */
  hydrate: () => Promise<void>;
  send: (text: string) => Promise<void>;
  newSession: () => void;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  clearAll: () => Promise<void>;
}

export type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
    chats: [],
    activeId: null,
    status: "ready",
    storage: EMPTY_STORAGE_STATS,
    hydrated: false,
    apiBase: "",

    configure: (apiBase) => set({ apiBase }),

    hydrate: async () => {
      if (get().hydrated) return;
      hydrating = true;
      try {
        const { chats, activeId, stored } = await readChats();
        const resolvedActive =
          activeId ?? (!stored && chats.length === 0 ? readLegacySessionId() : null);
        set({
          chats,
          activeId: resolvedActive,
          storage: storageStats(chats, resolvedActive),
          hydrated: true,
        });
      } finally {
        hydrating = false;
      }
    },

    send: async (input) => {
      const text = input.trim();
      const { apiBase, status } = get();
      if (!text || status === "submitted" || status === "streaming") return;

      const chatId = get().activeId ?? crypto.randomUUID();
      const userId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const now = Date.now();

      set((state) => {
        const userMessage: ChatMessage = {
          id: userId,
          role: "user",
          text,
          thinking: "",
          tools: [],
          blocks: [],
        };
        const assistantMessage: ChatMessage = {
          id: assistantId,
          role: "assistant",
          text: "",
          thinking: "",
          tools: [],
          blocks: [],
        };
        const existing = state.chats.find((chat) => chat.id === chatId);
        if (!existing) {
          const created: StoredChat = {
            id: chatId,
            title: titleFromMessage(text),
            createdAt: now,
            updatedAt: now,
            messages: [userMessage, assistantMessage],
          };
          return { chats: [created, ...state.chats], activeId: chatId, status: "submitted" };
        }
        return {
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  title: chat.messages.length === 0 ? titleFromMessage(text) : chat.title,
                  updatedAt: now,
                  messages: [...chat.messages, userMessage, assistantMessage],
                }
              : chat,
          ),
          activeId: chatId,
          status: "submitted",
        };
      });

      const patchChat = (chatId: string, fn: (chat: StoredChat) => StoredChat) => {
        set((state) => ({
          chats: state.chats.map((chat) => (chat.id === chatId ? fn(chat) : chat)),
        }));
      };

      const updateAssistant = (fn: (message: ChatMessage) => ChatMessage) => {
        patchChat(chatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === assistantId ? fn(message) : message,
          ),
        }));
      };

      try {
        const response = await fetch(`${apiBase}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: chatId, message: text }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "");
          throw new Error(detail || `Request failed with status ${response.status}`);
        }

        set({ status: "streaming" });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let interrupted = false;

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((candidate) => candidate.startsWith("data:"));
            if (!line) continue;
            let event: ChatEvent;
            try {
              event = JSON.parse(line.slice(5).trim()) as ChatEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case "text": {
                const prefix = interrupted ? "\n\n" : "";
                interrupted = false;
                updateAssistant((message) => ({
                  ...message,
                  text: message.text + prefix + event.delta,
                }));
                break;
              }
              case "thinking":
                updateAssistant((message) => ({
                  ...message,
                  thinking: message.thinking + event.delta,
                }));
                break;
              case "tool_start":
                interrupted = true;
                updateAssistant((message) => ({
                  ...message,
                  tools: [
                    ...message.tools,
                    {
                      id: event.toolCallId,
                      name: event.name,
                      args: event.args,
                      summary: "",
                      state: "running",
                    },
                  ],
                }));
                break;
              case "tool_end":
                updateAssistant((message) => {
                  const tools = [...message.tools];
                  const index = tools.findIndex(
                    (tool) =>
                      tool.id === event.toolCallId ||
                      (tool.name === event.name && tool.state === "running"),
                  );
                  if (index !== -1) {
                    tools[index] = {
                      ...tools[index],
                      state: event.isError ? "error" : "done",
                      summary: event.summary,
                      details: event.details,
                    };
                  }
                  return { ...message, tools };
                });
                break;
              case "ui":
                updateAssistant((message) => ({
                  ...message,
                  blocks: [...message.blocks, event.block],
                  tools: message.tools.map((tool) =>
                    tool.id === event.toolCallId ? { ...tool, hasBlock: true } : tool,
                  ),
                }));
                break;
              case "error":
                updateAssistant((message) => ({ ...message, error: event.message }));
                set({ status: "error" });
                break;
              default:
                break;
            }
          }
        }
      } catch (error) {
        updateAssistant((message) => ({
          ...message,
          error: error instanceof Error ? error.message : String(error),
        }));
        set({ status: "error" });
      } finally {
        patchChat(chatId, (chat) => ({ ...chat, updatedAt: Date.now() }));
        set((state) => ({ status: state.status === "error" ? "error" : "ready" }));
      }
    },

    newSession: () => set({ activeId: null }),

    selectChat: (id) => set({ activeId: id }),

    deleteChat: (id) => {
      set((state) => ({
        chats: state.chats.filter((chat) => chat.id !== id),
        activeId: state.activeId === id ? null : state.activeId,
      }));
      const { apiBase } = get();
      void fetch(`${apiBase}/api/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      }).catch(() => undefined);
    },

    clearAll: async () => {
      set({ chats: [], activeId: null, storage: EMPTY_STORAGE_STATS });
      clearLegacySessionId();
      await clearPersistedChats();
    },
  })),
);

/* -------------------------------------------------------------------------- */
/* Persistence wiring                                                          */
/* -------------------------------------------------------------------------- */

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let queued = false;
let hydrating = false;

async function flushNow(notify: boolean): Promise<void> {
  if (!useChatStore.getState().hydrated || hydrating) return;
  if (saving) {
    queued = true;
    return;
  }
  saving = true;
  try {
    const { chats, activeId } = useChatStore.getState();
    const { chats: saved, trimmed, usedBytes } = await writeChats(chats, activeId);
    if (notify) {
      useChatStore.setState({ storage: storageStats(saved, activeId, usedBytes, trimmed) });
    }
  } catch {
    // IndexedDB unavailable (private mode, quota); chats stay in memory for this session.
  } finally {
    saving = false;
    if (queued) {
      queued = false;
      void flushNow(notify);
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow(true);
  }, SAVE_INTERVAL_MS);
}

function flushImmediately(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  void flushNow(true);
}

if (typeof window !== "undefined") {
  useChatStore.subscribe(
    (state) => state.chats,
    () => {
      if (useChatStore.getState().hydrated) scheduleFlush();
    },
  );

  useChatStore.subscribe(
    (state) => state.activeId,
    () => {
      if (useChatStore.getState().hydrated) flushImmediately();
    },
  );

  useChatStore.subscribe(
    (state) => state.status,
    (status) => {
      if (!useChatStore.getState().hydrated) return;
      if (status === "ready" || status === "error") flushImmediately();
    },
  );

  const flushOnHide = () => void flushNow(false);
  window.addEventListener("beforeunload", flushOnHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnHide();
  });
}
