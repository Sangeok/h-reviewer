import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StructuredIssue } from "@/features/ai/types/suggestion";

const githubMocks = vi.hoisted(() => ({
  createReview: vi.fn(),
}));

vi.mock("@/lib/github/github", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/github/github")
  >();

  return {
    ...actual,
    createOctokitClient: vi.fn(() => ({
      rest: { pulls: { createReview: githubMocks.createReview } },
    })),
  };
});

import { postPRReviewWithSuggestions } from "./pr-review";

const INLINE_ISSUE: StructuredIssue = {
  file: "src/value.ts",
  line: 3,
  title: "Guard this value",
  body: "The value needs validation.",
  impact: "Invalid input can escape.",
  recommendation: "Validate before use.",
  severity: "WARNING",
  category: "bug",
};

function createPostInput(beforeInlinePost: () => Promise<void>) {
  return {
    token: "github-token",
    owner: "octo",
    repo: "sample",
    prNumber: 42,
    reviewBody: "Review body",
    suggestions: [],
    issues: [INLINE_ISSUE],
    headSha: "head-sha",
    langCode: "en" as const,
    beforeInlinePost,
  };
}

describe("postPRReviewWithSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubMocks.createReview.mockResolvedValue({ data: { id: 1 } });
  });

  it("runs the current-head guard immediately before the inline batch", async () => {
    const beforeInlinePost = vi.fn(async () => undefined);

    await postPRReviewWithSuggestions(createPostInput(beforeInlinePost));

    expect(githubMocks.createReview).toHaveBeenCalledTimes(2);
    expect(beforeInlinePost).toHaveBeenCalledOnce();
    expect(
      beforeInlinePost.mock.invocationCallOrder[0],
    ).toBeLessThan(githubMocks.createReview.mock.invocationCallOrder[1] ?? 0);
  });

  it("does not issue the inline GitHub call when its guard fails", async () => {
    const staleError = new Error("stale head");
    const beforeInlinePost = vi.fn(async () => {
      throw staleError;
    });

    await expect(
      postPRReviewWithSuggestions(createPostInput(beforeInlinePost)),
    ).rejects.toBe(staleError);

    expect(githubMocks.createReview).toHaveBeenCalledOnce();
    expect(beforeInlinePost).toHaveBeenCalledOnce();
  });
});
