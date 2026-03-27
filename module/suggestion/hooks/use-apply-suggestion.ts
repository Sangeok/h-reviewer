"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applySuggestion, dismissSuggestion } from "../actions";

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
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const result = await dismissSuggestion(suggestionId);
      if (!result.success) {
        throw new Error("Failed to dismiss suggestion");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });
}
