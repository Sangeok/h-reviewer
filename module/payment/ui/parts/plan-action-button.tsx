"use client";

import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2 } from "lucide-react";

interface PlanActionButtonProps {
  isPro: boolean;
  isActive: boolean;
  canUpgrade: boolean;
  checkoutLoading: boolean;
  portalLoading: boolean;
  onUpgrade: () => void;
  onManageSubscription: () => void;
}

export function PlanActionButton({
  isPro,
  isActive,
  canUpgrade,
  checkoutLoading,
  portalLoading,
  onUpgrade,
  onManageSubscription,
}: PlanActionButtonProps) {
  if (isPro && isActive) {
    return (
      <Button className="w-full" variant="outline" onClick={onManageSubscription} disabled={portalLoading}>
        {portalLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening Portal...
          </>
        ) : (
          <>
            Manage Subscription <ExternalLink className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      className="w-full"
      variant="outline"
      onClick={onUpgrade}
      disabled={!canUpgrade || checkoutLoading}
    >
      {checkoutLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking out...
        </>
      ) : (
        canUpgrade ? "Upgrade to Pro" : "Upgrade Temporarily Unavailable"
      )}
    </Button>
  );
}
