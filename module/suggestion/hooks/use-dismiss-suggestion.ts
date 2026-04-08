"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { dismissSuggestion } from "../actions";
import { SUGGESTION_QUERY_KEYS } from "../constants";

export function useDismissSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const result = await dismissSuggestion(suggestionId);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to dismiss suggestion");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUGGESTION_QUERY_KEYS.LIST });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to dismiss suggestion"));
    },
  });
}
