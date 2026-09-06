import { createReviewRequest } from "@/features/review/lib/review-request";

import type {
  ReviewPullRequestInput,
  ReviewPullRequestResult,
} from "../types";

export async function reviewPullRequest(
  input: ReviewPullRequestInput,
): Promise<ReviewPullRequestResult> {
  try {
    const { requestSource, ...identity } = input;
    const result = await createReviewRequest({
      ...identity,
      reviewType: "FULL_REVIEW",
      reviewMode: "FULL",
      requestSource,
      dispatchMode:
        requestSource === "AUTOMATIC" ? "DEBOUNCED" : "DIRECT",
    });

    if (result.kind === "rejected") {
      const reason = {
        PLAN_RESTRICTED: "plan_restricted",
        TRIAL_EXHAUSTED: "trial_exhausted",
        PR_NOT_REVIEWABLE: "pr_not_reviewable",
      } as const;

      return {
        success: false,
        message: result.message,
        reason: reason[result.reason],
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
        message: "The review failed. Retry it from the pull request page.",
        reason: "review_failed",
        ...metadata,
      };
    }

    if (result.status === "SUPERSEDED") {
      return {
        success: false,
        message: "A newer pull request head superseded this review.",
        reason: "review_superseded",
        ...metadata,
      };
    }

    const message =
      result.status === "COMPLETED"
        ? "Review already completed"
        : result.status === "RUNNING" || result.status === "POSTING"
          ? "Review already in progress"
          : result.kind === "existing"
            ? "Review already queued"
            : "Review Queued";

    return { success: true, message, ...metadata };
  } catch {
    return {
      success: false,
      message: "Error Reviewing Pull Request",
      reason: "internal_error",
    };
  }
}
