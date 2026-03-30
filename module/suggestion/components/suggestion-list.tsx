"use client";

import { useQuery } from "@tanstack/react-query";
import { getSuggestionsByReviewId } from "../actions";
import { SuggestionCard } from "./suggestion-card";

interface Props {
  reviewId: string;
  initialData?: Awaited<ReturnType<typeof getSuggestionsByReviewId>>;
}

export function SuggestionList({ reviewId, initialData }: Props) {
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["suggestions", reviewId],
    queryFn: () => getSuggestionsByReviewId(reviewId),
    initialData,
    staleTime: 60 * 1000,
  });

  if (isLoading) return <div>Loading suggestions...</div>;
  if (!suggestions?.length) return null;

  const pending = suggestions.filter(s => s.status === "PENDING").length;
  const applied = suggestions.filter(s => s.status === "APPLIED").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-medium text-[#e0e0e0]">Suggestions</h2>
        <span className="text-sm text-[#707070]">
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
