import type { Octokit } from "octokit";

export interface DashboardGithubContext {
  userId: string;
  accessToken: string;
  username: string;
  octokit: Octokit;
}

export interface DashboardStats {
  totalRepos: number;
  totalContributions: number;
  totalPRs: number;
  totalReviews: number;
}

export interface ContributionDay {
  date: string;
  contributionCount: number;
  contributionLevel?: string;
}

export interface ContributionWeek {
  contributionDays: ContributionDay[];
}

export interface ContributionCalendar {
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

