"use server";

import { requireAuthSession } from "@/lib/server-utils";
import { fetchUserContribution, getGithubAccessToken } from "@/module/github";
import { Octokit } from "octokit";

const CONTRIBUTION_LEVEL_MAP: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

interface ContributionDay {
  date: string;
  contributionCount: number;
  contributionLevel: string;
}

interface ContributionWeek {
  contributionDays: ContributionDay[];
}

interface ContributionCalendar {
  weeks: ContributionWeek[];
  totalContributions: number;
}

export interface ContributionData {
  date: string;
  count: number;
  level: number;
}

export interface ContributionStats {
  contributions: ContributionData[];
  totalContributions: number;
}

export async function getContributionStats(): Promise<ContributionStats | null> {
  try {
    await requireAuthSession();

    const accessToken = await getGithubAccessToken();
    const octokit = new Octokit({ auth: accessToken });

    const { data: user } = await octokit.rest.users.getAuthenticated();
    const username = user.login;

    const calendar = (await fetchUserContribution(
      accessToken,
      username
    )) as ContributionCalendar | null;

    if (!calendar) {
      return null;
    }

    const contributions = calendar.weeks.flatMap((week) =>
      week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
        level: CONTRIBUTION_LEVEL_MAP[day.contributionLevel] ?? 0,
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
