"use server";

import prisma from "@/lib/db";
import { requireAuthSession } from "@/lib/server-utils";
import { createWebhook, deleteWebhook, getRepositories } from "@/lib/github";
import { canConnectRepository, incrementRepositoryCount } from "@/features/payment/lib/subscription";
import { isGitHubRepositoryDto, mapGitHubRepositoryDtoToRepository } from "../lib/map-github-repository";
import { disconnectRepositories } from "../lib/repository-disconnect";
import type { ConnectRepositoryParams, ConnectRepositoryResult, Repository } from "../types";

export async function getUserRepositories(page: number = 1, perPage: number = 10): Promise<Repository[]> {
  const session = await requireAuthSession();

  const githubRepos = await getRepositories(page, perPage);

  const dbRepos = await prisma.repository.findMany({
    where: {
      userId: session.user.id,
    },
  });

  const connectedRepoIds = new Set(dbRepos.map((repo) => repo.githubId));

  return githubRepos
    .filter(isGitHubRepositoryDto)
    .map((repository) => mapGitHubRepositoryDtoToRepository(repository, connectedRepoIds));
}

export async function connectRepository({
  owner,
  repo,
  githubId,
}: ConnectRepositoryParams): Promise<ConnectRepositoryResult> {
  const session = await requireAuthSession();
  const repositoryGithubId = BigInt(githubId);

  const existingRepository = await prisma.repository.findUnique({
    where: {
      githubId: repositoryGithubId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (existingRepository && existingRepository.userId === session.user.id) {
    return {
      status: "already_connected",
    };
  }

  if (existingRepository) {
    return { status: "error", error: "ALREADY_CONNECTED_BY_OTHER" };
  }

  const canConnect = await canConnectRepository(session.user.id);

  if (!canConnect) {
    return { status: "error", error: "QUOTA_EXCEEDED" };
  }

  await createWebhook({ owner, repo });

  try {
    await prisma.$transaction(async (transactionClient) => {
      await transactionClient.repository.create({
        data: {
          githubId: repositoryGithubId,
          name: repo,
          owner,
          fullName: `${owner}/${repo}`,
          url: `https://github.com/${owner}/${repo}`,
          userId: session.user.id,
        },
      });

      await incrementRepositoryCount(session.user.id, transactionClient);
    });
  } catch (error) {
    const repositoryAfterFailure = await prisma.repository.findUnique({
      where: {
        githubId: repositoryGithubId,
      },
      select: {
        userId: true,
      },
    });

    if (repositoryAfterFailure && repositoryAfterFailure.userId === session.user.id) {
      return {
        status: "already_connected",
      };
    }

    // Best-effort compensation for partial failure: rollback only when repository was not persisted.
    if (!repositoryAfterFailure) {
      try {
        await deleteWebhook({ owner, repo });
      } catch (rollbackError) {
        console.error("Failed to rollback webhook after repository connection failure", rollbackError);
      }
    }

    throw error;
  }

  return {
    status: "connected",
  };
}

export async function disconnectRepository(repositoryId: string, userId: string): Promise<void> {
  await disconnectRepositories({ userId, repositoryIds: [repositoryId] });
}

export async function disconnectAllRepositoriesInternal(userId: string): Promise<void> {
  await disconnectRepositories({ userId });
}
