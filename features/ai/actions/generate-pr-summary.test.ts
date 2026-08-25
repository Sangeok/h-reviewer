import { beforeEach, describe, expect, it, vi } from "vitest";

const reviewRequestMocks = vi.hoisted(() => ({
  createReviewRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/review/lib/review-request", () => reviewRequestMocks);

import { generatePRSummary } from "./generate-pr-summary";

describe("generatePRSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates summary creation to the shared coordinator", async () => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "created",
      reviewId: "summary-1",
      requestKey: "summary-request-1",
      status: "PENDING",
    });

    const result = await generatePRSummary({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
    });

    expect(reviewRequestMocks.createReviewRequest).toHaveBeenCalledWith({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      reviewType: "SUMMARY",
      reviewMode: "FULL",
      requestSource: "COMMAND",
      dispatchMode: "DIRECT",
    });
    expect(result).toEqual({
      success: true,
      message: "Summary Queued",
      reviewId: "summary-1",
      requestKey: "summary-request-1",
      status: "PENDING",
    });
  });

  it("preserves dispatch failure metadata", async () => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "dispatch-failed",
      reviewId: "summary-1",
      requestKey: "summary-request-1",
      status: "FAILED",
      failureStage: "QUEUE",
      message: "The review request could not be dispatched.",
    });

    await expect(
      generatePRSummary({ owner: "octo", repo: "sample", prNumber: 42 }),
    ).resolves.toMatchObject({
      success: false,
      reason: "internal_error",
      status: "FAILED",
      failureStage: "QUEUE",
    });
  });

  it("reports an existing completed summary as completed", async () => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "existing",
      reviewId: "summary-1",
      requestKey: "summary-request-1",
      status: "COMPLETED",
    });

    await expect(
      generatePRSummary({ owner: "octo", repo: "sample", prNumber: 42 }),
    ).resolves.toMatchObject({
      success: true,
      message: "Summary already completed",
      status: "COMPLETED",
    });
  });
});
