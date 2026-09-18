import { useEffect, useState } from "react";
import type { AgentStatus } from "@voltedge/agent-contract";
import { Badge, Button } from "@voltedge/ui";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "./ai-elements/conversation.tsx";
import { Message, MessageContent } from "./ai-elements/message.tsx";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./ai-elements/reasoning.tsx";
import { Suggestion, Suggestions } from "./ai-elements/suggestion.tsx";
import { UiBlockView } from "./blocks/index.tsx";
import { ChatComposer } from "./chat-composer.tsx";
import { DocumentPreview } from "./document-preview.tsx";
import { Markdown } from "./markdown.tsx";
import { TelemetryPanel } from "./telemetry-panel.tsx";
import { ToolRunView } from "./tool-run.tsx";
import { useChat } from "../hooks/use-chat.ts";
import { useTelemetry } from "../hooks/use-telemetry.ts";

const DEFAULT_SUGGESTIONS = [
  "Chart headline inflation from 2021 to 2024 as a line chart.",
  "Show a table of the CPI index and headline inflation by year.",
  "How is headline inflation different from core inflation?",
  "Open the document sample/cpi-index.md.",
];

export interface ChatSurfaceProps {
  /** Base URL of the agent API. Empty string targets the current origin. */
  apiBase?: string;
  title?: string;
  subtitle?: string;
  /** Brand mark shown in the header. Defaults to "R". */
  mark?: string;
  suggestions?: string[];
  className?: string;
}

/**
 * A complete, self-contained grounded-chat surface: conversation, citations,
 * generative-UI blocks, telemetry and document preview. Portals render this and
 * supply their own page chrome around it.
 */
export function ChatSurface({
  apiBase = "",
  title = "Rafiki",
  subtitle = "StatsSA agent",
  mark = "R",
  suggestions = DEFAULT_SUGGESTIONS,
  className,
}: ChatSurfaceProps) {
  const { messages, status, send, newSession } = useChat({ apiBase });
  const { spans, summary, connected, clear } = useTelemetry({ apiBase });
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [previewSource, setPreviewSource] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/status`)
      .then((response) => response.json() as Promise<AgentStatus>)
      .then(setAgent)
      .catch(() => undefined);
  }, [apiBase]);

  const streaming = status === "streaming" || status === "submitted";

  return (
    <div
      className={["flex h-svh flex-col bg-background text-foreground", className ?? ""]
        .join(" ")
        .trim()}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {mark}
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">{title}</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {agent && (
            <Badge variant="secondary" className="hidden font-mono text-[11px] sm:inline-flex">
              {agent.model}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setTelemetryOpen(true)}>
            Telemetry
            {spans.length > 0 && (
              <Badge variant="default" className="ml-1 h-5 px-1.5 text-[10px]">
                {spans.length}
              </Badge>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void newSession()}>
            New chat
          </Button>
        </div>
      </header>

      {agent && !agent.hasEnvKey && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {agent.envKey} is not set. The agent cannot reach the model until it is configured.
        </div>
      )}

      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Ask about South African statistics</h3>
                <p className="text-sm text-muted-foreground">
                  Ask a question, or try one of these to see grounded answers, charts, tables and
                  document previews.
                </p>
              </div>
              <Suggestions className="w-full flex-wrap justify-center">
                {suggestions.map((suggestion) => (
                  <Suggestion
                    key={suggestion}
                    suggestion={suggestion}
                    className="h-auto whitespace-normal py-1.5 text-center leading-snug"
                    onClick={(value) => void send(value)}
                  />
                ))}
              </Suggestions>
            </ConversationEmptyState>
          ) : (
            messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              const messageStreaming = streaming && isLast && message.role === "assistant";
              return (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.thinking.length > 0 && (
                      <Reasoning
                        className="mb-2"
                        isStreaming={messageStreaming && message.text.length === 0}
                      >
                        <ReasoningTrigger />
                        <ReasoningContent>{message.thinking}</ReasoningContent>
                      </Reasoning>
                    )}

                    {message.tools
                      .filter((tool) => !tool.hasBlock)
                      .map((tool) => (
                        <ToolRunView key={tool.id} tool={tool} />
                      ))}

                    {message.blocks.map((block, blockIndex) => (
                      <UiBlockView
                        key={`${message.id}-block-${blockIndex}`}
                        block={block}
                        onOpenDocument={setPreviewSource}
                      />
                    ))}

                    {message.role === "assistant" ? (
                      <Markdown isAnimating={messageStreaming} onOpenDocument={setPreviewSource}>
                        {message.text}
                      </Markdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.text}</p>
                    )}

                    {message.error && (
                      <p className="mt-2 text-sm text-destructive">{message.error}</p>
                    )}
                  </MessageContent>
                </Message>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-3">
        <ChatComposer status={status} onSubmit={(text) => void send(text)} />
      </div>

      <TelemetryPanel
        open={telemetryOpen}
        onOpenChange={setTelemetryOpen}
        spans={spans}
        summary={summary}
        connected={connected}
        onClear={() => void clear()}
      />

      <DocumentPreview
        source={previewSource}
        open={previewSource !== null}
        apiBase={apiBase}
        onOpenChange={(open) => {
          if (!open) setPreviewSource(null);
        }}
      />
    </div>
  );
}
