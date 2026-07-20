import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SKELETON_COUNT } from "../../constants";

export default function RepositoryCardSkeleton() {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-b from-sidebar to-black border-border">
      {/* Subtle pulsing glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-ring/[0.03] to-transparent animate-pulse pointer-events-none" />

      <CardHeader className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-48 bg-secondary" />
              <Skeleton className="h-5 w-20 bg-secondary" />
            </div>
            <Skeleton className="h-4 w-full max-w-md bg-secondary" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-9 bg-secondary" />
            <Skeleton className="h-9 w-24 bg-secondary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-16 bg-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}

export function RepositoryListSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
        <RepositoryCardSkeleton key={index} />
      ))}
    </div>
  );
}
