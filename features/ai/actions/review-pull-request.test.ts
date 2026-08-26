import { beforeEach, describe, expect, it, vi } from "vitest";

const reviewRequestMocks = vi.hoisted(() => ({
  createReviewRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/review/lib/review-request", () => reviewRequestMocks);

import { reviewPullRequest } from "./review-pull-request";

describe("reviewPullRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates an object identity to the review request coordinator", async () => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "created",
      reviewId: "review-1",
      requestKey: "request-1",
      status: "PENDING",
    });

    const result = await reviewPullRequest({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      requestSource: "AUTOMATIC",
      transportBinding: {
        kind: "GITHUB_WEBHOOK",
        deliveryRowId: "delivery-row-1",
        leaseToken: "delivery-lease-1",
      },
    });

    expect(reviewRequestMocks.createReviewRequest).toHaveBeenCalledWith({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      transportBinding: {
        kind: "GITHUB_WEBHOOK",
        deliveryRowId: "delivery-row-1",
        leaseToken: "delivery-lease-1",
      },
      reviewType: "FULL_REVIEW",
      reviewMode: "FULL",
      requestSource: "AUTOMATIC",
      dispatchMode: "DEBOUNCED",
    });
    expect(result).toEqual({
      success: true,
      message: "Review Queued",
      reviewId: "review-1",
      requestKey: "request-1",
      status: "PENDING",
    });
  });

  it("preserves a command request source when delegating", async () => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "created",
      reviewId: "review-1",
      requestKey: "request-1",
      status: "PENDING",
    });

    await reviewPullRequest({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      requestSource: "COMMAND",
    });

    expect(reviewRequestMocks.createReviewRequest).toHaveBeenCalledWith({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      reviewType: "FULL_REVIEW",
      reviewMode: "FULL",
      requestSource: "COMMAND",
      dispatchMode: "DIRECT",
    });
  });

  it("does not report a confirmed dispatch failure as queued", async () => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "dispatch-failed",
      reviewId: "review-1",
      requestKey: "request-1",
      status: "FAILED",
      failureStage: "QUEUE",
      message: "The review request could not be dispatched.",
    });

    await expect(
      reviewPullRequest({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
        requestSource: "AUTOMATIC",
      }),
    ).resolves.toMatchObject({
      success: false,
      reason: "internal_error",
      status: "FAILED",
      failureStage: "QUEUE",
    });
  });

  it.each([
    ["FAILED", "review_failed"],
    ["SUPERSEDED", "review_superseded"],
  ] as const)("maps factual %s status without queued success", async (status, reason) => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "existing",
      reviewId: "review-1",
      requestKey: "request-1",
      status,
    });

    await expect(
      reviewPullRequest({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
        requestSource: "AUTOMATIC",
      }),
    ).resolves.toMatchObject({ success: false, reason, status });
  });

  it.each([
    ["PENDING", "Review already queued"],
    ["RUNNING", "Review already in progress"],
    ["POSTING", "Review already in progress"],
    ["COMPLETED", "Review already completed"],
  ] as const)("maps factual existing %s status", async (status, message) => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "existing",
      reviewId: "review-1",
      requestKey: "request-1",
      status,
    });

    await expect(
      reviewPullRequest({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
        requestSource: "AUTOMATIC",
      }),
    ).resolves.toMatchObject({ success: true, message, status });
  });
});
