"use client";

import { useMemo, useState } from "react";
import type { Repository } from "../types";
import { useConnectRepository } from "../hooks/use-connect-repository";
import { useInfiniteScrollTrigger } from "../hooks/use-infinite-scroll-trigger";
import { useRepositories } from "../hooks/use-repositories";
import { RepositoryCard } from "./parts/repository-card";
import { RepositoryListSkeleton } from "./parts/repository-card-skeleton";
import { RepositorySearchInput } from "./parts/repository-search-input";

export default function RepositoryList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useRepositories();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [localConnectingId, setLocalConnectingId] = useState<number | null>(null);

  const { mutate: connectRepository } = useConnectRepository();

  const observerTarget = useInfiniteScrollTrigger({
    hasNextPage,
    isFetchingNextPage,
    onLoadMore: () => {
      void fetchNextPage();
    },
  });

  const allRepositories = useMemo(() => data?.pages.flatMap((page) => page) || [], [data]);

  const normalizedSearchQuery = searchQuery.toLowerCase();
  const filteredRepositories = useMemo(
    () =>
      allRepositories.filter(
        (repo: Repository) =>
          repo.name.toLowerCase().includes(normalizedSearchQuery) ||
          repo.fullName.toLowerCase().includes(normalizedSearchQuery)
      ),
    [allRepositories, normalizedSearchQuery]
  );

  const handleConnect = (repo: Repository) => {
    setLocalConnectingId(repo.id);

    connectRepository(
      {
        owner: repo.ownerLogin,
        repo: repo.name,
        githubId: repo.id,
      },
      {
        onSettled: () => {
          setLocalConnectingId(null);
        },
      }
    );
  };

  if (isLoading) {
    return <RepositoryListSkeleton />;
  }

  return (
    <div className="space-y-6">
      <RepositorySearchInput value={searchQuery} onChange={setSearchQuery} />

      <div className="grid gap-4">
        {filteredRepositories.map((repo: Repository) => (
          <RepositoryCard
            key={repo.id}
            repository={repo}
            isConnecting={localConnectingId === repo.id}
            onConnect={handleConnect}
          />
        ))}
      </div>

      <div ref={observerTarget} className="py-8">
        {isFetchingNextPage && <RepositoryListSkeleton />}
        {!hasNextPage && allRepositories.length > 0 && (
          <p className="text-center text-[#606060] font-light text-sm">
            No more repositories
          </p>
        )}
      </div>
    </div>
  );
}
