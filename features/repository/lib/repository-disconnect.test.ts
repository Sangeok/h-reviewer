import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  disconnectRepositories,
  type RepositoryDisconnectDependencies,
} from "./repository-disconnect";

type DisconnectHarnessOptions = {
  hasActiveReview?: boolean;
  transactionConflictAfterMutation?: boolean;
};

function createDisconnectHarness(
  options: DisconnectHarnessOptions = {},
): {
  dependencies: RepositoryDisconnectDependencies;
  deleteWebhook: ReturnType<typeof vi.fn>;
  createWebhook: ReturnType<typeof vi.fn>;
  repositoryDeleteMany: ReturnType<typeof vi.fn>;
  usageUpdate: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
} {
  const repositories = [
    { id: "repository-1", owner: "octo", name: "alpha" },
    { id: "repository-2", owner: "octo", name: "beta" },
  ];
  const repositoryDeleteMany = vi.fn(async () => ({ count: repositories.length }));
  const usageUpdate = vi.fn(async () => ({ id: "usage-1" }));
  const transactionClient = {
    $queryRaw: vi.fn(async () => [{ id: "locked-row" }]),
    repository: {
      findMany: vi.fn(async () => repositories),
      deleteMany: repositoryDeleteMany,
    },
    userUsage: {
      upsert: vi.fn(async () => ({ id: "usage-1" })),
      findUnique: vi.fn(async () => ({ id: "usage-1", repositoryCount: 2 })),
      update: usageUpdate,
    },
    review: {
      findMany: vi.fn(async () => [{ id: "review-1" }]),
      findFirst: vi.fn(async () =>
        options.hasActiveReview ? { id: "review-1" } : null,
      ),
    },
  };
  let transactionAttempt = 0;
  const transaction = vi.fn(
    async (operation: (client: typeof transactionClient) => Promise<unknown>) => {
      transactionAttempt += 1;
      const result = await operation(transactionClient);
      if (options.transactionConflictAfterMutation && transactionAttempt === 1) {
        throw { code: "P2034" };
      }
      return result;
    },
  );
  const deleteWebhook = vi.fn(async () => "deleted" as const);
  const createWebhook = vi.fn(async () => "created" as const);

  return {
    dependencies: {
      prisma: { $transaction: transaction } as unknown as RepositoryDisconnectDependencies["prisma"],
      deleteWebhook,
      createWebhook,
      waitBeforeRetry: vi.fn(async () => undefined),
    },
    deleteWebhook,
    createWebhook,
    repositoryDeleteMany,
    usageUpdate,
    transaction,
  };
}

describe("disconnectRepositories", () => {
  it("blocks all webhook and database deletes when an active review exists", async () => {
    const harness = createDisconnectHarness({ hasActiveReview: true });

    await expect(
      disconnectRepositories({ userId: "user-1" }, harness.dependencies),
    ).rejects.toMatchObject({
      code: "ACTIVE_REVIEW",
    });

    expect(harness.deleteWebhook).not.toHaveBeenCalled();
    expect(harness.repositoryDeleteMany).not.toHaveBeenCalled();
    expect(harness.usageUpdate).not.toHaveBeenCalled();
  });

  it("deletes terminal-safe repositories and updates usage in one transaction", async () => {
    const harness = createDisconnectHarness();

    await expect(
      disconnectRepositories({ userId: "user-1" }, harness.dependencies),
    ).resolves.toEqual({ disconnectedCount: 2 });

    expect(harness.deleteWebhook).toHaveBeenNthCalledWith(1, {
      owner: "octo",
      repo: "alpha",
    });
    expect(harness.deleteWebhook).toHaveBeenNthCalledWith(2, {
      owner: "octo",
      repo: "beta",
    });
    expect(harness.repositoryDeleteMany).toHaveBeenCalledOnce();
    expect(harness.usageUpdate).toHaveBeenCalledWith({
      where: { id: "usage-1" },
      data: { repositoryCount: 0 },
    });
  });

  it("recreates only deleted webhooks before retrying a P2034 transaction", async () => {
    const harness = createDisconnectHarness({
      transactionConflictAfterMutation: true,
    });

    await expect(
      disconnectRepositories({ userId: "user-1" }, harness.dependencies),
    ).resolves.toEqual({ disconnectedCount: 2 });

    expect(harness.transaction).toHaveBeenCalledTimes(2);
    expect(harness.createWebhook).toHaveBeenCalledTimes(2);
    expect(harness.createWebhook).toHaveBeenCalledWith({
      owner: "octo",
      repo: "alpha",
    });
    expect(harness.createWebhook).toHaveBeenCalledWith({
      owner: "octo",
      repo: "beta",
    });
  });

  it("retries a PostgreSQL 40001 conflict wrapped by a raw Prisma query", async () => {
    const harness = createDisconnectHarness();
    harness.transaction.mockRejectedValueOnce({
      code: "P2010",
      meta: { code: "40001" },
    });

    await expect(
      disconnectRepositories({ userId: "user-1" }, harness.dependencies),
    ).resolves.toEqual({ disconnectedCount: 2 });
    expect(harness.transaction).toHaveBeenCalledTimes(2);
  });

  it("returns recovery-required without retry when compensation fails", async () => {
    const harness = createDisconnectHarness({
      transactionConflictAfterMutation: true,
    });
    harness.createWebhook.mockRejectedValue(new Error("compensation failed"));

    await expect(
      disconnectRepositories({ userId: "user-1" }, harness.dependencies),
    ).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });

    expect(harness.transaction).toHaveBeenCalledOnce();
  });
});
