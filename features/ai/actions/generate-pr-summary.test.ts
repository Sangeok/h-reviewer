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
      reviewType: "SUMMARY",
      reviewMode: "FULL",
      requestSource: "COMMAND",
      dispatchMode: "DIRECT",
    });
    expect(reviewRequestMocks.createReviewRequest).toHaveBeenCalledOnce();
    expect(result).toStrictEqual({
      success: true,
      message: "Summary Queued",
      reviewId: "summary-1",
      requestKey: "summary-request-1",
      status: "PENDING",
    });
  });

  it.each(["QUEUE", "POST", "RECONCILE"] as const)(
    "preserves %s dispatch failure metadata",
    async (failureStage) => {
      reviewRequestMocks.createReviewRequest.mockResolvedValue({
        kind: "dispatch-failed",
        reviewId: "summary-1",
        requestKey: "summary-request-1",
        status: "FAILED",
        failureStage,
        message: "The review request could not be dispatched.",
      });

      const result = await generatePRSummary({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
      });

      expect(result).toStrictEqual({
        success: false,
        message: "The review request could not be dispatched.",
        reason: "internal_error",
        reviewId: "summary-1",
        requestKey: "summary-request-1",
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
        message: "Summary entitlement rejected",
      });

      const result = await generatePRSummary({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
      });

      expect(result).toStrictEqual({
        success: false,
        message: "Summary entitlement rejected",
        reason: expectedReason,
      });
      expect(result).not.toHaveProperty("reviewId");
    },
  );

  it.each([
    ["PENDING", "Summary already queued"],
    ["RUNNING", "Summary already in progress"],
    ["POSTING", "Summary already in progress"],
    ["COMPLETED", "Summary already completed"],
  ] as const)("maps factual existing %s status", async (status, message) => {
    reviewRequestMocks.createReviewRequest.mockResolvedValue({
      kind: "existing",
      reviewId: "summary-1",
      requestKey: "summary-request-1",
      status,
    });

    const result = await generatePRSummary({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
    });

    expect(result).toStrictEqual({
      success: true,
      message,
      reviewId: "summary-1",
      requestKey: "summary-request-1",
      status,
    });
    expect(result).not.toHaveProperty("failureStage");
  });

  it.each([
    [
      "FAILED",
      "review_failed",
      "The summary failed. Retry it from the pull request page.",
    ],
    [
      "SUPERSEDED",
      "review_superseded",
      "A newer pull request head superseded this summary.",
    ],
  ] as const)(
    "maps factual %s status without queued success",
    async (status, reason, message) => {
      reviewRequestMocks.createReviewRequest.mockResolvedValue({
        kind: "existing",
        reviewId: "summary-1",
        requestKey: "summary-request-1",
        status,
      });

      const result = await generatePRSummary({
        owner: "octo",
        repo: "sample",
        prNumber: 42,
      });

      expect(result).toStrictEqual({
        success: false,
        message,
        reason,
        reviewId: "summary-1",
        requestKey: "summary-request-1",
        status,
      });
      expect(result).not.toHaveProperty("failureStage");
    },
  );

  it("keeps coordinator exceptions as metadata-free internal errors", async () => {
    reviewRequestMocks.createReviewRequest.mockRejectedValue(
      new Error("coordinator failed"),
    );

    const result = await generatePRSummary({
      owner: "octo",
      repo: "sample",
      prNumber: 42,
    });

    expect(result).toStrictEqual({
      success: false,
      message: "Error Queueing Summary",
      reason: "internal_error",
    });
    expect(result).not.toHaveProperty("reviewId");
  });
});
