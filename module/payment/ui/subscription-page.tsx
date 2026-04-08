"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { checkout, customer } from "@/lib/auth-client";
import { getSubscriptionData, syncSubscriptionStatus } from "../actions/config";
import { SUBSCRIPTION_QUERY_KEYS } from "../constants";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, RefreshCw, SplinePointer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UsageCard } from "./parts/usage-card";
import { FreePlanCard, ProPlanCard } from "./parts/plan-card";

export default function SubscriptionPage() {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  const { data, refetch, isLoading } = useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEYS.DATA,
    queryFn: () => getSubscriptionData(),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (success === "true") {
      const sync = async () => {
        try {
          await syncSubscriptionStatus();
          refetch();
        } catch {
          // handled by query boundary
        }
      };
      sync();
    }
  }, [success, refetch]);

  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <SplinePointer />
        <p className="text-sm text-muted-foreground font-light">Loading subscription data...</p>
      </div>
    );
  }

  if (!data.user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscription Plans</h1>
          <p className="text-muted-foreground">Please sign in to view subscription options</p>
        </div>
      </div>
    );
  }

  const isPro = data.user.subscriptionTier === "PRO";
  const isActive = data.user.subscriptionStatus === "ACTIVE";
  const canUpgrade = data.proUpgradeEnabled;

  const handleSync = async () => {
    try {
      setSyncLoading(true);
      const result = await syncSubscriptionStatus();

      if (result.success) {
        toast.success("Subscription status synced successfully");
        refetch();
      } else {
        toast.error("Failed to sync subscription status");
      }
    } catch {
      toast.error("Failed to sync subscription status");
    } finally {
      setSyncLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!canUpgrade) {
      toast.info("Pro upgrades are temporarily unavailable.");
      return;
    }

    try {
      setCheckoutLoading(true);
      await checkout({ slug: "pro" });
    } catch {
      toast.error("Failed to start checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      await customer.portal();
    } catch {
      toast.error("Failed to open customer portal");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscription Plans</h1>
          <p className="text-muted-foreground">Choose the perfect plan for your needs</p>
        </div>

        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncLoading}>
          {syncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync Status
        </Button>
      </div>

      {!canUpgrade && (
        <Alert>
          <AlertTitle>Upgrade Paused</AlertTitle>
          <AlertDescription>New Pro upgrades are temporarily unavailable.</AlertDescription>
        </Alert>
      )}

      {success === "true" && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertTitle>Success!</AlertTitle>
          <AlertDescription>Your subscription status has been synced successfully</AlertDescription>
        </Alert>
      )}

      {data.limits && <UsageCard limits={data.limits} isPro={isPro} />}

      <div className="grid gap-6 md:grid-cols-2">
        <FreePlanCard isPro={isPro} />
        <ProPlanCard
          isPro={isPro}
          isActive={isActive}
          canUpgrade={canUpgrade}
          checkoutLoading={checkoutLoading}
          portalLoading={portalLoading}
          onUpgrade={handleUpgrade}
          onManageSubscription={handleManageSubscription}
        />
      </div>
    </div>
  );
}
