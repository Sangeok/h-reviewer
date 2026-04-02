"use client";

import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { getConnectedRepositories, disconnectRepository, disconnectAllRepositories } from "../actions";
import { SETTINGS_QUERY_KEYS, REPOSITORIES_STALE_TIME_MS } from "../constants";

export function useConnectedRepositories() {
  const queryClient = useQueryClient();

  const { data: repositories, isFetching } = useSuspenseQuery({
    queryKey: SETTINGS_QUERY_KEYS.CONNECTED_REPOSITORIES,
    queryFn: getConnectedRepositories,
    staleTime: REPOSITORIES_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectRepository,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.CONNECTED_REPOSITORIES });
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
      await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.CONNECTED_REPOSITORIES });
      toast.success("All repositories disconnected successfully");
    },
    onError: (error) => {
      console.error(error);
      toast.error(getErrorMessage(error, "Failed to disconnect all repositories"));
    },
  });

  const disconnectingId = disconnectMutation.isPending ? disconnectMutation.variables : null;

  return { repositories, isFetching, disconnectMutation, disconnectAllMutation, disconnectingId };
}
