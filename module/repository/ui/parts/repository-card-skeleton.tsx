import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RepositoryCardSkeleton() {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
      {/* Subtle pulsing glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#2d3e2d]/3 to-transparent animate-pulse pointer-events-none" />

      <CardHeader className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-48 bg-[#1a1a1a]" />
              <Skeleton className="h-5 w-20 bg-[#1a1a1a]" />
            </div>
            <Skeleton className="h-4 w-full max-w-md bg-[#1a1a1a]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-9 bg-[#1a1a1a]" />
            <Skeleton className="h-9 w-24 bg-[#1a1a1a]" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-16 bg-[#1a1a1a]" />
        </div>
      </CardContent>
    </Card>
  );
}

export function RepositoryListSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <RepositoryCardSkeleton key={index} />
      ))}
    </div>
  );
}
