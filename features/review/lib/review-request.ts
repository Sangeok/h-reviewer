import { randomUUID } from "node:crypto";

import { getRepositoryWithToken } from "@/features/ai/lib/get-repository-with-token";
import { getUserTier } from "@/features/payment/lib/subscription";
import { REVIEW_QUEUE_LEASE_MS } from "@/features/review/constants";
import { getUserLanguageByUserId } from "@/features/settings";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import type {
  ReviewExecutionLeaseOwner,
  ReviewExecutionStage,
  ReviewFailureStage,
  ReviewStatus,
} from "@/lib/generated/prisma/enums";
import { getPullRequestSnapshot } from "@/lib/github/github";
import {
  bindGithubWebhookDeliveryRequest,
  type GithubWebhookTransportBinding,
} from "@/lib/github/github-webhook-delivery";

import {
  acknowledgeReviewDispatch,
  retryFailedReviewExecution,
  ReviewStateConflictError,
  transitionReviewExecution,
} from "./review-execution-state";

export type CreateReviewRequestInput = {
  owner: string;
  repo: string;
  prNumber: number;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  reviewMode: "FULL";
  requestSource: "AUTOMATIC" | "COMMAND";
  nonce?: string;
  dispatchMode: "DIRECT" | "DEBOUNCED";
  transportBinding?: GithubWebhookTransportBinding;
};

export type CreateReviewRequestResult =
  | {
      kind: "created";
      reviewId: string;
      requestKey: string;
      status: ReviewStatus;
    }
  | {
      kind: "existing";
      reviewId: string;
      requestKey: string;
      status: ReviewStatus;
    }
  | {
      kind: "dispatch-failed";
      reviewId: string;
      requestKey: string;
      status: "FAILED";
      failureStage: "QUEUE" | "POST" | "RECONCILE";
      message: string;
    }
  | {
      kind: "rejected";
      reason:
        | "PLAN_RESTRICTED"
        | "TRIAL_EXHAUSTED"
        | "PR_NOT_REVIEWABLE";
      message: string;
    };

type ReviewRequestEvent =
  | {
      id: string;
      name: "pr.review.auto-requested" | "pr.review.requested";
      data: {
        reviewId: string;
        attempt: number;
        debounceKey: string;
      };
    }
  | {
      id: string;
      name: "pr.summary.requested";
      data: {
        reviewId: string;
        attempt: number;
      };
    };

export type ReviewRequestDependencies = {
  prisma: typeof prisma;
  getRepositoryWithToken: typeof getRepositoryWithToken;
  getPullRequestSnapshot: typeof getPullRequestSnapshot;
  getUserLanguageByUserId: typeof getUserLanguageByUserId;
  getUserTier: typeof getUserTier;
  bindGithubWebhookDeliveryRequest: typeof bindGithubWebhookDeliveryRequest;
  sendEvent(event: ReviewRequestEvent): Promise<unknown>;
  now(): Date;
};

type FactualReview = {
  id: string;
  requestKey: string;
  status: ReviewStatus;
  attemptCount: number;
  repositoryId: string;
  prNumber: number;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  lastCompletedStage: ReviewExecutionStage | null;
  failureStage: ReviewFailureStage | null;
  executionLeaseExpiresAt: Date | null;
  executionLeaseToken: string | null;
  executionLeaseOwner: ReviewExecutionLeaseOwner | null;
};

const DEFAULT_NONCE = "default";
const DISPATCH_FAILURE_MESSAGE = "The review request could not be dispatched.";

export class ReviewRequestRecoveryError extends Error {
  readonly code = "DELIVERY_REQUEST_NOT_FOUND";

  constructor(requestKey: string) {
    super(`No review exists for delivery request key ${requestKey}`);
    this.name = "ReviewRequestRecoveryError";
  }
}

function getQueueLeaseExpiration(now: Date): Date {
  return new Date(now.getTime() + REVIEW_QUEUE_LEASE_MS);
}

function createRequestKey(input: {
  reviewType: CreateReviewRequestInput["reviewType"];
  reviewMode: CreateReviewRequestInput["reviewMode"];
  repositoryId: string;
  prNumber: number;
  headSha: string;
  nonce: string;
}): string {
  return [
    input.reviewType,
    input.reviewMode,
    input.repositoryId,
    input.prNumber,
    input.headSha,
    input.nonce,
  ].join(":");
}

function isRequestKeyUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  if (error.code !== "P2002" || !("meta" in error)) {
    return false;
  }

  const meta = error.meta;
  if (typeof meta !== "object" || meta === null) {
    return false;
  }

  const target = "target" in meta ? meta.target : null;
  const directTargetMatches = Array.isArray(target)
    ? target.some(
        (field) =>
          typeof field === "string" && field.includes("requestKey"),
      )
    : typeof target === "string" && target.includes("requestKey");

  if (directTargetMatches) {
    return true;
  }

  const driverAdapterError =
    "driverAdapterError" in meta ? meta.driverAdapterError : null;
  const cause =
    typeof driverAdapterError === "object" &&
    driverAdapterError !== null &&
    "cause" in driverAdapterError
      ? driverAdapterError.cause
      : null;
  const constraint =
    typeof cause === "object" && cause !== null && "constraint" in cause
      ? cause.constraint
      : null;
  const fields =
    typeof constraint === "object" &&
    constraint !== null &&
    "fields" in constraint
      ? constraint.fields
      : null;

  return (
    Array.isArray(fields) &&
    fields.some(
      (field) =>
        typeof field === "string" && field.includes("requestKey"),
    )
  );
}

function createReviewRequestEvent(input: {
  reviewId: string;
  attempt: number;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  repositoryId: string;
  prNumber: number;
  dispatchMode: "DIRECT" | "DEBOUNCED";
}): ReviewRequestEvent {
  if (input.reviewType === "SUMMARY") {
    if (input.dispatchMode !== "DIRECT") {
      throw new Error("Summary requests do not support debounced dispatch");
    }

    return {
      id: `hreviewer:summary-run:${input.reviewId}:${input.attempt}`,
      name: "pr.summary.requested",
      data: {
        reviewId: input.reviewId,
        attempt: input.attempt,
      },
    };
  }

  const isDebounced = input.dispatchMode === "DEBOUNCED";
  return {
    id: `hreviewer:${isDebounced ? "review-auto" : "review-run"}:${input.reviewId}:${input.attempt}`,
    name: isDebounced
      ? "pr.review.auto-requested"
      : "pr.review.requested",
    data: {
      reviewId: input.reviewId,
      attempt: input.attempt,
      debounceKey: `${input.repositoryId}:${input.prNumber}`,
    },
  };
}

async function findFactualReview(
  where: { id: string } | { requestKey: string },
  dependencies: ReviewRequestDependencies,
): Promise<FactualReview | null> {
  return dependencies.prisma.review.findUnique({
    where,
    select: {
      id: true,
      requestKey: true,
      status: true,
      attemptCount: true,
      repositoryId: true,
      prNumber: true,
      reviewType: true,
      lastCompletedStage: true,
      failureStage: true,
      executionLeaseExpiresAt: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
    },
  });
}

async function finalizeDispatch(input: {
  review: FactualReview;
  queueLeaseToken: string;
  event: ReviewRequestEvent;
  resultKind: "created" | "existing";
  dependencies: ReviewRequestDependencies;
}): Promise<CreateReviewRequestResult> {
  try {
    await input.dependencies.sendEvent(input.event);
  } catch {
    const failureTime = input.dependencies.now();

    try {
      await transitionReviewExecution(
        {
          reviewId: input.review.id,
          attempt: input.review.attemptCount,
          leaseToken: input.queueLeaseToken,
          leaseOwner: "QUEUE",
          now: failureTime,
          from: ["PENDING"],
          to: "FAILED",
          failure: {
            stage: "QUEUE",
            message: DISPATCH_FAILURE_MESSAGE,
          },
        },
        input.dependencies.prisma,
      );

      return {
        kind: "dispatch-failed",
        reviewId: input.review.id,
        requestKey: input.review.requestKey,
        status: "FAILED",
        failureStage: "QUEUE",
        message: DISPATCH_FAILURE_MESSAGE,
      };
    } catch (error) {
      if (!(error instanceof ReviewStateConflictError)) {
        throw error;
      }

      const factualReview = await findFactualReview(
        { id: input.review.id },
        input.dependencies,
      );

      if (
        factualReview &&
        factualReview.attemptCount === input.review.attemptCount &&
        factualReview.status !== "PENDING"
      ) {
        return {
          kind: input.resultKind,
          reviewId: factualReview.id,
          requestKey: factualReview.requestKey,
          status: factualReview.status,
        };
      }

      throw new ReviewStateConflictError(
        `Review ${input.review.id} dispatch failure lost an unexplained queue fence`,
      );
    }
  }

  const status = await acknowledgeReviewDispatch(
    {
      reviewId: input.review.id,
      attempt: input.review.attemptCount,
      queueLeaseToken: input.queueLeaseToken,
    },
    input.dependencies.prisma,
  );

  return {
    kind: input.resultKind,
    reviewId: input.review.id,
    requestKey: input.review.requestKey,
    status,
  };
}

const defaultReviewRequestDependencies: ReviewRequestDependencies = {
  prisma,
  getRepositoryWithToken,
  getPullRequestSnapshot,
  getUserLanguageByUserId,
  getUserTier,
  bindGithubWebhookDeliveryRequest,
  sendEvent: (event) => inngest.send(event),
  now: () => new Date(),
};

export async function createReviewRequest(
  input: CreateReviewRequestInput,
  dependencies: ReviewRequestDependencies = defaultReviewRequestDependencies,
): Promise<CreateReviewRequestResult> {
  const repositoryResult = await dependencies.getRepositoryWithToken({
    owner: input.owner,
    repo: input.repo,
  });
  const { repository, accessToken, githubAuthorId } = repositoryResult;

  if (
    input.reviewType === "FULL_REVIEW" &&
    (await dependencies.getUserTier(repository.user.id)) !== "PRO"
  ) {
    return {
      kind: "rejected",
      reason: "PLAN_RESTRICTED",
      message: "Review creation is available on the Pro plan only",
    };
  }

  const snapshot = await dependencies.getPullRequestSnapshot({
    token: accessToken,
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
  });

  if (snapshot.state !== "open" || snapshot.merged) {
    return {
      kind: "rejected",
      reason: "PR_NOT_REVIEWABLE",
      message: "The pull request is closed or merged and cannot be reviewed",
    };
  }

  const requestKey = createRequestKey({
    reviewType: input.reviewType,
    reviewMode: input.reviewMode,
    repositoryId: repository.id,
    prNumber: input.prNumber,
    headSha: snapshot.headSha,
    nonce: input.nonce ?? DEFAULT_NONCE,
  });
  const now = dependencies.now();
  const queueLeaseToken = randomUUID();
  const langCode = await dependencies.getUserLanguageByUserId(
    repository.user.id,
  );

  let createdReview: FactualReview;

  try {
    createdReview = await dependencies.prisma.$transaction(async (client) => {
      const review = await client.review.create({
        data: {
          repositoryId: repository.id,
          prNumber: input.prNumber,
          prTitle: snapshot.title,
          prUrl: snapshot.url,
          review: "",
          langCode,
          maxSuggestions: repository.user.maxSuggestions,
          verificationEnabled: repository.user.verificationEnabled,
          reviewType: input.reviewType,
          headSha: snapshot.headSha,
          requestKey,
          requestSource: input.requestSource,
          reviewMode: input.reviewMode,
          status: "PENDING",
          failureStage: null,
          failureMessage: null,
          lastCompletedStage: null,
          attemptCount: 1,
          executionLeaseExpiresAt: getQueueLeaseExpiration(now),
          executionLeaseToken: queueLeaseToken,
          executionLeaseOwner: "QUEUE",
          githubMainReviewId: null,
          githubMainPostedAt: null,
          githubAuthorId,
          artifactLookupMissedAt: null,
          trialCreditState: "NOT_APPLICABLE",
        },
        select: {
          id: true,
          requestKey: true,
          status: true,
          attemptCount: true,
          repositoryId: true,
          prNumber: true,
          reviewType: true,
          lastCompletedStage: true,
          failureStage: true,
          executionLeaseExpiresAt: true,
          executionLeaseToken: true,
          executionLeaseOwner: true,
        },
      });

      if (input.transportBinding) {
        await dependencies.bindGithubWebhookDeliveryRequest(
          {
            deliveryRowId: input.transportBinding.deliveryRowId,
            leaseToken: input.transportBinding.leaseToken,
            requestKey: review.requestKey,
          },
          client,
        );
      }

      return review;
    });
  } catch (error) {
    if (!isRequestKeyUniqueConflict(error)) {
      throw error;
    }

    const existingReview = await dependencies.prisma.review.findUnique({
      where: { requestKey },
      select: {
        id: true,
        requestKey: true,
        status: true,
        attemptCount: true,
        repositoryId: true,
        prNumber: true,
        reviewType: true,
        lastCompletedStage: true,
        failureStage: true,
        executionLeaseExpiresAt: true,
        executionLeaseToken: true,
        executionLeaseOwner: true,
      },
    });

    if (!existingReview) {
      throw new ReviewStateConflictError(
        `Request key ${requestKey} conflicted without an existing review`,
      );
    }

    const transportBinding = input.transportBinding;
    if (transportBinding) {
      await dependencies.prisma.$transaction((client) =>
        dependencies.bindGithubWebhookDeliveryRequest(
          {
            deliveryRowId: transportBinding.deliveryRowId,
            leaseToken: transportBinding.leaseToken,
            requestKey: existingReview.requestKey,
          },
          client,
        ),
      );
    }

    return {
      kind: "existing",
      reviewId: existingReview.id,
      requestKey: existingReview.requestKey,
      status: existingReview.status,
    };
  }

  return finalizeDispatch({
    review: createdReview,
    queueLeaseToken,
    event: createReviewRequestEvent({
      reviewId: createdReview.id,
      attempt: createdReview.attemptCount,
      reviewType: createdReview.reviewType,
      repositoryId: createdReview.repositoryId,
      prNumber: createdReview.prNumber,
      dispatchMode: input.dispatchMode,
    }),
    resultKind: "created",
    dependencies,
  });
}

export async function retryReviewRequest(
  reviewId: string,
  dependencies: ReviewRequestDependencies = defaultReviewRequestDependencies,
): Promise<CreateReviewRequestResult> {
  const review = await findFactualReview({ id: reviewId }, dependencies);

  if (!review || review.status !== "FAILED") {
    throw new ReviewStateConflictError(
      `Review ${reviewId} is not available for retry`,
    );
  }

  const now = dependencies.now();
  const queueLeaseToken = randomUUID();
  const { attempt } = await dependencies.prisma.$transaction((client) =>
    retryFailedReviewExecution(
      {
        reviewId,
        attempt: review.attemptCount,
        queueLeaseToken,
        now,
      },
      client,
    ),
  );
  const retriedReview = { ...review, status: "PENDING" as const, attemptCount: attempt };

  return finalizeDispatch({
    review: retriedReview,
    queueLeaseToken,
    event: createReviewRequestEvent({
      reviewId,
      attempt,
      reviewType: review.reviewType,
      repositoryId: review.repositoryId,
      prNumber: review.prNumber,
      dispatchMode: "DIRECT",
    }),
    resultKind: "existing",
    dependencies,
  });
}

export async function resumeReviewRequest(
  requestKey: string,
  dependencies: ReviewRequestDependencies = defaultReviewRequestDependencies,
): Promise<CreateReviewRequestResult> {
  let review = await findFactualReview({ requestKey }, dependencies);

  if (!review) {
    throw new ReviewRequestRecoveryError(requestKey);
  }

  if (review.status === "FAILED" && review.failureStage === "QUEUE") {
    return retryReviewRequest(review.id, dependencies);
  }

  if (
    review.status !== "PENDING" ||
    review.lastCompletedStage === "QUEUED"
  ) {
    return {
      kind: "existing",
      reviewId: review.id,
      requestKey: review.requestKey,
      status: review.status,
    };
  }

  const now = dependencies.now();
  let queueLeaseToken = review.executionLeaseToken;

  if (
    !queueLeaseToken ||
    review.executionLeaseOwner !== "QUEUE" ||
    review.executionLeaseExpiresAt === null
  ) {
    throw new ReviewStateConflictError(
      `Review ${review.id} has no resumable queue fence`,
    );
  }

  if (review.executionLeaseExpiresAt <= now) {
    const renewedQueueLeaseToken = randomUUID();
    const renewed = await dependencies.prisma.review.updateMany({
      where: {
        id: review.id,
        status: "PENDING",
        attemptCount: review.attemptCount,
        executionLeaseToken: queueLeaseToken,
        executionLeaseOwner: "QUEUE",
        executionLeaseExpiresAt: { lte: now },
        OR: [
          { lastCompletedStage: null },
          { lastCompletedStage: { not: "QUEUED" } },
        ],
      },
      data: {
        executionLeaseToken: renewedQueueLeaseToken,
        executionLeaseExpiresAt: getQueueLeaseExpiration(now),
      },
    });

    if (renewed.count === 1) {
      queueLeaseToken = renewedQueueLeaseToken;
      review = {
        ...review,
        executionLeaseToken: renewedQueueLeaseToken,
        executionLeaseExpiresAt: getQueueLeaseExpiration(now),
      };
    } else {
      const factualReview = await findFactualReview(
        { id: review.id },
        dependencies,
      );

      if (!factualReview) {
        throw new ReviewRequestRecoveryError(requestKey);
      }

      if (
        factualReview.status !== "PENDING" ||
        factualReview.lastCompletedStage === "QUEUED"
      ) {
        return {
          kind: "existing",
          reviewId: factualReview.id,
          requestKey: factualReview.requestKey,
          status: factualReview.status,
        };
      }

      if (
        !factualReview.executionLeaseToken ||
        factualReview.executionLeaseOwner !== "QUEUE" ||
        factualReview.executionLeaseExpiresAt === null ||
        factualReview.executionLeaseExpiresAt <= now
      ) {
        throw new ReviewStateConflictError(
          `Review ${review.id} queue lease renewal lost its fence`,
        );
      }

      review = factualReview;
      queueLeaseToken = factualReview.executionLeaseToken;
    }
  }

  return finalizeDispatch({
    review,
    queueLeaseToken,
    event: createReviewRequestEvent({
      reviewId: review.id,
      attempt: review.attemptCount,
      reviewType: review.reviewType,
      repositoryId: review.repositoryId,
      prNumber: review.prNumber,
      dispatchMode: "DIRECT",
    }),
    resultKind: "existing",
    dependencies,
  });
}
