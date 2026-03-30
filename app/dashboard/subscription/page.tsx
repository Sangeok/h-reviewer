"use client";

import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { SplinePointer } from "lucide-react";
import SubscriptionContent from "./subscription-content";

export default function SubscriptionPage() {
  return (
    <QueryBoundary
      fallback={<SubscriptionSkeleton />}
      title="Subscription Plans"
      description="Failed to load subscription data"
    >
      <SubscriptionContent />
    </QueryBoundary>
  );
}

function SubscriptionSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <SplinePointer />
      <p className="text-sm text-[#707070] font-light">Loading subscription data...</p>
    </div>
  );
}
