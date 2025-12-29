"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardStats, getMonthlyActivity, ContributionGraph } from "@/module/dashboard";
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

  const statCards = [
    {
      title: "Total Repositories",
      value: stats?.totalRepos || 0,
      description: "Connected Repositories",
      icon: GitBranch,
    },
    {
      title: "Total Commits",
      value: stats?.totalContributions || 0,
      description: "Total Contributions",
      icon: GitCommit,
    },
    {
      title: "Total PRs",
      value: stats?.totalPRs || 0,
      description: "Total Pull Requests",
      icon: GitPullRequest,
    },
    {
      title: "Total AI Reviews",
      value: stats?.totalReviews || 0,
      description: "Total AI Reviews",
      icon: MessageCircle,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Dashboard</h1>
        <p className="text-[#707070] font-light mt-1">Overview of your GitHub activity and AI Reviews</p>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card
              key={index}
              className="group relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a] hover:border-[#2d3e2d]/50 transition-all duration-300"
            >
              {/* Subtle hover glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#2d3e2d]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <CardHeader className="relative z-10 flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-[#d0d0d0]">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-[#4a6a4a] transition-transform duration-300 group-hover:scale-110" />
              </CardHeader>

              <CardContent className="relative z-10">
                <div className="text-2xl font-medium text-[#e0e0e0] mb-1">
                  {isLoading ? (
                    <span className="text-[#606060] animate-pulse">...</span>
                  ) : (
                    stat.value.toLocaleString()
                  )}
                </div>
                <p className="text-xs text-[#606060] font-light">{stat.description}</p>
              </CardContent>

              {/* Bottom accent line on hover */}
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#2d3e2d]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Card>
          );
        })}
      </div>

      {/* Contribution Activity Card */}
      <Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#2d3e2d]/3 to-transparent pointer-events-none" />

        <CardHeader className="relative z-10">
          <CardTitle className="text-lg font-medium text-[#e0e0e0]">
            Contribution Activity
          </CardTitle>
          <CardDescription className="text-[#707070] font-light">
            Visualize your contribution activity over time
          </CardDescription>
        </CardHeader>

        <CardContent className="relative z-10">
          <ContributionGraph />
        </CardContent>
      </Card>
    </div>
  );
}
