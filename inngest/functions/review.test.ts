import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StructuredReviewOutput } from "@/features/ai";

import {
  createGenerateReviewHandler,
  generateReview,
  type ReviewWorkerDependencies,
  type ReviewWorkerStep,
} from "./review";

const REVIEW_EVENT_DATA = {
  owner: "octo",
  repo: "sample",
  prNumber: 42,
  userId: "user-1",
  preferredLanguage: "en",
  maxSuggestions: 3,
  verificationEnabled: false,
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

type ReviewWorkerMocks = {
  generateText: ReturnType<typeof vi.fn>;
  postReviewComment: ReturnType<typeof vi.fn>;
  postPRReviewWithSuggestions: ReturnType<typeof vi.fn>;
  reviewCreate: ReturnType<typeof vi.fn>;
  suggestionCreateMany: ReturnType<typeof vi.fn>;
};

function createStepRecorder(): {
  step: ReviewWorkerStep;
  stepIds: string[];
} {
  const stepIds: string[] = [];
  const step: ReviewWorkerStep = {
    async run<T>(id: string, handler: () => Promise<T> | T): Promise<T> {
      stepIds.push(id);
      return await handler();
    },
  };

  return { step, stepIds };
}

function createDependencies(): {
  dependencies: ReviewWorkerDependencies;
  mocks: ReviewWorkerMocks;
} {
  const generateText = vi.fn();
  const postReviewComment = vi.fn(async () => undefined);
  const postPRReviewWithSuggestions = vi.fn(async () => undefined);
  const reviewCreate = vi.fn(async () => ({ id: "review-1" }));
  const suggestionCreateMany = vi.fn(async () => ({ count: 1 }));
  const reviewIssueCreateMany = vi.fn(async () => ({ count: 0 }));
  const transactionClient = {
    review: { create: reviewCreate },
    suggestion: { createMany: suggestionCreateMany },
    reviewIssue: { createMany: reviewIssueCreateMany },
  };
  const prismaMock = {
    account: {
      findFirst: vi.fn(async () => ({ accessToken: "github-token" })),
    },
    repository: {
      findFirst: vi.fn(async () => ({ id: "repository-1" })),
    },
    $transaction: vi.fn(
      async (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };

  const dependencies: ReviewWorkerDependencies = {
    prisma: prismaMock as unknown as ReviewWorkerDependencies["prisma"],
    getPullRequestDiff: vi.fn(async () => PULL_REQUEST_DIFF),
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
    createTimeoutSignal: () => new AbortController().signal,
  };

  return {
    dependencies,
    mocks: {
      generateText,
      postReviewComment,
      postPRReviewWithSuggestions,
      reviewCreate,
      suggestionCreateMany,
    },
  };
}

async function runReviewHandler(
  dependencies: ReviewWorkerDependencies,
): Promise<string[]> {
  const { step, stepIds } = createStepRecorder();
  const handler = createGenerateReviewHandler(dependencies);

  await handler({ event: { data: REVIEW_EVENT_DATA }, step });

  return stepIds;
}

describe("createGenerateReviewHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts structured output through the review API and saves the review row shape", async () => {
    const { dependencies, mocks } = createDependencies();
    mocks.generateText.mockResolvedValue({
      experimental_output: STRUCTURED_REVIEW,
    });

    const stepIds = await runReviewHandler(dependencies);

    expect(stepIds).toEqual([
      "fetch-pr-data",
      "generate-ai-review",
      "validate-review",
      "verify-findings",
      "detect-repeat-issues",
      "post-review",
      "post-verification-review",
      "save-review",
    ]);
    expect(mocks.postPRReviewWithSuggestions).toHaveBeenCalledOnce();
    expect(mocks.postReviewComment).not.toHaveBeenCalled();
    expect(mocks.reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryId: "repository-1",
        prNumber: 42,
        prTitle: "Add value",
        prUrl: "https://github.com/octo/sample/pull/42",
        reviewType: "FULL_REVIEW",
        status: "completed",
        headSha: "head-sha",
      }),
    });
    expect(mocks.suggestionCreateMany).toHaveBeenCalledOnce();
  });

  it("uses markdown fallback when structured generation fails", async () => {
    const { dependencies, mocks } = createDependencies();
    mocks.generateText
      .mockRejectedValueOnce(new Error("structured output failed"))
      .mockResolvedValueOnce({ text: "Fallback review" });

    await runReviewHandler(dependencies);

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.postPRReviewWithSuggestions).not.toHaveBeenCalled();
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
    mocks.generateText.mockResolvedValue({
      experimental_output: STRUCTURED_REVIEW,
    });
    mocks.postPRReviewWithSuggestions.mockRejectedValue(
      new Error("GitHub review API failed"),
    );

    await runReviewHandler(dependencies);

    expect(mocks.postPRReviewWithSuggestions).toHaveBeenCalledOnce();
    expect(mocks.postReviewComment).toHaveBeenCalledOnce();
  });
});

describe("default review worker composition", () => {
  it("loads with an explicit server-only mock", () => {
    expect(generateReview).toBeDefined();
  });
});
