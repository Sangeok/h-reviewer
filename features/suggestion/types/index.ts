import type { Suggestion } from "@/lib/generated/prisma/client";

export type ApplySuggestionResult =
  | { success: true; commitSha: string }
  | {
      success: false;
      error: string;
      reason: "conflict" | "not_found" | "pr_merged" | "unauthorized" | "api_error" | "fork_no_access";
    };

export type SuggestionItem = Suggestion;
export type SuggestionsData = SuggestionItem[];
