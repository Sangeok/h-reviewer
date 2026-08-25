import { Octokit } from "octokit";
import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";

export async function getAuthenticatedGithubAccount(): Promise<{ userId: string; accessToken: string }> {
  const session = await requireAuthSession();
  const userId = session.user.id;

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github" },
    select: { accessToken: true },
  });

  if (!account?.accessToken) {
    throw new Error("Github access token not found");
  }

  return { userId, accessToken: account.accessToken };
}

// Getting the github access token
export const getGithubAccessToken = async () => {
  const { accessToken } = await getAuthenticatedGithubAccount();
  return accessToken;
};

/**
 * Create Octokit client instance with authentication token.
 * Centralizes Octokit initialization to avoid code duplication.
 */
export function createOctokitClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

export async function fetchUserContribution(token: string, username: string) {
  const octokit = createOctokitClient(token);

  const query = `
  query($username:String!){
    user(login:$username) {
        contributionsCollection {
            contributionCalendar {
                totalContributions
                weeks {
                    contributionDays {
                        contributionCount
                        contributionLevel
                        date
                        color
                    }
                }
            }
        }
    }
  }
  `;

  try {
    const response = await octokit.graphql<{
      user: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: number;
            weeks: {
              contributionDays: {
                contributionCount: number;
                contributionLevel: string;
                date: string;
                color: string;
              }[];
            }[];
          };
        };
      };
    }>(query, { username });
    return response.user.contributionsCollection.contributionCalendar;
  } catch (error) {
    console.error("Error fetching user contributions:", error);
    return null;
  }
}

export const getRepositories = async (page: number = 1, perPage: number = 10) => {
  const token = await getGithubAccessToken();
  const octokit = createOctokitClient(token);

  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "updated",
    direction: "desc",
    visibility: "all",
    per_page: perPage,
    page: page,
  });

  return data;
};

export const createWebhook = async (owner: string, repo: string) => {
  const token = await getGithubAccessToken();
  const octokit = createOctokitClient(token);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/webhooks/github`;

  const { data: hooks } = await octokit.rest.repos.listWebhooks({
    owner,
    repo,
  });

  const existingHook = hooks.find((hook) => hook.config.url === webhookUrl);

  if (existingHook) {
    return existingHook;
  }

  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret: process.env.GITHUB_WEBHOOK_SECRET,
    },
    events: ["pull_request", "issue_comment"],
  });

  return data;
};

export const deleteWebhook = async (owner: string, repo: string) => {
  const token = await getGithubAccessToken();
  const octokit = createOctokitClient(token);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/webhooks/github`;
  try {
    const { data: hooks } = await octokit.rest.repos.listWebhooks({
      owner,
      repo,
    });

    const hookToDelete = hooks.find((hook) => hook.config.url === webhookUrl);

    if (hookToDelete) {
      await octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: hookToDelete.id,
      });

      return true;
    }

    return false;
  } catch (error) {
    console.error("Error deleting webhook:", error);
    return false;
  }
};

interface GetPullRequestDiffParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
}

export type PullRequestHeadRepository = {
  owner: string;
  repo: string;
};

export type PullRequestDiffResult = {
  title: string;
  diff: string;
  description: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  baseSha: string;
  headSha: string;
  headBranch: string;
  headRepository: PullRequestHeadRepository | null;
  state: string;
  merged: boolean;
};

type GithubPullRequestDiffSnapshot = {
  title: string;
  body: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  updated_at: string;
  base: { sha: string };
  head: {
    sha: string;
    ref: string;
    repo: {
      name: string;
      owner?: { login: string } | null;
    } | null;
  };
  state: string;
  merged: boolean;
};

const MAX_PR_SNAPSHOT_ATTEMPTS = 2;

function mapPullRequestDiffResult(
  pullRequest: GithubPullRequestDiffSnapshot,
  diff: string,
): PullRequestDiffResult {
  const headOwner = pullRequest.head.repo?.owner?.login;

  return {
    title: pullRequest.title,
    diff,
    description: pullRequest.body || "",
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    changedFiles: pullRequest.changed_files,
    baseSha: pullRequest.base.sha,
    headSha: pullRequest.head.sha,
    headBranch: pullRequest.head.ref,
    headRepository: headOwner && pullRequest.head.repo
      ? {
          owner: headOwner,
          repo: pullRequest.head.repo.name,
        }
      : null,
    state: pullRequest.state,
    merged: pullRequest.merged,
  };
}

export type GetPullRequestSnapshotInput = {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
};

export type PullRequestSnapshotResult = {
  title: string;
  url: string;
  headSha: string;
  state: string;
  merged: boolean;
};

export async function getPullRequestSnapshot(
  input: GetPullRequestSnapshotInput,
): Promise<PullRequestSnapshotResult> {
  const { token, owner, repo, prNumber } = input;
  const octokit = createOctokitClient(token);
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    title: data.title,
    url: data.html_url,
    headSha: data.head.sha,
    state: data.state,
    merged: data.merged,
  };
}

export async function getPullRequestDiff(
  params: GetPullRequestDiffParams,
): Promise<PullRequestDiffResult> {
  const { token, owner, repo, prNumber } = params;
  const octokit = createOctokitClient(token);

  for (let attempt = 0; attempt < MAX_PR_SNAPSHOT_ATTEMPTS; attempt += 1) {
    const { data: before } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const { data: diff } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: {
        format: "diff",
      },
    });

    const { data: after } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const isStable =
      before.head.sha === after.head.sha &&
      before.base.sha === after.base.sha &&
      before.updated_at === after.updated_at;

    if (isStable) {
      return mapPullRequestDiffResult(
        after,
        diff as unknown as string,
      );
    }
  }

  throw new Error("Pull request changed while fetching a stable diff snapshot");
}

type GetRepositoryFileTreeParams = {
  token: string;
  owner: string;
  repo: string;
  commitSha: string;
  signal?: AbortSignal;
};

export type RepositoryTreeFile = {
  path: string;
  size: number | null;
};

export type RepositoryFileTree = {
  files: RepositoryTreeFile[];
  truncated: boolean;
};

export async function getRepositoryFileTree(
  params: GetRepositoryFileTreeParams,
): Promise<RepositoryFileTree> {
  const { token, owner, repo, commitSha, signal } = params;
  const octokit = createOctokitClient(token);

  const { data: commit } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: commitSha,
    ...(signal ? { request: { signal } } : {}),
  });

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: commit.commit.tree.sha,
    recursive: "true",
    ...(signal ? { request: { signal } } : {}),
  });

  return {
    files: tree.tree.flatMap((entry): RepositoryTreeFile[] => {
      if (entry.type !== "blob" || typeof entry.path !== "string") {
        return [];
      }

      return [{
        path: entry.path,
        size: typeof entry.size === "number" ? entry.size : null,
      }];
    }),
    truncated: Boolean(tree.truncated),
  };
}

interface GetFileContentParams {
  token: string;
  owner: string;
  repo: string;
  path: string;
  ref: string;
  signal?: AbortSignal;
}

export async function getFileContent(params: GetFileContentParams): Promise<{ content: string; sha: string } | null> {
  const { token, owner, repo, path, ref, signal } = params;
  const octokit = createOctokitClient(token);

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path, ref,
      ...(signal ? { request: { signal } } : {}),
    });

    if (Array.isArray(data) || data.type !== "file" || !data.content) {
      return null;
    }

    return {
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as NodeJS.ErrnoException & { status?: number }).status === 404) return null;
    throw error;
  }
}

interface CommitFileUpdateParams {
  token: string;
  owner: string;
  repo: string;
  path: string;
  content: string;
  fileSha: string;
  message: string;
  branch: string;
}

export async function commitFileUpdate(params: CommitFileUpdateParams): Promise<{ commitSha: string }> {
  const { token, owner, repo, path, content, fileSha, message, branch } = params;
  const octokit = createOctokitClient(token);

  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    sha: fileSha,
    branch,
  });

  return { commitSha: data.commit.sha ?? "" };
}

/**
 * get pull request head info
 * PR Head : The branch that this PR is from
 * PR Base : The branch that this PR is target to
 * 
 * PR의 head 정보를 가져온다.
 * PR Head : PR을 생성한 브랜치
 * PR Base : PR을 target으로 하는 브랜치
 */
export async function getPullRequestHeadInfo(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{
  branch: string;
  headSha: string;
  state: string;
  merged: boolean;
  headRepoOwner: string;
  headRepoName: string;
  isFork: boolean;
}> {
  const octokit = createOctokitClient(token);

  // Get a pull request information
  const { data: pr } = await octokit.rest.pulls.get({
    owner, repo, pull_number: prNumber,
  });

  const headRepo = pr.head.repo;

  // Check if the PR is from a fork
  const isFork = headRepo ? headRepo.full_name !== `${owner}/${repo}` : false;

  return {
    branch: pr.head.ref,
    headSha: pr.head.sha,
    state: pr.state,
    merged: pr.merged,
    headRepoOwner: headRepo?.owner?.login ?? owner,
    headRepoName: headRepo?.name ?? repo,
    isFork,
  };
}

interface GetCompareFilesParams {
  token: string;
  owner: string;
  repo: string;
  base: string;
  head: string;
}

export type CompareFile = {
  path: string;
  status: string;
  patch?: string;
};

export async function getCompareFiles(params: GetCompareFilesParams): Promise<CompareFile[]> {
  const { token, owner, repo, base, head } = params;
  const octokit = createOctokitClient(token);

  const { data } = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base,
    head,
  });

  return (data.files ?? []).map((file) => ({
    path: file.filename,
    status: file.status,
    patch: file.patch,
  }));
}

export async function postReviewComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  review: string,
  options?: {
    title?: string;
  }
) {
  const octokit = createOctokitClient(token);

  const title = options?.title ?? "AI Code Review";

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: `## ${title}\n\n${review}\n\n---\n*Generated by HReviewer*`,
  });
}
