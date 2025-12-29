"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { connectRepository } from "@/module/repository";
import { useSession } from "@/lib/auth-client";

export const useConnectRepository = () => {
  const queryClient = useQueryClient();
  const { refetch: refetchSession } = useSession();

  return useMutation({
    mutationFn: async ({ owner, repo, githubId }: { owner: string; repo: string; githubId: number }) => {
      return await connectRepository(owner, repo, githubId);
    },
    onSuccess: async () => {
      alert("Repository connected successfully");
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      await refetchSession();
    },
    onError: (error) => {
      alert("Failed to connect repository");
      console.error(error);
    },
  });
};
