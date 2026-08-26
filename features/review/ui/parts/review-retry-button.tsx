"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { retryReview } from "@/features/review/actions/retry-review";

export interface ReviewRetryButtonProps {
  reviewId: string;
}

export function ReviewRetryButton({
  reviewId,
}: ReviewRetryButtonProps): React.ReactElement {
  const [isPending, startTransition] = useTransition();

  const handleRetry = (): void => {
    startTransition(async () => {
      const result = await retryReview(reviewId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Review retry queued");
      window.location.reload();
    });
  };

  return (
    <Button type="button" size="sm" onClick={handleRetry} disabled={isPending}>
      {isPending ? "Retrying…" : "Retry review"}
    </Button>
  );
}
