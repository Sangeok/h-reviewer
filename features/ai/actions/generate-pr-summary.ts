import { createReviewRequest } from "@/features/review/lib/review-request";

import { formatReviewRequestResult } from "../lib/review-request-result";
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

    return formatReviewRequestResult(result, "Summary");
  } catch {
    return {
      success: false,
      message: "Error Queueing Summary",
      reason: "internal_error",
    };
  }
}
