import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createTestPrismaClient } from "@/lib/test/create-test-prisma-client";

import {
  createReviewRequest,
  type ReviewRequestDependencies,
} from "./review-request";

const prisma = process.env.TEST_DATABASE_URL
  ? createTestPrismaClient()
  : null;
const ownedUserIds: string[] = [];

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "review request PostgreSQL concurrency",
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
        getUserTier: vi.fn(async (): Promise<"PRO"> => "PRO"),
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
    });
  },
);
