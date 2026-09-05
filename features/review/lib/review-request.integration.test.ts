import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createTestPrismaClient } from "@/lib/test/create-test-prisma-client";
import {
  createReviewWithTrialReservation,
  prepareTrialCreditForRetry,
  releaseTrialCredit,
  runReviewTrialTransaction,
} from "@/features/payment/lib/review-trial";
import {
  acquireGithubWebhookDelivery,
  bindGithubWebhookDeliveryRequest,
} from "@/lib/github/github-webhook-delivery";

import {
  createReviewRequest,
  type ReviewRequestDependencies,
} from "./review-request";

const prisma = process.env.TEST_DATABASE_URL
  ? createTestPrismaClient()
  : null;
const ownedUserIds: string[] = [];
const ownedDeliveryIds: string[] = [];

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "review request PostgreSQL concurrency",
  () => {
    beforeAll(async () => {
      await prisma?.$connect();
    });

    afterEach(async () => {
      if (!prisma) return;
      if (ownedDeliveryIds.length > 0) {
        await prisma.githubWebhookDelivery.deleteMany({
          where: { deliveryId: { in: [...ownedDeliveryIds] } },
        });
      }
      if (ownedUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: [...ownedUserIds] } } });
      }
      ownedUserIds.length = 0;
      ownedDeliveryIds.length = 0;
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("converges concurrent identical requests to one review and one event", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const runId = randomUUID();
      const userId = `t03-user-${runId}`;
      const repositoryId = `t03-repository-${runId}`;
      ownedUserIds.push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          name: "T03 Integration User",
          email: `t03-${runId}@example.com`,
          emailVerified: true,
          subscriptionTier: "PRO",
          accounts: {
            create: {
              id: `t03-account-${runId}`,
              accountId: `github-user-${runId}`,
              providerId: "github",
              accessToken: "integration-token-not-used",
            },
          },
          repositories: {
            create: {
              id: repositoryId,
              githubId: BigInt(`9${Date.now()}${Math.floor(Math.random() * 1000)}`),
              name: `sample-${runId}`,
              owner: "octo",
              fullName: `octo/sample-${runId}`,
              url: `https://github.com/octo/sample-${runId}`,
            },
          },
        },
      });

      const sendEvent = vi.fn(async () => ({ ids: [randomUUID()] }));
      const dependencies: ReviewRequestDependencies = {
        prisma,
        getRepositoryWithToken: vi.fn(async () => ({
          repository: {
            id: repositoryId,
            user: {
              id: userId,
              maxSuggestions: null,
              verificationEnabled: false,
            },
          },
          accessToken: "integration-token-not-used",
          githubAuthorId: `github-user-${runId}`,
        })),
        getPullRequestSnapshot: vi.fn(async () => ({
          title: "Concurrent request",
          url: `https://github.com/octo/sample-${runId}/pull/42`,
          headSha: "concurrent-head-sha",
          state: "open",
          merged: false,
        })),
        getUserLanguageByUserId: vi.fn(async (): Promise<"en"> => "en"),
        createReviewWithTrialReservation,
        prepareTrialCreditForRetry,
        releaseTrialCredit,
        runReviewTrialTransaction,
        bindGithubWebhookDeliveryRequest,
        sendEvent,
        now: () => new Date(),
      };
      const input = {
        owner: "octo",
        repo: `sample-${runId}`,
        prNumber: 42,
        reviewType: "FULL_REVIEW",
        reviewMode: "FULL",
        requestSource: "AUTOMATIC",
        dispatchMode: "DIRECT",
      } as const;

      const results = await Promise.all([
        createReviewRequest(input, dependencies),
        createReviewRequest(input, dependencies),
      ]);

      const reviews = await prisma.review.findMany({
        where: { repositoryId },
      });
      expect(reviews).toHaveLength(1);
      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(results.map((result) => result.kind).sort()).toEqual([
        "created",
        "existing",
      ]);
      expect(new Set(results.flatMap((result) =>
        "reviewId" in result ? [result.reviewId] : [],
      ))).toEqual(new Set([reviews[0]?.id]));
    }, 15_000);

    it("rolls back review creation when the delivery binding lease is lost", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const runId = randomUUID();
      const userId = `t04-user-${runId}`;
      const repositoryId = `t04-repository-${runId}`;
      const deliveryId = `t04-delivery-${runId}`;
      ownedUserIds.push(userId);
      ownedDeliveryIds.push(deliveryId);
      await prisma.user.create({
        data: {
          id: userId,
          name: "T04 Integration User",
          email: `t04-${runId}@example.com`,
          emailVerified: true,
          subscriptionTier: "PRO",
          accounts: {
            create: {
              id: `t04-account-${runId}`,
              accountId: `github-user-${runId}`,
              providerId: "github",
              accessToken: "integration-token-not-used",
            },
          },
          repositories: {
            create: {
              id: repositoryId,
              githubId: BigInt(`8${Date.now()}${Math.floor(Math.random() * 1000)}`),
              name: `sample-${runId}`,
              owner: "octo",
              fullName: `octo/sample-${runId}`,
              url: `https://github.com/octo/sample-${runId}`,
            },
          },
        },
      });
      const acquired = await acquireGithubWebhookDelivery(
        {
          deliveryId,
          payloadSha256: "a".repeat(64),
          event: "pull_request",
          action: "opened",
          now: new Date(),
        },
        prisma,
      );
      if (acquired.kind !== "acquired") throw new Error("Expected acquisition");

      const dependencies: ReviewRequestDependencies = {
        prisma,
        getRepositoryWithToken: vi.fn(async () => ({
          repository: {
            id: repositoryId,
            user: {
              id: userId,
              maxSuggestions: null,
              verificationEnabled: false,
            },
          },
          accessToken: "integration-token-not-used",
          githubAuthorId: `github-user-${runId}`,
        })),
        getPullRequestSnapshot: vi.fn(async () => ({
          title: "Atomic delivery binding",
          url: `https://github.com/octo/sample-${runId}/pull/42`,
          headSha: "atomic-head-sha",
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
      };

      await expect(
        createReviewRequest(
          {
            owner: "octo",
            repo: `sample-${runId}`,
            prNumber: 42,
            reviewType: "FULL_REVIEW",
            reviewMode: "FULL",
            requestSource: "AUTOMATIC",
            dispatchMode: "DIRECT",
            transportBinding: {
              kind: "GITHUB_WEBHOOK",
              deliveryRowId: acquired.deliveryRowId,
              leaseToken: "lost-delivery-lease",
            },
          },
          dependencies,
        ),
      ).rejects.toMatchObject({ code: "DELIVERY_BINDING_CONFLICT" });
      await expect(
        prisma.review.count({ where: { repositoryId } }),
      ).resolves.toBe(0);

      const created = await createReviewRequest(
        {
          owner: "octo",
          repo: `sample-${runId}`,
          prNumber: 42,
          reviewType: "FULL_REVIEW",
          reviewMode: "FULL",
          requestSource: "AUTOMATIC",
          dispatchMode: "DIRECT",
          transportBinding: {
            kind: "GITHUB_WEBHOOK",
            deliveryRowId: acquired.deliveryRowId,
            leaseToken: acquired.leaseToken,
          },
        },
        dependencies,
      );
      if (!("requestKey" in created)) throw new Error("Expected request key");

      await expect(
        prisma.githubWebhookDelivery.findUnique({
          where: { deliveryId },
          select: { requestKey: true },
        }),
      ).resolves.toEqual({ requestKey: created.requestKey });
    }, 15_000);
  },
);
