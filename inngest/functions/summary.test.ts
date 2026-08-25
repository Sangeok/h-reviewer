import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGenerateSummaryHandler,
  generateSummary,
  type SummaryWorkerDependencies,
  type SummaryWorkerStep,
} from "./summary";

const SUMMARY_EVENT_DATA = {
  owner: "octo",
  repo: "sample",
  prNumber: 42,
  userId: "user-1",
  preferredLanguage: "en",
} as const;

function createStepRecorder(): {
  step: SummaryWorkerStep;
  stepIds: string[];
} {
  const stepIds: string[] = [];
  const step: SummaryWorkerStep = {
    async run<T>(id: string, handler: () => Promise<T> | T): Promise<T> {
      stepIds.push(id);
      return await handler();
    },
  };

  return { step, stepIds };
}

describe("createGenerateSummaryHandler", () => {
  it("generates, posts, and saves a summary in the existing step order", async () => {
    const operationOrder: string[] = [];
    const generateText = vi.fn(async () => {
      operationOrder.push("generate");
      return { text: "Generated summary" };
    });
    const postReviewComment = vi.fn(async () => {
      operationOrder.push("post");
    });
    const reviewCreate = vi.fn(async () => {
      operationOrder.push("save");
      return { id: "summary-1" };
    });
    const prismaMock = {
      account: {
        findFirst: vi.fn(async () => ({ accessToken: "github-token" })),
      },
      repository: {
        findFirst: vi.fn(async () => ({ id: "repository-1" })),
      },
      review: { create: reviewCreate },
    };
    const dependencies: SummaryWorkerDependencies = {
      prisma: prismaMock as unknown as SummaryWorkerDependencies["prisma"],
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
      postReviewComment:
        postReviewComment as unknown as SummaryWorkerDependencies["postReviewComment"],
      generateText:
        generateText as unknown as SummaryWorkerDependencies["generateText"],
      createGeneratorModel: vi.fn(
        () => "generator-model",
      ) as unknown as SummaryWorkerDependencies["createGeneratorModel"],
    };
    const { step, stepIds } = createStepRecorder();
    const handler = createGenerateSummaryHandler(dependencies);

    await handler({ event: { data: SUMMARY_EVENT_DATA }, step });

    expect(stepIds).toEqual([
      "fetch-pr-data",
      "generate-ai-summary",
      "post-comment",
      "save-summary",
    ]);
    expect(operationOrder).toEqual(["generate", "post", "save"]);
    expect(postReviewComment).toHaveBeenCalledWith(
      "github-token",
      "octo",
      "sample",
      42,
      "Generated summary",
      { title: "AI PR Summary" },
    );
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryId: "repository-1",
        prNumber: 42,
        prTitle: "Improve docs",
        prUrl: "https://github.com/octo/sample/pull/42",
        review: "Generated summary",
        reviewType: "SUMMARY",
        requestSource: "LEGACY",
        reviewMode: "FULL",
        status: "COMPLETED",
        trialCreditState: "NOT_APPLICABLE",
      }),
    });
  });
});

describe("default summary worker composition", () => {
  it("loads with an explicit server-only mock", () => {
    expect(generateSummary).toBeDefined();
  });
});
