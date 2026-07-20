"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubscriptionData } from "../../actions/config";

interface UsageCardProps {
  limits: NonNullable<SubscriptionData["limits"]>;
  isPro: boolean;
}

export function UsageCard({ limits, isPro }: UsageCardProps) {
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
              <span className="text-sm font-medium">Reviews per Repository</span>
              <Badge variant="outline">{isPro ? "Unlimited" : "0 per repo"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {isPro ? "No limits on reviews" : "Free tier cannot create reviews"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
