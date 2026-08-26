import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const failureDbMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    review: {
      findUnique: failureDbMocks.findUnique,
      updateMany: failureDbMocks.updateMany,
    },
  },
}));

import type { PostedGithubArtifact } from "@/lib/github/github-review-artifacts";

import {
  createGenerateSummaryHandler,
  generateSummary,
  handleSummaryFailure,
  type SummaryWorkerEventData,
  type SummaryWorkerDependencies,
  type SummaryWorkerStep,
} from "./summary";

const NOW = new Date("2026-08-26T00:00:00Z");
const EVENT: SummaryWorkerEventData = { reviewId: "summary-1", attempt: 1 };
const ARTIFACT: PostedGithubArtifact = {
  id: "comment-1",
  kind: "issue-comment",
  commitId: null,
  postedAt: NOW,
};

function createStep(): { step: SummaryWorkerStep; ids: string[] } {
  const ids: string[] = [];
  return {
    ids,
    step: {
      async run<T>(id: string, handler: () => Promise<T> | T): Promise<T> {
        ids.push(id);
        return handler();
      },
    },
  };
}

function createHarness() {
  const state = {
    status: "PENDING" as "PENDING" | "RUNNING" | "POSTING" | "COMPLETED" | "FAILED" | "SUPERSEDED",
    attemptCount: 1,
    executionLeaseToken: "queue-token" as string | null,
    executionLeaseOwner: "QUEUE" as "QUEUE" | "WORKER" | "RECONCILER" | null,
    executionLeaseExpiresAt: new Date("2026-08-26T01:00:00Z") as Date | null,
    failureStage: null as string | null,
    lastCompletedStage: null as string | null,
    review: "",
    githubMainReviewId: null as string | null,
    githubMainPostedAt: null as Date | null,
    artifactLookupMissedAt: null as Date | null,
  };
  const updateMany = vi.fn(async ({ where, data }) => {
    const statuses =
      typeof where.status === "object" && where.status !== null && "in" in where.status
        ? where.status.in
        : [where.status];
    const matches =
      statuses.includes(state.status) &&
      (where.attemptCount === undefined || where.attemptCount === state.attemptCount) &&
      (where.executionLeaseToken === undefined ||
        (typeof where.executionLeaseToken === "object"
          ? state.executionLeaseToken !== null
          : where.executionLeaseToken === state.executionLeaseToken)) &&
      (where.executionLeaseOwner === undefined ||
        where.executionLeaseOwner === state.executionLeaseOwner);
    if (!matches) return { count: 0 };
    Object.assign(state, data);
    return { count: 1 };
  });
  const reviewUpdate = vi.fn(async ({ data }) => {
    Object.assign(state, data);
    return { id: "summary-1" };
  });
  const review = {
    updateMany,
    update: reviewUpdate,
    findUnique: vi.fn(async () => ({
      id: "summary-1",
      attemptCount: state.attemptCount,
      headSha: "head-sha",
      githubAuthorId: "github-user-1",
      langCode: "en",
      prNumber: 42,
      review: state.review,
      lastCompletedStage: state.lastCompletedStage,
      artifactLookupMissedAt: state.artifactLookupMissedAt,
      repository: { owner: "octo", name: "sample", userId: "user-1" },
    })),
  };
  const accountFindFirst = vi.fn(async () => ({ accessToken: "github-token" }));
  const postReviewComment = vi.fn(async () => ARTIFACT);
  const findGithubIssueCommentArtifact = vi.fn<
    () => Promise<PostedGithubArtifact | null>
  >(async () => null);
  const generateText = vi.fn(async () => ({ text: "Generated summary" }));
  const assertCurrentReviewHead = vi.fn(async () => undefined);
  const dependencies: SummaryWorkerDependencies = {
    prisma: {
      review,
      account: { findFirst: accountFindFirst },
      $transaction: vi.fn(async (callback) => callback({ review })),
    } as unknown as SummaryWorkerDependencies["prisma"],
    getPullRequestDiff: vi.fn(async () => ({
      title: "Improve docs",
      diff: "+documentation",
      description: "Documents behavior",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      baseSha: "base-sha",
      headSha: "head-sha",
      headBranch: "docs",
      headRepository: null,
      state: "open",
      merged: false,
    })),
    postReviewComment,
    findGithubIssueCommentArtifact,
    generateText: generateText as unknown as SummaryWorkerDependencies["generateText"],
    createGeneratorModel: vi.fn(() => "generator-model") as unknown as SummaryWorkerDependencies["createGeneratorModel"],
    assertCurrentReviewHead,
    now: () => NOW,
  };
  return {
    state,
    dependencies,
    mocks: {
      accountFindFirst,
      assertCurrentReviewHead,
      findGithubIssueCommentArtifact,
      generateText,
      postReviewComment,
      reviewUpdate,
    },
  };
}

async function run(
  dependencies: SummaryWorkerDependencies,
  event: SummaryWorkerEventData = EVENT,
): Promise<string[]> {
  const recorder = createStep();
  await createGenerateSummaryHandler(dependencies)({
    event: { data: event },
    step: recorder.step,
  });
  return recorder.ids;
}

describe("createGenerateSummaryHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists the canonical summary before marker lookup and posting", async () => {
    const { dependencies, state, mocks } = createHarness();

    const ids = await run(dependencies);

    expect(ids).toEqual([
      "claim-review",
      "load-review-request",
      "fetch-pr-data",
      "generate-ai-summary",
      "persist-summary-before-post",
      "load-persisted-summary",
      "post-comment",
      "complete-summary",
    ]);
    expect(mocks.reviewUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.postReviewComment.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.postReviewComment).toHaveBeenCalledWith({
      token: "github-token",
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      content: "Generated summary",
      marker: "<!-- hreviewer:review:summary-1:summary -->",
      title: "AI PR Summary",
    });
    expect(state).toMatchObject({
      status: "COMPLETED",
      review: "Generated summary",
      githubMainReviewId: "comment-1",
      lastCompletedStage: "MAIN_POSTED",
    });
  });

  it("does not repost when lookup finds the summary marker", async () => {
    const { dependencies, mocks } = createHarness();
    mocks.findGithubIssueCommentArtifact.mockResolvedValue(ARTIFACT);

    await run(dependencies);

    expect(mocks.postReviewComment).not.toHaveBeenCalled();
  });

  it("reuses persisted summary on POST recovery without AI", async () => {
    const { dependencies, state, mocks } = createHarness();
    state.review = "Persisted summary";
    state.lastCompletedStage = "PERSISTED";
    state.artifactLookupMissedAt = NOW;
    mocks.findGithubIssueCommentArtifact.mockResolvedValue(ARTIFACT);

    await run(dependencies);

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
    expect(state.status).toBe("COMPLETED");
  });

  it("does not post when the post guard detects a stale head", async () => {
    const { dependencies, mocks } = createHarness();
    mocks.assertCurrentReviewHead.mockRejectedValueOnce(new Error("stale head"));

    await expect(run(dependencies)).rejects.toThrow("stale head");
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
  });

  it("fails at PERSIST without posting an oversized summary", async () => {
    const { dependencies, state, mocks } = createHarness();
    mocks.generateText.mockResolvedValue({ text: "가".repeat(30_000) });

    await run(dependencies);

    expect(state).toMatchObject({ status: "FAILED", failureStage: "PERSIST" });
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
  });
});

describe("default summary worker composition", () => {
  it("registers terminal failure handling", () => {
    expect(generateSummary).toBeDefined();
    expect(generateSummary.opts.onFailure).toBeTypeOf("function");
  });

  it("uses the summary worker fence and does not overwrite terminal state", async () => {
    failureDbMocks.findUnique.mockResolvedValue({
      status: "COMPLETED",
      attemptCount: 1,
      executionLeaseToken: null,
      executionLeaseOwner: null,
      lastCompletedStage: "MAIN_POSTED",
    });

    await handleSummaryFailure({
      event: {
        data: { event: { data: { reviewId: "summary-1", attempt: 1 } } },
      },
      error: new Error("raw summary prompt"),
    });

    expect(failureDbMocks.updateMany).not.toHaveBeenCalled();
  });
});
