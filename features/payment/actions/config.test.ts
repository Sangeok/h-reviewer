import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
  findUnique: vi.fn(),
  getRemainingLimits: vi.fn(),
}));

vi.mock("@/lib/server-utils", () => ({
  requireAuthSession: mocks.requireAuthSession,
}));
vi.mock("@/lib/db", () => ({
  default: { user: { findUnique: mocks.findUnique, update: vi.fn() } },
}));
vi.mock("../constants/flags", () => ({
  FREE_REVIEW_TRIAL_ENABLED: false,
  PRO_UPGRADE_ENABLED: true,
}));
vi.mock("../constants/polar", () => ({
  polarClient: { subscriptions: { list: vi.fn() } },
}));
vi.mock("../lib/subscription", () => ({
  getRemainingLimits: mocks.getRemainingLimits,
  updateUserTier: vi.fn(),
}));

import { getSubscriptionData } from "./config";

const USER = {
  id: "user-1",
  name: "Reviewer",
  email: "reviewer@example.com",
  subscriptionTier: "FREE",
  subscriptionStatus: null,
  polarCustomerId: null,
  polarSubscriptionId: null,
};

describe("getSubscriptionData trial limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findUnique.mockResolvedValue(USER);
  });

  it.each([
    {
      name: "free flag off",
      tier: "FREE",
      trialReviews: {
        enabled: false,
        used: 0,
        limit: null,
        remaining: null,
        canReview: false,
      },
    },
    {
      name: "free trial available",
      tier: "FREE",
      trialReviews: {
        enabled: true,
        used: 2,
        limit: 5,
        remaining: 3,
        canReview: true,
      },
    },
    {
      name: "free trial exhausted",
      tier: "FREE",
      trialReviews: {
        enabled: true,
        used: 5,
        limit: 5,
        remaining: 0,
        canReview: false,
      },
    },
    {
      name: "pro unlimited",
      tier: "PRO",
      trialReviews: {
        enabled: true,
        used: 2,
        limit: null,
        remaining: null,
        canReview: true,
      },
    },
  ] as const)("returns server-calculated limits for $name", async (fixture) => {
    const limits = {
      tier: fixture.tier,
      repositories: {
        current: 1,
        limit: fixture.tier === "PRO" ? null : 5,
        canAdd: true,
      },
      trialReviews: fixture.trialReviews,
    };
    mocks.getRemainingLimits.mockResolvedValue(limits);

    await expect(getSubscriptionData()).resolves.toMatchObject({
      freeReviewTrialEnabled: false,
      proUpgradeEnabled: true,
      user: { id: "user-1" },
      limits,
    });
  });

  it("returns no limits when the authenticated user no longer exists", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(getSubscriptionData()).resolves.toEqual({
      freeReviewTrialEnabled: false,
      proUpgradeEnabled: true,
      user: null,
      limits: null,
    });
    expect(mocks.getRemainingLimits).not.toHaveBeenCalled();
  });
});
