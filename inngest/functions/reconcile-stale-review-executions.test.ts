import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PostedGithubArtifact } from "@/lib/github/github-review-artifacts";

import {
  createReconcileStaleReviewExecutionsHandler,
  type ReconcileStaleReviewExecutionsDependencies,
} from "./reconcile-stale-review-executions";

const NOW = new Date("2026-08-26T00:20:00Z");
const ARTIFACT: PostedGithubArtifact = {
  id: "github-review-1",
  kind: "pull-request-review",
  commitId: "head-sha",
  postedAt: new Date("2026-08-26T00:00:00Z"),
};

function createCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "review-1",
    status: "POSTING",
    attemptCount: 1,
    reviewType: "FULL_REVIEW",
    review: "Persisted canonical review",
    headSha: "head-sha",
    githubAuthorId: "github-user-1",
    lastCompletedStage: "PERSISTED",
    artifactLookupMissedAt: null,
    executionLeaseToken: "expired-worker-token",
    executionLeaseOwner: "WORKER",
    executionLeaseExpiresAt: new Date("2026-08-26T00:00:00Z"),
    prNumber: 42,
    repository: { owner: "octo", name: "sample", userId: "user-1" },
    ...overrides,
  };
}

function createHarness(candidate = createCandidate()) {
  const updateMany = vi.fn(
    async (input: { data?: Record<string, unknown> }) => {
      void input;
      return { count: 1 };
    },
  );
  const review = {
    findMany: vi.fn(async () => [candidate]),
    updateMany,
  };
  const findGithubMainReviewArtifact = vi.fn<
    () => Promise<PostedGithubArtifact | null>
  >(async () => ARTIFACT);
  const findGithubIssueCommentArtifact = vi.fn(async () => null);
  const dependencies = {
    prisma: {
      review,
      account: {
        findFirst: vi.fn(async () => ({ accessToken: "github-token" })),
      },
      $transaction: vi.fn(async (callback) => callback({ review })),
    },
    findGithubMainReviewArtifact,
    findGithubIssueCommentArtifact,
    now: () => NOW,
  } as unknown as ReconcileStaleReviewExecutionsDependencies;
  const step = {
    run: async <T,>(id: string, handler: () => Promise<T> | T): Promise<T> => {
      void id;
      return handler();
    },
  };
  return {
    dependencies,
    step,
    mocks: { findGithubMainReviewArtifact, review, updateMany },
  };
}

describe("reconcile stale review executions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims at most 50 oldest rows and atomically completes a marker match", async () => {
    const { dependencies, step, mocks } = createHarness();

    await createReconcileStaleReviewExecutionsHandler(dependencies)({ step });

    expect(mocks.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, orderBy: { updatedAt: "asc" } }),
    );
    expect(mocks.findGithubMainReviewArtifact).toHaveBeenCalledWith({
      token: "github-token",
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      marker: "<!-- hreviewer:review:review-1:main -->",
      expectedAuthorId: "github-user-1",
      headSha: "head-sha",
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          githubMainReviewId: "github-review-1",
          lastCompletedStage: "MAIN_POSTED",
        }),
      }),
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("does not look up or settle when another reconciler wins the lease CAS", async () => {
    const { dependencies, step, mocks } = createHarness();
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    await createReconcileStaleReviewExecutionsHandler(dependencies)({ step });

    expect(mocks.updateMany).toHaveBeenCalledOnce();
    expect(mocks.findGithubMainReviewArtifact).not.toHaveBeenCalled();
  });

  it("keeps the first negative lookup ambiguous until the grace lease", async () => {
    const { dependencies, step, mocks } = createHarness();
    mocks.findGithubMainReviewArtifact.mockResolvedValue(null);

    await createReconcileStaleReviewExecutionsHandler(dependencies)({ step });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          artifactLookupMissedAt: NOW,
          executionLeaseExpiresAt: new Date("2026-08-26T00:30:00Z"),
        }),
      }),
    );
    expect(
      mocks.updateMany.mock.calls.some(
        ([input]) => input.data?.status === "FAILED",
      ),
    ).toBe(false);
  });

  it("fails only after a second independently spaced marker miss", async () => {
    const candidate = createCandidate({
      artifactLookupMissedAt: new Date("2026-08-26T00:00:00Z"),
    });
    const { dependencies, step, mocks } = createHarness(candidate);
    mocks.findGithubMainReviewArtifact.mockResolvedValue(null);

    await createReconcileStaleReviewExecutionsHandler(dependencies)({ step });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          failureStage: "RECONCILE",
          artifactLookupMissedAt: null,
          executionLeaseToken: null,
        }),
      }),
    );
  });

  it("fails an expired pre-persistence PENDING row without GitHub lookup", async () => {
    const candidate = createCandidate({
      status: "PENDING",
      review: "",
      lastCompletedStage: "QUEUED",
      executionLeaseOwner: "QUEUE",
    });
    const { dependencies, step, mocks } = createHarness(candidate);

    await createReconcileStaleReviewExecutionsHandler(dependencies)({ step });

    expect(mocks.findGithubMainReviewArtifact).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          failureStage: "RECONCILE",
        }),
      }),
    );
  });

  it("extends only the reconciliation lease when GitHub lookup fails", async () => {
    const { dependencies, step, mocks } = createHarness();
    mocks.findGithubMainReviewArtifact.mockRejectedValue(new Error("network"));

    await createReconcileStaleReviewExecutionsHandler(dependencies)({ step });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          executionLeaseExpiresAt: new Date("2026-08-26T00:30:00Z"),
        },
      }),
    );
  });
});
