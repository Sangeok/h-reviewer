"use server";

import prisma from "@/lib/db";
import { fetchUserContribution } from "@/module/github";
import { getDashboardGithubContext } from "../lib/get-dashboard-github-context";
import { parseContributionCalendar } from "../lib/parse-contribution-calendar";
import type { DashboardStats } from "../types";

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  totalRepos: 0,
  totalContributions: 0,
  totalPRs: 0,
  totalReviews: 0,
};

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const { userId, accessToken, username, octokit } = await getDashboardGithubContext();

    const [totalRepos, totalReviews, rawCalendar, prsResult] = await Promise.all([
      prisma.repository.count({
        where: { userId },
      }),
      prisma.review.count({
        where: {
          repository: {
            userId,
          },
        },
      }),
      fetchUserContribution(accessToken, username),
      octokit.rest.search.issuesAndPullRequests({
        q: `author:${username} type:pr`,
        per_page: 1,
      }),
    ]);

    const calendar = parseContributionCalendar(rawCalendar);
    const totalContributions = calendar?.totalContributions ?? 0;
    const totalPRs = prsResult.data.total_count;

    return {
      totalRepos,
      totalContributions,
      totalPRs,
      totalReviews,
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return EMPTY_DASHBOARD_STATS;
  }
}
