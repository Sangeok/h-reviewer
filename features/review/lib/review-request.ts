import { randomUUID } from "node:crypto";

import { getRepositoryWithToken } from "@/features/ai/lib/get-repository-with-token";
import {
  createReviewWithTrialReservation,
  prepareTrialCreditForRetry,
  releaseTrialCredit,
  runReviewTrialTransaction,
} from "@/features/payment/lib/review-trial";
import { REVIEW_QUEUE_LEASE_MS } from "@/features/review/constants";
import { getUserLanguageByUserId } from "@/features/settings";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import type {
  ReviewExecutionLeaseOwner,
  ReviewExecutionStage,
  ReviewFailureStage,
  ReviewStatus,
  TrialCreditState,
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
        resumeFromPersisted?: boolean;
      };
    }
  | {
      id: string;
      name: "pr.summary.requested";
      data: {
        reviewId: string;
        attempt: number;
        resumeFromPersisted?: boolean;
      };
    }
  | {
      id: string;
      name: "pr.review.superseded";
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
  createReviewWithTrialReservation: typeof createReviewWithTrialReservation;
  prepareTrialCreditForRetry: typeof prepareTrialCreditForRetry;
  releaseTrialCredit: typeof releaseTrialCredit;
  runReviewTrialTransaction: typeof runReviewTrialTransaction;
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
  headSha: string | null;
  lastCompletedStage: ReviewExecutionStage | null;
  failureStage: ReviewFailureStage | null;
  executionLeaseExpiresAt: Date | null;
  executionLeaseToken: string | null;
  executionLeaseOwner: ReviewExecutionLeaseOwner | null;
  githubMainPostedAt: Date | null;
  review: string;
  trialCreditState: TrialCreditState;
};

type SupersededReviewIdentity = {
  reviewId: string;
  attempt: number;
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
  resumeFromPersisted?: boolean;
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
        ...(input.resumeFromPersisted ? { resumeFromPersisted: true } : {}),
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
      ...(input.resumeFromPersisted ? { resumeFromPersisted: true } : {}),
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
      headSha: true,
      lastCompletedStage: true,
      failureStage: true,
      executionLeaseExpiresAt: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
      githubMainPostedAt: true,
      review: true,
      trialCreditState: true,
    },
  });
}

async function sendSupersededReviewEvents(input: {
  reviews: readonly SupersededReviewIdentity[];
  dependencies: ReviewRequestDependencies;
}): Promise<void> {
  for (const review of input.reviews) {
    try {
      await input.dependencies.sendEvent({
        id: `hreviewer:review-superseded:${review.reviewId}:${review.attempt}`,
        name: "pr.review.superseded",
        data: review,
      });
    } catch (error) {
      console.warn("Superseded review cancellation event could not be sent", {
        reviewId: review.reviewId,
        attempt: review.attempt,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}

async function finalizeDispatch(input: {
  review: FactualReview;
  queueLeaseToken: string;
  event: ReviewRequestEvent;
  resultKind: "created" | "existing";
  resumeFailureStage?: Extract<ReviewFailureStage, "POST" | "RECONCILE">;
  dependencies: ReviewRequestDependencies;
}): Promise<CreateReviewRequestResult> {
  try {
    await input.dependencies.sendEvent(input.event);
  } catch {
    const failureTime = input.dependencies.now();

    try {
      const failureStage = input.resumeFailureStage ?? "QUEUE";
      await input.dependencies.runReviewTrialTransaction(
        async (client) => {
          if (
            input.review.trialCreditState === "RESERVED" &&
            input.resumeFailureStage === undefined
          ) {
            await input.dependencies.releaseTrialCredit(
              {
                reviewId: input.review.id,
                attempt: input.review.attemptCount,
                leaseToken: input.queueLeaseToken,
                leaseOwner: "QUEUE",
                allowedStatuses: ["PENDING"],
              },
              client,
            );
          }

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
                stage: failureStage,
                message: DISPATCH_FAILURE_MESSAGE,
              },
            },
            client,
          );
        },
        input.dependencies.prisma,
      );

      return {
        kind: "dispatch-failed",
        reviewId: input.review.id,
        requestKey: input.review.requestKey,
        status: "FAILED",
        failureStage,
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
  createReviewWithTrialReservation,
  prepareTrialCreditForRetry,
  releaseTrialCredit,
  runReviewTrialTransaction,
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
  let supersededReviews: SupersededReviewIdentity[] = [];

  try {
    const reservation = await dependencies.createReviewWithTrialReservation(
      {
        userId: repository.user.id,
        repositoryId: repository.id,
        prNumber: input.prNumber,
        prTitle: snapshot.title,
        prUrl: snapshot.url,
        headSha: snapshot.headSha,
        githubAuthorId,
        reviewType: input.reviewType,
        reviewMode: input.reviewMode,
        requestSource: input.requestSource,
        requestKey,
        langCode,
        maxSuggestions: repository.user.maxSuggestions,
        verificationEnabled: repository.user.verificationEnabled,
        queueLeaseToken,
        queueLeaseExpiresAt: getQueueLeaseExpiration(now),
        ...(input.transportBinding
          ? { transportBinding: input.transportBinding }
          : {}),
      },
      dependencies.prisma,
    );
    if (reservation.kind === "rejected") {
      return {
        kind: "rejected",
        reason: reservation.reason,
        message: reservation.reason === "PLAN_RESTRICTED"
          ? "Review creation is available on the Pro plan only"
          : "The free AI code review trial has been exhausted",
      };
    }

    createdReview = reservation.review;
    supersededReviews = reservation.supersededReviewRuns;
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
        headSha: true,
        lastCompletedStage: true,
        failureStage: true,
        executionLeaseExpiresAt: true,
        executionLeaseToken: true,
        executionLeaseOwner: true,
        githubMainPostedAt: true,
        review: true,
        trialCreditState: true,
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

  await sendSupersededReviewEvents({
    reviews: supersededReviews,
    dependencies,
  });

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

  const canResumePersistedPosting =
    (review.failureStage === "POST" || review.failureStage === "RECONCILE") &&
    review.review.trim().length > 0 &&
    review.lastCompletedStage !== null &&
    [
      "PERSISTED",
      "MAIN_POSTED",
      "INLINE_POSTED",
      "VERIFICATION_POSTED",
    ].includes(review.lastCompletedStage);

  const requiresAbsenceConfirmation =
    canResumePersistedPosting &&
    (review.failureStage === "RECONCILE" || review.executionLeaseToken !== null);

  if (requiresAbsenceConfirmation) {
    const now = dependencies.now();
    const reconciliationToken = randomUUID();
    const scheduled = await dependencies.prisma.review.updateMany({
      where: {
        id: reviewId,
        status: "FAILED",
        attemptCount: review.attemptCount,
        failureStage: { in: ["POST", "RECONCILE"] },
      },
      data: {
        failureStage: "RECONCILE",
        failureMessage: "The persisted review is queued for GitHub reconciliation.",
        executionLeaseToken: reconciliationToken,
        executionLeaseOwner: "RECONCILER",
        executionLeaseExpiresAt: now,
      },
    });

    if (scheduled.count !== 1) {
      throw new ReviewStateConflictError(
        `Review ${reviewId} could not schedule reconciliation`,
      );
    }

    return {
      kind: "existing",
      reviewId: review.id,
      requestKey: review.requestKey,
      status: "FAILED",
    };
  }

  const now = dependencies.now();
  const queueLeaseToken = randomUUID();
  const originalFailureStage = canResumePersistedPosting &&
    (review.failureStage === "POST" || review.failureStage === "RECONCILE")
    ? review.failureStage
    : undefined;
  const retryPreparation = await dependencies.runReviewTrialTransaction(
    async (client) => {
      const credit = await dependencies.prepareTrialCreditForRetry(
        reviewId,
        client,
      );
      if (credit.kind !== "ready") return credit;

      const { attempt } = await retryFailedReviewExecution(
      {
        reviewId,
        attempt: review.attemptCount,
        queueLeaseToken,
        now,
        expectedTrialCreditState: credit.trialCreditState,
        preserveLastCompletedStage: canResumePersistedPosting,
      },
      client,
      );
      return { kind: "ready" as const, attempt, credit };
    },
    dependencies.prisma,
  );
  if (retryPreparation.kind === "rejected") {
    return {
      kind: "rejected",
      reason: retryPreparation.reason,
      message: retryPreparation.reason === "PLAN_RESTRICTED"
        ? "Review creation is available on the Pro plan only"
        : "The free AI code review trial has been exhausted",
    };
  }
  if (retryPreparation.kind === "conflict") {
    throw new ReviewStateConflictError(
      `Review ${reviewId} has an invalid trial credit state for retry`,
    );
  }

  const { attempt, credit } = retryPreparation;
  const retriedReview = {
    ...review,
    status: "PENDING" as const,
    attemptCount: attempt,
    trialCreditState: credit.trialCreditState,
  };

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
      resumeFromPersisted: canResumePersistedPosting,
    }),
    resultKind: "existing",
    ...(originalFailureStage ? { resumeFailureStage: originalFailureStage } : {}),
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
