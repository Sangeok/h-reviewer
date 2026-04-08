"use client";

import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { SplinePointer } from "lucide-react";
import SubscriptionPage from "@/module/payment/ui/subscription-page";

export default function Page() {
  return (
    <QueryBoundary
      fallback={<SubscriptionSkeleton />}
      title="Subscription Plans"
      description="Failed to load subscription data"
    >
      <SubscriptionPage />
    </QueryBoundary>
  );
}

function SubscriptionSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <SplinePointer />
      <p className="text-sm text-muted-foreground font-light">Loading subscription data...</p>
    </div>
  );
}
