import { randomUUID } from "node:crypto";

import { releaseTrialCredit } from "@/features/payment/lib/review-trial";
import prisma from "@/lib/db";
import type { ReviewExecutionStage, ReviewFailureStage } from "@/lib/generated/prisma/enums";

export type ReviewFailureEventInput = {
  event: {
    data: {
      event?: unknown;
      error?: unknown;
    };
  };
};

export type ReviewFailureHandlerDependencies = {
  prisma: typeof prisma;
  reviewType: "FULL_REVIEW" | "SUMMARY";
  releaseTrialCredit?: typeof releaseTrialCredit;
  now(): Date;
};

function parseOriginalReviewEvent(value: unknown): {
  reviewId: string;
  attempt: number;
} | null {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return null;
  }

  const data = value.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("reviewId" in data) ||
    typeof data.reviewId !== "string" ||
    !("attempt" in data) ||
    typeof data.attempt !== "number" ||
    !Number.isInteger(data.attempt)
  ) {
    return null;
  }

  return { reviewId: data.reviewId, attempt: data.attempt };
}

function getFailureStage(input: {
  status: "PENDING" | "RUNNING" | "POSTING";
  lastCompletedStage: ReviewExecutionStage | null;
}): ReviewFailureStage {
  if (input.status === "PENDING") return "QUEUE";
  if (input.status === "POSTING") return "POST";

  switch (input.lastCompletedStage) {
    case "FETCHED":
      return "GENERATE";
    case "GENERATED":
      return "VERIFY";
    case "VERIFIED":
      return "PERSIST";
    case "PERSISTED":
    case "MAIN_POSTED":
    case "INLINE_POSTED":
    case "VERIFICATION_POSTED":
      return "POST";
    default:
      return "FETCH";
  }
}

function normalizeFailureMessage(error: unknown): string {
  const summary: { name: string; status?: number; code?: string } = {
    name: error instanceof Error ? error.name : "UnknownError",
  };

  if (typeof error === "object" && error !== null) {
    if ("status" in error && typeof error.status === "number") {
      summary.status = error.status;
    }
    if (
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{1,64}$/.test(error.code)
    ) {
      summary.code = error.code;
    }
  }

  return JSON.stringify(summary).slice(0, 1_000);
}

export function createReviewFailureHandler(
  dependencies: ReviewFailureHandlerDependencies,
): (input: ReviewFailureEventInput) => Promise<void> {
  return async ({ event }): Promise<void> => {
    const originalEvent = parseOriginalReviewEvent(event.data.event);
    if (!originalEvent) return;

    const review = await dependencies.prisma.review.findUnique({
      where: { id: originalEvent.reviewId },
      select: {
        reviewType: true,
        status: true,
        attemptCount: true,
        executionLeaseToken: true,
        executionLeaseOwner: true,
        lastCompletedStage: true,
        trialCreditState: true,
      },
    });
    if (
      !review ||
      review.reviewType !== dependencies.reviewType ||
      review.attemptCount !== originalEvent.attempt ||
      review.status === "FAILED" ||
      review.status === "COMPLETED" ||
      review.status === "SUPERSEDED" ||
      !review.executionLeaseToken
    ) {
      return;
    }

    const expectedOwner = review.status === "PENDING" ? "QUEUE" : "WORKER";
    if (review.executionLeaseOwner !== expectedOwner) return;
    const executionLeaseToken = review.executionLeaseToken;

    const failureStage = getFailureStage({
      status: review.status,
      lastCompletedStage: review.lastCompletedStage,
    });
    const isAmbiguousPostFailure = failureStage === "POST";
    const now = dependencies.now();

    const failReview = async (
      client: Parameters<typeof releaseTrialCredit>[1] | typeof dependencies.prisma,
    ): Promise<void> => {
      if (review.trialCreditState === "RESERVED" && !isAmbiguousPostFailure) {
        await (dependencies.releaseTrialCredit ?? releaseTrialCredit)(
          {
            reviewId: originalEvent.reviewId,
            attempt: originalEvent.attempt,
            leaseToken: executionLeaseToken,
            leaseOwner: expectedOwner,
            allowedStatuses: [review.status],
          },
          client,
        );
      }

      const failed = await client.review.updateMany({
        where: {
          id: originalEvent.reviewId,
          reviewType: dependencies.reviewType,
          status: review.status,
          attemptCount: originalEvent.attempt,
          executionLeaseToken,
          executionLeaseOwner: expectedOwner,
        },
        data: {
          status: "FAILED",
          failureStage,
          failureMessage: normalizeFailureMessage(event.data.error),
          ...(isAmbiguousPostFailure
            ? {
                executionLeaseToken: randomUUID(),
                executionLeaseOwner: "RECONCILER" as const,
                executionLeaseExpiresAt: now,
              }
            : {
                executionLeaseToken: null,
                executionLeaseOwner: null,
                executionLeaseExpiresAt: null,
              }),
        },
      });
      if (failed.count !== 1) {
        throw new Error(
          `Review ${originalEvent.reviewId} failure handler lost its fence`,
        );
      }
    };

    if (review.trialCreditState === "RESERVED" && !isAmbiguousPostFailure) {
      await dependencies.prisma.$transaction((client) => failReview(client));
      return;
    }

    await failReview(dependencies.prisma);
  };
}
