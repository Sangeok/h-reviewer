import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import type { SubscriptionData } from "../../actions/config";

import { UsageCard } from "./usage-card";

type Limits = NonNullable<SubscriptionData["limits"]>;

function createLimits(overrides: Partial<Limits["trialReviews"]>): Limits {
  return {
    tier: "FREE",
    repositories: { current: 1, limit: 5, canAdd: true },
    trialReviews: {
      enabled: true,
      used: 0,
      limit: 5,
      remaining: 5,
      canReview: true,
      ...overrides,
    },
  };
}

describe("UsageCard review trial copy", () => {
  it("renders the account-wide free trial usage and remaining count", () => {
    const markup = renderToStaticMarkup(
      <UsageCard
        limits={createLimits({ used: 2, remaining: 3 })}
        isPro={false}
      />,
    );

    expect(markup).toContain("AI code review trial");
    expect(markup).toContain("2 / 5");
    expect(markup).toContain("3 reviews remaining");
    expect(markup).not.toContain("per Repository");
  });

  it("renders an exhausted free trial without claiming review access", () => {
    const markup = renderToStaticMarkup(
      <UsageCard
        limits={createLimits({ used: 5, remaining: 0, canReview: false })}
        isPro={false}
      />,
    );

    expect(markup).toContain("5 / 5");
    expect(markup).toContain("Trial exhausted");
  });

  it("renders Pro-only copy when the free trial flag is disabled", () => {
    const markup = renderToStaticMarkup(
      <UsageCard
        limits={createLimits({
          enabled: false,
          limit: null,
          remaining: null,
          canReview: false,
        })}
        isPro={false}
      />,
    );

    expect(markup).toContain("Pro only");
    expect(markup).toContain("Free tier cannot create reviews");
  });

  it("renders unlimited usage for Pro", () => {
    const limits = createLimits({
      limit: null,
      remaining: null,
      canReview: true,
    });
    limits.tier = "PRO";

    const markup = renderToStaticMarkup(
      <UsageCard limits={limits} isPro />,
    );

    expect(markup).toContain("Unlimited");
    expect(markup).toContain("No limits on reviews");
  });
});
