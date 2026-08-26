import { beforeEach, describe, expect, it, vi } from "vitest";

const githubMocks = vi.hoisted(() => {
  const listReviews = vi.fn();
  const listReviewComments = vi.fn();
  const listComments = vi.fn();
  return {
    listReviews,
    listReviewComments,
    listComments,
    paginate: vi.fn(),
  };
});

vi.mock("@/lib/github/github", () => ({
  createOctokitClient: vi.fn(() => ({
    paginate: githubMocks.paginate,
    rest: {
      pulls: {
        listReviews: githubMocks.listReviews,
        listReviewComments: githubMocks.listReviewComments,
      },
      issues: { listComments: githubMocks.listComments },
    },
  })),
}));

import {
  findGithubIssueCommentArtifact,
  findGithubMainReviewArtifact,
  findGithubReviewCommentArtifact,
} from "./github-review-artifacts";

const INPUT = {
  token: "secret-token",
  owner: "octo",
  repo: "sample",
  prNumber: 42,
  marker: "<!-- hreviewer:review:review_1:main -->",
  expectedAuthorId: "99",
  headSha: "head-sha",
};

describe("GitHub review artifact lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubMocks.paginate.mockResolvedValue([]);
  });

  it("uses pagination and finds a trusted review beyond the first page", async () => {
    githubMocks.paginate.mockImplementation(async (endpoint) =>
      endpoint === githubMocks.listReviews
        ? [
            {
              id: 10,
              body: INPUT.marker,
              commit_id: "old-head",
              submitted_at: "2026-08-26T00:00:00Z",
              user: { id: 99 },
            },
            {
              id: 11,
              body: `review\n${INPUT.marker}`,
              commit_id: "head-sha",
              submitted_at: "2026-08-26T00:01:00Z",
              user: { id: 99 },
            },
          ]
        : [],
    );

    await expect(findGithubMainReviewArtifact(INPUT)).resolves.toEqual({
      id: "11",
      kind: "pull-request-review",
      commitId: "head-sha",
      postedAt: new Date("2026-08-26T00:01:00Z"),
    });
    expect(githubMocks.paginate).toHaveBeenCalledWith(
      githubMocks.listReviews,
      expect.objectContaining({ per_page: 100 }),
    );
  });

  it("ignores copied markers from another author or commit", async () => {
    githubMocks.paginate.mockResolvedValue([
      {
        id: 10,
        body: INPUT.marker,
        commit_id: "head-sha",
        created_at: "2026-08-26T00:00:00Z",
        user: { id: 100 },
      },
      {
        id: 11,
        body: INPUT.marker,
        commit_id: "old-head",
        created_at: "2026-08-26T00:00:00Z",
        user: { id: 99 },
      },
    ]);

    await expect(findGithubReviewCommentArtifact(INPUT)).resolves.toBeNull();
  });

  it("trusts issue comments by author and marker without inventing a commit", async () => {
    githubMocks.paginate.mockResolvedValue([
      {
        id: 12,
        body: INPUT.marker,
        created_at: "2026-08-26T00:02:00Z",
        user: { id: 99 },
      },
    ]);

    await expect(findGithubIssueCommentArtifact(INPUT)).resolves.toEqual({
      id: "12",
      kind: "issue-comment",
      commitId: null,
      postedAt: new Date("2026-08-26T00:02:00Z"),
    });
  });

  it("rejects a marker match with an invalid API timestamp", async () => {
    githubMocks.paginate.mockResolvedValue([
      {
        id: 12,
        body: INPUT.marker,
        created_at: "not-a-date",
        user: { id: 99 },
      },
    ]);

    await expect(findGithubIssueCommentArtifact(INPUT)).rejects.toThrow(
      "invalid timestamp",
    );
  });

  it("ignores invalid metadata on an untrusted marker copy", async () => {
    githubMocks.paginate.mockResolvedValue([
      {
        id: 12,
        body: INPUT.marker,
        created_at: "not-a-date",
        user: { id: 100 },
      },
    ]);

    await expect(findGithubIssueCommentArtifact(INPUT)).resolves.toBeNull();
  });
});
