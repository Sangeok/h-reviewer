import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../constants/flags", () => ({ FREE_REVIEW_TRIAL_ENABLED: true }));

import { createTestPrismaClient } from "@/lib/test/create-test-prisma-client";
import { transitionReviewExecution } from "@/features/review/lib/review-execution-state";

import {
  consumeTrialCredit,
  createReviewWithTrialReservation,
  releaseTrialCredit,
} from "./review-trial";

const prisma = process.env.TEST_DATABASE_URL
  ? createTestPrismaClient()
  : null;
const ownedUserIds: string[] = [];

type TestPrismaClient = ReturnType<typeof createTestPrismaClient>;

function createBarrier(participantCount: number): () => Promise<void> {
  let arrivedCount = 0;
  let releaseBarrier = (): void => {
    throw new Error("Barrier was released before initialization");
  };
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  return async (): Promise<void> => {
    arrivedCount += 1;
    if (arrivedCount === participantCount) releaseBarrier();
    await barrier;
  };
}

async function createConnectedClients(count: number): Promise<TestPrismaClient[]> {
  const clients = Array.from({ length: count }, () => createTestPrismaClient());
  await Promise.all(clients.map((client) => client.$connect()));
  return clients;
}

async function disconnectClients(clients: readonly TestPrismaClient[]): Promise<void> {
  await Promise.allSettled(clients.map((client) => client.$disconnect()));
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "review trial PostgreSQL concurrency",
  () => {
    beforeAll(async () => {
      await prisma?.$connect();
    });

    afterEach(async () => {
      if (!prisma || ownedUserIds.length === 0) return;
      await prisma.user.deleteMany({ where: { id: { in: [...ownedUserIds] } } });
      ownedUserIds.length = 0;
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("commits exactly five of six concurrent free review reservations", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const runId = randomUUID();
      const userId = `t08-trial-user-${runId}`;
      ownedUserIds.push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          name: "T08 Trial User",
          email: `t08-trial-${runId}@example.com`,
          emailVerified: true,
          subscriptionTier: "FREE",
          usage: {
            create: {
              repositoryCount: 6,
              reviewCounts: {},
              trialReviewCreditsUsed: 0,
            },
          },
          repositories: {
            create: Array.from({ length: 6 }, (_, index) => ({
              id: `t08-trial-repository-${index}-${runId}`,
              githubId: BigInt(`${Date.now()}${index}${Math.floor(Math.random() * 1000)}`),
              name: `sample-${index}`,
              owner: "octo",
              fullName: `octo/sample-${index}`,
              url: `https://github.com/octo/sample-${index}`,
            })),
          },
        },
      });

      const reservationClients = await createConnectedClients(6);
      let results: Awaited<ReturnType<typeof createReviewWithTrialReservation>>[];
      try {
        results = await Promise.all(
          reservationClients.map((client, index) =>
            createReviewWithTrialReservation(
              {
                userId,
                repositoryId: `t08-trial-repository-${index}-${runId}`,
                prNumber: 42,
                prTitle: `Concurrent trial ${index}`,
                prUrl: `https://github.com/octo/sample-${index}/pull/42`,
                headSha: `head-${index}`,
                githubAuthorId: `github-user-${runId}`,
                reviewType: "FULL_REVIEW",
                reviewMode: "FULL",
                requestSource: "AUTOMATIC",
                requestKey: `t08:${runId}:${index}`,
                langCode: "en",
                maxSuggestions: null,
                verificationEnabled: false,
                queueLeaseToken: randomUUID(),
                queueLeaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
              },
              client,
            ),
          ),
        );
      } finally {
        await disconnectClients(reservationClients);
      }

      expect(results.filter((result) => result.kind === "created")).toHaveLength(5);
      expect(results.filter((result) => result.kind === "rejected")).toEqual([
        { kind: "rejected", reason: "TRIAL_EXHAUSTED" },
      ]);
      await expect(
        prisma.userUsage.findUnique({
          where: { userId },
          select: { trialReviewCreditsUsed: true },
        }),
      ).resolves.toEqual({ trialReviewCreditsUsed: 5 });
      await expect(
        prisma.review.count({
          where: { repository: { userId }, trialCreditState: "RESERVED" },
        }),
      ).resolves.toBe(5);
    }, 60_000);

    it("commits either completion and consumption or failure and release as one transition", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const runId = randomUUID();
      const userId = `t08-credit-race-user-${runId}`;
      const repositoryId = `t08-credit-race-repository-${runId}`;
      const reviewId = `t08-credit-race-review-${runId}`;
      const leaseToken = randomUUID();
      const transitionTime = new Date();
      const postedAt = new Date(transitionTime.getTime() - 1_000);
      ownedUserIds.push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          name: "T08 Credit Race User",
          email: `t08-credit-race-${runId}@example.com`,
          emailVerified: true,
          subscriptionTier: "FREE",
          usage: {
            create: {
              repositoryCount: 1,
              reviewCounts: {},
              trialReviewCreditsUsed: 1,
            },
          },
          repositories: {
            create: {
              id: repositoryId,
              githubId: BigInt(`0x${runId.replaceAll("-", "").slice(0, 15)}`),
              name: "credit-race",
              owner: "octo",
              fullName: "octo/credit-race",
              url: "https://github.com/octo/credit-race",
              reviews: {
                create: {
                  id: reviewId,
                  prNumber: 42,
                  prTitle: "Credit transition race",
                  prUrl: "https://github.com/octo/credit-race/pull/42",
                  review: "Persisted review body",
                  requestKey: `t08-credit-race:${runId}`,
                  status: "POSTING",
                  attemptCount: 1,
                  lastCompletedStage: "PERSISTED",
                  executionLeaseToken: leaseToken,
                  executionLeaseOwner: "WORKER",
                  executionLeaseExpiresAt: new Date(
                    transitionTime.getTime() + 60_000,
                  ),
                  trialCreditState: "RESERVED",
                },
              },
            },
          },
        },
      });

      const [completionClient, failureClient] = await createConnectedClients(2);
      if (!completionClient || !failureClient) {
        throw new Error("Race clients were not initialized");
      }
      const waitForBothTransactions = createBarrier(2);

      try {
        const results = await Promise.allSettled([
          completionClient.$transaction(async (client) => {
            await waitForBothTransactions();
            await consumeTrialCredit(
              {
                reviewId,
                attempt: 1,
                leaseToken,
                leaseOwner: "WORKER",
                allowedStatuses: ["POSTING"],
                githubMainReviewId: `github-review-${runId}`,
                postedAt,
              },
              client,
            );
            await transitionReviewExecution(
              {
                reviewId,
                attempt: 1,
                leaseToken,
                leaseOwner: "WORKER",
                now: transitionTime,
                from: ["POSTING"],
                to: "COMPLETED",
              },
              client,
            );
          }),
          failureClient.$transaction(async (client) => {
            await waitForBothTransactions();
            await releaseTrialCredit(
              {
                reviewId,
                attempt: 1,
                leaseToken,
                leaseOwner: "WORKER",
                allowedStatuses: ["POSTING"],
              },
              client,
            );
            await transitionReviewExecution(
              {
                reviewId,
                attempt: 1,
                leaseToken,
                leaseOwner: "WORKER",
                now: transitionTime,
                from: ["POSTING"],
                to: "FAILED",
                failure: {
                  stage: "POST",
                  message: "GitHub post failed deterministically.",
                },
              },
              client,
            );
          }),
        ]);

        expect(results.filter((result) => result.status === "fulfilled"))
          .toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected"))
          .toHaveLength(1);
      } finally {
        await disconnectClients([completionClient, failureClient]);
      }

      const review = await prisma.review.findUnique({
        where: { id: reviewId },
        select: {
          status: true,
          trialCreditState: true,
          githubMainReviewId: true,
          githubMainPostedAt: true,
        },
      });
      const usage = await prisma.userUsage.findUnique({
        where: { userId },
        select: { trialReviewCreditsUsed: true },
      });

      if (review?.status === "COMPLETED") {
        expect(review).toEqual({
          status: "COMPLETED",
          trialCreditState: "CONSUMED",
          githubMainReviewId: `github-review-${runId}`,
          githubMainPostedAt: postedAt,
        });
        expect(usage).toEqual({ trialReviewCreditsUsed: 1 });
      } else {
        expect(review).toEqual({
          status: "FAILED",
          trialCreditState: "RELEASED",
          githubMainReviewId: null,
          githubMainPostedAt: null,
        });
        expect(usage).toEqual({ trialReviewCreditsUsed: 0 });
      }
    }, 30_000);
  },
);
