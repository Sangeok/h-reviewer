import "server-only";

import prisma from "@/lib/db";
import {
  Prisma,
  type Review,
} from "@/lib/generated/prisma/client";
import type {
  ReviewExecutionLeaseOwner,
  ReviewStatus,
  TrialCreditState,
} from "@/lib/generated/prisma/enums";
import {
  bindGithubWebhookDeliveryRequest,
  type GithubWebhookTransportBinding,
} from "@/lib/github/github-webhook-delivery";

import type { LanguageCode } from "@/features/settings";
import { ReviewStateConflictError } from "@/features/review/lib/review-execution-state";

import { FREE_REVIEW_TRIAL_LIMIT } from "../constants";
import { FREE_REVIEW_TRIAL_ENABLED } from "../constants/flags";

const MAX_SERIALIZATION_RETRIES = 3;
const SERIALIZATION_RETRY_BASE_DELAY_MS = 250;
const SERIALIZATION_RETRY_JITTER_MS = 5_000;

export type TrialTransactionRunner = Pick<typeof prisma, "$transaction">;

export type TrialSerializationRetryDelay = (retry: number) => Promise<void>;

export type TrialMutationClient = Pick<
  Prisma.TransactionClient,
  | "$queryRaw"
  | "githubWebhookDelivery"
  | "repository"
  | "review"
  | "user"
  | "userUsage"
>;

type CreatePendingReviewInput = {
  userId: string;
  repositoryId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  headSha: string;
  githubAuthorId: string;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  reviewMode: "FULL";
  requestSource: "AUTOMATIC" | "COMMAND";
  requestKey: string;
  langCode: LanguageCode;
  maxSuggestions: number | null;
  verificationEnabled: boolean;
  queueLeaseToken: string;
  queueLeaseExpiresAt: Date;
  transportBinding?: GithubWebhookTransportBinding;
};

export type CreateReviewWithTrialReservationResult =
  | {
      kind: "created";
      review: Review;
      supersededReviewRuns: Array<{ reviewId: string; attempt: number }>;
    }
  | {
      kind: "rejected";
      reason: "PLAN_RESTRICTED" | "TRIAL_EXHAUSTED";
    };

export type TrialCreditExecutionFence = {
  reviewId: string;
  attempt: number;
  leaseToken: string;
  leaseOwner: "QUEUE" | "WORKER" | "RECONCILER";
  allowedStatuses: readonly ReviewStatus[];
};

export type PrepareTrialCreditForRetryResult =
  | {
      kind: "ready";
      trialCreditState: "NOT_APPLICABLE" | "RESERVED";
    }
  | {
      kind: "rejected";
      reason: "PLAN_RESTRICTED" | "TRIAL_EXHAUSTED";
    }
  | { kind: "conflict"; reason: "INVALID_CREDIT_STATE" };

type LockedPriorReview = {
  id: string;
  status: ReviewStatus;
  attemptCount: number;
  executionLeaseToken: string | null;
  executionLeaseOwner: ReviewExecutionLeaseOwner | null;
  trialCreditState: TrialCreditState;
};

type CreditFenceRecord = {
  status: ReviewStatus;
  attemptCount: number;
  executionLeaseToken: string | null;
  executionLeaseOwner: ReviewExecutionLeaseOwner | null;
  trialCreditState: TrialCreditState;
  githubMainReviewId: string | null;
  githubMainPostedAt: Date | null;
};

function isSerializationConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "P2034") return true;
  if (!("meta" in error) || typeof error.meta !== "object" || !error.meta) {
    return false;
  }

  return "code" in error.meta && error.meta.code === "40001";
}

async function waitBeforeSerializationRetry(retry: number): Promise<void> {
  const exponentialDelay = SERIALIZATION_RETRY_BASE_DELAY_MS * 2 ** (retry - 1);
  const jitter = Math.floor(Math.random() * SERIALIZATION_RETRY_JITTER_MS);

  await new Promise((resolve) => setTimeout(resolve, exponentialDelay + jitter));
}

function hasMatchingFence(
  review: CreditFenceRecord,
  input: TrialCreditExecutionFence,
): boolean {
  return (
    review.attemptCount === input.attempt &&
    review.executionLeaseToken === input.leaseToken &&
    review.executionLeaseOwner === input.leaseOwner &&
    input.allowedStatuses.includes(review.status)
  );
}

function assertCreditFenceInput(input: TrialCreditExecutionFence): void {
  if (input.allowedStatuses.length === 0 || input.leaseToken.trim().length === 0) {
    throw new ReviewStateConflictError(
      "Trial credit mutations require an execution fence and status",
    );
  }
}

async function lockRepository(
  repositoryId: string,
  client: TrialMutationClient,
): Promise<void> {
  const locked = await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "repository" WHERE "id" = ${repositoryId} FOR UPDATE`,
  );

  if (locked.length !== 1) {
    throw new ReviewStateConflictError(
      `Repository ${repositoryId} is not available for review reservation`,
    );
  }
}

async function lockReview(
  reviewId: string,
  client: TrialMutationClient,
): Promise<void> {
  const locked = await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "review" WHERE "id" = ${reviewId} FOR UPDATE`,
  );

  if (locked.length !== 1) {
    throw new ReviewStateConflictError(
      `Review ${reviewId} is not available for trial credit mutation`,
    );
  }
}

async function getLockedUsage(
  userId: string,
  client: TrialMutationClient,
): Promise<{ id: string; trialReviewCreditsUsed: number }> {
  return client.userUsage.upsert({
    where: { userId },
    create: {
      userId,
      repositoryCount: 0,
      reviewCounts: {},
      trialReviewCreditsUsed: 0,
    },
    update: { trialReviewCreditsUsed: { increment: 0 } },
    select: { id: true, trialReviewCreditsUsed: true },
  });
}

async function getLockedPriorReviews(
  input: CreatePendingReviewInput,
  client: TrialMutationClient,
): Promise<LockedPriorReview[]> {
  const candidates = await client.review.findMany({
    where: {
      repositoryId: input.repositoryId,
      prNumber: input.prNumber,
      reviewType: input.reviewType,
      headSha: { not: input.headSha },
      status: { in: ["PENDING", "RUNNING", "POSTING"] },
      githubMainPostedAt: null,
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  for (const candidate of candidates) {
    await lockReview(candidate.id, client);
  }

  return client.review.findMany({
    where: {
      id: { in: candidates.map((candidate) => candidate.id) },
      status: { in: ["PENDING", "RUNNING", "POSTING"] },
      githubMainPostedAt: null,
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      attemptCount: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
      trialCreditState: true,
    },
  });
}

async function supersedePriorReviews(
  priorReviews: readonly LockedPriorReview[],
  client: TrialMutationClient,
): Promise<Array<{ reviewId: string; attempt: number }>> {
  const supersededReviewRuns: Array<{ reviewId: string; attempt: number }> = [];

  for (const priorReview of priorReviews) {
    const leaseToken = priorReview.executionLeaseToken;
    const leaseOwner = priorReview.executionLeaseOwner;
    if (!leaseToken || !leaseOwner) {
      throw new ReviewStateConflictError(
        `Review ${priorReview.id} has no supersede execution fence`,
      );
    }

    if (
      priorReview.trialCreditState === "RESERVED" &&
      priorReview.status !== "POSTING"
    ) {
      await releaseTrialCredit(
        {
          reviewId: priorReview.id,
          attempt: priorReview.attemptCount,
          leaseToken,
          leaseOwner,
          allowedStatuses: [priorReview.status],
        },
        client,
      );
    }

    const superseded = await client.review.updateMany({
      where: {
        id: priorReview.id,
        status: priorReview.status,
        attemptCount: priorReview.attemptCount,
        executionLeaseToken: leaseToken,
        executionLeaseOwner: leaseOwner,
      },
      data: {
        status: "SUPERSEDED",
        failureStage: null,
        failureMessage: null,
        executionLeaseExpiresAt: null,
        executionLeaseToken: null,
        executionLeaseOwner: null,
      },
    });
    if (superseded.count !== 1) {
      throw new ReviewStateConflictError(
        `Review ${priorReview.id} lost its supersede execution fence`,
      );
    }

    supersededReviewRuns.push({
      reviewId: priorReview.id,
      attempt: priorReview.attemptCount,
    });
  }

  return supersededReviewRuns;
}

async function reserveTrialCredit(
  userId: string,
  client: TrialMutationClient,
): Promise<boolean> {
  const reserved = await client.userUsage.updateMany({
    where: {
      userId,
      trialReviewCreditsUsed: { lt: FREE_REVIEW_TRIAL_LIMIT },
    },
    data: { trialReviewCreditsUsed: { increment: 1 } },
  });

  return reserved.count === 1;
}

export async function runReviewTrialTransaction<T>(
  operation: (client: Prisma.TransactionClient) => Promise<T>,
  runner: TrialTransactionRunner = prisma,
  waitBeforeRetry: TrialSerializationRetryDelay = waitBeforeSerializationRetry,
): Promise<T> {
  for (let retry = 0; retry <= MAX_SERIALIZATION_RETRIES; retry += 1) {
    try {
      return await runner.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializationConflict(error) || retry === MAX_SERIALIZATION_RETRIES) {
        throw error;
      }
      await waitBeforeRetry(retry + 1);
    }
  }

  throw new Error("Review trial transaction exhausted its retry policy");
}

export async function createReviewWithTrialReservation(
  input: CreatePendingReviewInput,
  runner: TrialTransactionRunner = prisma,
): Promise<CreateReviewWithTrialReservationResult> {
  return runReviewTrialTransaction(async (transactionClient) => {
    const client = transactionClient as TrialMutationClient;
    await lockRepository(input.repositoryId, client);

    const repository = await client.repository.findUnique({
      where: { id: input.repositoryId },
      select: {
        userId: true,
        user: { select: { subscriptionTier: true } },
      },
    });
    if (!repository || repository.userId !== input.userId) {
      throw new ReviewStateConflictError(
        `Repository ${input.repositoryId} ownership changed during reservation`,
      );
    }

    const usage = await getLockedUsage(input.userId, client);
    const priorReviews = await getLockedPriorReviews(input, client);
    const isPro = repository.user.subscriptionTier === "PRO";
    const needsTrialCredit = input.reviewType === "FULL_REVIEW" && !isPro;
    const releasableReservedCount = priorReviews.filter(
      (review) =>
        review.trialCreditState === "RESERVED" &&
        (review.status === "PENDING" || review.status === "RUNNING"),
    ).length;

    if (needsTrialCredit && !FREE_REVIEW_TRIAL_ENABLED) {
      return { kind: "rejected", reason: "PLAN_RESTRICTED" };
    }
    if (
      needsTrialCredit &&
      usage.trialReviewCreditsUsed - releasableReservedCount >=
        FREE_REVIEW_TRIAL_LIMIT
    ) {
      return { kind: "rejected", reason: "TRIAL_EXHAUSTED" };
    }

    const supersededReviewRuns = await supersedePriorReviews(
      priorReviews,
      client,
    );
    if (needsTrialCredit && !(await reserveTrialCredit(input.userId, client))) {
      throw new ReviewStateConflictError(
        `Trial credit capacity changed for user ${input.userId}`,
      );
    }

    const review = await client.review.create({
      data: {
        repositoryId: input.repositoryId,
        prNumber: input.prNumber,
        prTitle: input.prTitle,
        prUrl: input.prUrl,
        review: "",
        langCode: input.langCode,
        maxSuggestions: input.maxSuggestions,
        verificationEnabled: input.verificationEnabled,
        reviewType: input.reviewType,
        headSha: input.headSha,
        requestKey: input.requestKey,
        requestSource: input.requestSource,
        reviewMode: input.reviewMode,
        status: "PENDING",
        failureStage: null,
        failureMessage: null,
        lastCompletedStage: null,
        attemptCount: 1,
        executionLeaseExpiresAt: input.queueLeaseExpiresAt,
        executionLeaseToken: input.queueLeaseToken,
        executionLeaseOwner: "QUEUE",
        githubMainReviewId: null,
        githubMainPostedAt: null,
        githubAuthorId: input.githubAuthorId,
        artifactLookupMissedAt: null,
        trialCreditState: needsTrialCredit ? "RESERVED" : "NOT_APPLICABLE",
      },
    });

    if (input.transportBinding) {
      await bindGithubWebhookDeliveryRequest(
        {
          deliveryRowId: input.transportBinding.deliveryRowId,
          leaseToken: input.transportBinding.leaseToken,
          requestKey: input.requestKey,
        },
        client,
      );
    }

    return { kind: "created", review, supersededReviewRuns };
  }, runner);
}

async function getCreditFenceRecord(
  reviewId: string,
  client: TrialMutationClient,
): Promise<CreditFenceRecord | null> {
  return client.review.findUnique({
    where: { id: reviewId },
    select: {
      status: true,
      attemptCount: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
      trialCreditState: true,
      githubMainReviewId: true,
      githubMainPostedAt: true,
    },
  });
}

export async function consumeTrialCredit(
  input: TrialCreditExecutionFence & {
    githubMainReviewId: string;
    postedAt: Date;
  },
  client: TrialMutationClient,
): Promise<boolean> {
  assertCreditFenceInput(input);
  if (
    input.githubMainReviewId.trim().length === 0 ||
    Number.isNaN(input.postedAt.getTime())
  ) {
    throw new ReviewStateConflictError(
      "Trial credit consumption requires a valid GitHub artifact",
    );
  }

  const consumed = await client.review.updateMany({
    where: {
      id: input.reviewId,
      status: { in: [...input.allowedStatuses] },
      attemptCount: input.attempt,
      executionLeaseToken: input.leaseToken,
      executionLeaseOwner: input.leaseOwner,
      trialCreditState: "RESERVED",
      review: { not: "" },
    },
    data: {
      trialCreditState: "CONSUMED",
      githubMainReviewId: input.githubMainReviewId,
      githubMainPostedAt: input.postedAt,
      artifactLookupMissedAt: null,
      lastCompletedStage: "MAIN_POSTED",
    },
  });
  if (consumed.count === 1) return true;

  const review = await getCreditFenceRecord(input.reviewId, client);
  if (
    review &&
    hasMatchingFence(review, input) &&
    review.trialCreditState === "CONSUMED" &&
    review.githubMainReviewId === input.githubMainReviewId &&
    review.githubMainPostedAt?.getTime() === input.postedAt.getTime()
  ) {
    return false;
  }

  throw new ReviewStateConflictError(
    `Review ${input.reviewId} trial credit consumption lost its fence`,
  );
}

export async function releaseTrialCredit(
  input: TrialCreditExecutionFence,
  client: TrialMutationClient,
): Promise<boolean> {
  assertCreditFenceInput(input);

  const reviewOwner = await client.review.findUnique({
    where: { id: input.reviewId },
    select: {
      repository: {
        select: {
          user: { select: { usage: { select: { id: true } } } },
        },
      },
    },
  });
  const usageId = reviewOwner?.repository.user.usage?.id;
  if (!usageId) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} has no trial usage row`,
    );
  }
  await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "user_usage" WHERE "id" = ${usageId} FOR UPDATE`,
  );

  const released = await client.review.updateMany({
    where: {
      id: input.reviewId,
      status: { in: [...input.allowedStatuses] },
      attemptCount: input.attempt,
      executionLeaseToken: input.leaseToken,
      executionLeaseOwner: input.leaseOwner,
      trialCreditState: "RESERVED",
    },
    data: { trialCreditState: "RELEASED" },
  });
  if (released.count === 0) {
    const review = await getCreditFenceRecord(input.reviewId, client);
    if (
      review &&
      hasMatchingFence(review, input) &&
      review.trialCreditState === "RELEASED"
    ) {
      return false;
    }

    throw new ReviewStateConflictError(
      `Review ${input.reviewId} trial credit release lost its fence`,
    );
  }

  const decremented = await client.userUsage.updateMany({
    where: {
      id: usageId,
      trialReviewCreditsUsed: { gt: 0 },
    },
    data: { trialReviewCreditsUsed: { decrement: 1 } },
  });
  if (decremented.count !== 1) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} trial credit usage could not be decremented`,
    );
  }

  return true;
}

async function updateRetryCreditState(
  input: {
    reviewId: string;
    from: Extract<TrialCreditState, "NOT_APPLICABLE" | "RELEASED">;
    to: Extract<TrialCreditState, "NOT_APPLICABLE" | "RESERVED">;
  },
  client: TrialMutationClient,
): Promise<void> {
  if (input.from === input.to) return;

  const updated = await client.review.updateMany({
    where: {
      id: input.reviewId,
      status: "FAILED",
      trialCreditState: input.from,
    },
    data: { trialCreditState: input.to },
  });
  if (updated.count !== 1) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} retry credit state changed concurrently`,
    );
  }
}

export async function prepareTrialCreditForRetry(
  reviewId: string,
  client: TrialMutationClient,
): Promise<PrepareTrialCreditForRetryResult> {
  const initialReview = await client.review.findUnique({
    where: { id: reviewId },
    select: {
      reviewType: true,
      repository: { select: { userId: true } },
    },
  });
  if (!initialReview) {
    return { kind: "conflict", reason: "INVALID_CREDIT_STATE" };
  }

  let usage: { id: string; trialReviewCreditsUsed: number } | null = null;
  if (initialReview.reviewType === "FULL_REVIEW") {
    usage = await getLockedUsage(initialReview.repository.userId, client);
  }
  await lockReview(reviewId, client);

  const review = await client.review.findUnique({
    where: { id: reviewId },
    select: {
      status: true,
      reviewType: true,
      failureStage: true,
      trialCreditState: true,
      repository: {
        select: {
          userId: true,
          user: { select: { subscriptionTier: true } },
        },
      },
    },
  });
  if (!review || review.status !== "FAILED") {
    return { kind: "conflict", reason: "INVALID_CREDIT_STATE" };
  }

  if (review.reviewType === "SUMMARY") {
    return review.trialCreditState === "NOT_APPLICABLE"
      ? { kind: "ready", trialCreditState: "NOT_APPLICABLE" }
      : { kind: "conflict", reason: "INVALID_CREDIT_STATE" };
  }

  if (review.trialCreditState === "CONSUMED") {
    return { kind: "conflict", reason: "INVALID_CREDIT_STATE" };
  }
  if (review.trialCreditState === "RESERVED") {
    return review.failureStage === "POST" || review.failureStage === "RECONCILE"
      ? { kind: "ready", trialCreditState: "RESERVED" }
      : { kind: "conflict", reason: "INVALID_CREDIT_STATE" };
  }

  const isPro = review.repository.user.subscriptionTier === "PRO";
  if (isPro) {
    await updateRetryCreditState(
      {
        reviewId,
        from: review.trialCreditState,
        to: "NOT_APPLICABLE",
      },
      client,
    );
    return { kind: "ready", trialCreditState: "NOT_APPLICABLE" };
  }

  if (!FREE_REVIEW_TRIAL_ENABLED) {
    return { kind: "rejected", reason: "PLAN_RESTRICTED" };
  }
  if (!usage || usage.trialReviewCreditsUsed >= FREE_REVIEW_TRIAL_LIMIT) {
    return { kind: "rejected", reason: "TRIAL_EXHAUSTED" };
  }
  if (!(await reserveTrialCredit(review.repository.userId, client))) {
    return { kind: "rejected", reason: "TRIAL_EXHAUSTED" };
  }

  await updateRetryCreditState(
    {
      reviewId,
      from: review.trialCreditState,
      to: "RESERVED",
    },
    client,
  );
  return { kind: "ready", trialCreditState: "RESERVED" };
}
