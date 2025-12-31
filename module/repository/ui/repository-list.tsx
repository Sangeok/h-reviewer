"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  RepositoryListSkeleton,
  useConnectRepository,
  useRepositories,
  type Repository,
} from "@/module/repository";
import { Badge, ExternalLink, Search, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

      {/* Search Input - Terminal Inspired */}
      <div className="relative group">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#606060] group-hover:text-[#4a6a4a] transition-colors duration-300" />
        <Input
          type="text"
          placeholder="Search repositories..."
          className="pl-10 bg-[#0a0a0a] border-[#1a1a1a] text-[#e0e0e0] placeholder:text-[#606060] hover:border-[#2d3e2d]/50 focus:border-[#2d3e2d] focus:ring-[#2d3e2d]/20 transition-all duration-300"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Repository Cards */}
      <div className="grid gap-4">
        {filteredRepositories.map((repo: Repository) => (
          <Card
            key={repo.id}
            className="group relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a] hover:border-[#2d3e2d]/50 transition-all duration-300"
          >
            {/* Subtle hover glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#2d3e2d]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <CardHeader>
              <div className="flex items-start justify-between relative z-10">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="text-lg font-medium text-[#e0e0e0]">
                      {repo.name}
                    </CardTitle>

                    {repo.language && (
                      <span className="text-xs text-[#606060] font-mono px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#2d3e2d]/20">
                        {repo.language}
                      </span>
                    )}

                    {repo.isConnected && (
                      <Badge className="bg-gradient-to-r from-[#2d3e2d]/30 to-[#3d523d]/20 text-[#4a6a4a] border border-[#2d3e2d]/30 hover:bg-gradient-to-r hover:from-[#2d3e2d]/40 hover:to-[#3d523d]/30 transition-all duration-300">
                        Connected
                      </Badge>
                    )}
                  </div>

                  <CardDescription className="text-[#707070] font-light">
                    {repo.description || "No description available"}
                  </CardDescription>
                </div>

                <div className="flex gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="hover:bg-[#1a1a1a] hover:text-[#4a6a4a] transition-all duration-300"
                  >
                    <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>

                  <Button
                    variant={repo.isConnected ? "outline" : "default"}
                    onClick={() => handleConnect(repo)}
                    disabled={localConnectingId === repo.id || repo.isConnected}
                    className={
                      repo.isConnected
                        ? "border-[#2d3e2d]/30 text-[#707070] hover:border-[#2d3e2d]/50 hover:text-[#4a6a4a] transition-all duration-300"
                        : "bg-gradient-to-r from-[#4a6a4a] to-[#3d523d] hover:from-[#5a7a5a] hover:to-[#4d624d] text-black font-medium shadow-lg shadow-[#2d3e2d]/10 transition-all duration-300"
                    }
                  >
                    {localConnectingId === repo.id ? "Connecting..." : repo.isConnected ? "Connected" : "Connect"}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="relative z-10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[#707070]">
                    <Star className="h-4 w-4 fill-[#4a6a4a]/30 text-[#4a6a4a]" />
                    <span className="text-sm font-medium">{repo.stargazers_count.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </CardContent>

            {/* Bottom shimmer effect on hover */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#2d3e2d]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </Card>
        ))}
      </div>

      {/* Infinite Scroll Observer */}
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
