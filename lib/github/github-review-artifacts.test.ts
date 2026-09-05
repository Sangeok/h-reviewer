import { beforeEach, describe, expect, it, vi } from "vitest";

const githubMocks = vi.hoisted(() => ({
  paginate: vi.fn(),
  listReviews: vi.fn(),
  listReviewComments: vi.fn(),
  listComments: vi.fn(),
}));

vi.mock("octokit", () => ({
  Octokit: vi.fn(() => ({
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

import { findGithubReviewArtifact } from "./github-review-artifacts";

const INPUT = {
  token: "github-token",
  owner: "octo",
  repo: "sample",
  prNumber: 42,
  marker: "<!-- hreviewer:review:review-1:main -->",
  expectedAuthorId: "99",
  expectedHeadSha: "head-sha",
};

describe("findGithubReviewArtifact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubMocks.paginate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
  });

  it("finds a trusted marker returned after pagination", async () => {
    githubMocks.paginate
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 101,
          body: INPUT.marker,
          commit_id: "head-sha",
          submitted_at: "2026-08-25T00:00:00Z",
          user: { id: 99 },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(findGithubReviewArtifact(INPUT)).resolves.toMatchObject({
      id: "101",
      kind: "pull-request-review",
      commitId: "head-sha",
      authorId: "99",
    });
    expect(githubMocks.paginate).toHaveBeenCalledTimes(3);
  });

  it("ignores copied markers and stale pull-request commit IDs", async () => {
    githubMocks.paginate
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 101,
          body: INPUT.marker,
          commit_id: "old-head",
          submitted_at: "2026-08-25T00:00:00Z",
          user: { id: 99 },
        },
        {
          id: 102,
          body: INPUT.marker,
          commit_id: "head-sha",
          submitted_at: "2026-08-25T00:00:00Z",
          user: { id: 77 },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(findGithubReviewArtifact(INPUT)).resolves.toBeNull();
  });

  it("accepts an author-matched issue-comment fallback without a commit ID", async () => {
    githubMocks.paginate
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 103,
          body: `Fallback\n${INPUT.marker}`,
          created_at: "2026-08-25T00:00:00Z",
          user: { id: 99 },
        },
      ]);

    await expect(findGithubReviewArtifact(INPUT)).resolves.toMatchObject({
      id: "103",
      kind: "issue-comment",
      commitId: null,
    });
  });

  it("rejects a trusted marker with a missing API timestamp", async () => {
    githubMocks.paginate
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 101,
          body: INPUT.marker,
          commit_id: "head-sha",
          submitted_at: null,
          user: { id: 99 },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(findGithubReviewArtifact(INPUT)).rejects.toThrow(
      "missing its API timestamp",
    );
  });
});
