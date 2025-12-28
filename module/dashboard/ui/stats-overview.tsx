"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardStats, getMonthlyActivity } from "@/module/dashboard/actions";
import ContributionGraph from "@/module/dashboard/components/contribution-graph";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, GitCommit, GitPullRequest, MessageCircle } from "lucide-react";

export default function StatsOverview() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => await getDashboardStats(),
    refetchOnWindowFocus: false,
  });

  const { data: monthlyActivity, isLoading: isLoadingMonthlyActivity } = useQuery({
    queryKey: ["dashboard-monthly-activity"],
    queryFn: async () => await getMonthlyActivity(),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your GitHub activity and AI Reviews</p>
      </div>

      <div className="grid gap-4 grid-cols-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Total Repositories</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "..." : stats?.totalRepos || 0}</div>
            <p className="text-xs text-muted-foreground">Connected Repositories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Total Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "..." : stats?.totalContributions || 0}</div>
            <p className="text-xs text-muted-foreground">Total Contributions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Total PRs</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "..." : stats?.totalPRs || 0}</div>
            <p className="text-xs text-muted-foreground">Total Pull Requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Total AI Reviews</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "..." : stats?.totalReviews || 0}</div>
            <p className="text-xs text-muted-foreground">Total AI Reviews</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contribution Activity</CardTitle>
          <CardDescription>Visualize your contribution activity over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ContributionGraph />
        </CardContent>
      </Card>
    </div>
  );
}
