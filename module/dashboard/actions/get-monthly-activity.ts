"use server";

import { requireAuthSession } from "@/lib/server-utils";
import { fetchUserContribution, getGithubAccessToken } from "@/module/github";
import { Octokit } from "octokit";

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

interface ContributionDay {
  date: string;
  contributionCount: number;
}

interface ContributionWeek {
  contributionDays: ContributionDay[];
}

interface ContributionCalendar {
  weeks: ContributionWeek[];
}

interface MonthlyStats {
  commits: number;
  prs: number;
  reviews: number;
}

export interface MonthlyActivity {
  name: string;
  commits: number;
  prs: number;
  reviews: number;
}

/**
 * Initialize monthly data structure for the last 6 months.
 */
function initializeMonthlyData(): Record<string, MonthlyStats> {
  const monthlyData: Record<string, MonthlyStats> = {};
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = MONTH_NAMES[date.getMonth()];
    monthlyData[monthKey] = { commits: 0, prs: 0, reviews: 0 };
  }

  return monthlyData;
}

/**
 * Generate sample reviews for demo purposes.
 * TODO: Replace with real data from database.
 */
function generateSampleReviews(): { createdAt: Date }[] {
  const sampleReviews: { createdAt: Date }[] = [];
  const now = new Date();
  const SAMPLE_REVIEW_COUNT = 45;
  const DAYS_RANGE = 180;

  for (let i = 0; i < SAMPLE_REVIEW_COUNT; i++) {
    const randomDaysAgo = Math.floor(Math.random() * DAYS_RANGE);
    const reviewDate = new Date(now);
    reviewDate.setDate(reviewDate.getDate() - randomDaysAgo);
    sampleReviews.push({ createdAt: reviewDate });
  }

  return sampleReviews;
}

export async function getMonthlyActivity(): Promise<MonthlyActivity[]> {
  try {
    await requireAuthSession();

    const token = await getGithubAccessToken();
    const octokit = new Octokit({ auth: token });

    const { data: user } = await octokit.rest.users.getAuthenticated();

    const calendar = (await fetchUserContribution(
      token,
      user.login
    )) as ContributionCalendar | null;

    if (!calendar) {
      return [];
    }

    const monthlyData = initializeMonthlyData();

    // Aggregate commits from contribution calendar
    calendar.weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        const date = new Date(day.date);
        const monthKey = MONTH_NAMES[date.getMonth()];
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].commits += day.contributionCount;
        }
      });
    });

    // TODO: Replace with real reviews data from database
    const reviews = generateSampleReviews();
    reviews.forEach((review) => {
      const monthKey = MONTH_NAMES[review.createdAt.getMonth()];
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].reviews += 1;
      }
    });

    // Fetch PRs from GitHub
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
      q: `author:${user.login} type:pr created:>${sixMonthsAgo.toISOString().split("T")[0]}`,
      per_page: 100,
    });

    prs.items.forEach((pr) => {
      const date = new Date(pr.created_at);
      const monthKey = MONTH_NAMES[date.getMonth()];
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].prs += 1;
      }
    });

    return Object.keys(monthlyData).map((name) => ({
      name,
      ...monthlyData[name],
    }));
  } catch (error) {
    console.error("Error fetching monthly activity:", error);
    return [];
  }
}
