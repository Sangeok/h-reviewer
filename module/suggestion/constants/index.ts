export const SEVERITY_CONFIG = {
  CRITICAL:   { emoji: "🚨", color: "text-red-400",   bgColor: "bg-red-950/50",   borderColor: "border-red-800/30" },
  WARNING:    { emoji: "⚠️",  color: "text-amber-400", bgColor: "bg-amber-950/50", borderColor: "border-amber-800/30" },
  SUGGESTION: { emoji: "💡", color: "text-blue-400",  bgColor: "bg-blue-950/50",  borderColor: "border-blue-800/30" },
  INFO:       { emoji: "ℹ️",  color: "text-gray-400",  bgColor: "bg-gray-950/50",  borderColor: "border-gray-800/30" },
} as const;

export const STATUS_CONFIG = {
  PENDING:    { label: "Pending",   color: "text-muted-foreground" },
  APPLIED:    { label: "Applied",   color: "text-primary" },
  DISMISSED:  { label: "Dismissed", color: "text-muted-foreground-alt" },
  CONFLICTED: { label: "Conflict",  color: "text-red-400" },
} as const;

export const SUGGESTION_QUERY_KEYS = {
  DETAIL: (reviewId: string) => ["suggestions", reviewId] as const,
  LIST: ["suggestions"] as const,
} as const;

export const SUGGESTIONS_STALE_TIME_MS = 60 * 1000;
