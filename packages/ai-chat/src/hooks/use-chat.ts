import { useEffect, useMemo } from "react";
import type { ChatMessage } from "@voltedge/agent-contract";
import { useChatStore } from "../lib/chat-store.ts";

const EMPTY_MESSAGES: ChatMessage[] = [];

export interface UseChatOptions {
  /** Base URL of the agent API. Empty string targets the current origin. */
  apiBase?: string;
}

/**
 * Public facade over the shared chat store. The store is module-level so the
 * history sidebar and the chat surface always agree on what is active; this hook
 * wires the API base, kicks off hydration and derives the active message list.
 */
export function useChat(options: UseChatOptions = {}) {
  const apiBase = options.apiBase ?? "";

  const configure = useChatStore((state) => state.configure);
  const hydrate = useChatStore((state) => state.hydrate);

  useEffect(() => {
    configure(apiBase);
  }, [apiBase, configure]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const chats = useChatStore((state) => state.chats);
  const activeId = useChatStore((state) => state.activeId);
  const status = useChatStore((state) => state.status);
  const storage = useChatStore((state) => state.storage);
  const hydrated = useChatStore((state) => state.hydrated);
  const send = useChatStore((state) => state.send);
  const newSession = useChatStore((state) => state.newSession);
  const selectChat = useChatStore((state) => state.selectChat);
  const deleteChat = useChatStore((state) => state.deleteChat);
  const clearAll = useChatStore((state) => state.clearAll);

  const messages = useMemo(
    () => chats.find((chat) => chat.id === activeId)?.messages ?? EMPTY_MESSAGES,
    [chats, activeId],
  );

  return {
    messages,
    status,
    send,
    newSession,
    chats,
    activeId,
    selectChat,
    deleteChat,
    clearAll,
    storage,
    hydrated,
  };
}
