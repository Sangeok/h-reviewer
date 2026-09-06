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
    expect(reviewRequestMocks.createReviewRequest).toHaveBeenCalledOnce();
    expect(result).toStrictEqual({
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

  it.each(["QUEUE", "POST", "RECONCILE"] as const)(
    "does not report a %s dispatch failure as queued",
    async (failureStage) => {
      reviewRequestMocks.createReviewRequest.mockResolvedValue({
        kind: "dispatch-failed",
        reviewId: "review-1",
        requestKey: "request-1",
        status: "FAILED",
        failureStage,
        message: "The review request could not be dispatched.",
      });

      const result = await reviewPullRequest({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
        requestSource: "AUTOMATIC",
      });

      expect(result).toStrictEqual({
        success: false,
        message: "The review request could not be dispatched.",
        reason: "internal_error",
        reviewId: "review-1",
        requestKey: "request-1",
        status: "FAILED",
        failureStage,
      });
    },
  );

  it.each([
    ["PLAN_RESTRICTED", "plan_restricted"],
    ["TRIAL_EXHAUSTED", "trial_exhausted"],
    ["PR_NOT_REVIEWABLE", "pr_not_reviewable"],
  ] as const)(
    "maps the %s entitlement rejection",
    async (reason, expectedReason) => {
      reviewRequestMocks.createReviewRequest.mockResolvedValue({
        kind: "rejected",
        reason,
        message: "Review entitlement rejected",
      });

      const result = await reviewPullRequest({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
        requestSource: "AUTOMATIC",
      });

      expect(result).toStrictEqual({
        success: false,
        reason: expectedReason,
        message: "Review entitlement rejected",
      });
      expect(result).not.toHaveProperty("reviewId");
    },
  );

  it.each([
    [
      "FAILED",
      "review_failed",
      "The review failed. Retry it from the pull request page.",
    ],
    [
      "SUPERSEDED",
      "review_superseded",
      "A newer pull request head superseded this review.",
    ],
  ] as const)(
    "maps factual %s status without queued success",
    async (status, reason, message) => {
      reviewRequestMocks.createReviewRequest.mockResolvedValue({
        kind: "existing",
        reviewId: "review-1",
        requestKey: "request-1",
        status,
      });

      const result = await reviewPullRequest({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
        requestSource: "AUTOMATIC",
      });

      expect(result).toStrictEqual({
        success: false,
        message,
        reason,
        reviewId: "review-1",
        requestKey: "request-1",
        status,
      });
      expect(result).not.toHaveProperty("failureStage");
    },
  );

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

    const result = await reviewPullRequest({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      requestSource: "AUTOMATIC",
    });

    expect(result).toStrictEqual({
      success: true,
      message,
      reviewId: "review-1",
      requestKey: "request-1",
      status,
    });
    expect(result).not.toHaveProperty("failureStage");
  });

  it("keeps coordinator exceptions as metadata-free internal errors", async () => {
    reviewRequestMocks.createReviewRequest.mockRejectedValue(
      new Error("coordinator failed"),
    );

    const result = await reviewPullRequest({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      requestSource: "COMMAND",
    });

    expect(result).toStrictEqual({
      success: false,
      message: "Error Reviewing Pull Request",
      reason: "internal_error",
    });
    expect(result).not.toHaveProperty("reviewId");
  });
});
