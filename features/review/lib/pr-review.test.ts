import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const githubMocks = vi.hoisted(() => ({ createReview: vi.fn() }));

vi.mock("@/lib/github/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/github")>();
  return {
    ...actual,
    createOctokitClient: vi.fn(() => ({
      rest: { pulls: { createReview: githubMocks.createReview } },
    })),
  };
});

import {
  postInlineReviewIssues,
  postPRReviewWithSuggestions,
  postVerificationReview,
} from "./pr-review";
import { buildGithubArtifactBody } from "@/lib/github/github-artifact-body";

const MAIN_MARKER = "<!-- hreviewer:review:review_1:main -->";

describe("PR review posting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubMocks.createReview.mockResolvedValue({
      data: {
        id: 1,
        commit_id: "head-sha",
        submitted_at: "2026-08-26T00:00:00Z",
      },
    });
  });

  it("posts wrapper-free main content and marked suggestions once", async () => {
    const artifact = await postPRReviewWithSuggestions({
      token: "github-token",
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      reviewContent: "Lossless review",
      mainMarker: MAIN_MARKER,
      headSha: "head-sha",
      suggestions: [
        {
          file: "src/value.ts",
          line: 3,
          before: "old",
          after: "new",
          explanation: "Use the safe value.",
          severity: "WARNING",
          marker: "<!-- hreviewer:review:review_1:suggestion:suggestion_1 -->",
        },
      ],
    });

    expect(artifact).toEqual({
      id: "1",
      kind: "pull-request-review",
      commitId: "head-sha",
      postedAt: new Date("2026-08-26T00:00:00Z"),
    });
    const request = githubMocks.createReview.mock.calls[0]?.[0];
    expect(request.body).toBe(
      buildGithubArtifactBody({
        content: "Lossless review",
        marker: MAIN_MARKER,
        title: "AI Code Review",
      }),
    );
    expect(request.body.match(new RegExp(MAIN_MARKER, "g"))).toHaveLength(1);
    expect(request.comments[0].body).toContain(
      "hreviewer:review:review_1:suggestion:suggestion_1",
    );
    expect(request.request.signal).toBeInstanceOf(AbortSignal);
  });

  it("guards the independent inline issue batch and preserves full issue text", async () => {
    const beforePost = vi.fn(async () => undefined);
    await postInlineReviewIssues({
      token: "github-token",
      owner: "octo",
      repo: "sample",
      prNumber: 42,
      headSha: "head-sha",
      langCode: "en",
      beforePost,
      issues: [
        {
          file: "src/value.ts",
          line: 3,
          title: "Guard this value",
          body: "The value needs validation.",
          impact: "Invalid input can escape.",
          recommendation: "Validate before use.",
          severity: "WARNING",
          category: "bug",
          marker: "<!-- hreviewer:review:review_1:issue:issue_1 -->",
        },
      ],
    });

    expect(beforePost).toHaveBeenCalledOnce();
    const body = githubMocks.createReview.mock.calls[0]?.[0].comments[0].body;
    expect(body).toContain("The value needs validation.");
    expect(body).toContain("Invalid input can escape.");
    expect(body).toContain("Validate before use.");
    expect(body.match(/hreviewer:review:review_1:issue:issue_1/g)).toHaveLength(1);
  });

  it("returns the verification review artifact from the API response", async () => {
    await expect(
      postVerificationReview({
        token: "github-token",
        owner: "octo",
        repo: "sample",
        prNumber: 42,
        headSha: "head-sha",
        content: "Verification details",
        marker: "<!-- hreviewer:review:review_1:verification -->",
      }),
    ).resolves.toMatchObject({
      id: "1",
      kind: "pull-request-review",
      commitId: "head-sha",
    });
  });

  it("omits only an oversized native suggestion while preserving the main post", async () => {
    await expect(
      postPRReviewWithSuggestions({
        token: "github-token",
        owner: "octo",
        repo: "sample",
        prNumber: 42,
        reviewContent: "The replacement remains in the lossless main body.",
        mainMarker: MAIN_MARKER,
        headSha: "head-sha",
        suggestions: [
          {
            file: "src/value.ts",
            line: 3,
            before: "old",
            after: "가".repeat(30_000),
            explanation: "Large generated replacement",
            severity: "WARNING",
            marker:
              "<!-- hreviewer:review:review_1:suggestion:suggestion_large -->",
          },
        ],
      }),
    ).resolves.toMatchObject({ id: "1" });

    expect(githubMocks.createReview.mock.calls[0]?.[0].comments).toEqual([]);
  });
});
