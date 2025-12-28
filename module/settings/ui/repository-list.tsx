"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteRepository, disconnectAllRepositories, getConnectedRepositories } from "@/module/settings/actions";
import { useSession } from "@/lib/auth-client";
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
import { AlertTriangle, ExternalLink, Loader2, Trash2 } from "lucide-react";

export default function RepositoryList() {
  const queryClient = useQueryClient();
  const { refetch: refetchSession } = useSession();

  const [disconnectedAllOpen, setDisconnectedAllOpen] = useState(false);

  const { data: repositories, isLoading } = useQuery({
    queryKey: ["connected-repositories"],
    queryFn: async () => await getConnectedRepositories(),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: async (repositoryId: string) => await deleteRepository(repositoryId),
    onSuccess: async (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        await refetchSession();
        setDisconnectedAllOpen(false);
        alert("Repository disconnected successfully");
      } else {
        alert(result?.message);
      }
    },
    onError: (error) => {
      console.error(error);
      alert("Failed to disconnect repository");
    },
  });

  const disconnectAllMutation = useMutation({
    mutationFn: async () => await disconnectAllRepositories(),
    onSuccess: async (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        await refetchSession();
        setDisconnectedAllOpen(false);
        alert("All repositories disconnected successfully");
      } else {
        alert(result?.message);
      }
    },
    onError: (error) => {
      console.error(error);
      alert("Failed to disconnect all repositories");
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connected Repository</CardTitle>
          <CardDescription>Manage your connected Github Repository</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded-md"></div>
            <div className="h-10 bg-muted rounded-md"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Connected Repository</CardTitle>
              <CardDescription>Manage your connected Github Repository</CardDescription>
            </div>
            {repositories && repositories.length > 0 && (
              <AlertDialog open={disconnectedAllOpen} onOpenChange={setDisconnectedAllOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Disconnect All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      <span>Disconnect All Repositories?</span>
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action will disconnect all {repositories?.length} your connected repositories and delete all
                      associated AI reviews. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectAllMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={disconnectMutation.isPending}
                    >
                      {disconnectMutation.isPending ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : "Disconnect"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!repositories || repositories.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">No repositories connected</p>
              <p className="text-xs mt-2">Connect your repositories to start using AI reviews</p>
            </div>
          ) : (
            <div className="space-y-4">
              {repositories.map((repository) => (
                <div
                  key={repository.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 flex justify-between min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{repository.fullName}</h3>
                      <a
                        href={repository.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-4 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            <span>Disconnect Repository?</span>
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This action will disconnect the repository and delete all associated AI reviews. This action
                            cannot be undone.
                          </AlertDialogDescription>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => disconnectMutation.mutate(repository.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={disconnectMutation.isPending}
                            >
                              {disconnectMutation.isPending ? (
                                <Loader2 className="animate-spin w-4 h-4 mr-2" />
                              ) : (
                                "Disconnect"
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogHeader>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
