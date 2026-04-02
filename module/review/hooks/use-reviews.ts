"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { getUserReviews } from "../actions";
import { REVIEW_QUERY_KEYS, REVIEWS_STALE_TIME_MS } from "../constants";
import type { ReviewsData } from "../types";

export function useReviews(initialData?: ReviewsData) {
  const { data: reviews } = useSuspenseQuery({
    queryKey: REVIEW_QUERY_KEYS.LIST,
    queryFn: getUserReviews,
    staleTime: REVIEWS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    ...(initialData !== undefined && { initialData }),
  });

  return { reviews };
}
