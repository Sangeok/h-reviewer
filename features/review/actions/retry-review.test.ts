import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
  findFirst: vi.fn(),
  retryReviewRequest: vi.fn(),
}));

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
    mocks.findFirst.mockResolvedValue({ id: "review-1" });
    mocks.retryReviewRequest.mockResolvedValue({ status: "PENDING" });
  });

  it("returns not-found without DB writes when authentication is absent", async () => {
    mocks.requireAuthSession.mockRejectedValue(new Error("Unauthorized"));

    await expect(retryReview("review-1")).resolves.toEqual({ kind: "not-found" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.retryReviewRequest).not.toHaveBeenCalled();
  });

  it("uses an ownership-scoped lookup and hides another user's review", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(retryReview("review-1")).resolves.toEqual({ kind: "not-found" });
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "review-1",
          repository: { userId: "user-1" },
        }),
      }),
    );
    expect(mocks.retryReviewRequest).not.toHaveBeenCalled();
  });

  it("retries only the owned failed review", async () => {
    await expect(retryReview("review-1")).resolves.toEqual({
      kind: "retry-requested",
      status: "PENDING",
    });
    expect(mocks.retryReviewRequest).toHaveBeenCalledWith("review-1");
  });

  it("preserves a trial exhaustion rejection for the retry UI boundary", async () => {
    mocks.retryReviewRequest.mockResolvedValue({
      kind: "rejected",
      reason: "TRIAL_EXHAUSTED",
      message: "The free AI code review trial has been exhausted",
    });

    await expect(retryReview("review-1")).resolves.toEqual({
      kind: "not-found",
      reason: "TRIAL_EXHAUSTED",
    });
  });
});
