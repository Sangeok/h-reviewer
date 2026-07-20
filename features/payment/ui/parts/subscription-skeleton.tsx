import { SplinePointer } from "lucide-react";

export function SubscriptionSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <SplinePointer />
      <p className="text-sm text-muted-foreground font-light">Loading subscription data...</p>
    </div>
  );
}
