import { useEffect, useState } from "react";
import type { AgentStatus } from "@voltedge/agent-contract";
import {
  Badge,
  Button,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Spinner,
} from "@voltedge/ui";
import { SquarePenIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation.tsx";
import { Message, MessageContent } from "./ai-elements/message.tsx";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./ai-elements/reasoning.tsx";
import { Suggestion, Suggestions } from "./ai-elements/suggestion.tsx";
import { UiBlockView } from "./blocks/index.tsx";
import { ChatComposer } from "./chat-composer.tsx";
import { ChatHistorySidebar } from "./chat-history-sidebar.tsx";
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
  suggestions?: string[];
  /** Optional image shown above the empty-state heading, e.g. an institutional mark. */
  emptyStateImage?: string;
  /**
   * Show the telemetry drawer, model badge and provider warnings. Off by default so
   * public surfaces stay free of operator chrome. Defaults to false.
   */
  showTelemetry?: boolean;
  /**
   * Persist chats in the browser and show the history sidebar plus the storage
   * indicator above the composer. Defaults to true.
   */
  showHistory?: boolean;
  className?: string;
}

/**
 * A complete, self-contained grounded-chat surface: conversation, citations,
 * generative-UI blocks and document preview. Portals render this and supply their
 * own page chrome around it. Operator tooling (telemetry, model badge, provider
 * warnings) is opt-in via `showTelemetry`.
 */
export function ChatSurface({
  apiBase = "",
  suggestions = DEFAULT_SUGGESTIONS,
  emptyStateImage,
  showTelemetry = false,
  showHistory = true,
  className,
}: ChatSurfaceProps) {
  const { messages, status, send, newSession, storage, hydrated } = useChat({ apiBase });
  const { spans, summary, connected, clear } = useTelemetry({ apiBase, enabled: showTelemetry });
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [previewSource, setPreviewSource] = useState<string | null>(null);

  useEffect(() => {
    if (!showTelemetry) return;
    fetch(`${apiBase}/api/status`)
      .then((response) => response.json() as Promise<AgentStatus>)
      .then(setAgent)
      .catch(() => undefined);
  }, [apiBase, showTelemetry]);

  const streaming = status === "streaming" || status === "submitted";
  const empty = messages.length === 0;

  const composer = (
    <ChatComposer
      status={status}
      onSubmit={(text) => void send(text)}
      storage={showHistory ? storage : undefined}
    />
  );

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      {showHistory && <ChatHistorySidebar />}
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <div
          className={[
            "relative flex h-full min-h-0 flex-col bg-background text-foreground",
            className ?? "",
          ]
            .join(" ")
            .trim()}
        >
          {showHistory && (
            <div className="absolute top-3 left-3 z-10">
              <SidebarTrigger />
            </div>
          )}

          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            {showTelemetry && agent && (
              <Badge variant="secondary" className="hidden font-mono text-[11px] sm:inline-flex">
                {agent.model}
              </Badge>
            )}
            {showTelemetry && (
              <Button variant="outline" size="sm" onClick={() => setTelemetryOpen(true)}>
                Telemetry
                {spans.length > 0 && (
                  <Badge variant="default" className="ml-1 h-5 px-1.5 text-[10px]">
                    {spans.length}
                  </Badge>
                )}
              </Button>
            )}
            {!showHistory && !empty && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="New chat"
                onClick={() => newSession()}
              >
                <SquarePenIcon />
              </Button>
            )}
          </div>

          {showTelemetry && agent && !agent.hasEnvKey && (
            <div className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {agent.envKey} is not set. The agent cannot reach the model until it is configured.
            </div>
          )}

          {!hydrated ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : empty ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24">
              <div className="w-full max-w-2xl space-y-6">
                <div className="space-y-3">
                  {emptyStateImage && (
                    <img
                      src={emptyStateImage}
                      alt=""
                      aria-hidden="true"
                      className="mx-auto h-20 w-auto select-none"
                    />
                  )}
                  <h2 className="text-center text-2xl font-semibold tracking-tight">
                    What can I help with?
                  </h2>
                </div>
                <Suggestions className="w-full flex-wrap justify-center whitespace-normal">
                  {suggestions.map((suggestion) => (
                    <Suggestion
                      key={suggestion}
                      suggestion={suggestion}
                      className="h-auto whitespace-normal py-1.5 text-center leading-snug"
                      onClick={(value) => void send(value)}
                    />
                  ))}
                </Suggestions>
                {composer}
                <p className="text-center text-xs text-muted-foreground">
                  Rafiki can make mistakes. Check the cited sources.
                </p>
              </div>
            </div>
          ) : (
            <>
              <Conversation className="flex-1">
                <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6">
                  {messages.map((message, index) => {
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
                            <Markdown
                              isAnimating={messageStreaming}
                              onOpenDocument={setPreviewSource}
                            >
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
                  })}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>

              <div className="px-4 pb-4">
                <div className="mx-auto w-full max-w-3xl">
                  {composer}
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Rafiki can make mistakes. Check the cited sources.
                  </p>
                </div>
              </div>
            </>
          )}

          {showTelemetry && (
            <TelemetryPanel
              open={telemetryOpen}
              onOpenChange={setTelemetryOpen}
              spans={spans}
              summary={summary}
              connected={connected}
              onClear={() => void clear()}
            />
          )}

          <DocumentPreview
            source={previewSource}
            open={previewSource !== null}
            apiBase={apiBase}
            onOpenChange={(open) => {
              if (!open) setPreviewSource(null);
            }}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
