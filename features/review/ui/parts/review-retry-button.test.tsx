import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/review/actions/retry-review", () => ({
  retryReview: vi.fn(),
}));

import { ReviewRetryButton } from "./review-retry-button";

describe("ReviewRetryButton", () => {
  it("renders the retry affordance with its review identity", () => {
    const markup = renderToStaticMarkup(
      <ReviewRetryButton reviewId="review-1" />,
    );

    expect(markup).toContain("Retry review");
    expect(markup).not.toContain(" disabled=\"");
  });
});
