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

function getConnectButtonLabel(isConnecting: boolean, isConnected: boolean): string {
  if (isConnecting) return "Connecting...";
  if (isConnected) return "Connected";
  return "Connect";
}

export function RepositoryCard({ repository, isConnecting, onConnect }: RepositoryCardProps) {
  return (
    <Card className="group relative overflow-hidden bg-gradient-to-b from-sidebar to-black border-border hover:border-ring/50 transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-r from-ring/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <CardHeader>
        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-lg font-medium text-sidebar-foreground">{repository.name}</CardTitle>

              {repository.language && (
                <span className="text-xs text-muted-foreground-alt font-mono px-2 py-0.5 rounded bg-secondary border border-ring/20">
                  {repository.language}
                </span>
              )}

              {repository.isConnected && (
                <Badge className="bg-gradient-to-r from-ring/30 to-primary-muted/20 text-primary border border-ring/30 hover:bg-gradient-to-r hover:from-ring/40 hover:to-primary-muted/30 transition-all duration-300">
                  Connected
                </Badge>
              )}
            </div>

            <CardDescription className="text-muted-foreground font-light">
              {repository.description || "No description available"}
            </CardDescription>
          </div>

          <div className="flex gap-2 ml-4">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="hover:bg-secondary hover:text-primary transition-all duration-300"
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
                  ? "border-ring/30 text-muted-foreground hover:border-ring/50 hover:text-primary transition-all duration-300"
                  : "bg-gradient-to-r from-primary to-primary-muted hover:from-primary-hover hover:to-primary-muted text-black font-medium shadow-lg shadow-ring/10 transition-all duration-300"
              }
            >
              {getConnectButtonLabel(isConnecting, repository.isConnected)}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Star className="h-4 w-4 fill-primary/30 text-primary" />
              <span className="text-sm font-medium">{repository.stargazersCount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardContent>

      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-ring/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </Card>
  );
}
