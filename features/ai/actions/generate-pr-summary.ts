import { createReviewRequest } from "@/features/review/lib/review-request";

import type {
  GeneratePRSummaryResult,
  PullRequestIdentityInput,
} from "../types";

export async function generatePRSummary(
  input: PullRequestIdentityInput,
): Promise<GeneratePRSummaryResult> {
  try {
    const result = await createReviewRequest({
      ...input,
      reviewType: "SUMMARY",
      reviewMode: "FULL",
      requestSource: "COMMAND",
      dispatchMode: "DIRECT",
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
        message: "The summary failed. Retry it from the pull request page.",
        reason: "review_failed",
        ...metadata,
      };
    }

    if (result.status === "SUPERSEDED") {
      return {
        success: false,
        message: "A newer pull request head superseded this summary.",
        reason: "review_superseded",
        ...metadata,
      };
    }

    const message =
      result.status === "COMPLETED"
        ? "Summary already completed"
        : result.status === "RUNNING" || result.status === "POSTING"
          ? "Summary already in progress"
          : result.kind === "existing"
            ? "Summary already queued"
            : "Summary Queued";

    return { success: true, message, ...metadata };
  } catch {

    return {
      success: false,
      message: "Error Queueing Summary",
      reason: "internal_error",
    };
  }
}
