import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ReviewStatus } from "@/lib/generated/prisma/enums";

import {
  claimReviewExecution,
  renewReviewExecutionLease,
  ReviewStateConflictError,
  transitionReviewExecution,
  type ReviewExecutionClient,
  type TransitionReviewExecutionInput,
} from "./review-execution-state";

const NOW = new Date("2026-08-25T00:00:00.000Z");
const LEASE_EXPIRES_AT = new Date("2026-08-25T00:15:00.000Z");

type UpdateMany = ReviewExecutionClient["review"]["updateMany"];

function createReviewExecutionClient(): {
  client: ReviewExecutionClient;
  updateMany: ReturnType<typeof vi.fn<UpdateMany>>;
} {
  const updateMany = vi.fn<UpdateMany>();

  return {
    client: { review: { updateMany } },
    updateMany,
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

  beforeEach(() => {
    ({ client, updateMany } = createReviewExecutionClient());
    updateMany.mockResolvedValue({ count: 1 });
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
});
