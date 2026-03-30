export const REVIEW_QUERY_KEYS = {
  LIST: ["reviews"],
  DETAIL: (id: string) => ["reviews", id],
} as const;

export const REVIEWS_STALE_TIME_MS = 1000 * 60 * 2;
