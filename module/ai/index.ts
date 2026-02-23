// Barrel Export - AI Module Public API

// ===== Actions =====
export { generatePRSummary, reviewPullRequest } from "./actions";

// ===== Constants =====
export {
  DEFAULT_TOP_K,
  EMBEDDING_CONTENT_MAX_LENGTH,
  EMBEDDING_MODEL_ID,
  EMBEDDING_OUTPUT_DIMENSION,
  GITHUB_PROVIDER_ID,
  PINECONE_BATCH_SIZE,
  buildPRUrl,
} from "./constants";

// ===== Library Functions =====
export { generateEmbedding, getRepositoryWithToken, indexCodebase, retrieveContext, classifyPRSize, getTopKForSizeMode, getSectionPolicy } from "./lib";

// ===== Types =====
export type { EmbeddingTaskType, PRCommand, ReviewPullRequestResult } from "./types";
export type { ReviewSizeMode, PRSizeInfo } from "./lib";

// ===== Utils =====
export { parseCommand } from "./utils/command-parser";
export { stripFencedCodeBlocks } from "./utils/text-sanitizer";
