"use client";

import { useQuery } from "@tanstack/react-query";
import { getSuggestionsByReviewId } from "../actions";
import { SUGGESTION_QUERY_KEYS, SUGGESTIONS_STALE_TIME_MS } from "../constants";
import { SuggestionCard } from "./suggestion-card";

interface SuggestionListProps {
  reviewId: string;
  initialData?: Awaited<ReturnType<typeof getSuggestionsByReviewId>>;
}

export function SuggestionList({ reviewId, initialData }: SuggestionListProps) {
  const { data: suggestions, isLoading } = useQuery({
    queryKey: SUGGESTION_QUERY_KEYS.DETAIL(reviewId),
    queryFn: () => getSuggestionsByReviewId(reviewId),
    initialData,
    staleTime: SUGGESTIONS_STALE_TIME_MS,
  });

  if (isLoading) return <div>Loading suggestions...</div>;
  if (!suggestions?.length) return null;

  const pending = suggestions.filter(s => s.status === "PENDING").length;
  const applied = suggestions.filter(s => s.status === "APPLIED").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-medium text-sidebar-foreground">Suggestions</h2>
        <span className="text-sm text-muted-foreground">
          {pending} pending, {applied} applied
        </span>
      </div>

      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} />
        ))}
      </div>
    </div>
  );
}
