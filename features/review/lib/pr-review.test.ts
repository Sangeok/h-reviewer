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

import {
  postPRReviewWithSuggestions,
  postVerificationReview,
} from "./pr-review";

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
    reviewId: "review-1",
    reviewContent: "Review body",
    mainMarker: "<!-- hreviewer:review:review-1:main -->",
    suggestions: [],
    issues: [{ ...INLINE_ISSUE, id: "issue-1" }],
    headSha: "head-sha",
    langCode: "en" as const,
    beforeInlinePost,
  };
}

describe("postPRReviewWithSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubMocks.createReview.mockResolvedValue({
      data: {
        id: 1,
        commit_id: "head-sha",
        submitted_at: "2026-08-29T00:00:00Z",
      },
    });
  });

  it("runs the current-head guard immediately before the inline batch", async () => {
    const beforeInlinePost = vi.fn(async () => undefined);

    await postPRReviewWithSuggestions(createPostInput(beforeInlinePost));

    expect(githubMocks.createReview).toHaveBeenCalledTimes(2);
    expect(beforeInlinePost).toHaveBeenCalledOnce();
    expect(
      beforeInlinePost.mock.invocationCallOrder[0],
    ).toBeLessThan(githubMocks.createReview.mock.invocationCallOrder[1] ?? 0);
    expect(githubMocks.createReview.mock.calls[0][0].body).toContain(
      "<!-- hreviewer:review:review-1:main -->",
    );
    expect(githubMocks.createReview.mock.calls[1][0].comments[0].body).toContain(
      "<!-- hreviewer:review:review-1:issue:issue-1 -->",
    );
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

  it("returns the main review API artifact", async () => {
    await expect(
      postPRReviewWithSuggestions(createPostInput(async () => undefined)),
    ).resolves.toEqual({
      id: "1",
      kind: "pull-request-review",
      commitId: "head-sha",
      postedAt: new Date("2026-08-29T00:00:00Z"),
    });
  });
});

describe("postVerificationReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubMocks.createReview.mockResolvedValue({
      data: {
        id: 2,
        commit_id: "head-sha",
        submitted_at: "2026-08-29T00:01:00Z",
      },
    });
  });

  it("posts a marker-wrapped body and returns the API artifact", async () => {
    const marker = "<!-- hreviewer:review:review-1:verification -->";

    await expect(postVerificationReview({
      token: "github-token",
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      headSha: "head-sha",
      content: "Verification details",
      marker,
    })).resolves.toMatchObject({ id: "2", commitId: "head-sha" });

    expect(githubMocks.createReview.mock.calls[0][0].body).toContain(marker);
    expect(githubMocks.createReview.mock.calls[0][0].body).toContain(
      "Verification details",
    );
  });
});
