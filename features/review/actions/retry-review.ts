"use server";

import { retryReviewRequest } from "@/features/review/lib/review-request";
import prisma from "@/lib/db";
import type { ReviewStatus } from "@/lib/generated/prisma/enums";
import { requireAuthSession } from "@/lib/server-utils";

export type RetryReviewActionResult =
  | { kind: "retry-requested"; status: ReviewStatus }
  | {
      kind: "not-found";
      reason?: "PLAN_RESTRICTED" | "TRIAL_EXHAUSTED";
    };

export async function retryReview(
  reviewId: string,
): Promise<RetryReviewActionResult> {
  const normalizedReviewId = reviewId.trim();
  if (!normalizedReviewId) {
    return { kind: "not-found" };
  }

  let userId: string;
  try {
    const session = await requireAuthSession();
    userId = session.user.id;
  } catch {
    return { kind: "not-found" };
  }

  const review = await prisma.review.findFirst({
    where: {
      id: normalizedReviewId,
      repository: { userId },
      status: "FAILED",
      failureStage: {
        in: ["QUEUE", "FETCH", "GENERATE", "VERIFY", "PERSIST", "POST", "RECONCILE"],
      },
    },
    select: { id: true },
  });

  if (!review) {
    return { kind: "not-found" };
  }

  const result = await retryReviewRequest(review.id);
  if (result.kind === "rejected") {
    return result.reason === "PR_NOT_REVIEWABLE"
      ? { kind: "not-found" }
      : { kind: "not-found", reason: result.reason };
  }
  return { kind: "retry-requested", status: result.status };
}
