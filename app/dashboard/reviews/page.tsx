import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { ReviewList, getUserReviews } from "@/module/review";
import { Loader2 } from "lucide-react";

export default async function ReviewsPage() {
  const initialData = await getUserReviews();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-sidebar-foreground">Review History</h1>
        <p className="text-muted-foreground font-light mt-1">View your AI-powered code reviews</p>
      </div>
      <QueryBoundary fallback={<ReviewSkeleton />}>
        <ReviewList initialData={initialData} />
      </QueryBoundary>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 rounded-lg border border-border bg-gradient-to-b from-sidebar to-black">
      <Loader2 className="h-6 w-6 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground font-light">Loading reviews...</p>
    </div>
  );
}
