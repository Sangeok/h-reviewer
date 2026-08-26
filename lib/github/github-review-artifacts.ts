import { GITHUB_POST_TIMEOUT_MS } from "@/features/review/constants";

import { createOctokitClient } from "./github";

export type PostedGithubArtifact = {
  id: string;
  kind: "pull-request-review" | "review-comment" | "issue-comment";
  commitId: string | null;
  postedAt: Date;
};

export type FindGithubArtifactInput = {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  marker: string;
  expectedAuthorId: string;
  headSha: string;
};

function parseRequiredTimestamp(value: string | null | undefined): Date {
  if (!value) {
    throw new Error("GitHub artifact response is missing its timestamp");
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("GitHub artifact response has an invalid timestamp");
  }
  return timestamp;
}

function normalizeRequiredId(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim().length === 0) {
    throw new Error("GitHub artifact response is missing its ID");
  }
  return String(value);
}

function hasTrustedAuthorAndMarker(input: {
  authorId: string;
  body: string;
  expectedAuthorId: string;
  marker: string;
}): boolean {
  return (
    input.authorId === input.expectedAuthorId &&
    input.body.includes(input.marker)
  );
}

export async function findGithubPullRequestReviewArtifact(
  input: FindGithubArtifactInput,
): Promise<PostedGithubArtifact | null> {
  const octokit = createOctokitClient(input.token);
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner: input.owner,
    repo: input.repo,
    pull_number: input.prNumber,
    per_page: 100,
    request: { signal: AbortSignal.timeout(GITHUB_POST_TIMEOUT_MS) },
  });

  for (const review of reviews) {
    if (review.user?.id === undefined || review.user.id === null) continue;
    if (
      !hasTrustedAuthorAndMarker({
        authorId: String(review.user.id),
        body: review.body ?? "",
        expectedAuthorId: input.expectedAuthorId,
        marker: input.marker,
      }) ||
      review.commit_id !== input.headSha
    ) {
      continue;
    }
    return {
      id: normalizeRequiredId(review.id),
      kind: "pull-request-review",
      commitId: review.commit_id ?? null,
      postedAt: parseRequiredTimestamp(review.submitted_at),
    };
  }

  return null;
}

export async function findGithubReviewCommentArtifact(
  input: FindGithubArtifactInput,
): Promise<PostedGithubArtifact | null> {
  const octokit = createOctokitClient(input.token);
  const comments = await octokit.paginate(
    octokit.rest.pulls.listReviewComments,
    {
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
      per_page: 100,
      request: { signal: AbortSignal.timeout(GITHUB_POST_TIMEOUT_MS) },
    },
  );

  for (const comment of comments) {
    if (comment.user?.id === undefined || comment.user.id === null) continue;
    if (
      !hasTrustedAuthorAndMarker({
        authorId: String(comment.user.id),
        body: comment.body ?? "",
        expectedAuthorId: input.expectedAuthorId,
        marker: input.marker,
      }) ||
      comment.commit_id !== input.headSha
    ) {
      continue;
    }
    return {
      id: normalizeRequiredId(comment.id),
      kind: "review-comment",
      commitId: comment.commit_id ?? null,
      postedAt: parseRequiredTimestamp(comment.created_at),
    };
  }

  return null;
}

export async function findGithubIssueCommentArtifact(
  input: FindGithubArtifactInput,
): Promise<PostedGithubArtifact | null> {
  const octokit = createOctokitClient(input.token);
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: input.owner,
    repo: input.repo,
    issue_number: input.prNumber,
    per_page: 100,
    request: { signal: AbortSignal.timeout(GITHUB_POST_TIMEOUT_MS) },
  });

  for (const comment of comments) {
    if (comment.user?.id === undefined || comment.user.id === null) continue;
    if (
      !hasTrustedAuthorAndMarker({
        authorId: String(comment.user.id),
        body: comment.body ?? "",
        expectedAuthorId: input.expectedAuthorId,
        marker: input.marker,
      })
    ) {
      continue;
    }
    return {
      id: normalizeRequiredId(comment.id),
      kind: "issue-comment",
      commitId: null,
      postedAt: parseRequiredTimestamp(comment.created_at),
    };
  }

  return null;
}

export async function findGithubMainReviewArtifact(
  input: FindGithubArtifactInput,
): Promise<PostedGithubArtifact | null> {
  return (
    (await findGithubPullRequestReviewArtifact(input)) ??
    (await findGithubIssueCommentArtifact(input))
  );
}

export function isDeterministicGithubValidationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 422
  );
}
