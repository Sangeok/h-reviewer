"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getUserRepositories } from "../actions";
import { REPOSITORY_PAGE_SIZE, REPOSITORY_QUERY_KEYS } from "../constants";

export const useRepositories = () => {
  return useInfiniteQuery({
    queryKey: REPOSITORY_QUERY_KEYS.LIST,
    queryFn: ({ pageParam = 1 }) => getUserRepositories(pageParam, REPOSITORY_PAGE_SIZE),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < REPOSITORY_PAGE_SIZE) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
  });
};
