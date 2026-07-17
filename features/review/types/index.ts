import type { getUserReviews, getUserReviewById } from "../actions";

/** 리뷰 목록 조회 결과 (getUserReviews 반환 타입) */
export type ReviewsData = Awaited<ReturnType<typeof getUserReviews>>;

/** 리뷰 목록의 단일 항목 */
export type ReviewListItem = ReviewsData[number];

/** 리뷰 상세 조회 결과 (getUserReviewById 반환 타입, null 제외) */
export type ReviewDetailData = NonNullable<Awaited<ReturnType<typeof getUserReviewById>>>;

/** 리뷰 상태 */
export type ReviewStatus = "completed" | "failed" | "pending";
