export { ChatSurface, type ChatSurfaceProps } from "./components/chat-surface.tsx";
export { ChatComposer } from "./components/chat-composer.tsx";
export { ChatHistorySidebar } from "./components/chat-history-sidebar.tsx";
export { StorageIndicator, type StorageIndicatorProps } from "./components/storage-indicator.tsx";
export { TelemetryPanel, type TelemetryPanelProps } from "./components/telemetry-panel.tsx";
export { DocumentPreview } from "./components/document-preview.tsx";
export { ToolRunView } from "./components/tool-run.tsx";
export { Markdown } from "./components/markdown.tsx";
export { PlainMarkdown } from "./components/plain-markdown.tsx";

export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "./components/ai-elements/conversation.tsx";
export { Message, MessageContent, MessageResponse } from "./components/ai-elements/message.tsx";
export {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "./components/ai-elements/reasoning.tsx";
export {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./components/ai-elements/tool.tsx";
export { CodeBlock, CodeBlockCopyButton } from "./components/ai-elements/code-block.tsx";
export {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "./components/ai-elements/sources.tsx";
export { Suggestion, Suggestions } from "./components/ai-elements/suggestion.tsx";
export { Shimmer } from "./components/ai-elements/shimmer.tsx";

export {
  ChartBlock,
  DocumentBlock,
  SourcesBlock,
  TableBlock,
  UiBlockView,
} from "./components/blocks/index.tsx";

export { useChat, type UseChatOptions } from "./hooks/use-chat.ts";
export { useTelemetry, type UseTelemetryOptions } from "./hooks/use-telemetry.ts";

export {
  useChatStore,
  type ChatActions,
  type ChatState,
  type ChatStore,
} from "./lib/chat-store.ts";
export {
  CHAT_STORAGE_LIMIT_BYTES,
  type ChatStorageStats,
  type StoredChat,
} from "./lib/chat-persistence.ts";
export { linkifyCitations, parseCitationHref, type Citation } from "./lib/citations.ts";
export {
  formatBytes,
  formatCost,
  formatDuration,
  formatMs,
  formatPercent,
  formatRelativeTime,
  formatValue,
  numeric,
} from "./lib/format.ts";

export type {
  AgentStatus,
  ChatEvent,
  ChatMessage,
  ChatRequest,
  ChatStatus,
  IndexedDocument,
  RecordedSpan,
  SourceItem,
  TelemetryStoreEvent,
  TelemetrySummary,
  ToolRun,
  UiBlock,
} from "@voltedge/agent-contract";
export { isUiBlock, isUiComponent, UI_COMPONENTS } from "@voltedge/agent-contract";
