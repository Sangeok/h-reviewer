import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  reviewFindUnique: vi.fn(),
  accountFindFirst: vi.fn(),
  getPullRequestHeadInfo: vi.fn(),
  transitionReviewExecution: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    review: { findUnique: mocks.reviewFindUnique },
    account: { findFirst: mocks.accountFindFirst },
  },
}));

vi.mock("@/lib/github/github", () => ({
  getPullRequestHeadInfo: mocks.getPullRequestHeadInfo,
}));

vi.mock("./review-execution-state", () => ({
  ReviewStateConflictError: class ReviewStateConflictError extends Error {},
  transitionReviewExecution: mocks.transitionReviewExecution,
}));

import {
  assertCurrentReviewHead,
  SupersededReviewError,
} from "./review-head-guard";

const GUARD_INPUT = {
  reviewId: "review-1",
  attempt: 2,
  leaseToken: "worker-token-2",
  expectedHeadSha: "head-sha",
  allowedStatuses: ["RUNNING"] as const,
};

function createReviewFixture() {
  return {
    status: "RUNNING",
    attemptCount: 2,
    headSha: "head-sha",
    githubAuthorId: "github-user-1",
    executionLeaseExpiresAt: new Date(Date.now() + 60_000),
    executionLeaseToken: "worker-token-2",
    executionLeaseOwner: "WORKER",
    prNumber: 42,
    repository: {
      owner: "octo",
      name: "sample",
      userId: "user-1",
    },
  };
}

describe("assertCurrentReviewHead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reviewFindUnique.mockResolvedValue(createReviewFixture());
    mocks.accountFindFirst.mockResolvedValue({ accessToken: "github-token" });
    mocks.getPullRequestHeadInfo.mockResolvedValue({
      branch: "feature/head",
      headSha: "head-sha",
      state: "open",
      merged: false,
      headRepoOwner: "octo",
      headRepoName: "sample",
      isFork: false,
    });
    mocks.transitionReviewExecution.mockResolvedValue(undefined);
  });

  it("accepts only the exact persisted worker fence and current open head", async () => {
    await expect(assertCurrentReviewHead(GUARD_INPUT)).resolves.toBeUndefined();

    expect(mocks.accountFindFirst).toHaveBeenCalledWith({
      where: {
        accountId: "github-user-1",
        userId: "user-1",
        providerId: "github",
      },
      select: { accessToken: true },
    });
    expect(mocks.getPullRequestHeadInfo).toHaveBeenCalledWith({
      token: "github-token",
      owner: "octo",
      repo: "sample",
      prNumber: 42,
    });
    expect(mocks.transitionReviewExecution).not.toHaveBeenCalled();
  });

  it.each([
    ["a different head", { headSha: "new-head" }],
    ["a closed pull request", { state: "closed" }],
    ["a merged pull request", { merged: true }],
  ])("supersedes on %s", async (_label, overrides) => {
    mocks.getPullRequestHeadInfo.mockResolvedValue({
      branch: "feature/head",
      headSha: "head-sha",
      state: "open",
      merged: false,
      headRepoOwner: "octo",
      headRepoName: "sample",
      isFork: false,
      ...overrides,
    });

    await expect(assertCurrentReviewHead(GUARD_INPUT)).rejects.toBeInstanceOf(
      SupersededReviewError,
    );
    expect(mocks.transitionReviewExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewId: "review-1",
        attempt: 2,
        leaseToken: "worker-token-2",
        leaseOwner: "WORKER",
        from: ["RUNNING"],
        to: "SUPERSEDED",
      }),
      expect.objectContaining({ review: expect.any(Object) }),
    );
  });

  it("rejects a stale attempt before the GitHub API call", async () => {
    mocks.reviewFindUnique.mockResolvedValue({
      ...createReviewFixture(),
      attemptCount: 3,
    });

    await expect(assertCurrentReviewHead(GUARD_INPUT)).rejects.toThrow(
      "lost its execution fence",
    );
    expect(mocks.getPullRequestHeadInfo).not.toHaveBeenCalled();
    expect(mocks.transitionReviewExecution).not.toHaveBeenCalled();
  });

  it("propagates GitHub API failures without changing review state", async () => {
    const apiError = new Error("GitHub unavailable");
    mocks.getPullRequestHeadInfo.mockRejectedValue(apiError);

    await expect(assertCurrentReviewHead(GUARD_INPUT)).rejects.toBe(apiError);
    expect(mocks.transitionReviewExecution).not.toHaveBeenCalled();
  });
});
