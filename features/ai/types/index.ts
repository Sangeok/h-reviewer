export interface PRCommand {
  type: "summary" | "review";
}

export type PullRequestIdentityInput = {
  owner: string;
  repo: string;
  prNumber: number;
};

export type ReviewRequestMetadata = {
  reviewId: string;
  requestKey: string;
  status:
    | "PENDING"
    | "RUNNING"
    | "POSTING"
    | "COMPLETED"
    | "FAILED"
    | "SUPERSEDED";
  failureStage?: "QUEUE" | "POST" | "RECONCILE";
};

export type ReviewRequestFailureReason =
  | "plan_restricted"
  | "trial_exhausted"
  | "pr_not_reviewable"
  | "review_failed"
  | "review_superseded"
  | "internal_error";

export type ReviewPullRequestResult =
  | ({ success: true; message: string } & ReviewRequestMetadata)
  | ({
      success: false;
      message: string;
      reason: ReviewRequestFailureReason;
    } & Partial<ReviewRequestMetadata>);

export type GeneratePRSummaryResult =
  | ({ success: true; message: string } & ReviewRequestMetadata)
  | ({
      success: false;
      message: string;
      reason: ReviewRequestFailureReason;
    } & Partial<ReviewRequestMetadata>);

export type { CodeSuggestion, StructuredIssue, SuggestionSeverity, IssueCategory } from "./suggestion";
