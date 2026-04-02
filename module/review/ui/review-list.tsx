"use client";

import type { ReviewsData } from "../types";
import { useReviews } from "../hooks/use-reviews";
import { ReviewCard } from "./parts/review-card";
import { ReviewEmptyState } from "./parts/review-empty-state";

interface ReviewListProps {
  initialData?: ReviewsData;
}

export default function ReviewList({ initialData }: ReviewListProps) {
  const { reviews } = useReviews(initialData);

  if (reviews.length === 0) return <ReviewEmptyState />;

  return (
    <div className="grid gap-4">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}
