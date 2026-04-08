"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { PLAN_FEATURES, PLAN_PRICING } from "../../constants";
import { PlanActionButton } from "./plan-action-button";

interface FreePlanCardProps {
  isPro: boolean;
}

export function FreePlanCard({ isPro }: FreePlanCardProps) {
  return (
    <Card className={!isPro ? "ring-2 ring-primary" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Free Plan</CardTitle>
            <CardDescription>Perfect for getting started</CardDescription>
          </div>
          {!isPro && <Badge className="ml-2">Current Plan</Badge>}
        </div>
        <div className="mt-2">
          <span className="text-3xl font-bold">{PLAN_PRICING.FREE.label}</span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {PLAN_FEATURES.free.map((feature) => (
            <div key={feature.name} className="flex items-center gap-2">
              {feature.included ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <X className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={feature.included ? "" : "text-muted-foreground"}>{feature.name}</span>
            </div>
          ))}
        </div>
        <Button className="w-full" variant="outline" disabled>
          {!isPro ? "Current Plan" : "Downgrade"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ProPlanCardProps {
  isPro: boolean;
  isActive: boolean;
  canUpgrade: boolean;
  checkoutLoading: boolean;
  portalLoading: boolean;
  onUpgrade: () => void;
  onManageSubscription: () => void;
}

export function ProPlanCard({
  isPro,
  isActive,
  canUpgrade,
  checkoutLoading,
  portalLoading,
  onUpgrade,
  onManageSubscription,
}: ProPlanCardProps) {
  return (
    <Card className={isPro ? "ring-2 ring-primary" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Pro Plan</CardTitle>
            <CardDescription>For professional developers</CardDescription>
          </div>
          {isPro && <Badge className="ml-2">Current Plan</Badge>}
        </div>
        <div className="mt-2">
          <span className="text-3xl font-bold">{PLAN_PRICING.PRO.label}</span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {PLAN_FEATURES.pro.map((feature) => (
            <div key={feature.name} className="flex items-center gap-2">
              {feature.included ? (
                <Check className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <X className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={feature.included ? "" : "text-muted-foreground"}>{feature.name}</span>
            </div>
          ))}
        </div>
        <PlanActionButton
          isPro={isPro}
          isActive={isActive}
          canUpgrade={canUpgrade}
          checkoutLoading={checkoutLoading}
          portalLoading={portalLoading}
          onUpgrade={onUpgrade}
          onManageSubscription={onManageSubscription}
        />
      </CardContent>
    </Card>
  );
}
