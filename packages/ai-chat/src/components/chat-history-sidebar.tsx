import { memo, useMemo } from "react";
import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@voltedge/ui";
import { MessageSquareIcon, MessageSquarePlusIcon, Trash2Icon } from "lucide-react";
import { useChatStore } from "../lib/chat-store.ts";
import { formatBytes, formatPercent, formatRelativeTime } from "../lib/format.ts";

interface ChatHistoryItemProps {
  id: string;
  title: string;
  updatedAt: number;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const ChatHistoryItem = memo(function ChatHistoryItem({
  id,
  title,
  updatedAt,
  active,
  onSelect,
  onDelete,
}: ChatHistoryItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={() => onSelect(id)}
        className="h-auto items-start py-1.5 pr-7"
      >
        <MessageSquareIcon className="mt-0.5" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate">{title}</span>
          <span className="truncate text-[11px] font-normal text-muted-foreground">
            {formatRelativeTime(updatedAt)}
          </span>
        </span>
      </SidebarMenuButton>
      <SidebarMenuAction
        showOnHover
        aria-label={`Delete ${title}`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(id);
        }}
      >
        <Trash2Icon />
      </SidebarMenuAction>
    </SidebarMenuItem>
  );
});

/**
 * Shadcn sidebar listing chats persisted in this browser. Reads the shared
 * Zustand store directly so the chat surface only has to render it.
 */
export function ChatHistorySidebar() {
  const chats = useChatStore((state) => state.chats);
  const activeId = useChatStore((state) => state.activeId);
  const storage = useChatStore((state) => state.storage);
  const selectChat = useChatStore((state) => state.selectChat);
  const deleteChat = useChatStore((state) => state.deleteChat);
  const newSession = useChatStore((state) => state.newSession);
  const clearAll = useChatStore((state) => state.clearAll);

  const sorted = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt), [chats]);

  const handleClear = () => {
    if (window.confirm("Delete all chats saved in this browser? This cannot be undone.")) {
      void clearAll();
    }
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-0 pt-3">
        <a href="/" className="mb-2 flex items-center px-2">
          <img src="/statssa-logo.png" alt="Statistics South Africa" className="h-16 w-auto" />
        </a>
        <div className="flex items-center gap-1 px-2">
          <h2 className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">
            Chat history
          </h2>
          <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={() => newSession()}>
            <MessageSquarePlusIcon />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Saved in this browser</SidebarGroupLabel>
          <SidebarGroupContent>
            {sorted.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Chats you start are saved here automatically.
              </p>
            ) : (
              <SidebarMenu>
                {sorted.map((chat) => (
                  <ChatHistoryItem
                    key={chat.id}
                    id={chat.id}
                    title={chat.title}
                    updatedAt={chat.updatedAt}
                    active={chat.id === activeId}
                    onSelect={selectChat}
                    onDelete={deleteChat}
                  />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Browser storage</span>
            <span className="tabular-nums text-muted-foreground">
              {formatPercent(storage.ratio)}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-sidebar-border">
            <div
              className="h-full rounded-full bg-sidebar-primary transition-[width]"
              style={{
                width: `${Math.min(100, Math.max(2, storage.ratio * 100))}%`,
              }}
            />
          </div>
          <p className="mt-2 text-muted-foreground">
            {formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} ·{" "}
            {storage.chats === 1 ? "1 chat" : `${storage.chats} chats`}
          </p>
          {storage.trimmed && (
            <p className="mt-1 text-amber-600 dark:text-amber-400">
              Older content was trimmed to fit.
            </p>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="mt-2 w-full"
            disabled={sorted.length === 0}
            onClick={handleClear}
          >
            Clear all
          </Button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
