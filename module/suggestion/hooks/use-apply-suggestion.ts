"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { applySuggestion } from "../actions";
import { SUGGESTION_QUERY_KEYS } from "../constants";
import { REVIEW_QUERY_KEYS } from "@/module/review";

export function useApplySuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const result = await applySuggestion(suggestionId);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to apply suggestion");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUGGESTION_QUERY_KEYS.LIST });
      queryClient.invalidateQueries({ queryKey: REVIEW_QUERY_KEYS.LIST });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to apply suggestion"));
    },
  });
}
