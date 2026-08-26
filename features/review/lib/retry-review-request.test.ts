import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  retryReviewRequest,
  type ReviewRequestDependencies,
} from "./review-request";

function createDependencies(failureStage: "POST" | "RECONCILE") {
  const updateMany = vi
    .fn()
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 1 });
  const findUnique = vi.fn(async () => ({
    id: "review-1",
    requestKey: "request-1",
    status: "FAILED",
    attemptCount: 1,
    repositoryId: "repository-1",
    prNumber: 42,
    reviewType: "FULL_REVIEW",
    headSha: "head-sha",
    lastCompletedStage: "PERSISTED",
    failureStage,
    executionLeaseExpiresAt: null,
    executionLeaseToken: null,
    executionLeaseOwner: null,
    githubMainPostedAt: null,
    review: "Persisted canonical markdown",
    artifactLookupMissedAt: null,
  }));
  const review = { findUnique, updateMany };
  const sendEvent = vi.fn(async () => ({ ids: ["event-1"] }));
  const dependencies = {
    prisma: {
      review,
      $transaction: vi.fn(async (callback) => callback({ review })),
    },
    getRepositoryWithToken: vi.fn(),
    getPullRequestSnapshot: vi.fn(),
    getUserLanguageByUserId: vi.fn(),
    getUserTier: vi.fn(),
    bindGithubWebhookDeliveryRequest: vi.fn(),
    sendEvent,
    now: () => new Date("2026-08-26T00:00:00Z"),
  } as unknown as ReviewRequestDependencies;
  return { dependencies, updateMany, sendEvent };
}

describe("retryReviewRequest posting recovery", () => {
  it("keeps PERSISTED and performs lookup-only recovery for ambiguous POST", async () => {
    const { dependencies, updateMany, sendEvent } = createDependencies("POST");

    await retryReviewRequest("review-1", dependencies);

    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty(
      "lastCompletedStage",
    );
    expect(updateMany.mock.calls[0]?.[0].data).toMatchObject({
      artifactLookupMissedAt: new Date("2026-08-26T00:00:00Z"),
    });
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempt: 2 }) }),
    );
  });

  it("allows a persisted repost only after reconciler-confirmed absence", async () => {
    const { dependencies, updateMany, sendEvent } = createDependencies("RECONCILE");

    await retryReviewRequest("review-1", dependencies);

    expect(updateMany.mock.calls[0]?.[0].data).toMatchObject({
      artifactLookupMissedAt: null,
    });
    expect(sendEvent).toHaveBeenCalledOnce();
  });
});
