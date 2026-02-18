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
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useRepositories();

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
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Repositories</h1>
          <p className="text-[#707070] font-light mt-1">Manage and view your github repositories</p>
        </div>
        <RepositoryListSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Failed to load repositories</h1>
          <p className="text-[#707070] font-light mt-1">There was an error loading your repositories</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Repositories</h2>
        <p className="text-[#707070] font-light mt-1">Manage and view your github repositories</p>
      </div>

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
