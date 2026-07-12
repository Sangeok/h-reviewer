import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { ReviewList, ReviewSkeleton, getUserReviews } from "@/module/review";

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
