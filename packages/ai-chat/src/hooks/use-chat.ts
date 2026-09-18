import { useCallback, useRef, useState } from "react";
import type { ChatEvent, ChatMessage, ChatStatus } from "@voltedge/agent-contract";

const SESSION_KEY = "rafiki.session";

function readSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export interface UseChatOptions {
  /** Base URL of the agent API. Empty string targets the current origin. */
  apiBase?: string;
}

export function useChat(options: UseChatOptions = {}) {
  const apiBase = options.apiBase ?? "";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const sessionRef = useRef<string | null>(null);
  const activeRef = useRef(false);

  if (sessionRef.current === null) sessionRef.current = readSessionId();

  const send = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text || activeRef.current) return;
      activeRef.current = true;

      const userId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", text, thinking: "", tools: [], blocks: [] },
        { id: assistantId, role: "assistant", text: "", thinking: "", tools: [], blocks: [] },
      ]);
      setStatus("submitted");

      const update = (fn: (message: ChatMessage) => ChatMessage) => {
        setMessages((prev) =>
          prev.map((message) => (message.id === assistantId ? fn(message) : message)),
        );
      };

      try {
        const response = await fetch(`${apiBase}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionRef.current, message: text }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "");
          throw new Error(detail || `Request failed with status ${response.status}`);
        }

        setStatus("streaming");
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
                update((message) => ({ ...message, text: message.text + prefix + event.delta }));
                break;
              }
              case "thinking":
                update((message) => ({ ...message, thinking: message.thinking + event.delta }));
                break;
              case "tool_start":
                interrupted = true;
                update((message) => ({
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
                update((message) => {
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
                update((message) => ({
                  ...message,
                  blocks: [...message.blocks, event.block],
                  tools: message.tools.map((tool) =>
                    tool.id === event.toolCallId ? { ...tool, hasBlock: true } : tool,
                  ),
                }));
                break;
              case "error":
                update((message) => ({ ...message, error: event.message }));
                setStatus("error");
                break;
              default:
                break;
            }
          }
        }
      } catch (error) {
        update((message) => ({
          ...message,
          error: error instanceof Error ? error.message : String(error),
        }));
        setStatus("error");
      } finally {
        activeRef.current = false;
        setStatus((current) => (current === "error" ? current : "ready"));
      }
    },
    [apiBase],
  );

  const newSession = useCallback(async () => {
    const previous = sessionRef.current;
    setMessages([]);
    setStatus("ready");
    sessionRef.current = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionRef.current);
    await fetch(`${apiBase}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: previous }),
    }).catch(() => undefined);
  }, [apiBase]);

  return { messages, status, send, newSession };
}
