import prisma from "@/lib/db";
import { requireAuthSession } from "@/lib/server-utils";
import { Octokit } from "octokit";

export interface DashboardGithubContext {
  userId: string;
  accessToken: string;
  username: string;
  octokit: Octokit;
}

export async function getDashboardGithubContext(): Promise<DashboardGithubContext> {
  const session = await requireAuthSession();
  const userId = session.user.id;

  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "github",
    },
    select: {
      accessToken: true,
    },
  });

  if (!account?.accessToken) {
    throw new Error("Github access token not found");
  }

  const accessToken = account.accessToken;
  const octokit = new Octokit({ auth: accessToken });
  const { data: user } = await octokit.rest.users.getAuthenticated();

  return {
    userId,
    accessToken,
    username: user.login,
    octokit,
  };
}
