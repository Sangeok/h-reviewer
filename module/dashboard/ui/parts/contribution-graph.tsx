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
      <div className="w-full flex flex-col items-center justify-center gap-3 p-12">
        <Loader2 className="h-5 w-5 text-[#4a6a4a] animate-spin" />
        <p className="text-sm text-[#707070] font-light">Loading contribution graph...</p>
      </div>
    );
  }

  if (!data || !data.contributions.length) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-12">
        <p className="text-sm text-[#707070] font-light">No contribution data available</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      {/* Stats Summary */}
      <div className="text-sm text-[#707070] font-light">
        <span className="font-medium text-[#e0e0e0]">{data.totalContributions.toLocaleString()}</span>
        {" "}contributions in the last year
      </div>

      {/* Contribution Calendar */}
      <div className="w-full overflow-x-auto pb-4">
        <div className="flex justify-center min-w-max px-4">
          <ActivityCalendar
            data={data.contributions}
            colorScheme="dark"
            blockSize={14}
            blockMargin={4}
            blockRadius={3}
            fontSize={11}
            showWeekdayLabels
            theme={{
              // Light theme (not used but required)
              light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
              // Dark theme with sophisticated dark green palette
              dark: [
                "#0a0a0a",     // Level 0: No contributions (matches background)
                "#2d3e2d",     // Level 1: Low activity
                "#3d523d",     // Level 2: Medium-low activity
                "#4a6a4a",     // Level 3: Medium-high activity
                "#5a7a5a",     // Level 4: High activity
              ],
            }}
            labels={{
              totalCount: "{{count}} contributions in the last year",
            }}
            style={{
              color: "#707070",
            }}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-[#606060] font-light">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#0a0a0a] border border-[#1a1a1a]" />
          <div className="w-3 h-3 rounded-sm bg-[#2d3e2d]" />
          <div className="w-3 h-3 rounded-sm bg-[#3d523d]" />
          <div className="w-3 h-3 rounded-sm bg-[#4a6a4a]" />
          <div className="w-3 h-3 rounded-sm bg-[#5a7a5a]" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
