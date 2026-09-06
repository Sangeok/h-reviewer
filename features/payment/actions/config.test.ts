import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
  findUnique: vi.fn(),
  getRemainingLimits: vi.fn(),
  listSubscriptions: vi.fn(),
  updateUserTier: vi.fn(),
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
  polarClient: { subscriptions: { list: mocks.listSubscriptions } },
}));
vi.mock("../lib/subscription", () => ({
  getRemainingLimits: mocks.getRemainingLimits,
  updateUserTier: mocks.updateUserTier,
}));

import { getSubscriptionData, syncSubscriptionStatus } from "./config";

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

describe("syncSubscriptionStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requireAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findUnique.mockResolvedValue({
      ...USER,
      polarCustomerId: "customer-1",
    });
    mocks.listSubscriptions.mockResolvedValue({ result: { items: [] } });
    mocks.updateUserTier.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["missing user", null],
    ["missing customer id", USER],
  ] as const)("stops before Polar for %s", async (_name, user) => {
    mocks.findUnique.mockResolvedValue(user);

    await expect(syncSubscriptionStatus()).resolves.toStrictEqual({
      success: false,
      message: "No Polar customer Id found",
    });
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
    expect(mocks.updateUserTier).not.toHaveBeenCalled();
  });

  it("upgrades once when any valid subscription is active", async () => {
    mocks.listSubscriptions.mockResolvedValue({
      result: {
        items: [
          { id: "sub-cancelled", status: "canceled" },
          { id: "sub-active", status: "active" },
        ],
      },
    });

    await expect(syncSubscriptionStatus()).resolves.toStrictEqual({
      success: true,
      status: "ACTIVE",
    });
    expect(mocks.listSubscriptions).toHaveBeenCalledOnce();
    expect(mocks.listSubscriptions).toHaveBeenCalledWith({
      customerId: "customer-1",
    });
    expect(mocks.updateUserTier).toHaveBeenCalledOnce();
    expect(mocks.updateUserTier).toHaveBeenCalledWith(
      "user-1",
      "PRO",
      "ACTIVE",
    );
  });

  it.each([
    ["canceled", "CANCELLED"],
    ["expired", "EXPIRED"],
    ["trialing", "EXPIRED"],
  ] as const)("maps the first non-active %s subscription", async (polarStatus, status) => {
    mocks.listSubscriptions.mockResolvedValue({
      result: { items: [{ id: "sub-1", status: polarStatus }] },
    });

    await expect(syncSubscriptionStatus()).resolves.toStrictEqual({
      success: true,
      status,
    });
    expect(mocks.updateUserTier).toHaveBeenCalledOnce();
    expect(mocks.updateUserTier).toHaveBeenCalledWith(
      "user-1",
      "FREE",
      status,
    );
  });

  it.each([
    ["empty items", { result: { items: [] } }],
    ["missing items", { result: {} }],
    ["invalid items", { result: { items: [null, {}, { id: 1, status: "canceled" }] } }],
  ] as const)("does not update a tier for %s", async (_name, response) => {
    mocks.listSubscriptions.mockResolvedValue(response);

    await expect(syncSubscriptionStatus()).resolves.toStrictEqual({
      success: false,
      message: "No active subscription found",
    });
    expect(mocks.updateUserTier).not.toHaveBeenCalled();
  });

  it("filters invalid entries before choosing the first valid subscription", async () => {
    mocks.listSubscriptions.mockResolvedValue({
      result: {
        items: [
          { id: 1, status: "active" },
          { id: "sub-cancelled", status: "canceled" },
        ],
      },
    });

    await expect(syncSubscriptionStatus()).resolves.toStrictEqual({
      success: true,
      status: "CANCELLED",
    });
    expect(mocks.updateUserTier).toHaveBeenCalledWith(
      "user-1",
      "FREE",
      "CANCELLED",
    );
  });

  it("returns the Polar failure contract when listing rejects", async () => {
    mocks.listSubscriptions.mockRejectedValue(new Error("Polar unavailable"));

    await expect(syncSubscriptionStatus()).resolves.toStrictEqual({
      success: false,
      message: "Failed to sync with Polar",
    });
    expect(mocks.updateUserTier).not.toHaveBeenCalled();
  });

  it("returns the Polar failure contract when tier persistence rejects", async () => {
    mocks.listSubscriptions.mockResolvedValue({
      result: { items: [{ id: "sub-active", status: "active" }] },
    });
    mocks.updateUserTier.mockRejectedValue(new Error("database unavailable"));

    await expect(syncSubscriptionStatus()).resolves.toStrictEqual({
      success: false,
      message: "Failed to sync with Polar",
    });
    expect(mocks.updateUserTier).toHaveBeenCalledOnce();
  });

  it("keeps authentication failures outside the Polar error handler", async () => {
    const error = new Error("unauthenticated");
    mocks.requireAuthSession.mockRejectedValue(error);

    await expect(syncSubscriptionStatus()).rejects.toBe(error);
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
    expect(mocks.updateUserTier).not.toHaveBeenCalled();
  });

  it("keeps user lookup failures outside the Polar error handler", async () => {
    const error = new Error("database unavailable");
    mocks.findUnique.mockRejectedValue(error);

    await expect(syncSubscriptionStatus()).rejects.toBe(error);
    expect(mocks.listSubscriptions).not.toHaveBeenCalled();
    expect(mocks.updateUserTier).not.toHaveBeenCalled();
  });
});
