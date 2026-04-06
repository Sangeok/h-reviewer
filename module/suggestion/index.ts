// ===== Actions =====
export { getSuggestionsByReviewId, applySuggestion, dismissSuggestion } from "./actions";

// ===== Types =====
export type { ApplySuggestionResult, SuggestionsData, SuggestionItem } from "./types";

// ===== Constants =====
export { SEVERITY_CONFIG, STATUS_CONFIG, SUGGESTION_QUERY_KEYS, SUGGESTIONS_STALE_TIME_MS } from "./constants";

// ===== UI Components =====
export { SuggestionCard } from "./ui/suggestion-card";
export { SuggestionList } from "./ui/suggestion-list";

// ===== Hooks =====
export { useApplySuggestion } from "./hooks/use-apply-suggestion";
export { useDismissSuggestion } from "./hooks/use-dismiss-suggestion";
