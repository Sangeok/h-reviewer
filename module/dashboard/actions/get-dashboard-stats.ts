"use server";

import { requireAuthSession } from "@/lib/server-utils";
import { fetchUserContribution, getGithubAccessToken } from "@/module/github";
import { Octokit } from "octokit";

export interface DashboardStats {
  totalRepos: number;
  totalContributions: number;
  totalPRs: number;
  totalReviews: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    await requireAuthSession();

    const accessToken = await getGithubAccessToken();
    const octokit = new Octokit({ auth: accessToken });

    const { data: user } = await octokit.rest.users.getAuthenticated();

    // TODO: FETCH TOTAL CONNECTED REPO FROM DB
    const totalRepos = 30;

    const calendar = await fetchUserContribution(accessToken, user.login);
    const totalContributions =
      (calendar as { totalContributions?: number })?.totalContributions || 0;

    const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
      q: `author:${user.login} type:pr`,
      per_page: 1,
    });

    const totalPRs = prs.total_count;

    // TODO: COUNT AI REVIEWS FROM DB
    const totalReviews = 44;

    return {
      totalRepos,
      totalContributions,
      totalPRs,
      totalReviews,
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return {
      totalRepos: 0,
      totalContributions: 0,
      totalPRs: 0,
      totalReviews: 0,
    };
  }
}
