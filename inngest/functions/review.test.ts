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

import type { StructuredReviewOutput } from "@/features/ai";
import type { PostedGithubArtifact } from "@/lib/github/github-review-artifacts";

import {
  createGenerateReviewHandler,
  generateReview,
  handleReviewFailure,
  type ReviewWorkerEventData,
  type ReviewWorkerDependencies,
  type ReviewWorkerStep,
} from "./review";

const NOW = new Date("2026-08-26T00:00:00Z");
const EVENT: ReviewWorkerEventData = {
  reviewId: "review-1",
  attempt: 1,
  debounceKey: "repository-1:42",
} as const;
const DIFF = [
  "diff --git a/src/value.ts b/src/value.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/value.ts",
  "@@ -0,0 +1 @@",
  "+const value = 1;",
].join("\n");
const PULL_REQUEST = {
  title: "Add value",
  diff: DIFF,
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
const ARTIFACT: PostedGithubArtifact = {
  id: "github-review-1",
  kind: "pull-request-review",
  commitId: "head-sha",
  postedAt: NOW,
};

type State = {
  status: "PENDING" | "RUNNING" | "POSTING" | "COMPLETED" | "FAILED" | "SUPERSEDED";
  attemptCount: number;
  executionLeaseToken: string | null;
  executionLeaseOwner: "QUEUE" | "WORKER" | "RECONCILER" | null;
  executionLeaseExpiresAt: Date | null;
  lastCompletedStage: string | null;
  failureStage: string | null;
  review: string;
  githubMainReviewId: string | null;
  githubMainPostedAt: Date | null;
  artifactLookupMissedAt: Date | null;
};

function createStepRecorder(): { step: ReviewWorkerStep; ids: string[] } {
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
  const state: State = {
    status: "PENDING",
    attemptCount: 1,
    executionLeaseToken: "queue-token",
    executionLeaseOwner: "QUEUE",
    executionLeaseExpiresAt: new Date("2026-08-26T01:00:00Z"),
    lastCompletedStage: null,
    failureStage: null,
    review: "",
    githubMainReviewId: null,
    githubMainPostedAt: null,
    artifactLookupMissedAt: null,
  };
  const suggestions: Array<Record<string, unknown>> = [];
  const issues: Array<Record<string, unknown>> = [];
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
    return { id: "review-1" };
  });
  const reviewFindUnique = vi.fn(async () => ({
    id: "review-1",
    attemptCount: state.attemptCount,
    headSha: "head-sha",
    githubAuthorId: "github-user-1",
    langCode: "en",
    maxSuggestions: 3,
    verificationEnabled: false,
    review: state.review,
    lastCompletedStage: state.lastCompletedStage,
    artifactLookupMissedAt: state.artifactLookupMissedAt,
    prNumber: 42,
    repository: {
      id: "repository-1",
      owner: "octo",
      name: "sample",
      userId: "user-1",
    },
    suggestions,
    issues,
  }));
  const review = { findUnique: reviewFindUnique, updateMany, update: reviewUpdate };
  const suggestion = {
    deleteMany: vi.fn(async () => {
      suggestions.length = 0;
      return { count: 0 };
    }),
    create: vi.fn(async ({ data }) => {
      const row = { id: `suggestion-${suggestions.length + 1}`, ...data };
      suggestions.push({
        id: row.id,
        filePath: data.filePath,
        lineNumber: data.lineNumber,
        beforeCode: data.beforeCode,
        afterCode: data.afterCode,
        explanation: data.explanation,
        severity: data.severity,
      });
      return { id: row.id };
    }),
  };
  const reviewIssue = {
    deleteMany: vi.fn(async () => {
      issues.length = 0;
      return { count: 0 };
    }),
    create: vi.fn(async ({ data }) => {
      const id = `issue-${issues.length + 1}`;
      issues.push({ id, ...data });
      return { id };
    }),
  };
  const transactionClient = { review, suggestion, reviewIssue };
  const postReviewComment = vi.fn(async () => ({
    ...ARTIFACT,
    kind: "issue-comment" as const,
    commitId: null,
  }));
  const postPRReviewWithSuggestions = vi.fn(async () => ARTIFACT);
  const postVerificationReview = vi.fn(async () => ARTIFACT);
  const postInlineReviewIssues = vi.fn(async () => undefined);
  const findGithubMainReviewArtifact = vi.fn<
    () => Promise<PostedGithubArtifact | null>
  >(async () => null);
  const findGithubReviewCommentArtifact = vi.fn<
    () => Promise<PostedGithubArtifact | null>
  >(async () => null);
  const findGithubPullRequestReviewArtifact = vi.fn<
    () => Promise<PostedGithubArtifact | null>
  >(async () => null);
  const accountFindFirst = vi.fn(async () => ({ accessToken: "github-token" }));
  const generateText = vi.fn();
  const assertCurrentReviewHead = vi.fn(async () => undefined);
  const getPullRequestDiff = vi.fn(async () => PULL_REQUEST);
  const dependencies: ReviewWorkerDependencies = {
    prisma: {
      review,
      suggestion,
      reviewIssue,
      account: { findFirst: accountFindFirst },
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    } as unknown as ReviewWorkerDependencies["prisma"],
    getPullRequestDiff,
    postReviewComment,
    postPRReviewWithSuggestions,
    postInlineReviewIssues,
    postVerificationReview,
    findGithubMainReviewArtifact,
    findGithubPullRequestReviewArtifact,
    findGithubReviewCommentArtifact,
    buildDeterministicPrContext: vi.fn(),
    generateText: generateText as unknown as ReviewWorkerDependencies["generateText"],
    createGeneratorModel: vi.fn(() => "generator-model") as unknown as ReviewWorkerDependencies["createGeneratorModel"],
    verifyReview: vi.fn(),
    detectRepeatIssues: vi.fn(async () => []),
    assertCurrentReviewHead,
    createTimeoutSignal: () => new AbortController().signal,
    now: () => NOW,
  };
  return {
    state,
    dependencies,
    mocks: {
      accountFindFirst,
      assertCurrentReviewHead,
      findGithubMainReviewArtifact,
      findGithubPullRequestReviewArtifact,
      findGithubReviewCommentArtifact,
      generateText,
      getPullRequestDiff,
      postInlineReviewIssues,
      postPRReviewWithSuggestions,
      postReviewComment,
      reviewUpdate,
      suggestionCreate: suggestion.create,
    },
  };
}

async function run(
  dependencies: ReviewWorkerDependencies,
  event: ReviewWorkerEventData = EVENT,
): Promise<string[]> {
  const recorder = createStepRecorder();
  await createGenerateReviewHandler(dependencies)({
    event: { data: event },
    step: recorder.step,
  });
  return recorder.ids;
}

describe("createGenerateReviewHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists wrapper-free content before posting and records the main artifact", async () => {
    const { dependencies, state, mocks } = createHarness();
    mocks.generateText.mockResolvedValue({ experimental_output: STRUCTURED_REVIEW });

    const stepIds = await run(dependencies);

    expect(stepIds).toEqual([
      "claim-review",
      "load-review-request",
      "fetch-pr-data",
      "generate-ai-review",
      "validate-review",
      "verify-findings",
      "detect-repeat-issues",
      "checkpoint-review-verified",
      "persist-review-before-post",
      "load-persisted-review",
      "post-review",
      "post-inline-issues",
      "post-verification-review",
      "complete-review",
    ]);
    expect(mocks.reviewUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.postPRReviewWithSuggestions.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.postPRReviewWithSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewContent: expect.stringContaining("The change adds a value."),
        mainMarker: "<!-- hreviewer:review:review-1:main -->",
        suggestions: [
          expect.objectContaining({
            marker:
              "<!-- hreviewer:review:review-1:suggestion:suggestion-1 -->",
          }),
        ],
      }),
    );
    expect(state).toMatchObject({
      status: "COMPLETED",
      review: expect.stringContaining("const value = 2;"),
      githubMainReviewId: "github-review-1",
      githubMainPostedAt: NOW,
      lastCompletedStage: "MAIN_POSTED",
      executionLeaseToken: null,
    });
  });

  it("posts markdown fallback with the object-input contract", async () => {
    const { dependencies, mocks } = createHarness();
    mocks.generateText
      .mockRejectedValueOnce(new Error("structured output failed"))
      .mockResolvedValueOnce({ text: "Fallback review" });

    await run(dependencies);

    expect(mocks.postReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "github-token",
        content: expect.stringContaining("Fallback review"),
        marker: "<!-- hreviewer:review:review-1:main -->",
      }),
    );
  });

  it("falls back only for a deterministic 422 validation response", async () => {
    const { dependencies, mocks } = createHarness();
    mocks.generateText.mockResolvedValue({ experimental_output: STRUCTURED_REVIEW });
    mocks.postPRReviewWithSuggestions.mockRejectedValue({ status: 422 });

    await run(dependencies);

    expect(mocks.postReviewComment).toHaveBeenCalledOnce();
  });

  it("completes with every finding in the main body when inline posting fails", async () => {
    const { dependencies, state, mocks } = createHarness();
    mocks.getPullRequestDiff.mockResolvedValue({
      ...PULL_REQUEST,
      diff: `${DIFF}\n+const checkedValue = value;`,
      additions: 2,
    });
    mocks.generateText.mockResolvedValue({
      experimental_output: {
        ...STRUCTURED_REVIEW,
        issues: [
          {
            file: "src/value.ts",
            line: 2,
            title: "Validate value",
            body: "The value is accepted without validation.",
            impact: "Malformed input can escape.",
            recommendation: "Validate the value before use.",
            severity: "WARNING",
            category: "bug",
          },
        ],
      } satisfies StructuredReviewOutput,
    });
    mocks.postInlineReviewIssues.mockRejectedValue(new Error("inline failed"));

    await run(dependencies);

    expect(state.status).toBe("COMPLETED");
    expect(state.review).toContain("The value is accepted without validation.");
    expect(state.review).toContain("Malformed input can escape.");
    expect(state.review).toContain("Validate the value before use.");
    expect(state.review).toContain("Use the reviewed value.");
    expect(state.review).toContain("const value = 2;");
  });

  it("does not issue an immediate fallback for ambiguous failures", async () => {
    const { dependencies, mocks } = createHarness();
    mocks.generateText.mockResolvedValue({ experimental_output: STRUCTURED_REVIEW });
    mocks.postPRReviewWithSuggestions.mockRejectedValue({ status: 503 });

    await expect(run(dependencies)).rejects.toEqual({ status: 503 });
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
  });

  it("fails at PERSIST without a GitHub call when the final body is oversized", async () => {
    const { dependencies, state, mocks } = createHarness();
    mocks.generateText
      .mockRejectedValueOnce(new Error("structured output failed"))
      .mockResolvedValueOnce({ text: "가".repeat(30_000) });

    await run(dependencies);

    expect(state).toMatchObject({ status: "FAILED", failureStage: "PERSIST" });
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
    expect(mocks.postPRReviewWithSuggestions).not.toHaveBeenCalled();
  });

  it("reuses persisted markdown during POST recovery without invoking AI", async () => {
    const { dependencies, state, mocks } = createHarness();
    state.review = "Persisted canonical review";
    state.lastCompletedStage = "PERSISTED";
    state.artifactLookupMissedAt = NOW;
    mocks.findGithubMainReviewArtifact.mockResolvedValue(ARTIFACT);

    await run(dependencies);

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
    expect(mocks.postPRReviewWithSuggestions).not.toHaveBeenCalled();
    expect(state.status).toBe("COMPLETED");
  });

  it("stops before every external post when the current-head guard fails", async () => {
    const { dependencies, state, mocks } = createHarness();
    mocks.generateText.mockResolvedValue({ experimental_output: STRUCTURED_REVIEW });
    mocks.assertCurrentReviewHead.mockImplementationOnce(async () => {
      state.status = "SUPERSEDED";
      state.executionLeaseToken = null;
      state.executionLeaseOwner = null;
      throw new Error("superseded");
    });

    await expect(run(dependencies)).rejects.toThrow("superseded");
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
    expect(mocks.postPRReviewWithSuggestions).not.toHaveBeenCalled();
  });
});

describe("default review worker composition", () => {
  it("registers terminal failure handling", () => {
    expect(generateReview).toBeDefined();
    expect(generateReview.opts.onFailure).toBeTypeOf("function");
  });

  it("does not let terminal, newer-attempt, or reconciler-owned rows be overwritten", async () => {
    failureDbMocks.findUnique
      .mockResolvedValueOnce({
        status: "COMPLETED",
        attemptCount: 1,
        executionLeaseToken: null,
        executionLeaseOwner: null,
        lastCompletedStage: "MAIN_POSTED",
      })
      .mockResolvedValueOnce({
        status: "RUNNING",
        attemptCount: 2,
        executionLeaseToken: "worker-token",
        executionLeaseOwner: "WORKER",
        lastCompletedStage: null,
      })
      .mockResolvedValueOnce({
        status: "POSTING",
        attemptCount: 1,
        executionLeaseToken: "reconciler-token",
        executionLeaseOwner: "RECONCILER",
        lastCompletedStage: "PERSISTED",
      });
    const input = {
      event: { data: { event: { data: { reviewId: "review-1", attempt: 1 } } } },
      error: new Error("secret raw body"),
    };

    await handleReviewFailure(input);
    await handleReviewFailure(input);
    await handleReviewFailure(input);

    expect(failureDbMocks.updateMany).not.toHaveBeenCalled();
  });

  it("stores only allowlisted failure metadata under the exact worker fence", async () => {
    failureDbMocks.findUnique.mockResolvedValue({
      status: "POSTING",
      attemptCount: 1,
      executionLeaseToken: "worker-token",
      executionLeaseOwner: "WORKER",
      lastCompletedStage: "PERSISTED",
    });
    const error = Object.assign(new Error("token=secret raw response"), {
      status: 503,
      code: "UNTRUSTED_PROVIDER_CODE",
    });

    await handleReviewFailure({
      event: { data: { event: { data: { reviewId: "review-1", attempt: 1 } } } },
      error,
    });

    expect(failureDbMocks.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: "POSTING",
        attemptCount: 1,
        executionLeaseToken: "worker-token",
        executionLeaseOwner: "WORKER",
      }),
      data: expect.objectContaining({
        status: "FAILED",
        failureStage: "POST",
        failureMessage: "Error; status=503",
        executionLeaseOwner: "RECONCILER",
      }),
    });
    expect(JSON.stringify(failureDbMocks.updateMany.mock.calls)).not.toContain(
      "token=secret",
    );
  });
});
