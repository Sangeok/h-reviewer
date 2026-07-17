import { Suspense } from "react";
import { StatsOverview, DashboardSkeleton } from "@/features/dashboard";

export default function DashboardPage() {
  return (
    <div className="flex-1">
      <Suspense fallback={<DashboardSkeleton />}>
        <StatsOverview />
      </Suspense>
    </div>
  );
}
