"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchRepositories } from "@/module/repository";

export const useRepositories = () => {
  return useInfiniteQuery({
    queryKey: ["repositories"],
    queryFn: async ({ pageParam = 1 }) => {
      const repositories = await fetchRepositories(pageParam, 10);
      return repositories;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < 10) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
  });
};
