import type { IssueCategory, SuggestionSeverity } from "../types/suggestion";

export const CATEGORY_EMOJI: Record<IssueCategory, string> = {
  bug: "🐛", design: "🔀", security: "🛡️",
  performance: "⚡", testing: "🧪", general: "📋",
};

export const SEVERITY_EMOJI: Record<SuggestionSeverity, string> = {
  CRITICAL: "🚨", WARNING: "⚠️", SUGGESTION: "💡", INFO: "ℹ️",
};
