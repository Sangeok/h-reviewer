"use client";

import { ActivityCalendar } from "react-activity-calendar";
import { useTheme } from "next-themes";
import { getContributionStats } from "../../actions";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

export default function ContributionGraph() {
  const { theme } = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ["contribution-stats"],
    queryFn: async () => await getContributionStats(),
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <div className="w-full flex flex-col justify-center p-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading contribution graph...</p>
      </div>
    );
  }

  if (!data || !data.contributions.length) {
    return (
      <div className="w-full flex flex-col justify-center p-8">
        <p className="text-sm text-muted-foreground">No contribution data available</p>
      </div>
    );
  }

  return (
    <div className="w-max-content flex flex-col items-center gap-4">
      <div className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{data.totalContributions + " "}</span>
        contributions in the last year.
      </div>

      <div className="w-full overflow-x-auto pb-4">
        <div className="flex justify-center min-w-max px-4 ">
          <ActivityCalendar
            data={data.contributions}
            colorScheme={theme === "dark" ? "dark" : "light"}
            blockSize={16}
            blockRadius={4}
            fontSize={12}
            showWeekdayLabels
            showMonthLabels
            theme={{
              light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
              dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
            }}
          />
        </div>
      </div>
    </div>
  );
}
