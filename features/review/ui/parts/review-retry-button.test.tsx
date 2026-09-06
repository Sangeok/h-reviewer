import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/review/actions", () => ({ retryReview: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ReviewRetryButton } from "./review-retry-button";

describe("ReviewRetryButton", () => {
  it("renders an enabled retry control", () => {
    const markup = renderToStaticMarkup(
      <ReviewRetryButton reviewId="review-1" />,
    );

    expect(markup).toContain("Retry review");
    expect(markup).not.toContain(" disabled=\"\"");
  });
});
