import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StructuredReviewOutput } from "@/features/ai";

import {
  createGenerateReviewHandler,
  generateReview,
  type ReviewWorkerDependencies,
  type ReviewWorkerStep,
} from "./review";

const NOW = new Date("2026-08-25T00:00:00.000Z");
const REVIEW_EVENT_DATA = {
  reviewId: "review-1",
  attempt: 1,
  debounceKey: "repository-1:42",
} as const;
const REVIEWABLE_DIFF = [
  "diff --git a/src/value.ts b/src/value.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/value.ts",
  "@@ -0,0 +1 @@",
  "+const value = 1;",
].join("\n");
const PULL_REQUEST_DIFF = {
  title: "Add value",
  diff: REVIEWABLE_DIFF,
  description: "Adds a value",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  baseSha: "base-sha",
  headSha: "head-sha",
  headBranch: "feature/value",
  headRepository: null,
  state: "open",
  merged: false,
};
const STRUCTURED_REVIEW: StructuredReviewOutput = {
  summary: {
    overview: "The change adds a value.",
    riskLevel: "low",
    keyPoints: [],
  },
  walkthrough: [],
  strengths: [],
  issues: [],
  suggestions: [
    {
      file: "src/value.ts",
      line: 1,
      before: "const value = 1;",
      after: "const value = 2;",
      explanation: "Use the reviewed value.",
      severity: "SUGGESTION",
    },
  ],
  sequenceDiagram: null,
};

type WorkerState = {
  status:
    | "PENDING"
    | "RUNNING"
    | "POSTING"
    | "COMPLETED"
    | "FAILED"
    | "SUPERSEDED";
  attemptCount: number;
  executionLeaseToken: string | null;
  executionLeaseOwner: "QUEUE" | "WORKER" | null;
  executionLeaseExpiresAt: Date | null;
  lastCompletedStage: string | null;
  failureStage: string | null;
};

function createStepRecorder(): {
  step: ReviewWorkerStep;
  stepIds: string[];
  stepResults: Map<string, unknown>;
} {
  const stepIds: string[] = [];
  const stepResults = new Map<string, unknown>();
  const step: ReviewWorkerStep = {
    async run<T>(id: string, handler: () => Promise<T> | T): Promise<T> {
      stepIds.push(id);
      const result = await handler();
      stepResults.set(id, result);
      return result;
    },
  };
  return { step, stepIds, stepResults };
}

function createDependencies(): {
  dependencies: ReviewWorkerDependencies;
  state: WorkerState;
  mocks: {
    generateText: ReturnType<typeof vi.fn>;
    getPullRequestDiff: ReturnType<typeof vi.fn>;
    accountFindFirst: ReturnType<typeof vi.fn>;
    postReviewComment: ReturnType<typeof vi.fn>;
    postPRReviewWithSuggestions: ReturnType<typeof vi.fn>;
    assertCurrentReviewHead: ReturnType<typeof vi.fn>;
    reviewUpdate: ReturnType<typeof vi.fn>;
    suggestionCreateMany: ReturnType<typeof vi.fn>;
  };
} {
  const state: WorkerState = {
    status: "PENDING",
    attemptCount: 1,
    executionLeaseToken: "queue-token",
    executionLeaseOwner: "QUEUE",
    executionLeaseExpiresAt: new Date("2026-08-25T01:00:00.000Z"),
    lastCompletedStage: null,
    failureStage: null,
  };
  const updateMany = vi.fn(async ({ where, data }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    const statuses =
      typeof where.status === "object" && where.status !== null && "in" in where.status
        ? (where.status.in as WorkerState["status"][])
        : [where.status as WorkerState["status"]];
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

    if (typeof data.status === "string") state.status = data.status as WorkerState["status"];
    if ("executionLeaseToken" in data) {
      state.executionLeaseToken = data.executionLeaseToken as string | null;
    }
    if ("executionLeaseOwner" in data) {
      state.executionLeaseOwner = data.executionLeaseOwner as WorkerState["executionLeaseOwner"];
    }
    if ("executionLeaseExpiresAt" in data) {
      state.executionLeaseExpiresAt = data.executionLeaseExpiresAt as Date | null;
    }
    if ("lastCompletedStage" in data) {
      state.lastCompletedStage = data.lastCompletedStage as string | null;
    }
    if ("failureStage" in data) {
      state.failureStage = data.failureStage as string | null;
    }
    return { count: 1 };
  });
  const reviewUpdate = vi.fn(async () => ({ id: "review-1" }));
  const reviewDelegate = {
    findUnique: vi.fn(async () => ({
      id: "review-1",
      attemptCount: state.attemptCount,
      headSha: "head-sha",
      githubAuthorId: "github-user-1",
      langCode: "en",
      maxSuggestions: 3,
      verificationEnabled: false,
      prNumber: 42,
      repository: {
        id: "repository-1",
        owner: "octo",
        name: "sample",
        userId: "user-1",
      },
    })),
    updateMany,
    update: reviewUpdate,
  };
  const suggestionCreateMany = vi.fn(async () => ({ count: 1 }));
  const transactionClient = {
    review: reviewDelegate,
    suggestion: { createMany: suggestionCreateMany },
    reviewIssue: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
  const accountFindFirst = vi.fn(async () => ({ accessToken: "github-token" }));
  const prismaMock = {
    account: { findFirst: accountFindFirst },
    review: reviewDelegate,
    $transaction: vi.fn(
      async (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };
  const generateText = vi.fn();
  const getPullRequestDiff = vi.fn(async () => PULL_REQUEST_DIFF);
  const postReviewComment = vi.fn(async () => undefined);
  const postPRReviewWithSuggestions = vi.fn(async () => undefined);
  const assertCurrentReviewHead = vi.fn(async () => undefined);
  const dependencies: ReviewWorkerDependencies = {
    prisma: prismaMock as unknown as ReviewWorkerDependencies["prisma"],
    getPullRequestDiff,
    postReviewComment:
      postReviewComment as unknown as ReviewWorkerDependencies["postReviewComment"],
    postPRReviewWithSuggestions:
      postPRReviewWithSuggestions as unknown as ReviewWorkerDependencies["postPRReviewWithSuggestions"],
    postVerificationReview: vi.fn(async () => undefined),
    buildDeterministicPrContext: vi.fn(),
    generateText:
      generateText as unknown as ReviewWorkerDependencies["generateText"],
    createGeneratorModel: vi.fn(
      () => "generator-model",
    ) as unknown as ReviewWorkerDependencies["createGeneratorModel"],
    verifyReview: vi.fn(),
    detectRepeatIssues: vi.fn(async () => []),
    assertCurrentReviewHead,
    createTimeoutSignal: () => new AbortController().signal,
    now: () => NOW,
  };

  return {
    dependencies,
    state,
    mocks: {
      generateText,
      getPullRequestDiff,
      accountFindFirst,
      postReviewComment,
      postPRReviewWithSuggestions,
      assertCurrentReviewHead,
      reviewUpdate,
      suggestionCreateMany,
    },
  };
}

async function runReviewHandler(dependencies: ReviewWorkerDependencies) {
  const recorder = createStepRecorder();
  const handler = createGenerateReviewHandler(dependencies);
  await handler({ event: { data: REVIEW_EVENT_DATA }, step: recorder.step });
  return recorder;
}

describe("createGenerateReviewHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims and updates the coordinator review without persisting a token in step data", async () => {
    const { dependencies, state, mocks } = createDependencies();
    mocks.generateText.mockResolvedValue({ experimental_output: STRUCTURED_REVIEW });

    const { stepIds, stepResults } = await runReviewHandler(dependencies);

    expect(stepIds).toEqual([
      "claim-review",
      "load-review-request",
      "fetch-pr-data",
      "generate-ai-review",
      "validate-review",
      "verify-findings",
      "detect-repeat-issues",
      "mark-review-posting",
      "post-review",
      "post-verification-review",
      "save-review",
    ]);
    expect(stepResults.get("fetch-pr-data")).not.toHaveProperty("token");
    expect(JSON.stringify([...stepResults.values()])).not.toContain(
      "github-token",
    );
    expect(JSON.stringify([...stepResults.values()])).not.toContain(
      "accessToken",
    );
    expect(mocks.accountFindFirst).toHaveBeenCalledWith({
      where: {
        accountId: "github-user-1",
        userId: "user-1",
        providerId: "github",
      },
      select: { accessToken: true },
    });
    expect(mocks.reviewUpdate).toHaveBeenCalledWith({
      where: { id: "review-1" },
      data: expect.objectContaining({
        prTitle: "Add value",
        headSha: "head-sha",
      }),
    });
    expect(mocks.suggestionCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ reviewId: "review-1" })],
    });
    expect(state).toMatchObject({
      status: "COMPLETED",
      executionLeaseToken: null,
      executionLeaseOwner: null,
      lastCompletedStage: "PERSISTED",
    });
  });

  it("uses markdown fallback and posts with a freshly bound token", async () => {
    const { dependencies, mocks } = createDependencies();
    mocks.generateText
      .mockRejectedValueOnce(new Error("structured output failed"))
      .mockResolvedValueOnce({ text: "Fallback review" });

    await runReviewHandler(dependencies);

    expect(mocks.postReviewComment).toHaveBeenCalledWith(
      "github-token",
      "octo",
      "sample",
      42,
      expect.stringContaining("Fallback review"),
    );
  });

  it("falls back to a comment when the GitHub review API fails", async () => {
    const { dependencies, mocks } = createDependencies();
    mocks.generateText.mockResolvedValue({ experimental_output: STRUCTURED_REVIEW });
    mocks.postPRReviewWithSuggestions.mockRejectedValue(
      new Error("GitHub review API failed"),
    );

    await runReviewHandler(dependencies);

    expect(mocks.postReviewComment).toHaveBeenCalledOnce();
  });

  it("supersedes before generation without an external post", async () => {
    const { dependencies, state, mocks } = createDependencies();
    mocks.assertCurrentReviewHead.mockImplementation(async () => {
      state.status = "SUPERSEDED";
      state.executionLeaseToken = null;
      state.executionLeaseOwner = null;
      state.executionLeaseExpiresAt = null;
      throw new Error("superseded");
    });

    await expect(runReviewHandler(dependencies)).rejects.toThrow("superseded");

    expect(state).toMatchObject({ status: "SUPERSEDED" });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
    expect(mocks.postPRReviewWithSuggestions).not.toHaveBeenCalled();
  });

  it("supersedes on the post guard without issuing a GitHub post", async () => {
    const { dependencies, state, mocks } = createDependencies();
    mocks.generateText.mockResolvedValue({ experimental_output: STRUCTURED_REVIEW });
    mocks.assertCurrentReviewHead
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        state.status = "SUPERSEDED";
        state.executionLeaseToken = null;
        state.executionLeaseOwner = null;
        state.executionLeaseExpiresAt = null;
        throw new Error("superseded before post");
      });

    await expect(runReviewHandler(dependencies)).rejects.toThrow(
      "superseded before post",
    );

    expect(state.status).toBe("SUPERSEDED");
    expect(mocks.postPRReviewWithSuggestions).not.toHaveBeenCalled();
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
  });

  it("does not use another GitHub account when the persisted binding is absent", async () => {
    const { dependencies, state, mocks } = createDependencies();
    mocks.accountFindFirst.mockResolvedValue(null);

    await runReviewHandler(dependencies);

    expect(state).toMatchObject({ status: "FAILED", failureStage: "FETCH" });
    expect(mocks.getPullRequestDiff).not.toHaveBeenCalled();
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
  });
});

describe("default review worker composition", () => {
  it("loads with an explicit server-only mock", () => {
    expect(generateReview).toBeDefined();
  });
});
