import { MEDIA_REQUEST_STATUS_LABELS, type MediaRequestStatus } from "@voltedge/media-contract";
import { Badge, cn } from "@voltedge/ui";

const TONES: Record<MediaRequestStatus, string> = {
  submitted: "bg-secondary text-secondary-foreground",
  analysing: "bg-primary/10 text-primary",
  awaiting_review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  information_gap: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  approved: "bg-brand/10 text-brand",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: MediaRequestStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full border-transparent", TONES[status], className)}
    >
      {MEDIA_REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}
