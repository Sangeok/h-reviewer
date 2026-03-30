"use client";

import { useState } from "react";
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
import { AlertTriangle, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { useConnectedRepositories } from "../../../hooks/use-connected-repositories";
import { RepositoryItem } from "./repository-item";

export default function RepositoryList() {
  const [disconnectAllOpen, setDisconnectAllOpen] = useState(false);
  const { repositories, isFetching, disconnectMutation, disconnectAllMutation, disconnectingId } =
    useConnectedRepositories();

  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
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
                      onClick={() =>
                        disconnectAllMutation.mutate(undefined, {
                          onSuccess: () => setDisconnectAllOpen(false),
                        })
                      }
                      className="border border-destructive-bg/50 bg-gradient-to-r from-destructive-bg to-destructive-bg/80 text-destructive hover:from-destructive-bg hover:to-destructive-bg/70"
                      disabled={disconnectAllMutation.isPending}
                    >
                      {disconnectAllMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        "Disconnect"
                      )}
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
              <RepositoryItem
                key={repository.id}
                repository={repository}
                onDisconnect={(id) => disconnectMutation.mutate(id)}
                isDisconnecting={disconnectingId === repository.id}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
