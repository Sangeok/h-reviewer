import prisma from "@/lib/db";
import { GITHUB_PROVIDER_ID } from "../constants";

export type GetRepositoryWithTokenInput = {
  owner: string;
  repo: string;
};

export type RepositoryWithTokenResult = {
  repository: {
    id: string;
    user: {
      id: string;
      maxSuggestions: number | null;
      verificationEnabled: boolean;
    };
  };
  accessToken: string;
  githubAuthorId: string;
};

export async function getRepositoryWithToken(
  input: GetRepositoryWithTokenInput,
): Promise<RepositoryWithTokenResult> {
  const { owner, repo } = input;
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
            select: {
              accountId: true,
              accessToken: true,
            },
          },
        },
      },
    },
  });

  if (!repository) {
    throw new Error(`Repository ${owner}/${repo} not found`);
  }

  const githubAccount = repository.user.accounts.find(
    (account) =>
      Boolean(account.accessToken) && account.accountId.trim().length > 0,
  );

  if (!githubAccount?.accessToken || !githubAccount.accountId.trim()) {
    throw new Error("GitHub account identity and access token were not found");
  }

  return {
    repository: {
      id: repository.id,
      user: {
        id: repository.user.id,
        maxSuggestions: repository.user.maxSuggestions,
        verificationEnabled: repository.user.verificationEnabled,
      },
    },
    accessToken: githubAccount.accessToken,
    githubAuthorId: githubAccount.accountId,
  };
}
