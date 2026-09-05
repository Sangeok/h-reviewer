import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  consumeTrialCredit,
  createReviewWithTrialReservation,
  prepareTrialCreditForRetry,
  releaseTrialCredit,
  runReviewTrialTransaction,
} from "@/features/payment/lib/review-trial";
import {
  retryReviewRequest,
  type ReviewRequestDependencies,
} from "@/features/review/lib/review-request";
import { transitionReviewExecution } from "@/features/review/lib/review-execution-state";
import {
  createReconcileStaleReviewExecutionsHandler,
  type ReconcileReviewExecutionsDependencies,
  type ReconcileReviewExecutionsStep,
} from "@/inngest/functions/reconcile-stale-review-executions";
import { Prisma } from "@/lib/generated/prisma/client";
import { bindGithubWebhookDeliveryRequest } from "@/lib/github/github-webhook-delivery";
import { createTestPrismaClient } from "@/lib/test/create-test-prisma-client";

import {
  disconnectRepositories,
  type RepositoryDisconnectDependencies,
} from "./repository-disconnect";

const prisma = process.env.TEST_DATABASE_URL
  ? createTestPrismaClient()
  : null;
const ownedUserIds: string[] = [];

type TestPrismaClient = ReturnType<typeof createTestPrismaClient>;

type Deferred = {
  promise: Promise<void>;
  resolve(): void;
};

type ReviewFixtureKind =
  | "none"
  | "retryable-failed"
  | "reconcile-due"
  | "posting-reserved";

type RepositoryFixture = {
  userId: string;
  repositoryId: string;
  reviewId: string;
  leaseToken: string;
  githubAuthorId: string;
  owner: string;
  repo: string;
};

type CreateRepositoryFixtureInput = {
  client: TestPrismaClient;
  prefix: string;
  reviewKind: ReviewFixtureKind;
};

type SettleFailureOptions = {
  beforeMutation?: () => Promise<void>;
  beforeCommit?: () => Promise<void>;
};

type ReserveNewReviewInput = {
  client: TestPrismaClient;
  fixture: RepositoryFixture;
  requestKey: string;
};

function createDeferred(): Deferred {
  let resolvePromise = (): void => {
    throw new Error("Deferred resolved before initialization");
  };
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

async function createConnectedClient(): Promise<TestPrismaClient> {
  const client = createTestPrismaClient();
  await client.$connect();
  return client;
}

async function createRepositoryFixture({
  client,
  prefix,
  reviewKind,
}: CreateRepositoryFixtureInput): Promise<RepositoryFixture> {
  const runId = randomUUID();
  const userId = `${prefix}-user-${runId}`;
  const repositoryId = `${prefix}-repository-${runId}`;
  const reviewId = `${prefix}-review-${runId}`;
  const leaseToken = randomUUID();
  const githubAuthorId = `gh-${runId.replaceAll("-", "")}`;
  const owner = "octo";
  const repo = `${prefix}-${runId}`;
  const isReserved = reviewKind === "posting-reserved";
  const reviewData: Prisma.ReviewCreateWithoutRepositoryInput | undefined =
    reviewKind === "none"
      ? undefined
      : {
          id: reviewId,
          prNumber: 42,
          prTitle: `${prefix} review`,
          prUrl: `https://github.com/${owner}/${repo}/pull/42`,
          review: reviewKind === "retryable-failed" ? "" : "Persisted review body",
          requestKey: `${prefix}:${runId}`,
          reviewType: "FULL_REVIEW",
          status: reviewKind === "posting-reserved" ? "POSTING" : "FAILED",
          failureStage: reviewKind === "retryable-failed"
            ? "GENERATE"
            : reviewKind === "reconcile-due"
              ? "RECONCILE"
              : null,
          attemptCount: 1,
          headSha: `${prefix}-head-sha`,
          githubAuthorId,
          lastCompletedStage: reviewKind === "retryable-failed"
            ? null
            : "PERSISTED",
          executionLeaseToken: isReserved ? leaseToken : null,
          executionLeaseOwner: isReserved ? "WORKER" : null,
          executionLeaseExpiresAt: isReserved
            ? new Date(Date.now() + 60_000)
            : null,
          trialCreditState: isReserved ? "RESERVED" : "NOT_APPLICABLE",
        };

  ownedUserIds.push(userId);
  await client.user.create({
    data: {
      id: userId,
      name: `${prefix} User`,
      email: `${prefix}-${runId}@example.com`,
      emailVerified: true,
      subscriptionTier: isReserved ? "FREE" : "PRO",
      accounts: {
        create: {
          id: `${prefix}-account-${runId}`,
          accountId: githubAuthorId,
          providerId: "github",
          accessToken: "integration-token-not-used",
        },
      },
      usage: {
        create: {
          repositoryCount: 1,
          reviewCounts: {},
          trialReviewCreditsUsed: isReserved ? 1 : 0,
        },
      },
      repositories: {
        create: {
          id: repositoryId,
          githubId: BigInt(`0x${runId.replaceAll("-", "").slice(0, 15)}`),
          name: repo,
          owner,
          fullName: `${owner}/${repo}`,
          url: `https://github.com/${owner}/${repo}`,
          ...(reviewData ? { reviews: { create: reviewData } } : {}),
        },
      },
    },
  });

  return {
    userId,
    repositoryId,
    reviewId,
    leaseToken,
    githubAuthorId,
    owner,
    repo,
  };
}

function createDisconnectDependencies(
  client: TestPrismaClient,
  deleteWebhook: RepositoryDisconnectDependencies["deleteWebhook"] = vi.fn(
    async () => "absent" as const,
  ),
): RepositoryDisconnectDependencies {
  return {
    prisma: client,
    deleteWebhook,
    createWebhook: vi.fn(async () => "existing" as const),
    waitBeforeRetry: vi.fn(async () => undefined),
  };
}

function createReviewDependencies(
  client: TestPrismaClient,
  fixture: RepositoryFixture,
  overrides: Partial<ReviewRequestDependencies> = {},
): ReviewRequestDependencies {
  return {
    prisma: client,
    getRepositoryWithToken: vi.fn(async () => ({
      repository: {
        id: fixture.repositoryId,
        user: {
          id: fixture.userId,
          maxSuggestions: null,
          verificationEnabled: false,
        },
      },
      accessToken: "integration-token-not-used",
      githubAuthorId: fixture.githubAuthorId,
    })),
    getPullRequestSnapshot: vi.fn(async () => ({
      title: "Repository disconnect race",
      url: `https://github.com/${fixture.owner}/${fixture.repo}/pull/42`,
      headSha: `${fixture.repo}-new-head`,
      state: "open",
      merged: false,
    })),
    getUserLanguageByUserId: vi.fn(async (): Promise<"en"> => "en"),
    createReviewWithTrialReservation,
    prepareTrialCreditForRetry,
    releaseTrialCredit,
    runReviewTrialTransaction,
    bindGithubWebhookDeliveryRequest,
    sendEvent: vi.fn(async () => ({ ids: [randomUUID()] })),
    now: () => new Date(),
    ...overrides,
  };
}

function startHeldDisconnect(
  client: TestPrismaClient,
  fixture: RepositoryFixture,
): {
  promise: Promise<{ disconnectedCount: number }>;
  webhookDeleteStarted: Deferred;
  allowWebhookDelete: Deferred;
  deleteWebhook: ReturnType<typeof vi.fn>;
} {
  const webhookDeleteStarted = createDeferred();
  const allowWebhookDelete = createDeferred();
  const deleteWebhook = vi.fn(async () => {
    webhookDeleteStarted.resolve();
    await allowWebhookDelete.promise;
    return "absent" as const;
  });
  const promise = disconnectRepositories(
    { userId: fixture.userId, repositoryIds: [fixture.repositoryId] },
    createDisconnectDependencies(client, deleteWebhook),
  );

  return {
    promise,
    webhookDeleteStarted,
    allowWebhookDelete,
    deleteWebhook,
  };
}

function createReconcileStep(
  reconciliationStarted?: Deferred,
): ReconcileReviewExecutionsStep {
  return {
    async run<T>(id: string, handler: () => Promise<T> | T): Promise<T> {
      if (id.startsWith("reconcile-review-")) {
        reconciliationStarted?.resolve();
      }
      return handler();
    },
  };
}

async function settlePostingFailure(
  client: TestPrismaClient,
  fixture: RepositoryFixture,
  options: SettleFailureOptions = {},
): Promise<void> {
  await client.$transaction(
    async (transactionClient) => {
      await options.beforeMutation?.();
      const now = new Date();
      await releaseTrialCredit(
        {
          reviewId: fixture.reviewId,
          attempt: 1,
          leaseToken: fixture.leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["POSTING"],
        },
        transactionClient,
      );
      await transitionReviewExecution(
        {
          reviewId: fixture.reviewId,
          attempt: 1,
          leaseToken: fixture.leaseToken,
          leaseOwner: "WORKER",
          now,
          from: ["POSTING"],
          to: "FAILED",
          failure: {
            stage: "POST",
            message: "GitHub post failed deterministically.",
          },
        },
        transactionClient,
      );
      await options.beforeCommit?.();
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30_000,
    },
  );
}

async function reserveNewReview({
  client,
  fixture,
  requestKey,
}: ReserveNewReviewInput): Promise<Awaited<
  ReturnType<typeof createReviewWithTrialReservation>
>> {
  return createReviewWithTrialReservation(
    {
      userId: fixture.userId,
      repositoryId: fixture.repositoryId,
      prNumber: 42,
      prTitle: "Repository disconnect race",
      prUrl: `https://github.com/${fixture.owner}/${fixture.repo}/pull/42`,
      headSha: `${fixture.repo}-new-head`,
      githubAuthorId: fixture.githubAuthorId,
      reviewType: "FULL_REVIEW",
      reviewMode: "FULL",
      requestSource: "AUTOMATIC",
      requestKey,
      langCode: "en",
      maxSuggestions: null,
      verificationEnabled: false,
      queueLeaseToken: randomUUID(),
      queueLeaseExpiresAt: new Date(Date.now() + 60_000),
    },
    client,
  );
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "repository disconnect PostgreSQL guard",
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

    it("keeps an active review, repository, and usage untouched", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const runId = randomUUID();
      const userId = `t08-disconnect-user-${runId}`;
      const repositoryId = `t08-disconnect-repository-${runId}`;
      ownedUserIds.push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          name: "T08 Disconnect User",
          email: `t08-disconnect-${runId}@example.com`,
          emailVerified: true,
          usage: { create: { repositoryCount: 1, reviewCounts: {} } },
          repositories: {
            create: {
              id: repositoryId,
              githubId: BigInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`),
              name: "sample",
              owner: "octo",
              fullName: "octo/sample",
              url: "https://github.com/octo/sample",
              reviews: {
                create: {
                  prNumber: 42,
                  prTitle: "Active review",
                  prUrl: "https://github.com/octo/sample/pull/42",
                  review: "",
                  requestKey: `t08-disconnect:${runId}`,
                  status: "PENDING",
                  attemptCount: 1,
                  executionLeaseToken: randomUUID(),
                  executionLeaseOwner: "QUEUE",
                  executionLeaseExpiresAt: new Date(Date.now() + 60_000),
                  trialCreditState: "NOT_APPLICABLE",
                },
              },
            },
          },
        },
      });
      const deleteWebhook = vi.fn(async () => "absent" as const);
      const dependencies: RepositoryDisconnectDependencies = {
        prisma,
        deleteWebhook,
        createWebhook: vi.fn(async () => "existing" as const),
      };

      await expect(
        disconnectRepositories(
          { userId, repositoryIds: [repositoryId] },
          dependencies,
        ),
      ).rejects.toMatchObject({ code: "ACTIVE_REVIEW" });

      expect(deleteWebhook).not.toHaveBeenCalled();
      await expect(
        prisma.repository.count({ where: { id: repositoryId } }),
      ).resolves.toBe(1);
      await expect(
        prisma.userUsage.findUnique({
          where: { userId },
          select: { repositoryCount: true },
        }),
      ).resolves.toEqual({ repositoryCount: 1 });
    }, 15_000);

    it("lets a locked disconnect delete before a concurrent new reservation", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const fixture = await createRepositoryFixture({
        client: prisma,
        prefix: "t08-disconnect-first-request",
        reviewKind: "none",
      });
      const disconnectClient = await createConnectedClient();
      const requestClient = await createConnectedClient();
      const heldDisconnect = startHeldDisconnect(disconnectClient, fixture);

      try {
        await heldDisconnect.webhookDeleteStarted.promise;
        const reservationPromise = reserveNewReview({
          client: requestClient,
          fixture,
          requestKey: `disconnect-first-request:${randomUUID()}`,
        });
        const reservationExpectation = expect(reservationPromise).rejects
          .toMatchObject({ name: "ReviewStateConflictError" });

        heldDisconnect.allowWebhookDelete.resolve();

        await expect(heldDisconnect.promise).resolves.toEqual({
          disconnectedCount: 1,
        });
        await reservationExpectation;
      } finally {
        heldDisconnect.allowWebhookDelete.resolve();
        await Promise.allSettled([
          disconnectClient.$disconnect(),
          requestClient.$disconnect(),
        ]);
      }

      expect(heldDisconnect.deleteWebhook).toHaveBeenCalledOnce();
      await expect(
        prisma.repository.count({ where: { id: fixture.repositoryId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.review.count({ where: { repositoryId: fixture.repositoryId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.userUsage.findUnique({
          where: { userId: fixture.userId },
          select: { repositoryCount: true, trialReviewCreditsUsed: true },
        }),
      ).resolves.toEqual({ repositoryCount: 0, trialReviewCreditsUsed: 0 });
    }, 30_000);

    it("keeps a repository when a new reservation commits before disconnect", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const fixture = await createRepositoryFixture({
        client: prisma,
        prefix: "t08-request-first-disconnect",
        reviewKind: "none",
      });
      const requestClient = await createConnectedClient();
      const disconnectClient = await createConnectedClient();
      const reservationCommitted = createDeferred();
      const allowReservationReturn = createDeferred();
      const reservationPromise = (async () => {
        const result = await reserveNewReview({
          client: requestClient,
          fixture,
          requestKey: `request-first-disconnect:${randomUUID()}`,
        });
        reservationCommitted.resolve();
        await allowReservationReturn.promise;
        return result;
      })();
      const deleteWebhook = vi.fn(async () => "absent" as const);

      try {
        await reservationCommitted.promise;
        await expect(
          disconnectRepositories(
            {
              userId: fixture.userId,
              repositoryIds: [fixture.repositoryId],
            },
            createDisconnectDependencies(disconnectClient, deleteWebhook),
          ),
        ).rejects.toMatchObject({ code: "ACTIVE_REVIEW" });
        allowReservationReturn.resolve();
        await expect(reservationPromise).resolves.toMatchObject({ kind: "created" });
      } finally {
        allowReservationReturn.resolve();
        await Promise.allSettled([
          requestClient.$disconnect(),
          disconnectClient.$disconnect(),
        ]);
      }

      expect(deleteWebhook).not.toHaveBeenCalled();
      await expect(
        prisma.repository.count({ where: { id: fixture.repositoryId } }),
      ).resolves.toBe(1);
      await expect(
        prisma.review.findFirst({
          where: { repositoryId: fixture.repositoryId },
          select: { status: true, trialCreditState: true },
        }),
      ).resolves.toEqual({
        status: "PENDING",
        trialCreditState: "NOT_APPLICABLE",
      });
    }, 30_000);

    it("lets a locked disconnect delete before a concurrent retry transition", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const fixture = await createRepositoryFixture({
        client: prisma,
        prefix: "t08-disconnect-first-retry",
        reviewKind: "retryable-failed",
      });
      const disconnectClient = await createConnectedClient();
      const retryClient = await createConnectedClient();
      const heldDisconnect = startHeldDisconnect(disconnectClient, fixture);
      const retryPreparationStarted = createDeferred();
      const sendEvent = vi.fn(async () => ({ ids: [randomUUID()] }));
      const prepareConcurrentRetry: typeof prepareTrialCreditForRetry = async (
        reviewId,
        client,
      ) => {
        retryPreparationStarted.resolve();
        return prepareTrialCreditForRetry(reviewId, client);
      };
      const dependencies = createReviewDependencies(retryClient, fixture, {
        prepareTrialCreditForRetry: prepareConcurrentRetry,
        sendEvent,
      });

      try {
        await heldDisconnect.webhookDeleteStarted.promise;
        const retryPromise = retryReviewRequest(fixture.reviewId, dependencies);
        const retryExpectation = expect(retryPromise).rejects.toMatchObject({
          name: "ReviewStateConflictError",
        });
        await retryPreparationStarted.promise;

        heldDisconnect.allowWebhookDelete.resolve();

        await expect(heldDisconnect.promise).resolves.toEqual({
          disconnectedCount: 1,
        });
        await retryExpectation;
      } finally {
        heldDisconnect.allowWebhookDelete.resolve();
        await Promise.allSettled([
          disconnectClient.$disconnect(),
          retryClient.$disconnect(),
        ]);
      }

      expect(sendEvent).not.toHaveBeenCalled();
      await expect(
        prisma.repository.count({ where: { id: fixture.repositoryId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.review.count({ where: { id: fixture.reviewId } }),
      ).resolves.toBe(0);
    }, 30_000);

    it("keeps a repository when retry commits before disconnect", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const fixture = await createRepositoryFixture({
        client: prisma,
        prefix: "t08-retry-first-disconnect",
        reviewKind: "retryable-failed",
      });
      const retryClient = await createConnectedClient();
      const disconnectClient = await createConnectedClient();
      const retryPrepared = createDeferred();
      const allowRetryTransition = createDeferred();
      const sendEvent = vi.fn(async () => ({ ids: [randomUUID()] }));
      const prepareHeldRetry: typeof prepareTrialCreditForRetry = async (
        reviewId,
        client,
      ) => {
        const result = await prepareTrialCreditForRetry(reviewId, client);
        retryPrepared.resolve();
        await allowRetryTransition.promise;
        return result;
      };
      const dependencies = createReviewDependencies(retryClient, fixture, {
        prepareTrialCreditForRetry: prepareHeldRetry,
        sendEvent,
      });
      const retryPromise = retryReviewRequest(fixture.reviewId, dependencies);
      const deleteWebhook = vi.fn(async () => "absent" as const);

      try {
        await retryPrepared.promise;
        const disconnectPromise = disconnectRepositories(
          {
            userId: fixture.userId,
            repositoryIds: [fixture.repositoryId],
          },
          createDisconnectDependencies(disconnectClient, deleteWebhook),
        );
        const disconnectExpectation = expect(disconnectPromise).rejects
          .toMatchObject({ code: "ACTIVE_REVIEW" });
        allowRetryTransition.resolve();

        await expect(retryPromise).resolves.toMatchObject({
          kind: "existing",
          status: "PENDING",
        });
        await disconnectExpectation;
      } finally {
        allowRetryTransition.resolve();
        await Promise.allSettled([
          retryClient.$disconnect(),
          disconnectClient.$disconnect(),
        ]);
      }

      expect(sendEvent).toHaveBeenCalledOnce();
      expect(deleteWebhook).not.toHaveBeenCalled();
      await expect(
        prisma.review.findUnique({
          where: { id: fixture.reviewId },
          select: { status: true, attemptCount: true },
        }),
      ).resolves.toEqual({ status: "PENDING", attemptCount: 2 });
    }, 30_000);

    it("prevents a reconciler claim after disconnect locks a terminal-safe review", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const fixture = await createRepositoryFixture({
        client: prisma,
        prefix: "t08-disconnect-first-reconciler",
        reviewKind: "reconcile-due",
      });
      const disconnectClient = await createConnectedClient();
      const reconcileClient = await createConnectedClient();
      const heldDisconnect = startHeldDisconnect(disconnectClient, fixture);
      const reconciliationStarted = createDeferred();
      const findGithubReviewArtifact = vi.fn(async () => null);
      const dependencies: ReconcileReviewExecutionsDependencies = {
        prisma: reconcileClient,
        findGithubReviewArtifact,
        consumeTrialCredit,
        releaseTrialCredit,
        now: () => new Date(),
        createToken: randomUUID,
      };
      const handler = createReconcileStaleReviewExecutionsHandler(dependencies);

      try {
        await heldDisconnect.webhookDeleteStarted.promise;
        const reconciliationPromise = handler({
          step: createReconcileStep(reconciliationStarted),
        });
        await reconciliationStarted.promise;

        heldDisconnect.allowWebhookDelete.resolve();

        await expect(heldDisconnect.promise).resolves.toEqual({
          disconnectedCount: 1,
        });
        await reconciliationPromise;
      } finally {
        heldDisconnect.allowWebhookDelete.resolve();
        await Promise.allSettled([
          disconnectClient.$disconnect(),
          reconcileClient.$disconnect(),
        ]);
      }

      expect(findGithubReviewArtifact).not.toHaveBeenCalledWith(
        expect.objectContaining({ repo: fixture.repo }),
      );
      await expect(
        prisma.repository.count({ where: { id: fixture.repositoryId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.review.count({ where: { id: fixture.reviewId } }),
      ).resolves.toBe(0);
    }, 30_000);

    it("blocks disconnect after a reconciler claims an ambiguous review", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const fixture = await createRepositoryFixture({
        client: prisma,
        prefix: "t08-reconciler-first-disconnect",
        reviewKind: "reconcile-due",
      });
      const reconcileClient = await createConnectedClient();
      const disconnectClient = await createConnectedClient();
      const artifactLookupStarted = createDeferred();
      const allowArtifactLookup = createDeferred();
      const findGithubReviewArtifact = vi.fn(async (input) => {
        if (input.repo === fixture.repo) {
          artifactLookupStarted.resolve();
          await allowArtifactLookup.promise;
        }
        return null;
      });
      const dependencies: ReconcileReviewExecutionsDependencies = {
        prisma: reconcileClient,
        findGithubReviewArtifact,
        consumeTrialCredit,
        releaseTrialCredit,
        now: () => new Date(),
        createToken: randomUUID,
      };
      const handler = createReconcileStaleReviewExecutionsHandler(dependencies);
      const reconciliationPromise = handler({ step: createReconcileStep() });
      const deleteWebhook = vi.fn(async () => "absent" as const);

      try {
        await artifactLookupStarted.promise;
        await expect(
          disconnectRepositories(
            {
              userId: fixture.userId,
              repositoryIds: [fixture.repositoryId],
            },
            createDisconnectDependencies(disconnectClient, deleteWebhook),
          ),
        ).rejects.toMatchObject({ code: "ACTIVE_REVIEW" });
        allowArtifactLookup.resolve();
        await reconciliationPromise;
      } finally {
        allowArtifactLookup.resolve();
        await Promise.allSettled([
          reconcileClient.$disconnect(),
          disconnectClient.$disconnect(),
        ]);
      }

      expect(deleteWebhook).not.toHaveBeenCalled();
      await expect(
        prisma.review.findUnique({
          where: { id: fixture.reviewId },
          select: {
            status: true,
            executionLeaseOwner: true,
            githubMainReviewId: true,
          },
        }),
      ).resolves.toEqual({
        status: "FAILED",
        executionLeaseOwner: "RECONCILER",
        githubMainReviewId: null,
      });
    }, 30_000);

    it("deletes only after a concurrent terminal transition releases its credit", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const fixture = await createRepositoryFixture({
        client: prisma,
        prefix: "t08-terminal-first-disconnect",
        reviewKind: "posting-reserved",
      });
      const transitionClient = await createConnectedClient();
      const disconnectClient = await createConnectedClient();
      const transitionReadyToCommit = createDeferred();
      const allowTransitionCommit = createDeferred();
      const transitionPromise = settlePostingFailure(transitionClient, fixture, {
        beforeCommit: async () => {
          transitionReadyToCommit.resolve();
          await allowTransitionCommit.promise;
        },
      });
      const deleteWebhook = vi.fn(async () => "absent" as const);

      try {
        await transitionReadyToCommit.promise;
        const disconnectPromise = disconnectRepositories(
          {
            userId: fixture.userId,
            repositoryIds: [fixture.repositoryId],
          },
          createDisconnectDependencies(disconnectClient, deleteWebhook),
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        allowTransitionCommit.resolve();

        await expect(transitionPromise).resolves.toBeUndefined();
        await expect(disconnectPromise).resolves.toEqual({ disconnectedCount: 1 });
      } finally {
        allowTransitionCommit.resolve();
        await Promise.allSettled([
          transitionClient.$disconnect(),
          disconnectClient.$disconnect(),
        ]);
      }

      expect(deleteWebhook).toHaveBeenCalledOnce();
      await expect(
        prisma.repository.count({ where: { id: fixture.repositoryId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.review.count({ where: { id: fixture.reviewId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.userUsage.findUnique({
          where: { userId: fixture.userId },
          select: { repositoryCount: true, trialReviewCreditsUsed: true },
        }),
      ).resolves.toEqual({ repositoryCount: 0, trialReviewCreditsUsed: 0 });
    }, 30_000);

    it("rejects disconnect when it evaluates before a concurrent terminal transition", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const fixture = await createRepositoryFixture({
        client: prisma,
        prefix: "t08-disconnect-first-terminal",
        reviewKind: "posting-reserved",
      });
      const transitionClient = await createConnectedClient();
      const disconnectClient = await createConnectedClient();
      const transitionStarted = createDeferred();
      const allowTransitionMutation = createDeferred();
      const transitionPromise = settlePostingFailure(transitionClient, fixture, {
        beforeMutation: async () => {
          transitionStarted.resolve();
          await allowTransitionMutation.promise;
        },
      });
      const deleteWebhook = vi.fn(async () => "absent" as const);

      try {
        await transitionStarted.promise;
        await expect(
          disconnectRepositories(
            {
              userId: fixture.userId,
              repositoryIds: [fixture.repositoryId],
            },
            createDisconnectDependencies(disconnectClient, deleteWebhook),
          ),
        ).rejects.toMatchObject({ code: "ACTIVE_REVIEW" });
        allowTransitionMutation.resolve();
        await expect(transitionPromise).resolves.toBeUndefined();
      } finally {
        allowTransitionMutation.resolve();
        await Promise.allSettled([
          transitionClient.$disconnect(),
          disconnectClient.$disconnect(),
        ]);
      }

      expect(deleteWebhook).not.toHaveBeenCalled();
      await expect(
        prisma.review.findUnique({
          where: { id: fixture.reviewId },
          select: { status: true, trialCreditState: true },
        }),
      ).resolves.toEqual({ status: "FAILED", trialCreditState: "RELEASED" });
      await expect(
        prisma.userUsage.findUnique({
          where: { userId: fixture.userId },
          select: { repositoryCount: true, trialReviewCreditsUsed: true },
        }),
      ).resolves.toEqual({ repositoryCount: 1, trialReviewCreditsUsed: 0 });
    }, 30_000);
  },
);
