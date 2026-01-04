"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteRepository, disconnectAllRepositories, getConnectedRepositories } from "@/module/settings";
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
      <Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
        <CardHeader className="relative z-10">
          <CardTitle className="text-lg font-medium text-[#e0e0e0]">Connected Repository</CardTitle>
          <CardDescription className="text-[#707070] font-light">
            Manage your connected Github Repository
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="space-y-4">
            <div className="h-16 bg-[#1a1a1a] rounded-lg animate-pulse" />
            <div className="h-16 bg-[#1a1a1a] rounded-lg animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#2d3e2d]/3 to-transparent pointer-events-none" />

        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-medium text-[#e0e0e0]">Connected Repository</CardTitle>
              <CardDescription className="text-[#707070] font-light">
                Manage your connected Github Repository
              </CardDescription>
            </div>
            {repositories && repositories.length > 0 && (
              <AlertDialog open={disconnectedAllOpen} onOpenChange={setDisconnectedAllOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="bg-gradient-to-r from-[#3a1a1a] to-[#2d1515] hover:from-[#4a2020] hover:to-[#3d1a1a] text-[#ff6b6b] border border-[#3a1a1a]/50 shadow-lg shadow-[#3a1a1a]/10 transition-all duration-300"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Disconnect All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-[#e0e0e0]">
                      <AlertTriangle className="h-5 w-5 text-[#ff6b6b]" />
                      <span>Disconnect All Repositories?</span>
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-[#707070] font-light">
                      This action will disconnect all {repositories?.length} your connected repositories and delete all
                      associated AI reviews. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-[#1a1a1a] border-[#2d3e2d]/30 text-[#d0d0d0] hover:bg-[#2a2a2a] hover:text-[#e0e0e0] transition-all duration-300">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectAllMutation.mutate()}
                      className="bg-gradient-to-r from-[#3a1a1a] to-[#2d1515] hover:from-[#4a2020] hover:to-[#3d1a1a] text-[#ff6b6b] border border-[#3a1a1a]/50"
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
        <CardContent className="relative z-10">
          {!repositories || repositories.length === 0 ? (
            <div className="text-center py-12">
              <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-lg bg-[#1a1a1a] border border-[#2d3e2d]/30">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-[#4a6a4a]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              </div>
              <p className="text-sm text-[#707070] font-light">No repositories connected</p>
              <p className="text-xs text-[#606060] font-light mt-2">
                Connect your repositories to start using AI reviews
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {repositories.map((repository) => (
                <div
                  key={repository.id}
                  className="group relative flex items-center justify-between p-4 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] hover:border-[#2d3e2d]/50 hover:bg-[#121212] transition-all duration-300"
                >
                  {/* Subtle hover glow */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#2d3e2d]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-lg pointer-events-none" />

                  <div className="flex-1 flex justify-between items-center min-w-0 relative z-10">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-[#e0e0e0] truncate">{repository.fullName}</h3>
                      <a
                        href={repository.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#4a6a4a] hover:text-[#5a7a5a] transition-colors duration-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-4 text-[#ff6b6b] hover:text-[#ff8080] hover:bg-[#3a1a1a]/30 transition-all duration-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2 text-[#e0e0e0]">
                            <AlertTriangle className="h-5 w-5 text-[#ff6b6b]" />
                            <span>Disconnect Repository?</span>
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-[#707070] font-light">
                            This action will disconnect the repository and delete all associated AI reviews. This action
                            cannot be undone.
                          </AlertDialogDescription>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-[#1a1a1a] border-[#2d3e2d]/30 text-[#d0d0d0] hover:bg-[#2a2a2a] hover:text-[#e0e0e0] transition-all duration-300">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => disconnectMutation.mutate(repository.id)}
                              className="bg-gradient-to-r from-[#3a1a1a] to-[#2d1515] hover:from-[#4a2020] hover:to-[#3d1a1a] text-[#ff6b6b] border border-[#3a1a1a]/50"
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
