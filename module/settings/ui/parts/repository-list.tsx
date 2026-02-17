"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteRepository, disconnectAllRepositories, getConnectedRepositories } from "@/module/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ExternalLink, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
}

export default function RepositoryList() {
  const queryClient = useQueryClient();
  const [disconnectAllOpen, setDisconnectAllOpen] = useState(false);

  const {
    data: repositories = [],
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["connected-repositories"],
    queryFn: getConnectedRepositories,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: deleteRepository,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
      setDisconnectAllOpen(false);
      toast.success("Repository disconnected successfully");
    },
    onError: (error) => {
      console.error(error);
      toast.error(getErrorMessage(error, "Failed to disconnect repository"));
    },
  });

  const disconnectAllMutation = useMutation({
    mutationFn: disconnectAllRepositories,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
      setDisconnectAllOpen(false);
      toast.success("All repositories disconnected successfully");
    },
    onError: (error) => {
      console.error(error);
      toast.error(getErrorMessage(error, "Failed to disconnect all repositories"));
    },
  });

  if (isPending) {
    return (
      <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
        <CardHeader className="relative z-10">
          <CardTitle className="text-lg font-medium text-foreground">Connected Repository</CardTitle>
          <CardDescription className="font-light text-muted-foreground">
            Manage your connected GitHub repositories
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="space-y-4">
            <div className="h-16 animate-pulse rounded-lg bg-secondary" />
            <div className="h-16 animate-pulse rounded-lg bg-secondary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
        <CardHeader className="relative z-10">
          <CardTitle className="text-lg font-medium text-foreground">Connected Repository</CardTitle>
          <CardDescription className="font-light text-muted-foreground">
            Failed to load connected GitHub repositories
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10 space-y-3">
          <p className="text-sm font-light text-muted-foreground">
            {getErrorMessage(error, "Failed to load connected repositories")}
          </p>
          <Button
            variant="outline"
            className="border-ring/30 bg-secondary text-secondary-foreground transition-all duration-300 hover:bg-accent hover:text-foreground"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
      {/* Subtle background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ring/3 to-transparent" />

      <CardHeader className="relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-medium text-foreground">Connected Repository</CardTitle>
            <CardDescription className="font-light text-muted-foreground">
              Manage your connected GitHub repositories
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {isFetching && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Updating...</span>
              </div>
            )}
            {repositories.length > 0 && (
              <AlertDialog open={disconnectAllOpen} onOpenChange={setDisconnectAllOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="border border-destructive-bg/50 bg-gradient-to-r from-destructive-bg to-destructive-bg/80 text-destructive shadow-lg shadow-destructive/10 transition-all duration-300 hover:from-destructive-bg hover:to-destructive-bg/70"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Disconnect All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-border bg-gradient-to-b from-card to-background">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      <span>Disconnect All Repositories?</span>
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-light text-muted-foreground">
                      This action will disconnect all {repositories.length} connected repositories and delete all
                      associated AI reviews. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-ring/30 bg-secondary text-secondary-foreground transition-all duration-300 hover:bg-accent hover:text-foreground">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectAllMutation.mutate()}
                      className="border border-destructive-bg/50 bg-gradient-to-r from-destructive-bg to-destructive-bg/80 text-destructive hover:from-destructive-bg hover:to-destructive-bg/70"
                      disabled={disconnectAllMutation.isPending}
                    >
                      {disconnectAllMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Disconnect"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10">
        {repositories.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-lg border border-ring/30 bg-secondary">
              <FolderOpen className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-light text-muted-foreground">No repositories connected</p>
            <p className="mt-2 text-xs font-light text-chart-4">Connect repositories to start using AI reviews</p>
          </div>
        ) : (
          <div className="space-y-3">
            {repositories.map((repository) => (
              <div
                key={repository.id}
                className="group relative flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all duration-300 hover:border-ring/50 hover:bg-accent"
              >
                {/* Subtle hover glow */}
                <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-r from-ring/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative z-10 flex min-w-0 flex-1 items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="truncate font-medium text-foreground">{repository.fullName}</h3>
                    <a
                      href={repository.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary transition-colors duration-300 hover:text-primary-hover"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-4 text-destructive transition-all duration-300 hover:bg-destructive-bg/30 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-border bg-gradient-to-b from-card to-background">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          <span>Disconnect Repository?</span>
                        </AlertDialogTitle>
                        <AlertDialogDescription className="font-light text-muted-foreground">
                          This action will disconnect the repository and delete all associated AI reviews. This action
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-ring/30 bg-secondary text-secondary-foreground transition-all duration-300 hover:bg-accent hover:text-foreground">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => disconnectMutation.mutate(repository.id)}
                          className="border border-destructive-bg/50 bg-gradient-to-r from-destructive-bg to-destructive-bg/80 text-destructive hover:from-destructive-bg hover:to-destructive-bg/70"
                          disabled={disconnectMutation.isPending}
                        >
                          {disconnectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Disconnect"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
