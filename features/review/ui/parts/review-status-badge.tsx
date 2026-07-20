import { Badge } from "@/components/ui/badge";
import type { ReviewStatus } from "../../types";

const STATUS_CONFIG: Record<ReviewStatus, { label: string; className: string }> = {
  completed: {
    label: "Completed",
    className: "bg-primary/10 text-primary border-primary/30",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  pending: {
    label: "Pending",
    className: "bg-warning/30 text-warning-foreground border-warning/50",
  },
};

function isReviewStatus(value: string): value is ReviewStatus {
  return value in STATUS_CONFIG;
}

export function ReviewStatusBadge({ status }: { status: string }) {
  if (!isReviewStatus(status)) return null;

  const config = STATUS_CONFIG[status];
  return <Badge className={config.className}>{config.label}</Badge>;
}
