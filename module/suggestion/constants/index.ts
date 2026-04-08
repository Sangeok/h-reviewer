export const SEVERITY_CONFIG = {
  CRITICAL:   { emoji: "🚨", color: "text-red-400",   bgColor: "bg-red-950/50",   borderColor: "border-red-800/30" },
  WARNING:    { emoji: "⚠️",  color: "text-amber-400", bgColor: "bg-amber-950/50", borderColor: "border-amber-800/30" },
  SUGGESTION: { emoji: "💡", color: "text-blue-400",  bgColor: "bg-blue-950/50",  borderColor: "border-blue-800/30" },
  INFO:       { emoji: "ℹ️",  color: "text-gray-400",  bgColor: "bg-gray-950/50",  borderColor: "border-gray-800/30" },
} as const;

export const STATUS_CONFIG = {
  PENDING:    { label: { en: "Pending",   ko: "대기 중" }, color: "text-muted-foreground" },
  APPLIED:    { label: { en: "Applied",   ko: "적용됨"  }, color: "text-primary" },
  DISMISSED:  { label: { en: "Dismissed", ko: "무시됨"  }, color: "text-muted-foreground-alt" },
  CONFLICTED: { label: { en: "Conflict",  ko: "충돌"    }, color: "text-red-400" },
} as const;

export const SUGGESTION_QUERY_KEYS = {
  DETAIL: (reviewId: string) => ["suggestions", reviewId] as const,
  LIST: ["suggestions"] as const,
} as const;

export const SUGGESTIONS_STALE_TIME_MS = 60 * 1000;
