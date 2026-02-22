"use server";

import prisma from "@/lib/db";
import { fetchUserContribution } from "@/module/github";
import { getDashboardGithubContext } from "../lib/get-dashboard-github-context";
import { parseContributionCalendar } from "../lib/parse-contribution-calendar";
import type { MonthlyActivity } from "../types";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface MonthlyStats {
  commits: number;
  prs: number;
  reviews: number;
}

interface MonthBucket {
  key: string;
  label: string;
  stats: MonthlyStats;
}

/**
 * Initialize monthly data structure for the last 6 months.
 */
function initializeMonthlyData(): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    buckets.push({
      key: monthKey,
      label: MONTH_NAMES[date.getMonth()],
      stats: {
        commits: 0,
        prs: 0,
        reviews: 0,
      },
    });
  }

  return buckets;
}

function toMonthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export async function getMonthlyActivity(): Promise<MonthlyActivity[]> {
  try {
    const { userId, accessToken, username, octokit } = await getDashboardGithubContext();
    const monthlyData = initializeMonthlyData();
    const monthlyDataMap = new Map(monthlyData.map((item) => [item.key, item.stats]));

    const rawCalendar = await fetchUserContribution(accessToken, username);
    const calendar = parseContributionCalendar(rawCalendar);

    if (calendar) {
      for (const week of calendar.weeks) {
        for (const day of week.contributionDays) {
          const monthKey = toMonthKey(new Date(day.date));
          const stats = monthlyDataMap.get(monthKey);
          if (stats) {
            stats.commits += day.contributionCount;
          }
        }
      }
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [pullRequestsResult, reviews] = await Promise.all([
      octokit.rest.search.issuesAndPullRequests({
        q: `author:${username} type:pr created:>${sixMonthsAgo.toISOString().split("T")[0]}`,
        per_page: 100,
      }),
      prisma.review.findMany({
        where: {
          repository: {
            userId,
          },
          createdAt: {
            gte: sixMonthsAgo,
          },
        },
        select: {
          createdAt: true,
        },
      }),
    ]);

    for (const pr of pullRequestsResult.data.items) {
      const monthKey = toMonthKey(new Date(pr.created_at));
      const stats = monthlyDataMap.get(monthKey);
      if (stats) {
        stats.prs += 1;
      }
    }

    for (const review of reviews) {
      const monthKey = toMonthKey(review.createdAt);
      const stats = monthlyDataMap.get(monthKey);
      if (stats) {
        stats.reviews += 1;
      }
    }

    return monthlyData.map((item) => ({
      name: item.label,
      ...item.stats,
    }));
  } catch (error) {
    console.error("Error fetching monthly activity:", error);
    return [];
  }
}
