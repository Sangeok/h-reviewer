"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { getReviews } from "../actions";
import { REVIEW_QUERY_KEYS, REVIEWS_STALE_TIME_MS } from "../constants";

type ReviewsData = Awaited<ReturnType<typeof getReviews>>;

export function useReviews(initialData?: ReviewsData) {
  const { data: reviews } = useSuspenseQuery({
    queryKey: REVIEW_QUERY_KEYS.LIST,
    queryFn: getReviews,
    staleTime: REVIEWS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    ...(initialData !== undefined && { initialData }),
  });

  return { reviews };
}
