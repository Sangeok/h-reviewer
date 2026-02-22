import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, GitCommit, GitPullRequest, MessageCircle } from "lucide-react";
import { getContributionStats, getDashboardStats } from "../actions";
import ContributionGraph from "./parts/contribution-graph";

const STAT_ICON_SIZE = "h-4 w-4";

export default async function StatsOverview() {
  const [stats, contributionStats] = await Promise.all([getDashboardStats(), getContributionStats()]);

  const statCards: Array<{
    title: string;
    value: number;
    description: string;
    icon: typeof GitBranch;
  }> = [
    {
      title: "Total Repositories",
      value: stats.totalRepos,
      description: "Connected Repositories",
      icon: GitBranch,
    },
    {
      title: "Total Commits",
      value: stats.totalContributions,
      description: "Total Contributions",
      icon: GitCommit,
    },
    {
      title: "Total PRs",
      value: stats.totalPRs,
      description: "Total Pull Requests",
      icon: GitPullRequest,
    },
    {
      title: "Total AI Reviews",
      value: stats.totalReviews,
      description: "Total AI Reviews",
      icon: MessageCircle,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 font-light text-muted-foreground">Overview of your GitHub activity and AI reviews</p>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.title}
              className="group relative overflow-hidden border-border bg-gradient-to-b from-card to-background transition-all duration-300 hover:border-ring/50"
            >
              {/* Subtle hover glow */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ring/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              <CardHeader className="relative z-10 flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-secondary-foreground">{stat.title}</CardTitle>
                <Icon className={`${STAT_ICON_SIZE} text-primary transition-transform duration-300 group-hover:scale-110`} />
              </CardHeader>

              <CardContent className="relative z-10">
                <div className="mb-1 text-2xl font-medium text-foreground">{stat.value.toLocaleString()}</div>
                <p className="text-xs font-light text-chart-4">{stat.description}</p>
              </CardContent>

              {/* Bottom accent line on hover */}
              <div className="absolute right-0 bottom-0 left-0 h-px bg-gradient-to-r from-transparent via-ring/50 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </Card>
          );
        })}
      </div>

      {/* Contribution Activity Card */}
      <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
        {/* Subtle background gradient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ring/3 to-transparent" />

        <CardHeader className="relative z-10">
          <CardTitle className="text-lg font-medium text-foreground">Contribution Activity</CardTitle>
          <CardDescription className="font-light text-muted-foreground">Visualize your contribution activity over time</CardDescription>
        </CardHeader>

        <CardContent className="relative z-10">
          <ContributionGraph stats={contributionStats} />
        </CardContent>
      </Card>
    </div>
  );
}
