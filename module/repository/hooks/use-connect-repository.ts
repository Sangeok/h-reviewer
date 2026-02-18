"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { connectRepository } from "../actions";
import { useSession } from "@/lib/auth-client";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

export const useConnectRepository = () => {
  const queryClient = useQueryClient();
  const { refetch: refetchSession } = useSession();

  return useMutation({
    mutationFn: async ({ owner, repo, githubId }: { owner: string; repo: string; githubId: number }) => {
      return await connectRepository(owner, repo, githubId);
    },
    onSuccess: async (result) => {
      if (result.status === "already_connected") {
        toast.info("Repository is already connected");
      } else {
        toast.success("Repository connected successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      await refetchSession();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to connect repository"));
      console.error(error);
    },
  });
};
