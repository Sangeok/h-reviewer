import type { SuggestionStatus, SuggestionSeverity } from "@/lib/generated/prisma/client";

export interface ApplySuggestionResult {
  success: boolean;
  commitSha?: string;
  error?: string;
  reason?: "conflict" | "not_found" | "pr_merged" | "unauthorized" | "api_error" | "fork_no_access";
}

export interface SuggestionWithReview {
  id: string;
  filePath: string;
  lineNumber: number;
  beforeCode: string;
  afterCode: string;
  explanation: string;
  severity: SuggestionSeverity;
  status: SuggestionStatus;
  appliedAt: Date | null;
  appliedCommitSha: string | null;
  review: {
    id: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    headSha: string | null;
    repository: {
      owner: string;
      name: string;
    };
  };
}
