import { POPIA_REQUEST_STATUS_LABELS, type PopiaRequestStatus } from "@voltedge/popia-contract";
import { Badge, cn } from "@voltedge/ui";

const TONES: Record<PopiaRequestStatus, string> = {
  submitted: "bg-secondary text-secondary-foreground",
  acknowledged: "bg-primary/10 text-primary",
  in_review: "bg-primary/10 text-primary",
  awaiting_information: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  completed: "bg-brand/10 text-brand",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: PopiaRequestStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full border-transparent", TONES[status], className)}
    >
      {POPIA_REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}
