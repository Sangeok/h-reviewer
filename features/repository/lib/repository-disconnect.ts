import "server-only";

import prisma from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  createWebhook,
  deleteWebhook,
  GithubWebhookMutationError,
} from "@/lib/github";

import { REPOSITORY_DISCONNECT_TRANSACTION_TIMEOUT_MS } from "../constants";

const MAX_SERIALIZATION_RETRIES = 3;
const SERIALIZATION_RETRY_BASE_DELAY_MS = 250;
const SERIALIZATION_RETRY_JITTER_MS = 5_000;

export type RepositoryDisconnectErrorCode =
  | "ACTIVE_REVIEW"
  | "NOT_FOUND"
  | "RECOVERY_REQUIRED"
  | "DISCONNECT_FAILED";

export class RepositoryDisconnectError extends Error {
  constructor(readonly code: RepositoryDisconnectErrorCode) {
    super("The repository could not be disconnected safely.");
    this.name = "RepositoryDisconnectError";
  }
}

export type DisconnectRepositoriesInput = {
  userId: string;
  repositoryIds?: readonly string[];
};

export type DisconnectRepositoriesResult = {
  disconnectedCount: number;
};

export type RepositoryDisconnectDependencies = {
  prisma: typeof prisma;
  deleteWebhook: typeof deleteWebhook;
  createWebhook: typeof createWebhook;
  waitBeforeRetry?: (retry: number) => Promise<void>;
};

type DisconnectRepositoryRecord = {
  id: string;
  owner: string;
  name: string;
};

function isSerializationConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "P2034") return true;
  if (!("meta" in error) || typeof error.meta !== "object" || !error.meta) {
    return false;
  }

  return "code" in error.meta && error.meta.code === "40001";
}

async function waitBeforeSerializationRetry(retry: number): Promise<void> {
  const exponentialDelay = SERIALIZATION_RETRY_BASE_DELAY_MS * 2 ** (retry - 1);
  const jitter = Math.floor(Math.random() * SERIALIZATION_RETRY_JITTER_MS);

  await new Promise((resolve) => setTimeout(resolve, exponentialDelay + jitter));
}

async function lockRepositoryRows(
  repositories: readonly DisconnectRepositoryRecord[],
  client: Prisma.TransactionClient,
): Promise<void> {
  for (const repository of repositories) {
    const locked = await client.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "repository" WHERE "id" = ${repository.id} FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new RepositoryDisconnectError("NOT_FOUND");
    }
  }
}

async function lockUserUsage(
  userId: string,
  client: Prisma.TransactionClient,
): Promise<{ id: string; repositoryCount: number }> {
  const usage = await client.userUsage.upsert({
    where: { userId },
    create: { userId, repositoryCount: 0, reviewCounts: {} },
    update: {},
    select: { id: true },
  });
  await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "user_usage" WHERE "id" = ${usage.id} FOR UPDATE`,
  );

  const lockedUsage = await client.userUsage.findUnique({
    where: { id: usage.id },
    select: { id: true, repositoryCount: true },
  });
  if (!lockedUsage) {
    throw new RepositoryDisconnectError("DISCONNECT_FAILED");
  }

  return lockedUsage;
}

async function lockAndAssertSafeReviews(
  repositoryIds: readonly string[],
  client: Prisma.TransactionClient,
): Promise<void> {
  const reviewIds = await client.review.findMany({
    where: { repositoryId: { in: [...repositoryIds] } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  for (const review of reviewIds) {
    await client.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "review" WHERE "id" = ${review.id} FOR UPDATE`,
    );
  }

  const activeReview = await client.review.findFirst({
    where: {
      repositoryId: { in: [...repositoryIds] },
      OR: [
        { status: { in: ["PENDING", "RUNNING", "POSTING"] } },
        { executionLeaseOwner: "RECONCILER" },
        { trialCreditState: "RESERVED" },
      ],
    },
    select: { id: true },
  });
  if (activeReview) {
    throw new RepositoryDisconnectError("ACTIVE_REVIEW");
  }
}

async function compensateDeletedWebhooks(
  repositories: readonly DisconnectRepositoryRecord[],
  dependencies: RepositoryDisconnectDependencies,
): Promise<boolean> {
  for (const repository of repositories) {
    try {
      await dependencies.createWebhook({
        owner: repository.owner,
        repo: repository.name,
      });
    } catch {
      console.error("Repository webhook compensation requires recovery", {
        code: "RECOVERY_REQUIRED",
        owner: repository.owner,
        repository: repository.name,
      });
      return false;
    }
  }

  return true;
}

function getRepositoryWhere(input: DisconnectRepositoriesInput): {
  userId: string;
  id?: { in: string[] };
} {
  const repositoryIds = input.repositoryIds
    ? [...new Set(input.repositoryIds)].sort()
    : undefined;
  return {
    userId: input.userId,
    ...(repositoryIds ? { id: { in: repositoryIds } } : {}),
  };
}

export async function disconnectRepositories(
  input: DisconnectRepositoriesInput,
  dependencies: RepositoryDisconnectDependencies = {
    prisma,
    deleteWebhook,
    createWebhook,
  },
): Promise<DisconnectRepositoriesResult> {
  const requestedRepositoryCount = input.repositoryIds
    ? new Set(input.repositoryIds).size
    : null;

  for (let retry = 0; retry <= MAX_SERIALIZATION_RETRIES; retry += 1) {
    const deletedWebhooks: DisconnectRepositoryRecord[] = [];

    try {
      return await dependencies.prisma.$transaction(
        async (client) => {
          const repositories = await client.repository.findMany({
            where: getRepositoryWhere(input),
            orderBy: { id: "asc" },
            select: { id: true, owner: true, name: true },
          });
          if (
            requestedRepositoryCount !== null &&
            repositories.length !== requestedRepositoryCount
          ) {
            throw new RepositoryDisconnectError("NOT_FOUND");
          }
          if (repositories.length === 0) {
            return { disconnectedCount: 0 };
          }

          await lockRepositoryRows(repositories, client);
          const usage = await lockUserUsage(input.userId, client);
          const repositoryIds = repositories.map((repository) => repository.id);
          await lockAndAssertSafeReviews(repositoryIds, client);

          for (const repository of repositories) {
            try {
              const result = await dependencies.deleteWebhook({
                owner: repository.owner,
                repo: repository.name,
              });
              if (result === "deleted") deletedWebhooks.push(repository);
            } catch (error) {
              if (
                error instanceof GithubWebhookMutationError &&
                error.mutationOccurred
              ) {
                deletedWebhooks.push(repository);
              }
              throw error;
            }
          }

          const deleted = await client.repository.deleteMany({
            where: {
              userId: input.userId,
              id: { in: repositoryIds },
            },
          });
          if (deleted.count !== repositories.length) {
            throw new RepositoryDisconnectError("DISCONNECT_FAILED");
          }

          await client.userUsage.update({
            where: { id: usage.id },
            data: {
              repositoryCount: Math.max(
                0,
                usage.repositoryCount - repositories.length,
              ),
            },
          });

          return { disconnectedCount: repositories.length };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: REPOSITORY_DISCONNECT_TRANSACTION_TIMEOUT_MS,
        },
      );
    } catch (error) {
      if (
        deletedWebhooks.length > 0 &&
        !(await compensateDeletedWebhooks(deletedWebhooks, dependencies))
      ) {
        throw new RepositoryDisconnectError("RECOVERY_REQUIRED");
      }

      if (isSerializationConflict(error) && retry < MAX_SERIALIZATION_RETRIES) {
        await (dependencies.waitBeforeRetry ?? waitBeforeSerializationRetry)(
          retry + 1,
        );
        continue;
      }
      if (error instanceof RepositoryDisconnectError) throw error;

      console.error("Repository disconnect failed", {
        code: error instanceof GithubWebhookMutationError
          ? error.code
          : "DISCONNECT_FAILED",
      });
      throw new RepositoryDisconnectError("DISCONNECT_FAILED");
    }
  }

  throw new RepositoryDisconnectError("DISCONNECT_FAILED");
}
