import prisma from "@/lib/db";
import { GITHUB_PROVIDER_ID } from "../constants";

export async function getRepositoryWithToken(owner: string, repo: string) {
  const repository = await prisma.repository.findFirst({
    where: {
      owner,
      name: repo,
    },
    include: {
      user: {
        include: {
          accounts: {
            where: {
              providerId: GITHUB_PROVIDER_ID,
            },
          },
        },
      },
    },
  });

  if (!repository) {
    throw new Error(`Repository ${owner}/${repo} not found`);
  }

  const githubAccount = repository.user.accounts[0];

  if (!githubAccount?.accessToken) {
    throw new Error("Github access token not found");
  }

  return {
    repository,
    accessToken: githubAccount.accessToken,
  };
}
