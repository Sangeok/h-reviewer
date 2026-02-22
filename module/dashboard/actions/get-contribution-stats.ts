"use server";

import { fetchUserContribution } from "@/module/github";
import { getDashboardGithubContext } from "../lib/get-dashboard-github-context";
import { parseContributionCalendar } from "../lib/parse-contribution-calendar";
import type { ContributionStats } from "../types";

const CONTRIBUTION_LEVEL_MAP: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

export async function getContributionStats(): Promise<ContributionStats | null> {
  try {
    const { accessToken, username } = await getDashboardGithubContext();
    const rawCalendar = await fetchUserContribution(accessToken, username);
    const calendar = parseContributionCalendar(rawCalendar);

    if (!calendar) {
      return null;
    }

    const contributions = calendar.weeks.flatMap((week) =>
      week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
        level: CONTRIBUTION_LEVEL_MAP[day.contributionLevel ?? "NONE"] ?? 0,
      }))
    );

    return {
      contributions,
      totalContributions: calendar.totalContributions,
    };
  } catch (error) {
    console.error("Error fetching contribution stats:", error);
    return null;
  }
}
