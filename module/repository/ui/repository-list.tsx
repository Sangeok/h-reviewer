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
  const [connectingRepositoryId, setConnectingRepositoryId] = useState<number | null>(null);

  const { mutate: connectRepository } = useConnectRepository();

  const observerTarget = useInfiniteScrollTrigger({
    hasNextPage,
    isFetchingNextPage,
    onLoadMore: () => {
      void fetchNextPage();
    },
  });

  const repositories = useMemo(() => data?.pages.flatMap((page) => page) ?? [], [data]);

  const filteredRepositories = useMemo(() => {
    const normalized = searchQuery.toLowerCase();
    return repositories.filter(
      (repo) =>
        repo.name.toLowerCase().includes(normalized) ||
        repo.fullName.toLowerCase().includes(normalized)
    );
  }, [repositories, searchQuery]);

  const handleConnect = (repo: Repository) => {
    setConnectingRepositoryId(repo.id);

    connectRepository(
      {
        owner: repo.ownerLogin,
        repo: repo.name,
        githubId: repo.id,
      },
      {
        onSettled: () => {
          setConnectingRepositoryId(null);
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
            isConnecting={connectingRepositoryId === repo.id}
            onConnect={handleConnect}
          />
        ))}
      </div>

      <div ref={observerTarget} className="py-8">
        {isFetchingNextPage && <RepositoryListSkeleton />}
        {!hasNextPage && repositories.length > 0 && (
          <p className="text-center text-muted-foreground-alt font-light text-sm">
            No more repositories
          </p>
        )}
      </div>
    </div>
  );
}
