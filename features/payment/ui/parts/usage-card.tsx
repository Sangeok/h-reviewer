"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";
import type { SubscriptionData } from "../../actions/config";

type UsageCardProps = {
  limits: NonNullable<SubscriptionData["limits"]>;
  isPro: boolean;
};

type TrialUsageCopy = {
  label: string;
  badge: string;
  description: string;
  isAvailable: boolean;
};

function getTrialUsageCopy(
  limits: UsageCardProps["limits"],
  isPro: boolean,
): TrialUsageCopy {
  if (isPro) {
    return {
      label: "AI code reviews",
      badge: "Unlimited",
      description: "No limits on reviews",
      isAvailable: true,
    };
  }

  if (!limits.trialReviews.enabled) {
    return {
      label: "AI code reviews",
      badge: "Pro only",
      description: "Free tier cannot create reviews",
      isAvailable: false,
    };
  }

  const remaining = limits.trialReviews.remaining ?? 0;
  return {
    label: "AI code review trial",
    badge: `${limits.trialReviews.used} / ${limits.trialReviews.limit ?? 0}`,
    description: remaining > 0 ? `${remaining} reviews remaining` : "Trial exhausted",
    isAvailable: limits.trialReviews.canReview,
  };
}

export function UsageCard({ limits, isPro }: UsageCardProps): ReactNode {
  const trialUsage = getTrialUsageCopy(limits, isPro);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Usage</CardTitle>
        <CardDescription>Your current plan limits and usage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Repositories</span>
              <Badge variant={limits.repositories.canAdd ? "default" : "destructive"}>
                {limits.repositories.current} / {limits.repositories.limit ?? "Unlimited"}
              </Badge>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${limits.repositories.canAdd ? "bg-primary" : "bg-destructive"}`}
                style={{
                  width: limits.repositories.limit
                    ? `${Math.min((limits.repositories.current / limits.repositories.limit) * 100, 100)}%`
                    : "0%",
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{trialUsage.label}</span>
              <Badge variant={trialUsage.isAvailable ? "outline" : "destructive"}>
                {trialUsage.badge}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {trialUsage.description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
