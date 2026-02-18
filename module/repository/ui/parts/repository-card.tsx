"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Star } from "lucide-react";
import type { Repository } from "../../types";

interface RepositoryCardProps {
  repository: Repository;
  isConnecting: boolean;
  onConnect: (repository: Repository) => void;
}

export function RepositoryCard({ repository, isConnecting, onConnect }: RepositoryCardProps) {
  return (
    <Card className="group relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a] hover:border-[#2d3e2d]/50 transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-r from-[#2d3e2d]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <CardHeader>
        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-lg font-medium text-[#e0e0e0]">{repository.name}</CardTitle>

              {repository.language && (
                <span className="text-xs text-[#606060] font-mono px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#2d3e2d]/20">
                  {repository.language}
                </span>
              )}

              {repository.isConnected && (
                <Badge className="bg-gradient-to-r from-[#2d3e2d]/30 to-[#3d523d]/20 text-[#4a6a4a] border border-[#2d3e2d]/30 hover:bg-gradient-to-r hover:from-[#2d3e2d]/40 hover:to-[#3d523d]/30 transition-all duration-300">
                  Connected
                </Badge>
              )}
            </div>

            <CardDescription className="text-[#707070] font-light">
              {repository.description || "No description available"}
            </CardDescription>
          </div>

          <div className="flex gap-2 ml-4">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="hover:bg-[#1a1a1a] hover:text-[#4a6a4a] transition-all duration-300"
            >
              <a href={repository.htmlUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>

            <Button
              variant={repository.isConnected ? "outline" : "default"}
              onClick={() => onConnect(repository)}
              disabled={isConnecting || repository.isConnected}
              className={
                repository.isConnected
                  ? "border-[#2d3e2d]/30 text-[#707070] hover:border-[#2d3e2d]/50 hover:text-[#4a6a4a] transition-all duration-300"
                  : "bg-gradient-to-r from-[#4a6a4a] to-[#3d523d] hover:from-[#5a7a5a] hover:to-[#4d624d] text-black font-medium shadow-lg shadow-[#2d3e2d]/10 transition-all duration-300"
              }
            >
              {isConnecting ? "Connecting..." : repository.isConnected ? "Connected" : "Connect"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[#707070]">
              <Star className="h-4 w-4 fill-[#4a6a4a]/30 text-[#4a6a4a]" />
              <span className="text-sm font-medium">{repository.stargazersCount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardContent>

      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#2d3e2d]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </Card>
  );
}
