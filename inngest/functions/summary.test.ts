import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGenerateSummaryHandler,
  generateSummary,
  type SummaryWorkerDependencies,
  type SummaryWorkerStep,
} from "./summary";

const NOW = new Date("2026-08-25T00:00:00.000Z");
const SUMMARY_EVENT_DATA = {
  reviewId: "summary-1",
  attempt: 1,
} as const;

function createStepRecorder(): {
  step: SummaryWorkerStep;
  stepIds: string[];
  stepResults: Map<string, unknown>;
} {
  const stepIds: string[] = [];
  const stepResults = new Map<string, unknown>();
  const step: SummaryWorkerStep = {
    async run<T>(id: string, handler: () => Promise<T> | T): Promise<T> {
      stepIds.push(id);
      const result = await handler();
      stepResults.set(id, result);
      return result;
    },
  };
  return { step, stepIds, stepResults };
}

function createDependencies() {
  const state = {
    status: "PENDING" as
      | "PENDING"
      | "RUNNING"
      | "POSTING"
      | "COMPLETED"
      | "FAILED"
      | "SUPERSEDED",
    attemptCount: 1,
    executionLeaseToken: "queue-token" as string | null,
    executionLeaseOwner: "QUEUE" as "QUEUE" | "WORKER" | null,
    executionLeaseExpiresAt: new Date("2026-08-25T01:00:00.000Z") as Date | null,
    failureStage: null as string | null,
  };
  const updateMany = vi.fn(async ({ where, data }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    const statuses =
      typeof where.status === "object" && where.status !== null && "in" in where.status
        ? (where.status.in as Array<typeof state.status>)
        : [where.status as typeof state.status];
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

    if (typeof data.status === "string") state.status = data.status as typeof state.status;
    if ("executionLeaseToken" in data) {
      state.executionLeaseToken = data.executionLeaseToken as string | null;
    }
    if ("executionLeaseOwner" in data) {
      state.executionLeaseOwner = data.executionLeaseOwner as typeof state.executionLeaseOwner;
    }
    if ("executionLeaseExpiresAt" in data) {
      state.executionLeaseExpiresAt = data.executionLeaseExpiresAt as Date | null;
    }
    if ("failureStage" in data) {
      state.failureStage = data.failureStage as string | null;
    }
    return { count: 1 };
  });
  const reviewUpdate = vi.fn(async () => ({ id: "summary-1" }));
  const reviewDelegate = {
    findUnique: vi.fn(async () => ({
      id: "summary-1",
      review: "Persisted summary body",
      attemptCount: state.attemptCount,
      headSha: "head-sha",
      githubAuthorId: "github-user-1",
      langCode: "en",
      prNumber: 42,
      repository: {
        owner: "octo",
        name: "sample",
        userId: "user-1",
      },
    })),
    updateMany,
    update: reviewUpdate,
  };
  const accountFindFirst = vi.fn(
    async (): Promise<{ accessToken: string } | null> => ({
      accessToken: "github-token",
    }),
  );
  const transactionClient = { review: reviewDelegate };
  const prismaMock = {
    account: { findFirst: accountFindFirst },
    review: reviewDelegate,
    $transaction: vi.fn(
      async (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };
  const operationOrder: string[] = [];
  const generateText = vi.fn(async () => {
    operationOrder.push("generate");
    return { text: "Generated summary" };
  });
  const postReviewComment = vi.fn(async () => {
    operationOrder.push("post");
    return {
      id: "github-summary-1",
      kind: "issue-comment" as const,
      commitId: null,
      postedAt: NOW,
    };
  });
  const findGithubReviewArtifact = vi.fn(async () => null);
  const assertCurrentReviewHead = vi.fn(async () => undefined);
  reviewUpdate.mockImplementation(async () => {
    operationOrder.push("save");
    return { id: "summary-1" };
  });
  const getPullRequestDiff = vi.fn(async () => ({
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
  }));
  const dependencies: SummaryWorkerDependencies = {
    prisma: prismaMock as unknown as SummaryWorkerDependencies["prisma"],
    getPullRequestDiff,
    postReviewComment:
      postReviewComment as unknown as SummaryWorkerDependencies["postReviewComment"],
    findGithubReviewArtifact,
    generateText:
      generateText as unknown as SummaryWorkerDependencies["generateText"],
    createGeneratorModel: vi.fn(
      () => "generator-model",
    ) as unknown as SummaryWorkerDependencies["createGeneratorModel"],
    assertCurrentReviewHead,
    now: () => NOW,
  };

  return {
    dependencies,
    state,
    operationOrder,
    mocks: {
      generateText,
      accountFindFirst,
      getPullRequestDiff,
      postReviewComment,
      assertCurrentReviewHead,
      reviewUpdate,
    },
  };
}

describe("createGenerateSummaryHandler", () => {
  it("persists before posting and records the primary artifact", async () => {
    const { dependencies, state, operationOrder, mocks } = createDependencies();
    const recorder = createStepRecorder();
    const handler = createGenerateSummaryHandler(dependencies);

    await handler({ event: { data: SUMMARY_EVENT_DATA }, step: recorder.step });

    expect(recorder.stepIds).toEqual([
      "claim-review",
      "load-review-request",
      "fetch-pr-data",
      "generate-ai-summary",
      "persist-summary",
      "post-comment",
      "record-summary-artifact",
      "complete-summary",
    ]);
    expect(operationOrder).toEqual(["generate", "save", "post"]);
    expect(recorder.stepResults.get("fetch-pr-data")).not.toHaveProperty("token");
    expect(JSON.stringify([...recorder.stepResults.values()])).not.toContain(
      "github-token",
    );
    expect(JSON.stringify([...recorder.stepResults.values()])).not.toContain(
      "accessToken",
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
    expect(mocks.reviewUpdate).toHaveBeenCalledWith({
      where: { id: "summary-1" },
      data: {
        prTitle: "Improve docs",
        review: "Generated summary",
        headSha: "head-sha",
        artifactLookupMissedAt: null,
      },
    });
    expect(state).toMatchObject({
      status: "COMPLETED",
      executionLeaseToken: null,
      executionLeaseOwner: null,
    });
  });

  it("supersedes before generation without posting", async () => {
    const { dependencies, state, mocks } = createDependencies();
    mocks.assertCurrentReviewHead.mockImplementation(async () => {
      state.status = "SUPERSEDED";
      state.executionLeaseToken = null;
      state.executionLeaseOwner = null;
      state.executionLeaseExpiresAt = null;
      throw new Error("superseded");
    });
    const recorder = createStepRecorder();

    await expect(
      createGenerateSummaryHandler(dependencies)({
        event: { data: SUMMARY_EVENT_DATA },
        step: recorder.step,
      }),
    ).rejects.toThrow("superseded");

    expect(state.status).toBe("SUPERSEDED");
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
    expect(mocks.reviewUpdate).not.toHaveBeenCalled();
  });

  it("supersedes on the post guard without issuing a GitHub comment", async () => {
    const { dependencies, state, mocks } = createDependencies();
    mocks.assertCurrentReviewHead
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        state.status = "SUPERSEDED";
        state.executionLeaseToken = null;
        state.executionLeaseOwner = null;
        state.executionLeaseExpiresAt = null;
        throw new Error("superseded before post");
      });
    const recorder = createStepRecorder();

    await expect(
      createGenerateSummaryHandler(dependencies)({
        event: { data: SUMMARY_EVENT_DATA },
        step: recorder.step,
      }),
    ).rejects.toThrow("superseded before post");

    expect(state.status).toBe("SUPERSEDED");
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
    expect(mocks.reviewUpdate).toHaveBeenCalledOnce();
  });

  it("requires the exact persisted GitHub account binding", async () => {
    const { dependencies, state, mocks } = createDependencies();
    mocks.accountFindFirst.mockResolvedValue(null);
    const recorder = createStepRecorder();

    await createGenerateSummaryHandler(dependencies)({
      event: { data: SUMMARY_EVENT_DATA },
      step: recorder.step,
    });

    expect(state).toMatchObject({ status: "FAILED", failureStage: "FETCH" });
    expect(mocks.getPullRequestDiff).not.toHaveBeenCalled();
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
  });

  it("resumes a persisted summary without fetching or invoking AI", async () => {
    const { dependencies, mocks } = createDependencies();
    const recorder = createStepRecorder();

    await createGenerateSummaryHandler(dependencies)({
      event: {
        data: { ...SUMMARY_EVENT_DATA, resumeFromPersisted: true },
      },
      step: recorder.step,
    });

    expect(recorder.stepIds).toEqual([
      "claim-review",
      "load-review-request",
      "prepare-persisted-summary-post",
      "post-persisted-summary",
      "record-persisted-summary-artifact",
      "complete-persisted-summary",
    ]);
    expect(mocks.getPullRequestDiff).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.postReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Persisted summary body" }),
    );
  });
});

describe("default summary worker composition", () => {
  it("loads with an explicit server-only mock", () => {
    expect(generateSummary).toBeDefined();
  });
});
