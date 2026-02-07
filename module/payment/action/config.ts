"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { getRemainingLimits, updateUserTier } from "../lib/subscription";
import { polarClient } from "../config/polar";

export interface SubscriptionData {
  user: {
    id: string;
    name: string;
    email: string;
    subscriptionTier: string;
    subscriptionStatus: string | null;
    polarCustomerId: string | null;
    polarSubscriptionId: string | null;
  } | null;
  limits: {
    tier: "FREE" | "PRO";
    repositories: {
      current: number;
      limit: number | null;
      canAdd: boolean;
    };
    reviews: {
      [repositoryId: string]: {
        current: number;
        limit: number | null;
        canAdd: boolean;
      };
    };
  } | null;
}

export async function getSubscriptionData(): Promise<SubscriptionData> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { user: null, limits: null };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
  });

  if (!user) {
    return { user: null, limits: null };
  }

  const limits = await getRemainingLimits(user.id);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      subscriptionTier: user.subscriptionTier || "FREE",
      subscriptionStatus: user.subscriptionStatus || null,
      polarCustomerId: user.polarCustomerId || null,
      polarSubscriptionId: user.polarSubscriptionId || null,
    },
    limits,
  };
}

export async function syncSubscriptionStatus() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
  });

  if (!user || !user.polarCustomerId) {
    return { success: false, message: "No Polar customer Id found" };
  }

  try {
    // Fetch subscriptions from Polar
    const result = await polarClient.subscriptions.list({
      customerId: user.polarCustomerId,
    });

    const subscriptions = result.result?.items ?? [];

    // Find the active subscription
    const activeSubscription = subscriptions.find((subscription: any) => subscription.status === "active");
    const lastestSubscription = subscriptions[0]; // Assuming the latest subscription is the active one

    if (activeSubscription) {
      await updateUserTier(user.id, "PRO", "ACTIVE", activeSubscription.id);
      return { success: true, message: "ACTIVE" };
    } else if (lastestSubscription) {
      // if lastest is canceled/expired
      const status = lastestSubscription.status === "canceled" ? "CANCELLED" : "EXPIRED";

      // only downgrade if the lastest is not active
      if (lastestSubscription.status !== "active") {
        await updateUserTier(user.id, "FREE", status, lastestSubscription.id);
        return { success: true, status };
      }
    }

    return { success: false, message: "No active subscription found" };
  } catch (error) {
    console.error("Error syncing subscription status:", error);
    return { success: false, message: "Failed t o sync with Polar" };
  }
}
