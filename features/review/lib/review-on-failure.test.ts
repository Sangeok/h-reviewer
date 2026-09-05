import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createReviewFailureHandler } from "./review-on-failure";

const NOW = new Date("2026-08-29T00:00:00Z");

function createDependencies(review: Record<string, unknown>) {
  const findUnique = vi.fn(async () => review);
  const updateMany = vi.fn(
    async (_input: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      void _input;
      return { count: 1 };
    },
  );
  const releaseTrialCredit = vi.fn(async () => true);
  const transaction = vi.fn(
    async (callback: (client: unknown) => Promise<unknown>) =>
      callback({ review: { updateMany } }),
  );
  return {
    handler: createReviewFailureHandler({
      prisma: {
        review: { findUnique, updateMany },
        $transaction: transaction,
      } as never,
      reviewType: "FULL_REVIEW",
      releaseTrialCredit,
      now: () => NOW,
    }),
    findUnique,
    releaseTrialCredit,
    transaction,
    updateMany,
  };
}

function failureInput(attempt = 1) {
  return {
    event: {
      data: {
        event: { data: { reviewId: "review-1", attempt } },
        error: Object.assign(new Error("secret raw message"), {
          status: 503,
          code: "UPSTREAM_TIMEOUT",
          response: "secret response",
        }),
      },
    },
  };
}

describe("createReviewFailureHandler", () => {
  it("does not overwrite a terminal review", async () => {
    const { handler, updateMany } = createDependencies({
      reviewType: "FULL_REVIEW",
      status: "COMPLETED",
      attemptCount: 1,
      executionLeaseToken: null,
      executionLeaseOwner: null,
      lastCompletedStage: "MAIN_POSTED",
    });

    await handler(failureInput());
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does not overwrite a newer attempt or a reconciler lease", async () => {
    const { handler, updateMany } = createDependencies({
      reviewType: "FULL_REVIEW",
      status: "POSTING",
      attemptCount: 2,
      executionLeaseToken: "reconciler-token",
      executionLeaseOwner: "RECONCILER",
      lastCompletedStage: "PERSISTED",
    });

    await handler(failureInput());
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("moves an ambiguous post failure to a due reconciliation lease", async () => {
    const { handler, releaseTrialCredit, transaction, updateMany } = createDependencies({
      reviewType: "FULL_REVIEW",
      status: "POSTING",
      attemptCount: 1,
      executionLeaseToken: "worker-token",
      executionLeaseOwner: "WORKER",
      lastCompletedStage: "PERSISTED",
      trialCreditState: "RESERVED",
    });

    await handler(failureInput());

    const write = updateMany.mock.calls[0]?.[0];
    expect(write).toBeDefined();
    if (!write) throw new Error("Expected a failure-state write");
    expect(write.where).toMatchObject({
      attemptCount: 1,
      executionLeaseToken: "worker-token",
      executionLeaseOwner: "WORKER",
    });
    expect(write.data).toMatchObject({
      status: "FAILED",
      failureStage: "POST",
      executionLeaseOwner: "RECONCILER",
      executionLeaseExpiresAt: NOW,
    });
    expect(write.data.failureMessage).not.toContain("secret raw message");
    expect(write.data.failureMessage).not.toContain("secret response");
    expect(releaseTrialCredit).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("releases a reserved trial credit in the same transaction for a pre-post failure", async () => {
    const { handler, releaseTrialCredit, transaction, updateMany } = createDependencies({
      reviewType: "FULL_REVIEW",
      status: "RUNNING",
      attemptCount: 1,
      executionLeaseToken: "worker-token",
      executionLeaseOwner: "WORKER",
      lastCompletedStage: "FETCHED",
      trialCreditState: "RESERVED",
    });

    await handler(failureInput());

    expect(transaction).toHaveBeenCalledOnce();
    expect(releaseTrialCredit).toHaveBeenCalledWith(
      {
        reviewId: "review-1",
        attempt: 1,
        leaseToken: "worker-token",
        leaseOwner: "WORKER",
        allowedStatuses: ["RUNNING"],
      },
      expect.any(Object),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          executionLeaseToken: "worker-token",
          executionLeaseOwner: "WORKER",
        }),
        data: expect.objectContaining({
          status: "FAILED",
          failureStage: "GENERATE",
          executionLeaseToken: null,
          executionLeaseOwner: null,
        }),
      }),
    );
  });
});
