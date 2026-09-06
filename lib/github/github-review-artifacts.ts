import { Octokit } from "octokit";

import { GITHUB_POST_TIMEOUT_MS } from "@/features/review/constants";

export type PostedGithubArtifact = {
  id: string;
  kind: "pull-request-review" | "review-comment" | "issue-comment";
  commitId: string | null;
  postedAt: Date;
};

export type GithubReviewArtifact = PostedGithubArtifact & {
  body: string;
  authorId: string;
};

export class GithubArtifactNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubArtifactNormalizationError";
  }
}

type GithubArtifactTimestamp = string | null | undefined;

function normalizeTimestamp(value: GithubArtifactTimestamp): Date {
  if (!value) {
    throw new GithubArtifactNormalizationError(
      "GitHub artifact response is missing its API timestamp",
    );
  }

  const postedAt = new Date(value);
  if (Number.isNaN(postedAt.getTime())) {
    throw new GithubArtifactNormalizationError(
      "GitHub artifact response contains an invalid API timestamp",
    );
  }

  return postedAt;
}

function normalizeArtifactId(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim().length === 0) {
    throw new GithubArtifactNormalizationError(
      "GitHub artifact response is missing its ID",
    );
  }

  return String(value);
}

function normalizeAuthorId(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim().length === 0) {
    throw new GithubArtifactNormalizationError(
      "GitHub artifact response is missing its author ID",
    );
  }

  return String(value);
}

export function createPostedGithubArtifact(input: {
  id: string | number | null | undefined;
  kind: PostedGithubArtifact["kind"];
  commitId?: string | null;
  postedAt: GithubArtifactTimestamp;
}): PostedGithubArtifact {
  return {
    id: normalizeArtifactId(input.id),
    kind: input.kind,
    commitId: input.commitId ?? null,
    postedAt: normalizeTimestamp(input.postedAt),
  };
}

export type FindGithubReviewArtifactInput = {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  marker: string;
  expectedAuthorId: string;
  expectedHeadSha: string;
};

type PullRequestReview = Awaited<
  ReturnType<Octokit["rest"]["pulls"]["listReviews"]>
>["data"][number];

type PullRequestReviewComment = Awaited<
  ReturnType<Octokit["rest"]["pulls"]["listReviewComments"]>
>["data"][number];

type IssueComment = Awaited<
  ReturnType<Octokit["rest"]["issues"]["listComments"]>
>["data"][number];

function matchesTrustedArtifact(input: {
  body: string | null | undefined;
  marker: string;
  authorId: string | number | null | undefined;
  expectedAuthorId: string;
  commitId?: string | null;
  expectedHeadSha?: string;
}): boolean {
  if (!input.body?.includes(input.marker)) {
    return false;
  }
  if (input.authorId === null || input.authorId === undefined) {
    return false;
  }
  if (String(input.authorId) !== input.expectedAuthorId) {
    return false;
  }

  return input.expectedHeadSha === undefined
    ? true
    : input.commitId === input.expectedHeadSha;
}

function normalizePullRequestReview(
  review: PullRequestReview,
): GithubReviewArtifact {
  return {
    ...createPostedGithubArtifact({
      id: review.id,
      kind: "pull-request-review",
      commitId: review.commit_id,
      postedAt: review.submitted_at,
    }),
    body: review.body ?? "",
    authorId: normalizeAuthorId(review.user?.id),
  };
}

function normalizeReviewComment(
  comment: PullRequestReviewComment,
): GithubReviewArtifact {
  return {
    ...createPostedGithubArtifact({
      id: comment.id,
      kind: "review-comment",
      commitId: comment.commit_id,
      postedAt: comment.created_at,
    }),
    body: comment.body,
    authorId: normalizeAuthorId(comment.user?.id),
  };
}

function normalizeIssueComment(comment: IssueComment): GithubReviewArtifact {
  return {
    ...createPostedGithubArtifact({
      id: comment.id,
      kind: "issue-comment",
      postedAt: comment.created_at,
    }),
    body: comment.body ?? "",
    authorId: normalizeAuthorId(comment.user?.id),
  };
}

export async function findGithubReviewArtifact(
  input: FindGithubReviewArtifactInput,
): Promise<GithubReviewArtifact | null> {
  const octokit = new Octokit({ auth: input.token });
  const request = { signal: AbortSignal.timeout(GITHUB_POST_TIMEOUT_MS) };
  const [reviews, reviewComments, issueComments] = await Promise.all([
    octokit.paginate(octokit.rest.pulls.listReviews, {
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
      per_page: 100,
      request,
    }),
    octokit.paginate(octokit.rest.pulls.listReviewComments, {
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
      per_page: 100,
      request,
    }),
    octokit.paginate(octokit.rest.issues.listComments, {
      owner: input.owner,
      repo: input.repo,
      issue_number: input.prNumber,
      per_page: 100,
      request,
    }),
  ]);

  const review = reviews.find((candidate) =>
    matchesTrustedArtifact({
      body: candidate.body,
      marker: input.marker,
      authorId: candidate.user?.id,
      expectedAuthorId: input.expectedAuthorId,
      commitId: candidate.commit_id,
      expectedHeadSha: input.expectedHeadSha,
    }),
  );
  if (review) {
    return normalizePullRequestReview(review);
  }

  const reviewComment = reviewComments.find((candidate) =>
    matchesTrustedArtifact({
      body: candidate.body,
      marker: input.marker,
      authorId: candidate.user?.id,
      expectedAuthorId: input.expectedAuthorId,
      commitId: candidate.commit_id,
      expectedHeadSha: input.expectedHeadSha,
    }),
  );
  if (reviewComment) {
    return normalizeReviewComment(reviewComment);
  }

  const issueComment = issueComments.find((candidate) =>
    matchesTrustedArtifact({
      body: candidate.body,
      marker: input.marker,
      authorId: candidate.user?.id,
      expectedAuthorId: input.expectedAuthorId,
    }),
  );

  return issueComment ? normalizeIssueComment(issueComment) : null;
}
