"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { retryReview } from "@/features/review/actions";

export interface ReviewRetryButtonProps {
  reviewId: string;
}

export function ReviewRetryButton({
  reviewId,
}: ReviewRetryButtonProps): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRetry = (): void => {
    startTransition(async () => {
      const result = await retryReview(reviewId);
      if (result.kind === "not-found") {
        toast.error("This review is unavailable for retry.");
        return;
      }

      toast.success("Review retry requested.");
      router.refresh();
    });
  };

  return (
    <Button type="button" size="sm" disabled={isPending} onClick={handleRetry}>
      {isPending ? "Retrying…" : "Retry review"}
    </Button>
  );
}
