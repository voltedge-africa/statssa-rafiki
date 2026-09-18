import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@voltedge/ui";
import { cn } from "cn";
import { HardDriveIcon } from "lucide-react";
import type { ChatStorageStats } from "../lib/chat-persistence.ts";
import { formatBytes, formatPercent } from "../lib/format.ts";

export interface StorageIndicatorProps {
  stats: ChatStorageStats;
  className?: string;
}

/**
 * Compact readout of how much of the active chat is persisted to IndexedDB,
 * pinned above the composer. Turns amber near the budget and red at the cap.
 */
export function StorageIndicator({ stats, className }: StorageIndicatorProps) {
  const critical = stats.ratio >= 0.95;
  const warning = !critical && stats.ratio >= 0.75;
  const fill = Math.min(100, Math.max(3, stats.ratio * 100));

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground",
            className,
          )}
        >
          <HardDriveIcon className="size-3 shrink-0" />
          <span className="truncate">
            Saved locally · <span className="tabular-nums">{formatBytes(stats.chatBytes)}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {stats.trimmed && <span className="text-amber-600 dark:text-amber-400">trimmed</span>}
            <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full transition-[width]",
                  critical ? "bg-destructive" : warning ? "bg-amber-500" : "bg-primary/60",
                )}
                style={{ width: `${fill}%` }}
              />
            </span>
            <span className="w-7 text-right tabular-nums">{formatPercent(stats.ratio)}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 flex-col items-start gap-1">
          <p className="font-medium">Chat storage</p>
          <p>This chat: {formatBytes(stats.chatBytes)}</p>
          <p>
            All chats: {formatBytes(stats.usedBytes)} of {formatBytes(stats.limitBytes)}
          </p>
          <p className="text-background/70">
            Saved in this browser only. When the limit is reached the oldest chats are removed
            first.
          </p>
          {stats.trimmed && (
            <p className="text-amber-400">
              Some older content was trimmed because the storage limit was reached.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
