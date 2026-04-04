import { getAuthenticatedGithubAccount, createOctokitClient } from "@/module/github";
import type { DashboardGithubContext } from "../types";

export async function resolveAuthenticatedGithubContext(): Promise<DashboardGithubContext> {
  const { userId, accessToken } = await getAuthenticatedGithubAccount();
  const octokit = createOctokitClient(accessToken);
  const { data: user } = await octokit.rest.users.getAuthenticated();

  return { userId, accessToken, username: user.login, octokit };
}
