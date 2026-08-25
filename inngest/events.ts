type ReviewRunEventData = {
  reviewId: string;
  attempt: number;
  debounceKey: string;
};

type SummaryRunEventData = Pick<ReviewRunEventData, "reviewId" | "attempt">;

export type SupersededReviewEventData = Pick<
  ReviewRunEventData,
  "reviewId" | "attempt"
>;

export type HReviewerEvents = {
  "pr.review.auto-requested": { data: ReviewRunEventData };
  "pr.review.requested": { data: ReviewRunEventData };
  "pr.review.superseded": { data: SupersededReviewEventData };
  "pr.summary.requested": { data: SummaryRunEventData };
};
