import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import SubscriptionPage from "@/module/payment/ui/subscription-page";
import { SubscriptionSkeleton } from "@/module/payment/ui/parts/subscription-skeleton";

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
