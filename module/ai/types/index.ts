export interface PRCommand {
  type: "summary" | "review";
}

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

export type ReviewPullRequestResult =
  | {
      success: true;
      message: "Review Queued";
    }
  | {
      success: false;
      message: string;
      reason: "plan_restricted" | "internal_error";
    };

export type GeneratePRSummaryResult =
  | { success: true; message: "Summary Queued" }
  | { success: false; message: string; reason: "internal_error" };

export type { CodeSuggestion, StructuredIssue, SuggestionSeverity, IssueCategory } from "./suggestion";
