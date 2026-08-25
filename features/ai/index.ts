// Barrel Export - AI Module Public API

// ===== Actions =====
export { generatePRSummary, reviewPullRequest } from "./actions";

// ===== Constants =====
export {
  GENERATOR_MODEL_ID,
  EMBEDDING_MODEL_ID,
  EMBEDDING_OUTPUT_DIMENSION,
  GITHUB_PROVIDER_ID,
} from "./constants";

// ===== Library Functions =====
export {
  buildDeterministicPrContext,
  createEmptyDeterministicPrContext,
  generateEmbedding,
  getRepositoryWithToken,
  classifyPRSize,
} from "./lib";
export type {
  BuildDeterministicPrContextParams,
  DeterministicPrContext,
  PrContextManifestEntry,
  PrContextSelection,
  PrContextSource,
  PrContextTreeStatus,
} from "./lib";
export { guardTextFeedback, structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt, getIssueLimit, formatStructuredReviewToMarkdown, buildReviewNotice } from "./lib";
export { detectRepeatIssues } from "./lib";
export type { RepeatAnnotation, RepeatBadgeInfo } from "./lib";

// ===== Types =====
export type {
  GeneratePRSummaryResult,
  PRCommand,
  PullRequestIdentityInput,
  ReviewPullRequestResult,
  ReviewRequestFailureReason,
  ReviewRequestMetadata,
} from "./types";
export type { ReviewSizeMode, PRSizeInfo } from "./lib";
export type { CodeSuggestion, StructuredIssue, SuggestionSeverity, IssueCategory } from "./types";
export type { StructuredReviewOutput } from "./lib/review-schema";
export { REVIEW_SCHEMA_VERSION } from "./lib/review-schema";

// ===== Constants (emoji) =====
export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./constants";

// ===== Review Verification (검수자) =====
export { VERIFIER_MODEL_ID } from "./constants";
export { verifyReview, applyVerification, buildVerificationReviewBody, countExcluded, storedReviewDataSchema } from "./lib";
export type { VerificationResult, AppliedVerification, VerdictEntry, StoredReviewData, ReviewVerification, VerificationVerdict } from "./lib";

// ===== Utils =====
export { parseCommand, stripFencedCodeBlocks, buildPRUrl } from "./utils";
