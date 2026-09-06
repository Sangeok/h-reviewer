import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { FreePlanCard, ProPlanCard } from "./plan-card";

describe("subscription plan cards", () => {
  it("shows the one-time five-review feature when the free trial is enabled", () => {
    const markup = renderToStaticMarkup(
      <FreePlanCard isPro={false} trialReviewsEnabled />,
    );

    expect(markup).toContain("5 AI code reviews, one-time");
    expect(markup).not.toContain("No AI reviews (Pro only)");
  });

  it("keeps the Pro-only copy when the free trial flag is disabled", () => {
    const markup = renderToStaticMarkup(
      <FreePlanCard isPro={false} trialReviewsEnabled={false} />,
    );

    expect(markup).toContain("No AI reviews (Pro only)");
    expect(markup).not.toContain("5 AI code reviews, one-time");
  });

  it("shows unlimited reviews and review history on the Pro plan", () => {
    const markup = renderToStaticMarkup(
      <ProPlanCard isPro action={<button type="button">Manage</button>} />,
    );

    expect(markup).toContain("Unlimited AI code reviews");
    expect(markup).toContain("Review history");
    expect(markup).not.toContain("Advanced analytics");
  });
});
