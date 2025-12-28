"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RepositoryListSkeleton } from "@/module/repository/components/RepositoryCardSkeleton";
import { useConnectRepository } from "@/module/repository/hooks/use-connect-repository";
import { useRepositories } from "@/module/repository/hooks/use-repositories";
import { Badge, ExternalLink, Search, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  stargazers_count: number;
  language: string;
  topics: string[];
  isConnected?: boolean;
}

export default function RepositoryList() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useRepositories();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [localConnectingId, setLocalConnectingId] = useState<number | null>(null);

  const { mutate: connectRepository } = useConnectRepository();

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        threshold: 0.1,
      }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const allRepositories = data?.pages.flatMap((page) => page) || [];

  const filteredRepositories = allRepositories.filter(
    (repo: Repository) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConnect = (repo: Repository) => {
    setLocalConnectingId(repo.id);

    connectRepository(
      {
        owner: repo.full_name.split("/")[0],
        repo: repo.full_name.split("/")[1],
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
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Repositories</h1>
          <p className="text-muted-foreground">Manage and view your github repositories</p>
        </div>
        <RepositoryListSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Failed to load repositories</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Repositories</h2>
        <p className="text-muted-foreground">Manage and view your github repositories</p>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search repositories..."
          className="pl-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-4">
        {filteredRepositories.map((repo: Repository) => (
          <Card key={repo.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-bold">{repo.name}</CardTitle>
                    <span className="text-xs text-muted-foreground mt-0.5">{repo.language || "Unknown"}</span>

                    {repo.isConnected && <Badge>Connected</Badge>}
                  </div>
                  <CardDescription>{repo.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" asChild>
                    <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant={repo.isConnected ? "outline" : "default"}
                    onClick={() => handleConnect(repo)}
                    disabled={localConnectingId === repo.id || repo.isConnected}
                  >
                    {localConnectingId === repo.id ? "Connecting..." : repo.isConnected ? "Connected" : "Connect"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    <span className="text-sm font-medium">{repo.stargazers_count}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div ref={observerTarget} className="py-4">
        {isFetchingNextPage && <RepositoryListSkeleton />}
        {!hasNextPage && allRepositories.length > 0 && (
          <p className="text-center text-muted-foreground">No more repositories</p>
        )}
      </div>
    </div>
  );
}
