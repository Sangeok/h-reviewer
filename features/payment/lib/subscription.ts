import "server-only";

import prisma from "@/lib/db";

import { FREE_REVIEW_TRIAL_LIMIT } from "../constants";
import { FREE_REVIEW_TRIAL_ENABLED } from "../constants/flags";

export type SubscriptionTier = "FREE" | "PRO";
export type SubscriptionStatus = "ACTIVE" | "CANCELLED" | "EXPIRED";

export type UserLimits = {
  tier: SubscriptionTier;
  repositories: {
    current: number;
    limit: number | null;
    canAdd: boolean;
  };
  trialReviews: {
    enabled: boolean;
    used: number;
    limit: number | null;
    remaining: number | null;
    canReview: boolean;
  };
};

type UserUsageClient = Pick<typeof prisma, "userUsage">;

function isSubscriptionTier(value: string | null | undefined): value is SubscriptionTier {
  return value === "FREE" || value === "PRO";
}

const TIER_LIMITS = {
  FREE: {
    repositories: 5,
  },
  PRO: {
    repositories: null, // unlimited
  },
} as const;

export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      subscriptionTier: true,
    },
  });

  return isSubscriptionTier(user?.subscriptionTier) ? user.subscriptionTier : "FREE";
}

async function getUserUsage(userId: string) {
  let usage = await prisma.userUsage.findUnique({
    where: {
      userId: userId,
    },
  });

  if (!usage) {
    usage = await prisma.userUsage.create({
      data: {
        userId: userId,
        repositoryCount: 0,
        reviewCounts: {},
      },
    });
  }

  return usage;
}

export async function canConnectRepository(userId: string): Promise<boolean> {
  const tier = await getUserTier(userId);

  if (tier === "PRO") {
    return true; // PRO users can connect unlimited repositories
  }

  const usage = await getUserUsage(userId);
  const limit = TIER_LIMITS.FREE.repositories;

  return usage.repositoryCount < limit;
}

export async function incrementRepositoryCount(
  userId: string,
  userUsageClient: UserUsageClient = prisma
): Promise<void> {
  await userUsageClient.userUsage.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      repositoryCount: 1,
      reviewCounts: {},
    },
    update: {
      repositoryCount: {
        increment: 1,
      },
    },
  });
}

export async function decrementRepositoryCount(userId: string): Promise<void> {
  const usage = await getUserUsage(userId);

  await prisma.userUsage.update({
    where: {
      userId,
    },
    data: {
      repositoryCount: Math.max(0, usage.repositoryCount - 1),
    },
  });
}

export async function getRemainingLimits(userId: string): Promise<UserLimits> {
  const tier = await getUserTier(userId);
  const usage = await getUserUsage(userId);
  const isPro = tier === "PRO";
  const trialLimit = isPro || !FREE_REVIEW_TRIAL_ENABLED
    ? null
    : FREE_REVIEW_TRIAL_LIMIT;
  const trialRemaining = trialLimit === null
    ? null
    : Math.max(0, trialLimit - usage.trialReviewCreditsUsed);

  return {
    tier,
    repositories: {
      current: usage.repositoryCount,
      limit: isPro ? null : TIER_LIMITS.FREE.repositories,
      canAdd: isPro || usage.repositoryCount < TIER_LIMITS.FREE.repositories,
    },
    trialReviews: {
      enabled: isPro || FREE_REVIEW_TRIAL_ENABLED,
      used: usage.trialReviewCreditsUsed,
      limit: trialLimit,
      remaining: trialRemaining,
      canReview:
        isPro ||
        (FREE_REVIEW_TRIAL_ENABLED &&
          usage.trialReviewCreditsUsed < FREE_REVIEW_TRIAL_LIMIT),
    },
  };
}

export async function updateUserTier(
  userId: string,
  tier: SubscriptionTier,
  status: SubscriptionStatus,
): Promise<void> {
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      subscriptionTier: tier,
      subscriptionStatus: status,
    },
  });
}

export async function updatePolarCustomerId(userId: string, polarCustomerId: string): Promise<void> {
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      polarCustomerId: polarCustomerId,
    },
  });
}
