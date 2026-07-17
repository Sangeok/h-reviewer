"use client";

import { ActivityCalendar } from "react-activity-calendar";
import type { ContributionStats } from "../../types";

const CALENDAR_CONFIG = {
  BLOCK_SIZE: 14,
  BLOCK_MARGIN: 4,
  BLOCK_RADIUS: 3,
  FONT_SIZE: 11,
} as const;

const CONTRIBUTION_THEME_COLORS = [
  "var(--color-card)",
  "var(--color-ring)",
  "var(--color-chart-2)",
  "var(--color-primary)",
  "var(--color-primary-hover)",
] as const;

interface ContributionGraphProps {
  stats: ContributionStats;
}

export default function ContributionGraph({ stats }: ContributionGraphProps) {
  if (!stats.contributions.length) {
    return (
      <div className="flex w-full flex-col items-center justify-center p-12">
        <p className="text-sm font-light text-muted-foreground">No contribution data available</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {/* Stats Summary */}
      <div className="text-sm font-light text-muted-foreground">
        <span className="font-medium text-foreground">{stats.totalContributions.toLocaleString()}</span>{" "}
        contributions in the last year
      </div>

      {/* Contribution Calendar */}
      <div className="w-full overflow-x-auto pb-4">
        <div className="flex min-w-max justify-center px-4">
          <ActivityCalendar
            data={stats.contributions}
            colorScheme="dark"
            blockSize={CALENDAR_CONFIG.BLOCK_SIZE}
            blockMargin={CALENDAR_CONFIG.BLOCK_MARGIN}
            blockRadius={CALENDAR_CONFIG.BLOCK_RADIUS}
            fontSize={CALENDAR_CONFIG.FONT_SIZE}
            showWeekdayLabels
            theme={{
              dark: [...CONTRIBUTION_THEME_COLORS],
            }}
            labels={{
              totalCount: "{{count}} contributions in the last year",
            }}
            style={{
              color: "var(--color-muted-foreground)",
            }}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-xs font-light text-chart-4">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-sm border border-border bg-card" />
          <div className="h-3 w-3 rounded-sm bg-ring" />
          <div className="h-3 w-3 rounded-sm bg-chart-2" />
          <div className="h-3 w-3 rounded-sm bg-primary" />
          <div className="h-3 w-3 rounded-sm bg-primary-hover" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
