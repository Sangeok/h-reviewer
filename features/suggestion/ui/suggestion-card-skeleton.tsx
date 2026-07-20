import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SUGGESTION_SKELETON_COUNT = 3;

export function SuggestionCardSkeleton() {
  return (
    <Card className="border-border bg-sidebar">
      <CardContent className="p-4 space-y-3">
        {/* Header: severity + file path + status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20 bg-secondary" />
            <Skeleton className="h-4 w-40 bg-secondary" />
          </div>
          <Skeleton className="h-4 w-16 bg-secondary" />
        </div>

        {/* Explanation */}
        <Skeleton className="h-4 w-full bg-secondary" />

        {/* Code diff */}
        <div className="rounded border border-border overflow-hidden">
          <div className="bg-red-950/20 p-3 border-b border-border">
            <Skeleton className="h-4 w-3/4 bg-secondary" />
          </div>
          <div className="bg-green-950/20 p-3">
            <Skeleton className="h-4 w-3/4 bg-secondary" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 bg-secondary" />
          <Skeleton className="h-8 w-20 bg-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}

export function SuggestionListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-28 bg-secondary" />
        <Skeleton className="h-4 w-36 bg-secondary" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: SUGGESTION_SKELETON_COUNT }).map((_, index) => (
          <SuggestionCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
