import { randomUUID } from "node:crypto";

import prisma from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  ReviewExecutionLeaseOwner,
  ReviewExecutionStage,
  ReviewFailureStage,
  ReviewStatus,
} from "@/lib/generated/prisma/enums";

import {
  REVIEW_EXECUTION_LEASE_MS,
  REVIEW_QUEUE_LEASE_MS,
} from "../constants";

const T02_ALLOWED_TRANSITIONS: Readonly<
  Record<ReviewStatus, readonly ReviewStatus[]>
> = {
  PENDING: ["FAILED", "SUPERSEDED"],
  RUNNING: ["POSTING", "FAILED", "SUPERSEDED"],
  POSTING: ["COMPLETED", "FAILED", "SUPERSEDED"],
  COMPLETED: [],
  FAILED: [],
  SUPERSEDED: [],
};

const TERMINAL_REVIEW_STATUSES = new Set<ReviewStatus>([
  "COMPLETED",
  "FAILED",
  "SUPERSEDED",
]);

const FAILURE_MESSAGE_MAX_CHARS = 1_000;

export type ReviewExecutionClient = {
  review: {
    updateMany: Prisma.TransactionClient["review"]["updateMany"];
    findUnique(input: {
      where: { id: string };
      select: {
        status: true;
        attemptCount: true;
        executionLeaseToken: true;
        executionLeaseOwner: true;
        lastCompletedStage: true;
      };
    }): Promise<{
      status: ReviewStatus;
      attemptCount: number;
      executionLeaseToken: string | null;
      executionLeaseOwner: ReviewExecutionLeaseOwner | null;
      lastCompletedStage: ReviewExecutionStage | null;
    } | null>;
  };
};

export type TransitionReviewExecutionInput = {
  reviewId: string;
  attempt: number;
  leaseToken: string;
  leaseOwner: ReviewExecutionLeaseOwner;
  now: Date;
  from: readonly ReviewStatus[];
  to: ReviewStatus;
  failure?: {
    stage: ReviewFailureStage;
    message: string;
  };
  lastCompletedStage?: ReviewExecutionStage;
  leaseExpiresAt?: Date | null;
};

export type ClaimReviewExecutionInput = {
  reviewId: string;
  attempt: number;
  now: Date;
};

export type RenewReviewExecutionLeaseInput = {
  reviewId: string;
  attempt: number;
  leaseToken: string;
  leaseOwner: Extract<ReviewExecutionLeaseOwner, "WORKER" | "RECONCILER">;
  allowedStatuses: readonly ReviewStatus[];
  now: Date;
};

export type AcknowledgeReviewDispatchInput = {
  reviewId: string;
  attempt: number;
  queueLeaseToken: string;
};

export type RetryFailedReviewExecutionInput = {
  reviewId: string;
  attempt: number;
  queueLeaseToken: string;
  now: Date;
};

export class ReviewStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewStateConflictError";
  }
}

function assertTransitionInput(input: TransitionReviewExecutionInput): void {
  if (input.from.length === 0) {
    throw new ReviewStateConflictError(
      "At least one source review status is required",
    );
  }

  const isAllowedTransition = input.from.every((status) =>
    T02_ALLOWED_TRANSITIONS[status].includes(input.to),
  );

  if (!isAllowedTransition) {
    throw new ReviewStateConflictError(
      `Review transition to ${input.to} is not allowed in T02`,
    );
  }

  if (input.to === "FAILED") {
    const failureMessage = input.failure?.message.trim() ?? "";

    if (!input.failure || failureMessage.length === 0) {
      throw new ReviewStateConflictError(
        "Failed review transitions require failure metadata",
      );
    }

    if (failureMessage.length > FAILURE_MESSAGE_MAX_CHARS) {
      throw new ReviewStateConflictError(
        "Failure messages must not exceed 1,000 characters",
      );
    }
  } else if (input.failure) {
    throw new ReviewStateConflictError(
      "Failure metadata is only valid for failed review transitions",
    );
  }

  if (!TERMINAL_REVIEW_STATUSES.has(input.to) && input.leaseExpiresAt === null) {
    throw new ReviewStateConflictError(
      "Active review transitions cannot clear the execution lease",
    );
  }
}

function getLeaseExpiration(now: Date): Date {
  return new Date(now.getTime() + REVIEW_EXECUTION_LEASE_MS);
}

function getQueueLeaseExpiration(now: Date): Date {
  return new Date(now.getTime() + REVIEW_QUEUE_LEASE_MS);
}

export async function transitionReviewExecution(
  input: TransitionReviewExecutionInput,
  client: ReviewExecutionClient = prisma,
): Promise<void> {
  assertTransitionInput(input);

  const isTerminal = TERMINAL_REVIEW_STATUSES.has(input.to);
  const failureMessage = input.failure?.message.trim();
  const result = await client.review.updateMany({
    where: {
      id: input.reviewId,
      status: { in: [...input.from] },
      attemptCount: input.attempt,
      executionLeaseToken: input.leaseToken,
      executionLeaseOwner: input.leaseOwner,
      executionLeaseExpiresAt: { gt: input.now },
    },
    data: {
      status: input.to,
      failureStage: input.failure?.stage ?? null,
      failureMessage: failureMessage ?? null,
      ...(input.lastCompletedStage === undefined
        ? {}
        : { lastCompletedStage: input.lastCompletedStage }),
      ...(isTerminal
        ? {
            executionLeaseExpiresAt: null,
            executionLeaseToken: null,
            executionLeaseOwner: null,
          }
        : input.leaseExpiresAt === undefined
          ? {}
          : { executionLeaseExpiresAt: input.leaseExpiresAt }),
    },
  });

  if (result.count !== 1) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} execution lease was lost`,
    );
  }
}

export async function claimReviewExecution(
  input: ClaimReviewExecutionInput,
  client: ReviewExecutionClient = prisma,
): Promise<{ leaseToken: string }> {
  const leaseToken = randomUUID();
  const result = await client.review.updateMany({
    where: {
      id: input.reviewId,
      status: "PENDING",
      attemptCount: input.attempt,
      executionLeaseToken: { not: null },
      executionLeaseOwner: "QUEUE",
      executionLeaseExpiresAt: { gt: input.now },
    },
    data: {
      status: "RUNNING",
      failureStage: null,
      failureMessage: null,
      executionLeaseToken: leaseToken,
      executionLeaseOwner: "WORKER",
      executionLeaseExpiresAt: getLeaseExpiration(input.now),
    },
  });

  if (result.count !== 1) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} could not be claimed`,
    );
  }

  return { leaseToken };
}

export async function acknowledgeReviewDispatch(
  input: AcknowledgeReviewDispatchInput,
  client: ReviewExecutionClient = prisma,
): Promise<ReviewStatus> {
  const result = await client.review.updateMany({
    where: {
      id: input.reviewId,
      status: "PENDING",
      attemptCount: input.attempt,
      executionLeaseToken: input.queueLeaseToken,
      executionLeaseOwner: "QUEUE",
    },
    data: {
      lastCompletedStage: "QUEUED",
    },
  });

  if (result.count === 1) {
    return "PENDING";
  }

  const review = await client.review.findUnique({
    where: { id: input.reviewId },
    select: {
      status: true,
      attemptCount: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
      lastCompletedStage: true,
    },
  });

  if (!review || review.attemptCount !== input.attempt) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} dispatch acknowledgement lost its attempt`,
    );
  }

  if (review.status !== "PENDING") {
    return review.status;
  }

  if (
    review.executionLeaseToken === input.queueLeaseToken &&
    review.executionLeaseOwner === "QUEUE" &&
    review.lastCompletedStage === "QUEUED"
  ) {
    return review.status;
  }

  throw new ReviewStateConflictError(
    `Review ${input.reviewId} dispatch acknowledgement lost its queue lease`,
  );
}

export async function retryFailedReviewExecution(
  input: RetryFailedReviewExecutionInput,
  client: ReviewExecutionClient = prisma,
): Promise<{ attempt: number }> {
  const nextAttempt = input.attempt + 1;
  const result = await client.review.updateMany({
    where: {
      id: input.reviewId,
      status: "FAILED",
      attemptCount: input.attempt,
      executionLeaseExpiresAt: null,
      executionLeaseToken: null,
      executionLeaseOwner: null,
    },
    data: {
      status: "PENDING",
      failureStage: null,
      failureMessage: null,
      lastCompletedStage: null,
      attemptCount: nextAttempt,
      executionLeaseExpiresAt: getQueueLeaseExpiration(input.now),
      executionLeaseToken: input.queueLeaseToken,
      executionLeaseOwner: "QUEUE",
    },
  });

  if (result.count !== 1) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} could not start a retry attempt`,
    );
  }

  return { attempt: nextAttempt };
}

export async function renewReviewExecutionLease(
  input: RenewReviewExecutionLeaseInput,
  client: ReviewExecutionClient = prisma,
): Promise<void> {
  if (input.allowedStatuses.length === 0) {
    throw new ReviewStateConflictError(
      "At least one renewable review status is required",
    );
  }

  const result = await client.review.updateMany({
    where: {
      id: input.reviewId,
      status: { in: [...input.allowedStatuses] },
      attemptCount: input.attempt,
      executionLeaseToken: input.leaseToken,
      executionLeaseOwner: input.leaseOwner,
      executionLeaseExpiresAt: { gt: input.now },
    },
    data: {
      executionLeaseExpiresAt: getLeaseExpiration(input.now),
    },
  });

  if (result.count !== 1) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} execution lease could not be renewed`,
    );
  }
}
