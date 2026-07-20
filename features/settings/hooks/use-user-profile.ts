"use client";

import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getUserProfile, updateUserProfile } from "../actions";
import { SETTINGS_QUERY_KEYS, PROFILE_STALE_TIME_MS } from "../constants";

export function useUserProfile() {
  const queryClient = useQueryClient();

  const { data: profile } = useSuspenseQuery({
    queryKey: SETTINGS_QUERY_KEYS.USER_PROFILE,
    queryFn: getUserProfile,
    staleTime: PROFILE_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: updateUserProfile,
    // updateUserProfile은 검증 실패 시 throw 대신 { success: false, message } 반환.
    // React Query는 이를 성공으로 처리하므로 onSuccess에서 result.success를 확인한다.
    onSuccess: async (result) => {
      if (result.success) {
        await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.USER_PROFILE });
        toast.success("Profile updated successfully");
      } else {
        toast.error(result.message);
      }
    },
    onError: () => {
      toast.error("Failed to update profile");
    },
  });

  return { profile, updateMutation };
}
