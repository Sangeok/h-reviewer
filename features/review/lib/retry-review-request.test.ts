import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  retryReviewRequest,
  type ReviewRequestDependencies,
} from "./review-request";

const NOW = new Date("2026-08-29T00:00:00Z");

describe("retryReviewRequest persisted posting recovery", () => {
  it.each(["POST", "RECONCILE"] as const)(
    "schedules %s failures for reconciliation without a new AI event",
    async (failureStage) => {
      const updateMany = vi.fn(async () => ({ count: 1 }));
      const sendEvent = vi.fn();
      const transaction = vi.fn();
      const dependencies = {
        prisma: {
          review: {
            findUnique: vi.fn(async () => ({
              id: "review-1",
              requestKey: "request-1",
              status: "FAILED",
              attemptCount: 2,
              repositoryId: "repository-1",
              prNumber: 42,
              reviewType: "FULL_REVIEW",
              headSha: "head-sha",
              lastCompletedStage: "PERSISTED",
              failureStage,
              executionLeaseExpiresAt: NOW,
              executionLeaseToken: "ambiguity-token",
              executionLeaseOwner: "RECONCILER",
              githubMainPostedAt: null,
              review: "Persisted markdown fallback",
              trialCreditState: "RESERVED",
            })),
            updateMany,
          },
          $transaction: transaction,
        },
        sendEvent,
        now: () => NOW,
      } as unknown as ReviewRequestDependencies;

      await expect(
        retryReviewRequest("review-1", dependencies),
      ).resolves.toMatchObject({
        kind: "existing",
        status: "FAILED",
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: "review-1",
          status: "FAILED",
          failureStage: { in: ["POST", "RECONCILE"] },
        }),
        data: expect.objectContaining({
          failureStage: "RECONCILE",
          executionLeaseOwner: "RECONCILER",
          executionLeaseExpiresAt: NOW,
        }),
      });
      expect(transaction).not.toHaveBeenCalled();
      expect(sendEvent).not.toHaveBeenCalled();
    },
  );

  it("dispatches a persisted-only retry after reconciliation confirmed absence", async () => {
    const updateMany = vi.fn(
      async (_input: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        void _input;
        return { count: 1 };
      },
    );
    const sendEvent = vi.fn(async () => ({ ids: ["event-1"] }));
    const reviewDelegate = {
      findUnique: vi.fn(async () => ({
        id: "review-1",
        requestKey: "request-1",
        status: "FAILED",
        attemptCount: 2,
        repositoryId: "repository-1",
        prNumber: 42,
        reviewType: "FULL_REVIEW",
        headSha: "head-sha",
        lastCompletedStage: "PERSISTED",
        failureStage: "POST",
        executionLeaseExpiresAt: null,
        executionLeaseToken: null,
        executionLeaseOwner: null,
        githubMainPostedAt: null,
        review: "Persisted markdown fallback",
        trialCreditState: "RESERVED",
      })),
      updateMany,
    };
    const dependencies = {
      prisma: {
        review: reviewDelegate,
        $transaction: vi.fn(
          async (callback: (client: { review: typeof reviewDelegate }) => Promise<unknown>) =>
            callback({ review: reviewDelegate }),
        ),
      },
      sendEvent,
      now: () => NOW,
      prepareTrialCreditForRetry: vi.fn(async () => ({
        kind: "ready",
        trialCreditState: "RESERVED",
      })),
      releaseTrialCredit: vi.fn(async () => false),
      runReviewTrialTransaction: vi.fn(
        async (operation: (client: { review: typeof reviewDelegate }) => Promise<unknown>) =>
          operation({ review: reviewDelegate }),
      ),
    } as unknown as ReviewRequestDependencies;

    await expect(
      retryReviewRequest("review-1", dependencies),
    ).resolves.toMatchObject({ kind: "existing", status: "PENDING" });

    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hreviewer:review-run:review-1:3",
        data: expect.objectContaining({
          attempt: 3,
          resumeFromPersisted: true,
        }),
      }),
    );
    const firstWrite = updateMany.mock.calls[0]?.[0];
    expect(firstWrite).toBeDefined();
    if (!firstWrite) throw new Error("Expected a retry-state write");
    expect(firstWrite.data).not.toHaveProperty("lastCompletedStage");
  });
});
