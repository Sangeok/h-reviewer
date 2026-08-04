import { beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  embed: vi.fn(),
  textEmbeddingModel: vi.fn(() => ({ provider: "google-test-model" })),
}));

vi.mock("ai", () => ({ embed: providerMocks.embed }));
vi.mock("@ai-sdk/google", () => ({
  google: { textEmbeddingModel: providerMocks.textEmbeddingModel },
}));

import { generateEmbedding } from "./generate-embedding";

const VALID_EMBEDDING = Array.from({ length: 768 }, (_, index) => index / 768);

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMocks.embed.mockResolvedValue({ embedding: VALID_EMBEDDING });
  });

  it("uses the preserved semantic-similarity model and 768-dimensional contract", async () => {
    await generateEmbedding("Issue title and body");

    expect(providerMocks.textEmbeddingModel).toHaveBeenCalledWith(
      "gemini-embedding-001",
    );
    expect(providerMocks.embed).toHaveBeenCalledWith({
      model: { provider: "google-test-model" },
      value: "Issue title and body",
      maxRetries: 2,
      providerOptions: {
        google: {
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: 768,
        },
      },
    });
  });

  it("returns a finite 768-dimensional embedding unchanged", async () => {
    await expect(generateEmbedding("Issue title and body")).resolves.toBe(
      VALID_EMBEDDING,
    );
  });

  it.each([
    ["wrong length", Array.from({ length: 767 }, () => 0.1)],
    ["NaN value", [...VALID_EMBEDDING.slice(0, 767), Number.NaN]],
    ["infinite value", [...VALID_EMBEDDING.slice(0, 767), Number.POSITIVE_INFINITY]],
  ])("rejects an invalid provider vector with %s", async (_case, embedding) => {
    providerMocks.embed.mockResolvedValue({ embedding });

    await expect(generateEmbedding("Issue title and body")).rejects.toThrow(
      "Embedding provider returned an invalid vector",
    );
  });
});
