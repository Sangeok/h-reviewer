import { randomUUID } from "node:crypto";

import {
  REVIEW_ARTIFACT_ABSENCE_GRACE_MS,
  REVIEW_EXECUTION_LEASE_MS,
} from "@/features/review/constants";
import { buildReviewArtifactMarker } from "@/features/review/lib/review-artifact-marker";
import {
  consumeTrialCredit,
  releaseTrialCredit,
} from "@/features/payment/lib/review-trial";
import prisma from "@/lib/db";
import type { ReviewExecutionStage } from "@/lib/generated/prisma/enums";
import {
  findGithubReviewArtifact,
  type GithubReviewArtifact,
} from "@/lib/github/github-review-artifacts";

import { inngest } from "../client";

const MAX_RECONCILIATIONS_PER_RUN = 50;

export type ReconcileReviewExecutionsStep = {
  run<T>(id: string, handler: () => Promise<T> | T): Promise<T>;
};

export type ReconcileReviewExecutionsDependencies = {
  prisma: typeof prisma;
  findGithubReviewArtifact: typeof findGithubReviewArtifact;
  consumeTrialCredit: typeof consumeTrialCredit;
  releaseTrialCredit: typeof releaseTrialCredit;
  now(): Date;
  createToken(): string;
};

function hasPersistedStage(stage: ReviewExecutionStage | null): boolean {
  return stage !== null && [
    "PERSISTED",
    "MAIN_POSTED",
    "INLINE_POSTED",
    "VERIFICATION_POSTED",
  ].includes(stage);
}

function getLeaseExpiration(now: Date): Date {
  return new Date(now.getTime() + REVIEW_EXECUTION_LEASE_MS);
}

function getAbsenceGraceExpiration(now: Date): Date {
  return new Date(now.getTime() + REVIEW_ARTIFACT_ABSENCE_GRACE_MS);
}

export function createReconcileStaleReviewExecutionsHandler(
  dependencies: ReconcileReviewExecutionsDependencies,
): (input: { step: ReconcileReviewExecutionsStep }) => Promise<{ processed: number }> {
  return async ({ step }): Promise<{ processed: number }> => {
    const now = dependencies.now();
    const candidates = await step.run("load-stale-review-executions", () =>
      dependencies.prisma.review.findMany({
        where: {
          OR: [
            {
              status: { in: ["PENDING", "RUNNING", "POSTING"] },
              executionLeaseExpiresAt: { lte: now },
            },
            {
              status: "FAILED",
              failureStage: { in: ["POST", "RECONCILE"] },
              OR: [
                { review: { not: "" } },
                { trialCreditState: "RESERVED" },
              ],
              AND: [{
                OR: [
                  { executionLeaseExpiresAt: null },
                  { executionLeaseExpiresAt: { lte: now } },
                ],
              }],
            },
            {
              status: "SUPERSEDED",
              trialCreditState: "RESERVED",
              OR: [
                { executionLeaseExpiresAt: null },
                { executionLeaseExpiresAt: { lte: now } },
              ],
            },
          ],
        },
        orderBy: { updatedAt: "asc" },
        take: MAX_RECONCILIATIONS_PER_RUN,
        select: {
          id: true,
          status: true,
          attemptCount: true,
          reviewType: true,
          review: true,
          headSha: true,
          githubAuthorId: true,
          githubMainReviewId: true,
          githubMainPostedAt: true,
          artifactLookupMissedAt: true,
          lastCompletedStage: true,
          executionLeaseToken: true,
          executionLeaseExpiresAt: true,
          trialCreditState: true,
          repository: {
            select: { owner: true, name: true, userId: true },
          },
          prNumber: true,
        },
      }),
    );

    let processed = 0;
    for (const candidate of candidates) {
      const result = await step.run(`reconcile-review-${candidate.id}`, async () => {
        const leaseToken = dependencies.createToken();
        const claimed = await dependencies.prisma.review.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status,
            attemptCount: candidate.attemptCount,
            executionLeaseToken: candidate.executionLeaseToken,
            OR: [
              { executionLeaseExpiresAt: null },
              { executionLeaseExpiresAt: { lte: now } },
            ],
          },
          data: {
            executionLeaseToken: leaseToken,
            executionLeaseOwner: "RECONCILER",
            executionLeaseExpiresAt: getLeaseExpiration(now),
          },
        });
        if (claimed.count !== 1) return false;

        const settleWithoutLookup = async (): Promise<void> => {
          const canHavePosted =
            hasPersistedStage(candidate.lastCompletedStage) &&
            candidate.review.trim().length > 0;
          await dependencies.prisma.$transaction(async (transactionClient) => {
            if (candidate.trialCreditState === "RESERVED") {
              await dependencies.releaseTrialCredit(
                {
                  reviewId: candidate.id,
                  attempt: candidate.attemptCount,
                  leaseToken,
                  leaseOwner: "RECONCILER",
                  allowedStatuses: [candidate.status],
                },
                transactionClient,
              );
            }

            const settled = await transactionClient.review.updateMany({
              where: {
                id: candidate.id,
                status: candidate.status,
                attemptCount: candidate.attemptCount,
                executionLeaseToken: leaseToken,
                executionLeaseOwner: "RECONCILER",
              },
              data: {
                status: candidate.status === "SUPERSEDED" ? "SUPERSEDED" : "FAILED",
                failureStage: candidate.status === "SUPERSEDED"
                  ? null
                  : canHavePosted
                    ? "POST"
                    : "RECONCILE",
                failureMessage: candidate.status === "SUPERSEDED"
                  ? null
                  : canHavePosted
                    ? "The GitHub artifact could not be reconciled."
                    : "The review stopped before its content was persisted.",
                artifactLookupMissedAt: null,
                executionLeaseToken: null,
                executionLeaseOwner: null,
                executionLeaseExpiresAt: null,
              },
            });
            if (settled.count !== 1) {
              throw new Error(
                `Review ${candidate.id} reconciliation settlement lost its fence`,
              );
            }
          });
        };

        if (
          !hasPersistedStage(candidate.lastCompletedStage) ||
          candidate.review.trim().length === 0 ||
          !candidate.headSha ||
          !candidate.githubAuthorId
        ) {
          await settleWithoutLookup();
          return true;
        }

        let artifact: GithubReviewArtifact | null = null;
        if (candidate.githubMainReviewId && candidate.githubMainPostedAt) {
          artifact = {
            id: candidate.githubMainReviewId,
            kind: candidate.reviewType === "SUMMARY"
              ? "issue-comment"
              : "pull-request-review",
            commitId: candidate.reviewType === "SUMMARY" ? null : candidate.headSha,
            postedAt: candidate.githubMainPostedAt,
            body: candidate.review,
            authorId: candidate.githubAuthorId,
          };
        } else {
          const account = await dependencies.prisma.account.findFirst({
            where: {
              accountId: candidate.githubAuthorId,
              userId: candidate.repository.userId,
              providerId: "github",
            },
            select: { accessToken: true },
          });
          if (!account?.accessToken) {
            await settleWithoutLookup();
            return true;
          }

          try {
            artifact = await dependencies.findGithubReviewArtifact({
              token: account.accessToken,
              owner: candidate.repository.owner,
              repo: candidate.repository.name,
              prNumber: candidate.prNumber,
              marker: buildReviewArtifactMarker(
                candidate.id,
                candidate.reviewType === "SUMMARY" ? "summary" : "main",
              ),
              expectedAuthorId: candidate.githubAuthorId,
              expectedHeadSha: candidate.headSha,
            });
          } catch {
            await dependencies.prisma.review.updateMany({
              where: {
                id: candidate.id,
                status: candidate.status,
                attemptCount: candidate.attemptCount,
                executionLeaseToken: leaseToken,
                executionLeaseOwner: "RECONCILER",
              },
              data: { executionLeaseExpiresAt: getLeaseExpiration(now) },
            });
            return true;
          }
        }

        if (artifact) {
          await dependencies.prisma.$transaction(async (transactionClient) => {
            if (candidate.trialCreditState === "RESERVED") {
              await dependencies.consumeTrialCredit(
                {
                  reviewId: candidate.id,
                  attempt: candidate.attemptCount,
                  leaseToken,
                  leaseOwner: "RECONCILER",
                  allowedStatuses: [candidate.status],
                  githubMainReviewId: artifact.id,
                  postedAt: artifact.postedAt,
                },
                transactionClient,
              );
            }

            const completed = await transactionClient.review.updateMany({
              where: {
                id: candidate.id,
                status: candidate.status,
                attemptCount: candidate.attemptCount,
                review: { not: "" },
                executionLeaseToken: leaseToken,
                executionLeaseOwner: "RECONCILER",
              },
              data: {
                status: candidate.status === "SUPERSEDED" ? "SUPERSEDED" : "COMPLETED",
                failureStage: null,
                failureMessage: null,
                githubMainReviewId: artifact.id,
                githubMainPostedAt: artifact.postedAt,
                lastCompletedStage: "MAIN_POSTED",
                artifactLookupMissedAt: null,
                executionLeaseToken: null,
                executionLeaseOwner: null,
                executionLeaseExpiresAt: null,
              },
            });
            if (completed.count !== 1) {
              throw new Error(
                `Review ${candidate.id} artifact reconciliation lost its fence`,
              );
            }
          });
          return true;
        }

        if (candidate.artifactLookupMissedAt === null) {
          await dependencies.prisma.review.updateMany({
            where: {
              id: candidate.id,
              status: candidate.status,
              attemptCount: candidate.attemptCount,
              executionLeaseToken: leaseToken,
              executionLeaseOwner: "RECONCILER",
            },
            data: {
              artifactLookupMissedAt: now,
              executionLeaseExpiresAt: getAbsenceGraceExpiration(now),
            },
          });
          return true;
        }

        if (
          now.getTime() - candidate.artifactLookupMissedAt.getTime() <
          REVIEW_ARTIFACT_ABSENCE_GRACE_MS
        ) {
          await dependencies.prisma.review.updateMany({
            where: {
              id: candidate.id,
              status: candidate.status,
              attemptCount: candidate.attemptCount,
              executionLeaseToken: leaseToken,
              executionLeaseOwner: "RECONCILER",
            },
            data: {
              executionLeaseExpiresAt: new Date(
                candidate.artifactLookupMissedAt.getTime() +
                REVIEW_ARTIFACT_ABSENCE_GRACE_MS,
              ),
            },
          });
          return true;
        }

        await settleWithoutLookup();
        return true;
      });

      if (result) processed += 1;
    }

    return { processed };
  };
}

const defaultDependencies: ReconcileReviewExecutionsDependencies = {
  prisma,
  findGithubReviewArtifact,
  consumeTrialCredit,
  releaseTrialCredit,
  now: () => new Date(),
  createToken: randomUUID,
};

export const reconcileStaleReviewExecutions = inngest.createFunction(
  { id: "reconcile-stale-review-executions" },
  { cron: "*/10 * * * *" },
  createReconcileStaleReviewExecutionsHandler(defaultDependencies),
);
