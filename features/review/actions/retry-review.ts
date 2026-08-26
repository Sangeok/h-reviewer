"use server";

import { retryReviewRequest } from "@/features/review/lib/review-request";
import prisma from "@/lib/db";
import { requireAuthSession } from "@/lib/server-utils";

export type RetryReviewResult =
  | { success: true; reviewId: string }
  | {
      success: false;
      reason: "not_found" | "not_retryable" | "dispatch_failed";
      error: string;
    };

export async function retryReview(reviewId: string): Promise<RetryReviewResult> {
  let userId: string;
  try {
    const session = await requireAuthSession();
    userId = session.user.id;
  } catch {
    return {
      success: false,
      reason: "not_found",
      error: "Review not found",
    };
  }

  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      repository: { userId },
    },
    select: { id: true, status: true, failureStage: true },
  });
  if (!review) {
    return {
      success: false,
      reason: "not_found",
      error: "Review not found",
    };
  }
  if (
    review.status !== "FAILED" ||
    review.failureStage === null ||
    review.failureStage === "LEGACY"
  ) {
    return {
      success: false,
      reason: "not_retryable",
      error: "Review is not retryable",
    };
  }

  const result = await retryReviewRequest(review.id);
  if (result.kind === "dispatch-failed") {
    return {
      success: false,
      reason: "dispatch_failed",
      error: result.message,
    };
  }
  return { success: true, reviewId: review.id };
}
