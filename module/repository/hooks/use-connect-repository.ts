"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { connectRepository } from "../actions";
import { useSession } from "@/lib/auth-client";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import type { ConnectRepositoryParams } from "../types";
import { REPOSITORY_QUERY_KEYS } from "../constants";

/**
 * Repository 연결 mutation hook.
 * 성공 시 repositories 쿼리 캐시 무효화 및 세션 리프레시를 수행한다.
 */
export const useConnectRepository = () => {
  const queryClient = useQueryClient();
  const { refetch: refetchSession } = useSession();

  return useMutation({
    mutationFn: async (params: ConnectRepositoryParams) => {
      return await connectRepository(params);
    },
    onSuccess: async (result) => {
      switch (result.status) {
        case "connected":
          toast.success("Repository connected successfully");
          break;
        case "already_connected":
          toast.info("Repository is already connected");
          break;
        case "error":
          if (result.error === "QUOTA_EXCEEDED") {
            toast.error("You have reached the maximum number of repositories");
          } else {
            toast.error("Repository is already connected by another user");
          }
          return;
      }

      queryClient.invalidateQueries({ queryKey: REPOSITORY_QUERY_KEYS.LIST });
      await refetchSession();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to connect repository"));
      console.error(error);
    },
  });
};
