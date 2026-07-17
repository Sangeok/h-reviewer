import { google } from "@ai-sdk/google";
import { embed } from "ai";
import { EMBEDDING_MODEL_ID, EMBEDDING_OUTPUT_DIMENSION } from "../constants";
import { type EmbeddingTaskType } from "../types";

export async function generateEmbedding(text: string, taskType: EmbeddingTaskType) {
  const { embedding } = await embed({
    model: google.textEmbeddingModel(EMBEDDING_MODEL_ID),
    value: text,
    providerOptions: {
      google: {
        taskType,
        outputDimensionality: EMBEDDING_OUTPUT_DIMENSION,
      },
    },
  });

  return embedding;
}
