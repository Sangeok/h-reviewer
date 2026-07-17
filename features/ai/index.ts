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
} from "./constants";

// ===== Library Functions =====
export { generateEmbedding, getRepositoryWithToken, indexCodebase, retrieveContext, classifyPRSize, getTopKForSizeMode } from "./lib";
export { guardTextFeedback, structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt, getIssueLimit, formatStructuredReviewToMarkdown } from "./lib";
export { detectRepeatIssues } from "./lib";
export type { RepeatAnnotation, RepeatBadgeInfo } from "./lib";

// ===== Types =====
export type { EmbeddingTaskType, PRCommand, ReviewPullRequestResult, GeneratePRSummaryResult } from "./types";
export type { ReviewSizeMode, PRSizeInfo } from "./lib";
export type { CodeSuggestion, StructuredIssue, SuggestionSeverity, IssueCategory } from "./types";
export type { StructuredReviewOutput } from "./lib/review-schema";
export { REVIEW_SCHEMA_VERSION } from "./lib/review-schema";

// ===== Constants (emoji) =====
export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./constants";

// ===== Second Reviewer Verification =====
export { VERIFIER_MODEL_ID } from "./constants";
export { verifySecondReviewer, applyVerification, buildVerificationTrace, buildSecondReviewerReviewBody, storedReviewDataSchema } from "./lib";
export type { VerificationResult, AppliedVerification, VerdictEntry, StoredReviewData, ReviewVerification, VerificationVerdict } from "./lib";

// ===== Utils =====
export { parseCommand, stripFencedCodeBlocks, buildPRUrl } from "./utils";
