import prisma from "@/lib/db";
import type { ReviewStatus } from "@/lib/generated/prisma/enums";
import { getPullRequestHeadInfo } from "@/lib/github/github";

import {
  ReviewStateConflictError,
  transitionReviewExecution,
} from "./review-execution-state";

export type AssertCurrentReviewHeadInput = {
  reviewId: string;
  attempt: number;
  leaseToken: string;
  expectedHeadSha: string;
  allowedStatuses: readonly ReviewStatus[];
};

export class SupersededReviewError extends Error {
  constructor(reviewId: string) {
    super(`Review ${reviewId} no longer targets the current pull request head`);
    this.name = "SupersededReviewError";
  }
}

export async function assertCurrentReviewHead(
  input: AssertCurrentReviewHeadInput,
): Promise<void> {
  if (input.allowedStatuses.length === 0) {
    throw new ReviewStateConflictError(
      "At least one review status is required for a head guard",
    );
  }

  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: {
      status: true,
      attemptCount: true,
      headSha: true,
      githubAuthorId: true,
      executionLeaseExpiresAt: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
      prNumber: true,
      repository: {
        select: {
          owner: true,
          name: true,
          userId: true,
        },
      },
    },
  });
  const now = new Date();

  if (
    !review ||
    !input.allowedStatuses.includes(review.status) ||
    review.attemptCount !== input.attempt ||
    review.headSha !== input.expectedHeadSha ||
    review.executionLeaseToken !== input.leaseToken ||
    review.executionLeaseOwner !== "WORKER" ||
    review.executionLeaseExpiresAt === null ||
    review.executionLeaseExpiresAt <= now ||
    !review.githubAuthorId
  ) {
    throw new ReviewStateConflictError(
      `Review ${input.reviewId} head guard lost its execution fence`,
    );
  }

  const account = await prisma.account.findFirst({
    where: {
      accountId: review.githubAuthorId,
      userId: review.repository.userId,
      providerId: "github",
    },
    select: { accessToken: true },
  });

  if (!account?.accessToken) {
    throw new Error("The persisted GitHub account binding is unavailable");
  }

  const currentHead = await getPullRequestHeadInfo({
    token: account.accessToken,
    owner: review.repository.owner,
    repo: review.repository.name,
    prNumber: review.prNumber,
  });

  if (
    currentHead.headSha === input.expectedHeadSha &&
    currentHead.state === "open" &&
    !currentHead.merged
  ) {
    return;
  }

  await transitionReviewExecution(
    {
      reviewId: input.reviewId,
      attempt: input.attempt,
      leaseToken: input.leaseToken,
      leaseOwner: "WORKER",
      now: new Date(),
      from: input.allowedStatuses,
      to: "SUPERSEDED",
    },
    prisma,
  );

  throw new SupersededReviewError(input.reviewId);
}
