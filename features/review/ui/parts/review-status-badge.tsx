import { Badge } from "@/components/ui/badge";
import type { ReviewStatus } from "../../types";

type ReviewStatusPresentation = {
  label: string;
  className: string;
  description: string;
};

type ReviewStatusBadgeProps = {
  status: ReviewStatus;
};

const STATUS_CONFIG: Record<ReviewStatus, ReviewStatusPresentation> = {
  PENDING: {
    label: "Pending",
    className: "bg-warning/30 text-warning-foreground border-warning/50",
    description: "This review is queued and waiting to start.",
  },
  RUNNING: {
    label: "Running",
    className: "bg-blue-950/30 text-blue-400 border-blue-800/30",
    description: "HReviewer is analyzing the pull request.",
  },
  POSTING: {
    label: "Posting",
    className: "bg-blue-950/30 text-blue-400 border-blue-800/30",
    description: "The review is being posted to GitHub.",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-primary/10 text-primary border-primary/30",
    description: "The review completed successfully.",
  },
  FAILED: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    description: "The review could not be completed.",
  },
  SUPERSEDED: {
    label: "Superseded",
    className: "bg-warning/30 text-warning-foreground border-warning/50",
    description:
      "A newer head is being reviewed, or this pull request is no longer open for review.",
  },
};

export function getReviewStatusPresentation(
  status: ReviewStatus,
): ReviewStatusPresentation {
  return STATUS_CONFIG[status];
}

export function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
  const config = getReviewStatusPresentation(status);
  return <Badge className={config.className}>{config.label}</Badge>;
}
