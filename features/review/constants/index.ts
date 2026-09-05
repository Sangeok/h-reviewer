export const REVIEW_QUERY_KEYS = {
  LIST: ["reviews"],
  DETAIL: (id: string) => ["reviews", id],
} as const;

export const REVIEWS_STALE_TIME_MS = 1000 * 60 * 2;

export const REVIEW_PREVIEW_MAX_CHARS = 300;

export const REVIEW_QUEUE_LEASE_MS = 30 * 60 * 1000;

export const REVIEW_EXECUTION_LEASE_MS = 15 * 60 * 1000;

export const GITHUB_POST_TIMEOUT_MS = 60 * 1000;

export const REVIEW_ARTIFACT_ABSENCE_GRACE_MS = 5 * 60 * 1000;
