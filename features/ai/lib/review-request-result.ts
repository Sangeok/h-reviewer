import type { CreateReviewRequestResult } from "@/features/review/lib/review-request";

import type { ReviewPullRequestResult } from "../types";

export function formatReviewRequestResult(
  result: CreateReviewRequestResult,
  subject: "Review" | "Summary",
): ReviewPullRequestResult {
  if (result.kind === "rejected") {
    const reasons = {
      PLAN_RESTRICTED: "plan_restricted",
      TRIAL_EXHAUSTED: "trial_exhausted",
      PR_NOT_REVIEWABLE: "pr_not_reviewable",
    } as const;

    return {
      success: false,
      message: result.message,
      reason: reasons[result.reason],
    };
  }

  const metadata = {
    reviewId: result.reviewId,
    requestKey: result.requestKey,
    status: result.status,
    ...(result.kind === "dispatch-failed"
      ? { failureStage: result.failureStage }
      : {}),
  };

  if (result.kind === "dispatch-failed") {
    return {
      success: false,
      message: result.message,
      reason: "internal_error",
      ...metadata,
    };
  }

  if (result.status === "FAILED") {
    return {
      success: false,
      message: `The ${subject.toLowerCase()} failed. Retry it from the pull request page.`,
      reason: "review_failed",
      ...metadata,
    };
  }

  if (result.status === "SUPERSEDED") {
    return {
      success: false,
      message: `A newer pull request head superseded this ${subject.toLowerCase()}.`,
      reason: "review_superseded",
      ...metadata,
    };
  }

  const messages = {
    COMPLETED: `${subject} already completed`,
    RUNNING: `${subject} already in progress`,
    POSTING: `${subject} already in progress`,
    PENDING:
      result.kind === "existing"
        ? `${subject} already queued`
        : `${subject} Queued`,
  } satisfies Record<typeof result.status, string>;

  return { success: true, message: messages[result.status], ...metadata };
}
