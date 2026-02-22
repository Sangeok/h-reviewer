export interface PRCommand {
  type: "summary" | "review";
}

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

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
