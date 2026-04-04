"use server";

import prisma from "@/lib/db";
import { fetchUserContribution } from "@/module/github";
import { resolveAuthenticatedGithubContext } from "../lib/get-dashboard-github-context";
import { parseContributionCalendar } from "../lib/parse-contribution-calendar";
import type { ContributionStats, DashboardStats } from "../types";

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  totalRepos: 0,
  totalContributions: 0,
  totalPRs: 0,
  totalReviews: 0,
};

const EMPTY_CONTRIBUTION_STATS: ContributionStats = {
  contributions: [],
  totalContributions: 0,
};

const ContributionLevel = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
} as const;

interface DashboardData {
  stats: DashboardStats;
  contributionStats: ContributionStats;
}

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const { userId, accessToken, username, octokit } =
      await resolveAuthenticatedGithubContext();

    const [totalRepos, totalReviews, rawCalendar, prsResult] =
      await Promise.all([
        prisma.repository.count({ where: { userId } }),
        prisma.review.count({ where: { repository: { userId } } }),
        fetchUserContribution(accessToken, username),
        octokit.rest.search.issuesAndPullRequests({
          q: `author:${username} type:pr`,
          per_page: 1,
        }),
      ]);

    const calendar = parseContributionCalendar(rawCalendar);
    const totalContributions = calendar?.totalContributions ?? 0;
    const totalPRs = prsResult.data.total_count;

    const stats: DashboardStats = {
      totalRepos,
      totalContributions,
      totalPRs,
      totalReviews,
    };

    const contributions = calendar
      ? calendar.weeks.flatMap((week) =>
          week.contributionDays.map((day) => ({
            date: day.date,
            count: day.contributionCount,
            level:
              ContributionLevel[
                (day.contributionLevel ?? "NONE") as keyof typeof ContributionLevel
              ] ?? 0,
          }))
        )
      : [];

    const contributionStats: ContributionStats = {
      contributions,
      totalContributions,
    };

    return { stats, contributionStats };
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return {
      stats: EMPTY_DASHBOARD_STATS,
      contributionStats: EMPTY_CONTRIBUTION_STATS,
    };
  }
}
