import { createReviewRequest } from "@/features/review/lib/review-request";

import { formatReviewRequestResult } from "../lib/review-request-result";
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

    return formatReviewRequestResult(result, "Review");
  } catch {
    return {
      success: false,
      message: "Error Reviewing Pull Request",
      reason: "internal_error",
    };
  }
}
