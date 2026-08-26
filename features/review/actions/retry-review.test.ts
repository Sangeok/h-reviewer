import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
  findFirst: vi.fn(),
  retryReviewRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-utils", () => ({
  requireAuthSession: mocks.requireAuthSession,
}));
vi.mock("@/lib/db", () => ({
  default: { review: { findFirst: mocks.findFirst } },
}));
vi.mock("@/features/review/lib/review-request", () => ({
  retryReviewRequest: mocks.retryReviewRequest,
}));

import { retryReview } from "./retry-review";

describe("retryReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findFirst.mockResolvedValue({
      id: "review-1",
      status: "FAILED",
      failureStage: "POST",
    });
    mocks.retryReviewRequest.mockResolvedValue({
      kind: "existing",
      reviewId: "review-1",
      status: "PENDING",
    });
  });

  it("converges unauthenticated access to not_found without writes", async () => {
    mocks.requireAuthSession.mockRejectedValue(new Error("Unauthorized"));

    await expect(retryReview("review-1")).resolves.toEqual({
      success: false,
      reason: "not_found",
      error: "Review not found",
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.retryReviewRequest).not.toHaveBeenCalled();
  });

  it("converges another user's review to not_found", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(retryReview("review-1")).resolves.toMatchObject({
      success: false,
      reason: "not_found",
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "review-1", repository: { userId: "user-1" } },
      select: { id: true, status: true, failureStage: true },
    });
    expect(mocks.retryReviewRequest).not.toHaveBeenCalled();
  });

  it("queues an owned retryable failure", async () => {
    await expect(retryReview("review-1")).resolves.toEqual({
      success: true,
      reviewId: "review-1",
    });
    expect(mocks.retryReviewRequest).toHaveBeenCalledWith("review-1");
  });
});
