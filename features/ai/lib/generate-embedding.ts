import { google } from "@ai-sdk/google";
import { embed } from "ai";

import {
  EMBEDDING_MODEL_ID,
  EMBEDDING_OUTPUT_DIMENSION,
} from "../constants";

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: google.textEmbeddingModel(EMBEDDING_MODEL_ID),
    value: text,
    maxRetries: 2,
    providerOptions: {
      google: {
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: EMBEDDING_OUTPUT_DIMENSION,
      },
    },
  });

  if (
    embedding.length !== EMBEDDING_OUTPUT_DIMENSION ||
    !embedding.every(Number.isFinite)
  ) {
    throw new Error("Embedding provider returned an invalid vector");
  }

  return embedding;
}
