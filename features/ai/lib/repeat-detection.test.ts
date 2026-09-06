import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repeatMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  generateEmbedding: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    reviewIssue: { findMany: repeatMocks.findMany },
  },
}));

vi.mock("./generate-embedding", () => ({
  generateEmbedding: repeatMocks.generateEmbedding,
}));

import type { StructuredIssue } from "../types";
import {
  detectRepeatIssues,
  findBestRepeatCandidate,
} from "./repeat-detection";

const CURRENT_EMBEDDING = [1, ...Array.from({ length: 767 }, () => 0)];

function createIssue(overrides: Partial<StructuredIssue> = {}): StructuredIssue {
  return {
    file: "src/foo.ts",
    line: 4,
    title: "Missing null guard for external response",
    body: "The changed code reads a nullable response without checking it first.",
    impact: "A null response can crash the request.",
    recommendation: "Guard the response before reading its fields.",
    severity: "WARNING",
    category: "bug",
    ...overrides,
  };
}

function createCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "candidate-id",
    category: "bug",
    embedding: CURRENT_EMBEDDING,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    review: { prUrl: "https://github.com/example/repo/pull/1" },
    ...overrides,
  };
}

describe("findBestRepeatCandidate", () => {
  it("accepts a same-category candidate exactly at the production threshold", () => {
    const thresholdEmbedding = [
      0.9,
      Math.sqrt(1 - (0.9 ** 2)),
      ...Array.from({ length: 766 }, () => 0),
    ];

    const result = findBestRepeatCandidate({
      category: "bug",
      embedding: CURRENT_EMBEDDING,
      candidates: [{
        id: "threshold",
        category: "bug",
        embedding: thresholdEmbedding,
      }],
    });

    expect(result?.id).toBe("threshold");
    expect(result?.similarity).toBeCloseTo(0.9);
  });

  it("keeps category filtering and ignores malformed embeddings", () => {
    const result = findBestRepeatCandidate({
      category: "bug",
      embedding: CURRENT_EMBEDDING,
      candidates: [
        { id: "other-category", category: "testing", embedding: CURRENT_EMBEDDING },
        { id: "short", category: "bug", embedding: [1, 0] },
        {
          id: "non-finite",
          category: "bug",
          embedding: [...CURRENT_EMBEDDING.slice(0, 767), Number.NaN],
        },
      ],
    });

    expect(result).toBeNull();
  });

  it("returns the highest-similarity compatible candidate", () => {
    const lowerSimilarityEmbedding = [
      0.95,
      Math.sqrt(1 - (0.95 ** 2)),
      ...Array.from({ length: 766 }, () => 0),
    ];

    expect(findBestRepeatCandidate({
      category: "bug",
      embedding: CURRENT_EMBEDDING,
      candidates: [
        { id: "lower", category: "bug", embedding: lowerSimilarityEmbedding },
        { id: "highest", category: "bug", embedding: CURRENT_EMBEDDING },
      ],
    })).toEqual({ id: "highest", similarity: 1 });
  });
});

describe("detectRepeatIssues", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T00:00:00Z"));
    vi.clearAllMocks();
    repeatMocks.findMany.mockResolvedValue([]);
    repeatMocks.generateEmbedding.mockResolvedValue(CURRENT_EMBEDDING);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves the user, 90-day, ignored-status, and same-PR query contract", async () => {
    await detectRepeatIssues({
      issues: [createIssue()],
      userId: "user-id",
      repositoryId: "repository-id",
      prNumber: 12,
    });

    expect(repeatMocks.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-id",
        createdAt: { gte: new Date("2026-05-06T00:00:00Z") },
        resolutionStatus: { not: "IGNORED" },
        NOT: {
          review: { repositoryId: "repository-id", prNumber: 12 },
        },
      },
      select: {
        id: true,
        category: true,
        embedding: true,
        createdAt: true,
        review: { select: { prUrl: true } },
      },
    });
  });

  it("calls the repeat-only embedding API without a task argument", async () => {
    const issue = createIssue();

    const [annotation] = await detectRepeatIssues({
      issues: [issue],
      userId: "user-id",
      repositoryId: "repository-id",
      prNumber: 12,
    });

    expect(repeatMocks.generateEmbedding).toHaveBeenCalledWith(
      `${issue.title}\n${issue.body}`,
    );
    expect(repeatMocks.generateEmbedding.mock.calls[0]).toHaveLength(1);
    expect(annotation.embedding).toBe(CURRENT_EMBEDDING);
  });

  it("selects the highest compatible same-category candidate above the threshold", async () => {
    const lowerSimilarityEmbedding = [
      0.95,
      Math.sqrt(1 - (0.95 ** 2)),
      ...Array.from({ length: 766 }, () => 0),
    ];
    repeatMocks.findMany.mockResolvedValue([
      createCandidate({
        id: "lower-id",
        embedding: lowerSimilarityEmbedding,
        review: { prUrl: "https://github.com/example/repo/pull/2" },
      }),
      createCandidate({ id: "best-id" }),
      createCandidate({ id: "different-category", category: "testing" }),
    ]);

    const [annotation] = await detectRepeatIssues({
      issues: [createIssue()],
      userId: "user-id",
      repositoryId: "repository-id",
      prNumber: 12,
    });

    expect(annotation).toMatchObject({
      isRepeat: true,
      repeatOfIssueId: "best-id",
      repeatSimilarity: 1,
      repeat: {
        prUrl: "https://github.com/example/repo/pull/1",
        date: "2026-08-01",
      },
    });
  });

  it("ignores incompatible candidate JSON vectors", async () => {
    repeatMocks.findMany.mockResolvedValue([
      createCandidate({ id: "short", embedding: [1, 0] }),
      createCandidate({
        id: "nan",
        embedding: [...CURRENT_EMBEDDING.slice(0, 767), Number.NaN],
      }),
      createCandidate({
        id: "infinite",
        embedding: [...CURRENT_EMBEDDING.slice(0, 767), Number.POSITIVE_INFINITY],
      }),
      createCandidate({
        id: "string",
        embedding: [...CURRENT_EMBEDDING.slice(0, 767), "0"],
      }),
      createCandidate({ id: "null", embedding: null }),
    ]);

    const [annotation] = await detectRepeatIssues({
      issues: [createIssue()],
      userId: "user-id",
      repositoryId: "repository-id",
      prNumber: 12,
    });

    expect(annotation).toMatchObject({
      isRepeat: false,
      repeatOfIssueId: null,
      repeatSimilarity: null,
      repeat: null,
    });
  });

  it("skips the provider and returns a non-repeat annotation for short text", async () => {
    const [annotation] = await detectRepeatIssues({
      issues: [createIssue({ title: "Short", body: "text" })],
      userId: "user-id",
      repositoryId: "repository-id",
      prNumber: 12,
    });

    expect(repeatMocks.generateEmbedding).not.toHaveBeenCalled();
    expect(annotation).toEqual({
      embedding: null,
      isRepeat: false,
      repeatOfIssueId: null,
      repeatSimilarity: null,
      repeat: null,
    });
  });

  it("propagates provider failures to the worker fail-open boundary", async () => {
    repeatMocks.generateEmbedding.mockRejectedValue(new Error("provider failed"));

    await expect(detectRepeatIssues({
      issues: [createIssue()],
      userId: "user-id",
      repositoryId: "repository-id",
      prNumber: 12,
    })).rejects.toThrow("provider failed");
  });
});
