"use server";

import prisma from "@/lib/db";
import { requireAuthSession } from "@/lib/server-utils";
import { createWebhook, getRepositories } from "@/module/github";
import { inngest } from "@/inngest/client";
import {
  canConnectRepository,
  decrementRepositoryCount,
  incrementRepositoryCount,
} from "@/module/payment/lib/subscription";

export const getUserRepositories = async (page: number = 1, perPage: number = 10) => {
  const session = await requireAuthSession();

  const githubRepos = await getRepositories(page, perPage);

  const dbRepos = await prisma.repository.findMany({
    where: {
      userId: session.user.id,
    },
  });

  const connectedRepoIds = new Set(dbRepos.map((repo) => repo.githubId));

  return githubRepos.map((repo: any) => ({
    ...repo,
    isConnected: connectedRepoIds.has(BigInt(repo.id)),
  }));
};

export const connectRepository = async (owner: string, repo: string, githubId: number) => {
  const session = await requireAuthSession();

  const canConnect = await canConnectRepository(session.user.id);

  if (!canConnect) {
    throw new Error("You have reached the maximum number of repositories");
  }

  const webhook = await createWebhook(owner, repo);

  if (webhook) {
    await prisma.repository.create({
      data: {
        githubId: BigInt(githubId),
        name: repo,
        owner,
        fullName: `${owner}/${repo}`,
        url: `https://github.com/${owner}/${repo}`,
        userId: session.user.id,
      },
    });

    await incrementRepositoryCount(session.user.id);

    try {
      await inngest.send({
        name: "repository.connected",
        data: {
          owner,
          repo,
          userId: session.user.id,
        },
      });
    } catch (error) {
      console.error("Failed to trigger repository indexing", error);
    }
  }

  return webhook;
};
