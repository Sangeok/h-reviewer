"use client";

import { useEffect, useRef } from "react";

interface UseInfiniteScrollTriggerParams {
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function useInfiniteScrollTrigger({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: UseInfiniteScrollTriggerParams) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentTarget = observerTarget.current;

    if (!currentTarget) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      {
        threshold: 0.1,
      }
    );

    observer.observe(currentTarget);

    return () => {
      observer.unobserve(currentTarget);
    };
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  return observerTarget;
}
