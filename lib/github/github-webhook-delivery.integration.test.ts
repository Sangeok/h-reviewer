import { createHash, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createTestPrismaClient } from "@/lib/test/create-test-prisma-client";

import { acquireGithubWebhookDelivery } from "./github-webhook-delivery";

const prisma = process.env.TEST_DATABASE_URL
  ? createTestPrismaClient()
  : null;
const ownedDeliveryIds: string[] = [];

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "GitHub webhook delivery PostgreSQL concurrency",
  () => {
    beforeAll(async () => {
      await prisma?.$connect();
    });

    afterEach(async () => {
      if (!prisma || ownedDeliveryIds.length === 0) return;
      await prisma.githubWebhookDelivery.deleteMany({
        where: { deliveryId: { in: [...ownedDeliveryIds] } },
      });
      ownedDeliveryIds.length = 0;
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("allows exactly one concurrent acquire for one delivery ID", async () => {
      if (!prisma) throw new Error("Test Prisma client was not initialized");

      const deliveryId = `t04-delivery-${randomUUID()}`;
      ownedDeliveryIds.push(deliveryId);
      const rawBody = JSON.stringify({ action: "opened", number: 42 });
      const input = {
        deliveryId,
        payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
        event: "pull_request",
        action: "opened",
        now: new Date(),
      } as const;

      const results = await Promise.all([
        acquireGithubWebhookDelivery(input, prisma),
        acquireGithubWebhookDelivery(input, prisma),
      ]);

      expect(results.filter((result) => result.kind === "acquired")).toHaveLength(1);
      expect(results.filter((result) => result.kind === "processing")).toHaveLength(1);
      await expect(
        prisma.githubWebhookDelivery.count({ where: { deliveryId } }),
      ).resolves.toBe(1);
    });
  },
);
