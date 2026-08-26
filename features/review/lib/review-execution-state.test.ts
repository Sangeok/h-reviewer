import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ReviewStatus } from "@/lib/generated/prisma/enums";

import {
  acknowledgeReviewDispatch,
  claimReviewExecution,
  checkpointReviewExecution,
  completeReviewExecution,
  recordGithubMainArtifact,
  renewReviewExecutionLease,
  retryFailedReviewExecution,
  ReviewStateConflictError,
  transitionReviewExecution,
  type ReviewExecutionClient,
  type TransitionReviewExecutionInput,
} from "./review-execution-state";

const NOW = new Date("2026-08-25T00:00:00.000Z");
const LEASE_EXPIRES_AT = new Date("2026-08-25T00:15:00.000Z");

type UpdateMany = ReviewExecutionClient["review"]["updateMany"];
type FindUnique = ReviewExecutionClient["review"]["findUnique"];

function createReviewExecutionClient(): {
  client: ReviewExecutionClient;
  updateMany: ReturnType<typeof vi.fn<UpdateMany>>;
  findUnique: ReturnType<typeof vi.fn<FindUnique>>;
} {
  const updateMany = vi.fn<UpdateMany>();
  const findUnique = vi.fn<FindUnique>();

  return {
    client: { review: { findUnique, updateMany } },
    updateMany,
    findUnique,
  };
}

function createTransitionInput(
  overrides: Partial<TransitionReviewExecutionInput> = {},
): TransitionReviewExecutionInput {
  return {
    reviewId: "review-1",
    attempt: 1,
    leaseToken: "lease-token-1",
    leaseOwner: "WORKER",
    now: NOW,
    from: ["RUNNING"],
    to: "POSTING",
    leaseExpiresAt: LEASE_EXPIRES_AT,
    ...overrides,
  };
}

describe("review execution state", () => {
  let client: ReviewExecutionClient;
  let updateMany: ReturnType<typeof vi.fn<UpdateMany>>;
  let findUnique: ReturnType<typeof vi.fn<FindUnique>>;

  beforeEach(() => {
    ({ client, updateMany, findUnique } = createReviewExecutionClient());
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue(null);
  });

  it.each<{
    from: ReviewStatus;
    to: ReviewStatus;
  }>([
    { from: "PENDING", to: "FAILED" },
    { from: "PENDING", to: "SUPERSEDED" },
    { from: "RUNNING", to: "POSTING" },
    { from: "RUNNING", to: "FAILED" },
    { from: "RUNNING", to: "SUPERSEDED" },
    { from: "POSTING", to: "COMPLETED" },
    { from: "POSTING", to: "FAILED" },
    { from: "POSTING", to: "SUPERSEDED" },
  ])("allows the T02 $from to $to transition", async ({ from, to }) => {
    await transitionReviewExecution(
      createTransitionInput({
        from: [from],
        to,
        ...(to === "FAILED"
          ? {
              failure: {
                stage: "GENERATE",
                message: "Review generation failed safely.",
              },
            }
          : {}),
      }),
      client,
    );

    expect(updateMany).toHaveBeenCalledOnce();
  });

  it.each<{
    from: ReviewStatus;
    to: ReviewStatus;
  }>([
    { from: "PENDING", to: "POSTING" },
    { from: "RUNNING", to: "COMPLETED" },
    { from: "POSTING", to: "RUNNING" },
    { from: "FAILED", to: "PENDING" },
    { from: "FAILED", to: "COMPLETED" },
    { from: "COMPLETED", to: "FAILED" },
    { from: "SUPERSEDED", to: "PENDING" },
  ])("rejects the T02 $from to $to transition", async ({ from, to }) => {
    await expect(
      transitionReviewExecution(
        createTransitionInput({ from: [from], to }),
        client,
      ),
    ).rejects.toBeInstanceOf(ReviewStateConflictError);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a failed transition without failure metadata", async () => {
    await expect(
      transitionReviewExecution(
        createTransitionInput({ from: ["RUNNING"], to: "FAILED" }),
        client,
      ),
    ).rejects.toThrow("require failure metadata");

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("clears the execution lease when a review reaches a terminal state", async () => {
    await transitionReviewExecution(
      createTransitionInput({ from: ["POSTING"], to: "COMPLETED" }),
      client,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          review: { not: "" },
          githubMainReviewId: { not: null },
          githubMainPostedAt: { not: null },
        }),
        data: expect.objectContaining({
          status: "COMPLETED",
          executionLeaseExpiresAt: null,
          executionLeaseToken: null,
          executionLeaseOwner: null,
        }),
      }),
    );
  });

  it("fences transition writes by attempt, token, owner, and lease expiry", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      transitionReviewExecution(createTransitionInput(), client),
    ).rejects.toBeInstanceOf(ReviewStateConflictError);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attemptCount: 1,
          executionLeaseToken: "lease-token-1",
          executionLeaseOwner: "WORKER",
          executionLeaseExpiresAt: { gt: NOW },
        }),
      }),
    );
  });

  it("records a trusted primary artifact at MAIN_POSTED under the exact fence", async () => {
    await recordGithubMainArtifact(
      {
        reviewId: "review-1",
        attempt: 1,
        leaseToken: "lease-token-1",
        leaseOwner: "WORKER",
        from: ["POSTING"],
        artifactId: "github-review-7",
        postedAt: NOW,
        now: NOW,
      },
      client,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        review: { not: "" },
        status: { in: ["POSTING"] },
        executionLeaseToken: "lease-token-1",
      }),
      data: expect.objectContaining({
        githubMainReviewId: "github-review-7",
        githubMainPostedAt: NOW,
        lastCompletedStage: "MAIN_POSTED",
      }),
    });
  });

  it("records a durable stage checkpoint while renewing the same lease", async () => {
    await checkpointReviewExecution(
      {
        reviewId: "review-1",
        attempt: 1,
        leaseToken: "lease-token-1",
        leaseOwner: "WORKER",
        allowedStatuses: ["RUNNING"],
        now: NOW,
        stage: "FETCHED",
      },
      client,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lastCompletedStage: "FETCHED",
          executionLeaseExpiresAt: LEASE_EXPIRES_AT,
        },
      }),
    );
  });

  it("guards worker and reconciler completion with persisted body and artifact", async () => {
    await completeReviewExecution(
      {
        reviewId: "review-1",
        attempt: 1,
        leaseToken: "lease-token-1",
        leaseOwner: "RECONCILER",
        from: ["FAILED"],
        now: NOW,
      },
      client,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: { in: ["FAILED"] },
        review: { not: "" },
        githubMainReviewId: { not: null },
        githubMainPostedAt: { not: null },
        lastCompletedStage: {
          in: ["MAIN_POSTED", "INLINE_POSTED", "VERIFICATION_POSTED"],
        },
      }),
      data: expect.objectContaining({
        status: "COMPLETED",
        executionLeaseToken: null,
      }),
    });
  });

  it("allows only one concurrent worker claim to rotate the queue lease", async () => {
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.allSettled([
      claimReviewExecution(
        { reviewId: "review-1", attempt: 1, now: NOW },
        client,
      ),
      claimReviewExecution(
        { reviewId: "review-1", attempt: 1, now: NOW },
        client,
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          attemptCount: 1,
          executionLeaseOwner: "QUEUE",
          executionLeaseExpiresAt: { gt: NOW },
        }),
        data: expect.objectContaining({
          status: "RUNNING",
          executionLeaseOwner: "WORKER",
          executionLeaseExpiresAt: LEASE_EXPIRES_AT,
        }),
      }),
    );
  });

  it("rejects renewal after the current execution lease is lost", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      renewReviewExecutionLease(
        {
          reviewId: "review-1",
          attempt: 1,
          leaseToken: "lease-token-1",
          leaseOwner: "WORKER",
          allowedStatuses: ["RUNNING", "POSTING"],
          now: NOW,
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ReviewStateConflictError);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          executionLeaseExpiresAt: { gt: NOW },
        }),
      }),
    );
  });

  it("acknowledges only the exact pending queue fence", async () => {
    const status = await acknowledgeReviewDispatch(
      {
        reviewId: "review-1",
        attempt: 1,
        queueLeaseToken: "queue-token-1",
      },
      client,
    );

    expect(status).toBe("PENDING");
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "review-1",
        status: "PENDING",
        attemptCount: 1,
        executionLeaseToken: "queue-token-1",
        executionLeaseOwner: "QUEUE",
      },
      data: { lastCompletedStage: "QUEUED" },
    });
  });

  it("returns the factual worker status when claim wins the dispatch race", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({
      status: "RUNNING",
      attemptCount: 1,
      executionLeaseToken: "worker-token-1",
      executionLeaseOwner: "WORKER",
      lastCompletedStage: "QUEUED",
    });

    await expect(
      acknowledgeReviewDispatch(
        {
          reviewId: "review-1",
          attempt: 1,
          queueLeaseToken: "queue-token-1",
        },
        client,
      ),
    ).resolves.toBe("RUNNING");
  });

  it("retries a failed review by incrementing only the same row attempt", async () => {
    const result = await retryFailedReviewExecution(
      {
        reviewId: "review-1",
        attempt: 2,
        queueLeaseToken: "queue-token-3",
        now: NOW,
      },
      client,
    );

    expect(result).toEqual({ attempt: 3 });
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "review-1",
        status: "FAILED",
        attemptCount: 2,
      }),
      data: expect.objectContaining({
        status: "PENDING",
        attemptCount: 3,
        executionLeaseToken: "queue-token-3",
        executionLeaseOwner: "QUEUE",
      }),
    });
  });
});
