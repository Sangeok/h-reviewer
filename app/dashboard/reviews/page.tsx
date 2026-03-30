import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { ReviewList, getReviews } from "@/module/review";
import { Loader2 } from "lucide-react";

export default async function ReviewsPage() {
  const initialData = await getReviews();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Review History</h1>
        <p className="text-[#707070] font-light mt-1">View your AI-powered code reviews</p>
      </div>
      <QueryBoundary fallback={<ReviewSkeleton />}>
        <ReviewList initialData={initialData} />
      </QueryBoundary>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 rounded-lg border border-[#1a1a1a] bg-gradient-to-b from-[#0a0a0a] to-black">
      <Loader2 className="h-6 w-6 text-[#4a6a4a] animate-spin" />
      <p className="text-sm text-[#707070] font-light">Loading reviews...</p>
    </div>
  );
}
