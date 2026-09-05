import prisma from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ReviewFailureStage } from "@/lib/generated/prisma/enums";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/lib/github/github";
import {
  postPRReviewWithSuggestions,
  postVerificationReview,
  type PersistedReviewIssue,
  type PersistedReviewSuggestion,
} from "@/features/review/lib/pr-review";
import {
  buildDeterministicPrContext, createEmptyDeterministicPrContext, classifyPRSize,
  structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt,
  getIssueLimit, formatStructuredReviewToMarkdown, buildReviewNotice,
  REVIEW_SCHEMA_VERSION, guardTextFeedback,
  detectRepeatIssues,
  verifyReview, applyVerification, buildVerificationReviewBody, countExcluded, VERIFIER_MODEL_ID,
  GENERATOR_MODEL_ID,
} from "@/features/ai";
import type {
  ReviewSizeMode,
  StructuredReviewOutput,
  VerificationResult,
} from "@/features/ai";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeMermaidSequenceDiagrams } from "@/lib/github/github-markdown";
import { isValidLanguageCode } from "@/features/settings";
import { SECTION_HEADERS, DIAGRAM_FALLBACK_TEXT } from "@/shared/constants";
import {
  extractDiffAddedLinesMap,
  extractDiffFileSet,
  extractDiffPathAliases,
  filterNonReviewableFiles,
  isRangeFullyAdded,
  parseDiffToChangedFiles,
  unescapeGitPath,
} from "@/lib/github/diff-parser";
import type { LanguageCode } from "@/features/settings";
import type { HReviewerEvents } from "../events";
import {
  claimReviewExecution,
  recordGithubMainArtifact,
  renewReviewExecutionLease,
  transitionReviewExecution,
} from "@/features/review/lib/review-execution-state";
import {
  consumeTrialCredit,
  releaseTrialCredit,
} from "@/features/payment/lib/review-trial";
import { assertCurrentReviewHead } from "@/features/review/lib/review-head-guard";
import { buildReviewArtifactMarker } from "@/features/review/lib/review-artifact-marker";
import { createReviewFailureHandler } from "@/features/review/lib/review-on-failure";
import {
  assertGithubArtifactBodyBudget,
  buildGithubArtifactBody,
} from "@/lib/github/github-artifact-body";
import {
  findGithubReviewArtifact,
  type PostedGithubArtifact,
} from "@/lib/github/github-review-artifacts";

const CONTEXT_BUILD_TIMEOUT_MS = 45_000;

/**
 * 구조화 생성 / 마크다운 폴백 타임아웃.
 *
 * 예산 근거: app/api/inngest/route.ts의 maxDuration = 300s가 HTTP 호출당 상한이다.
 * generate-ai-review의 최악 경로를 합산해야 한다:
 *   context(45s) + 구조화(150s) + 폴백(40s) = 235s < 300s  (여유 65s)
 *
 * 여유분을 65s로 잡은 이유: 이 스텝이 해당 호출에서 유일한 작업이라는 보장이 없다.
 * Inngest는 통상 호출당 새 스텝 하나를 실행하지만, 앞선 스텝(fetch-pr-data 등)과
 * 같은 호출에 묶이면 그만큼이 예산에서 빠진다. 여기에 네트워크·Zod 재검증·마크다운
 * 변환·대용량 스텝 결과 직렬화 오버헤드가 더해진다.
 * ⚠️ 어느 값이든 올릴 때는 이 합이 maxDuration을 넘지 않는지 반드시 확인할 것.
 * 넘으면 플랫폼이 함수를 중간에 죽여 로그조차 남지 않는다.
 *
 * 실측(2026-08-10) 구조화 생성 소요: 42.6s / 48.5s / 107.7s
 * (마지막은 138 files / 100KB / 30.8k tokens PR). 150s면 최악 관측값 대비 39% 여유다.
 * 이전 값 100s에서는 그런 PR이 매번 타임아웃 → 마크다운 폴백으로 떨어져
 * 인라인 제안·이슈 행·검수·반복 감지를 전부 잃었다.
 */
const AI_GENERATION_TIMEOUT_MS = 150_000;
const AI_FALLBACK_TIMEOUT_MS = 40_000;
const deterministicContextEnabled =
  process.env.DETERMINISTIC_PR_CONTEXT_ENABLED !== "false";

type SafeExternalErrorSummary = {
  name: string;
  status: number | null;
};

type GenerateAiReviewStepResult = {
  rawReview: string;
  structuredOutput: StructuredReviewOutput | null;
};

export type ReviewWorkerEventData =
  HReviewerEvents["pr.review.requested"]["data"];

export type ReviewWorkerStep = {
  run<T>(id: string, handler: () => Promise<T> | T): Promise<T>;
};

export type ReviewWorkerHandler = (input: {
  event: { data: ReviewWorkerEventData };
  step: ReviewWorkerStep;
}) => Promise<{ success: true }>;

export type ReviewWorkerDependencies = {
  prisma: typeof prisma;
  getPullRequestDiff: typeof getPullRequestDiff;
  postReviewComment: typeof postReviewComment;
  postPRReviewWithSuggestions: typeof postPRReviewWithSuggestions;
  postVerificationReview: typeof postVerificationReview;
  findGithubReviewArtifact: typeof findGithubReviewArtifact;
  buildDeterministicPrContext: typeof buildDeterministicPrContext;
  generateText: typeof generateText;
  createGeneratorModel: typeof google;
  verifyReview: typeof verifyReview;
  detectRepeatIssues: typeof detectRepeatIssues;
  assertCurrentReviewHead: typeof assertCurrentReviewHead;
  consumeTrialCredit: typeof consumeTrialCredit;
  releaseTrialCredit: typeof releaseTrialCredit;
  createTimeoutSignal(milliseconds: number): AbortSignal;
  now(): Date;
};

type PersistedReviewPostingData = {
  suggestions: PersistedReviewSuggestion[];
  issues: PersistedReviewIssue[];
};

type ClaimedReviewRequest = {
  id: string;
  review: string;
  attemptCount: number;
  headSha: string;
  githubAuthorId: string;
  langCode: string;
  maxSuggestions: number | null;
  verificationEnabled: boolean;
  repository: {
    id: string;
    owner: string;
    name: string;
    userId: string;
  };
  prNumber: number;
  trialCreditState: "NOT_APPLICABLE" | "RESERVED";
};

async function getBoundGithubToken(
  dependencies: ReviewWorkerDependencies,
  reviewRequest: ClaimedReviewRequest,
): Promise<string> {
  const account = await dependencies.prisma.account.findFirst({
    where: {
      accountId: reviewRequest.githubAuthorId,
      userId: reviewRequest.repository.userId,
      providerId: "github",
    },
    select: { accessToken: true },
  });

  if (!account?.accessToken) {
    throw new Error("The persisted GitHub account binding is unavailable");
  }

  return account.accessToken;
}

async function assertAndRenewCurrentReviewHead(input: {
  dependencies: ReviewWorkerDependencies;
  reviewRequest: ClaimedReviewRequest;
  attempt: number;
  leaseToken: string;
  allowedStatuses: readonly ("RUNNING" | "POSTING")[];
}): Promise<void> {
  await input.dependencies.assertCurrentReviewHead({
    reviewId: input.reviewRequest.id,
    attempt: input.attempt,
    leaseToken: input.leaseToken,
    expectedHeadSha: input.reviewRequest.headSha,
    allowedStatuses: input.allowedStatuses,
  });
  await renewReviewExecutionLease(
    {
      reviewId: input.reviewRequest.id,
      attempt: input.attempt,
      leaseToken: input.leaseToken,
      leaseOwner: "WORKER",
      allowedStatuses: input.allowedStatuses,
      now: input.dependencies.now(),
    },
    input.dependencies.prisma,
  );
}

/**
 * AbortSignal.timeout() 발화 여부.
 *
 * 흐름을 바꾸지는 않는다(폴백은 그대로 시도한다). 로그 심각도를 가르는 데만 쓴다 —
 * 타임아웃으로 인한 축소는 diff가 예산을 넘었다는 구조적 신호이므로 warn이 아니라
 * error로 남겨야 한다. 사용자에게 보이는 고지는 buildReviewNotice가 담당한다.
 */
function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const message = "message" in error ? String(error.message).toLowerCase() : "";
  return message.includes("aborted due to timeout") || message.includes("timeout");
}

function getSafeExternalErrorSummary(
  error: unknown,
): SafeExternalErrorSummary {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : null;

  return {
    name: error instanceof Error ? error.name : "UnknownError",
    status,
  };
}

function isDeterministicGithubValidationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 422
  );
}

async function failReviewExecutionAndReleaseCredit(input: {
  dependencies: ReviewWorkerDependencies;
  reviewRequest: ClaimedReviewRequest;
  attempt: number;
  leaseToken: string;
  stage: ReviewFailureStage;
  message: string;
}): Promise<void> {
  const now = input.dependencies.now();
  await input.dependencies.prisma.$transaction(async (transactionClient) => {
    if (input.reviewRequest.trialCreditState === "RESERVED") {
      await input.dependencies.releaseTrialCredit(
        {
          reviewId: input.reviewRequest.id,
          attempt: input.attempt,
          leaseToken: input.leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["RUNNING"],
        },
        transactionClient,
      );
    }

    await transitionReviewExecution(
      {
        reviewId: input.reviewRequest.id,
        attempt: input.attempt,
        leaseToken: input.leaseToken,
        leaseOwner: "WORKER",
        now,
        from: ["RUNNING"],
        to: "FAILED",
        failure: { stage: input.stage, message: input.message },
      },
      transactionClient,
    );
  });
}

async function recordMainArtifactAndConsumeCredit(input: {
  dependencies: ReviewWorkerDependencies;
  reviewRequest: ClaimedReviewRequest;
  attempt: number;
  leaseToken: string;
  artifact: PostedGithubArtifact;
}): Promise<void> {
  const now = input.dependencies.now();
  await input.dependencies.prisma.$transaction(async (transactionClient) => {
    if (input.reviewRequest.trialCreditState === "RESERVED") {
      await input.dependencies.consumeTrialCredit(
        {
          reviewId: input.reviewRequest.id,
          attempt: input.attempt,
          leaseToken: input.leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["POSTING"],
          githubMainReviewId: input.artifact.id,
          postedAt: input.artifact.postedAt,
        },
        transactionClient,
      );
      return;
    }

    await recordGithubMainArtifact(
      {
        reviewId: input.reviewRequest.id,
        attempt: input.attempt,
        leaseToken: input.leaseToken,
        leaseOwner: "WORKER",
        allowedStatuses: ["POSTING"],
        artifactId: input.artifact.id,
        postedAt: input.artifact.postedAt,
        now,
      },
      transactionClient,
    );
  });
}

function normalizeGenerateAiReviewStepResult(
  value: unknown,
): GenerateAiReviewStepResult {
  if (typeof value === "string") {
    return { rawReview: value, structuredOutput: null };
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("rawReview" in value) ||
    typeof value.rawReview !== "string"
  ) {
    throw new Error("Unsupported memoized AI review result");
  }

  if (!("structuredOutput" in value) || value.structuredOutput === null) {
    return { rawReview: value.rawReview, structuredOutput: null };
  }

  const parsed = structuredReviewSchema.safeParse(value.structuredOutput);

  return {
    rawReview: value.rawReview,
    structuredOutput: parsed.success ? parsed.data : null,
  };
}

/**
 * AI가 echo한 파일 경로를 diffFiles의 정규화된 경로로 해결한다.
 * 1. 완전 매치
 * 2. AI가 raw diff escape 경로를 그대로 copy한 경우 → unescape 후 재시도
 * 3. basename fallback (충돌 시 drop)
 */
function resolveToDiffPath(
  file: string,
  diffFiles: Set<string>,
  diffArray: string[],
  pathAliases: Map<string, string>,
  scope: "walkthrough" | "issues" | "suggestions",
): string | null {
  const unescaped = unescapeGitPath(file);
  const currentPath = pathAliases.get(unescaped) ?? unescaped;
  if (diffFiles.has(currentPath)) return currentPath;

  const basename = currentPath.split("/").pop() ?? currentPath;
  const matches = diffArray.filter(
    (f) => f.endsWith("/" + basename) || f === basename,
  );

  if (matches.length === 0) {
    console.warn(`[${scope}] dropped entry`, { file, reason: "no_match" });
    return null;
  }
  if (matches.length > 1) {
    console.warn(`[${scope}] dropped entry`, {
      file, reason: "basename_collision", basename, candidates: matches,
    });
    return null;
  }
  return matches[0];
}

function resolveEntryFile<T extends { file: string }>(
  entry: T,
  diffFiles: Set<string>,
  diffArray: string[],
  pathAliases: Map<string, string>,
  scope: "walkthrough" | "issues" | "suggestions",
): T | null {
  const resolved = resolveToDiffPath(
    entry.file,
    diffFiles,
    diffArray,
    pathAliases,
    scope,
  );
  if (!resolved) return null;
  return resolved === entry.file ? entry : { ...entry, file: resolved };
}

/**
 * 게시·저장 직전 병렬 배열 길이 동등성 soft assert.
 * finalOutput.issues와 병렬 배열(검증 판정·반복 감지 주석)은 같은 index가 같은
 * 이슈를 가리킨다는 암묵적 약속 위에 있다 — 어긋나면 배지·embedding이 엉뚱한
 * 이슈에 붙는다. 이 함수는 그 약속의 필요조건인 "길이 동등성"만 검증한다
 * (같은 길이로 재정렬된 배열은 통과 — 요소 대응까지 보장하지 않는다).
 * 어긋나면 warn을 남기고 false를 반환하며, 호출부는 해당 장식 부착만 생략하고
 * 게시·저장 자체는 진행한다 (fail-open, Step 5.3/5.5와 동일 철학).
 */
function checkLengthAlignment(
  scope: "post-review" | "save-review" | "persist-review",
  name: string,
  expected: number,
  actual: number,
  options?: { allowEmpty?: boolean },
): boolean {
  if (actual === expected) return true;
  if (options?.allowEmpty && actual === 0) return true;
  // "[index-alignment]"는 검증 절차가 grep하는 고정 로그 토큰 — 변경 시 이 토큰을 확인하는 절차도 함께 수정
  console.warn(`[index-alignment] ${name} length mismatch — related decorations skipped`, {
    scope,
    expected,
    actual,
  });
  return false;
}

/** repeatAnnotations 전용 wrapper — 빈 배열 허용(allowEmpty) 정책을 배열에 바인딩한다.
 *  Step 5.5는 실패·이슈 0개 시 []를 반환하므로 빈 배열은 정상 상태다. */
function checkRepeatsAligned(
  scope: "post-review" | "save-review" | "persist-review",
  expected: number,
  actual: number,
): boolean {
  return checkLengthAlignment(scope, "repeatAnnotations", expected, actual, { allowEmpty: true });
}

export function createGenerateReviewHandler(
  dependencies: ReviewWorkerDependencies,
): ReviewWorkerHandler {
  return async ({ event, step }) => {
    const { reviewId, attempt } = event.data;
    const { leaseToken } = await step.run("claim-review", () =>
      claimReviewExecution(
        { reviewId, attempt, now: dependencies.now() },
        dependencies.prisma,
      ),
    );
    const reviewRequest = await step.run("load-review-request", async () => {
      const review = await dependencies.prisma.review.findUnique({
        where: { id: reviewId },
        select: {
          id: true,
          review: true,
          attemptCount: true,
          headSha: true,
          githubAuthorId: true,
          langCode: true,
          maxSuggestions: true,
          verificationEnabled: true,
          trialCreditState: true,
          prNumber: true,
          repository: {
            select: {
              id: true,
              owner: true,
              name: true,
              userId: true,
            },
          },
        },
      });

      if (
        !review ||
        !review.headSha ||
        !review.githubAuthorId ||
        review.attemptCount !== attempt ||
        (
          review.trialCreditState !== "NOT_APPLICABLE" &&
          review.trialCreditState !== "RESERVED"
        )
      ) {
        throw new Error("Claimed review request data is incomplete");
      }

      return {
        ...review,
        headSha: review.headSha,
        githubAuthorId: review.githubAuthorId,
        trialCreditState: review.trialCreditState,
      } satisfies ClaimedReviewRequest;
    });
    const owner = reviewRequest.repository.owner;
    const repo = reviewRequest.repository.name;
    const prNumber = reviewRequest.prNumber;
    const userId = reviewRequest.repository.userId;
    const preferredLanguage = reviewRequest.langCode;
    const maxSuggestions = reviewRequest.maxSuggestions;
    const verificationEnabled = reviewRequest.verificationEnabled;

    if (event.data.resumeFromPersisted) {
      const mainMarker = buildReviewArtifactMarker(reviewId, "main");
      const canPost = await step.run("prepare-persisted-review-post", async () => {
        try {
          const body = buildGithubArtifactBody({
            content: reviewRequest.review,
            marker: mainMarker,
            title: "AI Code Review",
          });
          assertGithubArtifactBodyBudget({ body });
        } catch {
          await failReviewExecutionAndReleaseCredit({
            dependencies,
            reviewRequest,
            attempt,
            leaseToken,
            stage: "PERSIST",
            message: "The persisted review exceeds the safe GitHub artifact budget.",
          });
          return false;
        }

        await transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["RUNNING"],
            to: "POSTING",
            lastCompletedStage: "PERSISTED",
          },
          dependencies.prisma,
        );
        return true;
      });
      if (!canPost) return { success: true };

      const artifact = await step.run(
        "post-persisted-review",
        async (): Promise<PostedGithubArtifact> => {
          const token = await getBoundGithubToken(dependencies, reviewRequest);
          await assertAndRenewCurrentReviewHead({
            dependencies,
            reviewRequest,
            attempt,
            leaseToken,
            allowedStatuses: ["POSTING"],
          });
          const existingArtifact = await dependencies.findGithubReviewArtifact({
            token,
            owner,
            repo,
            prNumber,
            marker: mainMarker,
            expectedAuthorId: reviewRequest.githubAuthorId,
            expectedHeadSha: reviewRequest.headSha,
          });

          return existingArtifact ?? dependencies.postReviewComment({
            token,
            owner,
            repo,
            prNumber,
            content: reviewRequest.review,
            marker: mainMarker,
            title: "AI Code Review",
          });
        },
      );

      await step.run("record-persisted-review-artifact", () =>
        recordMainArtifactAndConsumeCredit({
          dependencies,
          reviewRequest,
          attempt,
          leaseToken,
          artifact,
        }),
      );
      await step.run("complete-persisted-review", () =>
        transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["POSTING"],
            to: "COMPLETED",
            lastCompletedStage: "MAIN_POSTED",
          },
          dependencies.prisma,
        ),
      );

      return { success: true };
    }

    // ── Step 1: PR 데이터 + 크기 정보 가져오기 ──
    const fetchResult = await step.run("fetch-pr-data", async () => {
      await renewReviewExecutionLease(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["RUNNING"],
          now: dependencies.now(),
        },
        dependencies.prisma,
      );

      try {
        const token = await getBoundGithubToken(dependencies, reviewRequest);
        const data = await dependencies.getPullRequestDiff({
          token,
          owner,
          repo,
          prNumber,
        });

        return data;
      } catch {
        await failReviewExecutionAndReleaseCredit({
          dependencies,
          reviewRequest,
          attempt,
          leaseToken,
          stage: "FETCH",
          message: "Pull request data could not be fetched.",
        });
        return null;
      }
    });

    if (!fetchResult) {
      return { success: true };
    }

    const {
      diff: rawDiff,
      title,
      description,
      additions,
      deletions,
      changedFiles,
      headSha,
    } = fetchResult;

    // ── Step 1.5: 기계 생성 파일(lock 파일 등) 제거 ──
    // diff 크기를 지배하면서 리뷰 가치는 0이라 타임아웃만 유발한다.
    // 프롬프트·검증·검수 전 경로가 같은 diff를 봐야 하므로 여기서 한 번만 필터한다.
    //
    // 전부 제외되면(예: lock 파일만 바꾼 dependabot PR) 원본을 쓴다 —
    // 빈 diff를 모델에 보내는 새 실패 모드를 만들지 않는다.
    const filtered = filterNonReviewableFiles(rawDiff);
    const hasReviewableContent = extractDiffFileSet(filtered.diff).size > 0;
    const diff = hasReviewableContent ? filtered.diff : rawDiff;
    const excludedFiles = hasReviewableContent ? filtered.excludedFiles : [];

    if (filtered.excludedFiles.length > 0) {
      console.info("[diff-filter] non-reviewable files", {
        owner,
        repo,
        prNumber,
        excluded: filtered.excludedFiles,
        appliedFilter: hasReviewableContent,
        rawChars: rawDiff.length,
        filteredChars: diff.length,
      });
    }

    const baseSha =
      "baseSha" in fetchResult && typeof fetchResult.baseSha === "string"
        ? fetchResult.baseSha
        : null;

    const headRepository =
      "headRepository" in fetchResult
        ? fetchResult.headRepository ?? null
        : null;

    // ── Step 2: 크기 분류 + 언어 코드 (이후 모든 step에서 공유) ──
    const langCode: LanguageCode = isValidLanguageCode(preferredLanguage) ? preferredLanguage : "en";
    const sizeMode: ReviewSizeMode = classifyPRSize({ additions, deletions, changedFiles });

    // ── Step 3: deterministic context + AI 리뷰 생성 ──
    // 같은 step ID와 반환 shape를 유지해 배포 전 memoized run과 호환한다.
    const aiStepResult: unknown = await step.run("generate-ai-review", async () => {
      await assertAndRenewCurrentReviewHead({
        dependencies,
        reviewRequest,
        attempt,
        leaseToken,
        allowedStatuses: ["RUNNING"],
      });
      let deterministicContext = createEmptyDeterministicPrContext(headSha);

      if (!deterministicContextEnabled) {
        console.warn("[pr-context] disabled by operator; using diff-only review", {
          owner,
          repo,
          prNumber,
          baseSha,
          headSha,
          characters: 0,
          fileCount: 0,
          manifestIdentitySha256: null,
          failedFileCount: 0,
          treeStatus: "not-requested",
        });
      } else if (!headRepository) {
        console.warn("[pr-context] head repository unavailable; using diff-only review", {
          owner,
          repo,
          prNumber,
          baseSha,
          headSha,
          characters: 0,
          fileCount: 0,
          manifestIdentitySha256: null,
          failedFileCount: 0,
          treeStatus: "not-requested",
        });
      } else {
        try {
          const token = await getBoundGithubToken(
            dependencies,
            reviewRequest,
          );
          deterministicContext = await dependencies.buildDeterministicPrContext({
            token,
            owner: headRepository.owner,
            repo: headRepository.repo,
            headSha,
            diff,
            sizeMode,
            signal: dependencies.createTimeoutSignal(CONTEXT_BUILD_TIMEOUT_MS),
          });

          const sourceCounts = {
            changed: 0,
            "related-test": 0,
            "direct-import": 0,
          };
          for (const entry of deterministicContext.manifest) {
            sourceCounts[entry.source] += 1;
          }

          console.info("[pr-context] context built", {
            owner,
            repo,
            prNumber,
            baseSha,
            headSha,
            characters: deterministicContext.content.length,
            fileCount: deterministicContext.manifest.length,
            manifestIdentitySha256:
              deterministicContext.manifestIdentitySha256,
            sourceCounts,
            truncatedFileCount: deterministicContext.manifest.filter(
              (entry) => entry.truncated,
            ).length,
            omittedByBudgetCount: deterministicContext.omittedByBudgetCount,
            failedFileCount: deterministicContext.failedFileCount,
            treeStatus: deterministicContext.treeStatus,
          });
        } catch (error) {
          console.warn("[pr-context] context build failed; using diff-only review", {
            owner,
            repo,
            prNumber,
            baseSha,
            headSha,
            error: getSafeExternalErrorSummary(error),
          });
        }
      }

      const headers = SECTION_HEADERS[langCode];
      const changedFilesSummary = parseDiffToChangedFiles(diff);

      // 구조화 출력 시도
      try {
        const prompt = buildStructuredPrompt({
          title,
          description,
          diff,
          deterministicContext: deterministicContext.content,
          langCode,
          sizeMode,
          changedFilesSummary,
          maxSuggestions,
        });

        const { experimental_output } = await dependencies.generateText({
          model: dependencies.createGeneratorModel(GENERATOR_MODEL_ID),
          experimental_output: Output.object({ schema: structuredReviewSchema }),
          prompt,
          abortSignal: dependencies.createTimeoutSignal(AI_GENERATION_TIMEOUT_MS),
        });

        if (experimental_output) {
          // SDK 레벨 검증을 신뢰하지 않고 Zod로 재검증 — 비정상 line 값 등 방어
          const parsed = structuredReviewSchema.safeParse(experimental_output);
          if (!parsed.success) {
            console.warn("Structured output re-validation failed", {
              issueCount: parsed.error.issues.length,
            });
            // fallback으로 진행
          } else {
            const markdown = formatStructuredReviewToMarkdown(parsed.data, langCode);
            return { rawReview: markdown, structuredOutput: parsed.data };
          }
        }
      } catch (error) {
        // 타임아웃은 diff가 예산보다 크다는 신호다. 폴백은 여전히 시도한다 —
        // 마크다운은 출력이 단순해 구조화가 못 한 크기에서 성공할 여지가 있고,
        // 폴백 예산(50s)은 maxDuration 합산에 이미 반영돼 있다.
        // 다만 warn이 아니라 error로 남긴다: 크기 때문에 리뷰가 축소되는 것은
        // 조용히 지나가면 안 되는 사건이다.
        const logDegradation = isTimeoutError(error) ? console.error : console.warn;
        logDegradation("Structured output failed; using markdown fallback", {
          owner,
          repo,
          prNumber,
          timedOut: isTimeoutError(error),
          timeoutMs: AI_GENERATION_TIMEOUT_MS,
          diffChars: diff.length,
          changedFiles,
          sizeMode,
          error: getSafeExternalErrorSummary(error),
        });
      }

      // 폴백: 기존 마크다운 경로
      try {
        const fallbackPrompt = buildFallbackPrompt({
          title,
          description,
          diff,
          deterministicContext: deterministicContext.content,
          langCode,
          sizeMode,
          headers,
        });
        // 구조화가 이미 예산을 상당히 태웠을 수 있어 폴백은 짧은 상한을 쓴다
        // (maxDuration 합산 근거는 AI_FALLBACK_TIMEOUT_MS 주석 참조).
        const { text } = await dependencies.generateText({
          model: dependencies.createGeneratorModel(GENERATOR_MODEL_ID),
          prompt: fallbackPrompt,
          abortSignal: dependencies.createTimeoutSignal(AI_FALLBACK_TIMEOUT_MS),
        });

        return { rawReview: text, structuredOutput: null };
      } catch (error) {
        console.error("AI review generation failed", {
          error: getSafeExternalErrorSummary(error),
        });
        throw new Error("AI review generation failed");
      }
    });

    const { rawReview, structuredOutput } =
      normalizeGenerateAiReviewStepResult(aiStepResult);

    // ── Step 5: 검증 게이트 (validate → markdown 재생성 → sanitize) ──
    const { review, validatedStructuredOutput } = await step.run("validate-review", async () => {
      // ── 1. sequenceDiagram 검증 ──
      let validatedOutput = structuredOutput;
      if (structuredOutput?.sequenceDiagram) {
        const wrappedDiagram = `\`\`\`mermaid\n${structuredOutput.sequenceDiagram}\n\`\`\``;
        const sanitizedDiagram = sanitizeMermaidSequenceDiagrams(wrappedDiagram, langCode);
        const diagramFailed =
          sanitizedDiagram.includes(DIAGRAM_FALLBACK_TEXT.en) ||
          sanitizedDiagram.includes(DIAGRAM_FALLBACK_TEXT.ko);

        if (diagramFailed) {
          validatedOutput = { ...structuredOutput, sequenceDiagram: null };
        }
      }

      // ── 2. diffFiles / diffArray 한 번만 계산 ──
      const diffFiles = extractDiffFileSet(diff);
      const diffArray = Array.from(diffFiles);
      const pathAliases = extractDiffPathAliases(diff);
      const addedLinesMap = extractDiffAddedLinesMap(diff);

      // ── 3. walkthrough 검증: diff 파일 목록으로 필터링 + basename fallback ──
      if (validatedOutput?.walkthrough) {
        validatedOutput = {
          ...validatedOutput,
          walkthrough: validatedOutput.walkthrough
            .map((entry) => resolveEntryFile(
              entry,
              diffFiles,
              diffArray,
              pathAliases,
              "walkthrough",
            ))
            .filter((e): e is NonNullable<typeof e> => e !== null),
        };
      }

      // ── 4. issues 경로 해결 ──
      if (validatedOutput?.issues) {
        validatedOutput = {
          ...validatedOutput,
          issues: validatedOutput.issues
            .map((issue) => {
              if (issue.file === null) return issue; // project-level
              if (issue.line !== null && issue.line < 1) return null;
              const resolved = resolveToDiffPath(
                issue.file,
                diffFiles,
                diffArray,
                pathAliases,
                "issues",
              );
              if (!resolved) return null;
              return resolved === issue.file ? issue : { ...issue, file: resolved };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null),
        };
      }

      // ── 5. suggestions 경로 해결 ──
      if (validatedOutput?.suggestions) {
        validatedOutput = {
          ...validatedOutput,
          suggestions: validatedOutput.suggestions
            .map((suggestion) => resolveEntryFile(
              suggestion,
              diffFiles,
              diffArray,
              pathAliases,
              "suggestions",
            ))
            .filter((s): s is NonNullable<typeof s> => s !== null),
        };
      }

      // ── 5-1. suggestions line 검증: diff added lines 범위 체크 ──
      if (validatedOutput?.suggestions && validatedOutput.suggestions.length > 0) {
        validatedOutput = {
          ...validatedOutput,
          suggestions: validatedOutput.suggestions.filter((suggestion) => {
            // 타입 가드: line이 유효한 양의 정수인지 확인
            if (
              typeof suggestion.line !== "number" ||
              !Number.isInteger(suggestion.line) ||
              suggestion.line < 1
            ) {
              console.warn("[suggestions] dropped entry", {
                file: suggestion.file,
                line: suggestion.line,
                reason: "invalid_line_type",
              });
              return false;
            }

            const beforeLineCount = suggestion.before.split("\n").length;
            const isFullyAdded = isRangeFullyAdded(
              addedLinesMap,
              suggestion.file,
              suggestion.line,
              beforeLineCount,
            );

            if (isFullyAdded) return true;

            console.warn("[suggestions] dropped entry", {
              file: suggestion.file,
              line: suggestion.line,
              reason: "range_not_fully_added",
            });
            return false;
          }),
        };
      }

      // ── 6. 텍스트 인코딩 오탐 guard ──
      if (validatedOutput) {
        const {
          keptSuggestions,
          keptIssues,
          synthesizedIssues,
        } = guardTextFeedback({
          suggestions: validatedOutput.suggestions,
          issues: validatedOutput.issues,
          langCode,
          diffText: diff,
        });

        const keptInlineIssues = keptIssues.filter((issue) => issue.line !== null);
        const keptLineNullIssues = keptIssues.filter((issue) => issue.line === null);

        validatedOutput = {
          ...validatedOutput,
          suggestions: keptSuggestions,
          issues: [...keptInlineIssues, ...synthesizedIssues, ...keptLineNullIssues],
        };
      }

      // ── 7. suggestion-line 중복 issue 제거 (중복 인라인 댓글 방지) ──
      if (validatedOutput?.issues && validatedOutput.suggestions && validatedOutput.suggestions.length > 0) {
        const suggestionLineSet = new Set(
          validatedOutput.suggestions.map(s => `${s.file}:${s.line}`)
        );
        validatedOutput = {
          ...validatedOutput,
          issues: validatedOutput.issues.filter(issue => {
            if (issue.file !== null && issue.line !== null) {
              return !suggestionLineSet.has(`${issue.file}:${issue.line}`);
            }
            return true;
          }),
        };
      }

      // ── 8. count-trimming (dedup 이후) ──
      // ⚠️ AI가 prompt limit을 초과할 수 있으므로 count-trimming 적용
      if (validatedOutput?.issues) {
        const { inline: maxInline, general: maxGeneral } = getIssueLimit(sizeMode);
        let inlineCount = 0, generalCount = 0;
        validatedOutput = {
          ...validatedOutput,
          issues: validatedOutput.issues.filter(issue => {
            if (issue.line !== null) return ++inlineCount <= maxInline;
            return ++generalCount <= maxGeneral;
          }),
        };
      }

      // ── 9. validation 완료 후 마크다운 재생성 + sanitize ──
      const finalMarkdown = validatedOutput
        ? formatStructuredReviewToMarkdown(validatedOutput, langCode)
        : rawReview;
      const sanitized = sanitizeMermaidSequenceDiagrams(finalMarkdown, langCode);

      return {
        review: sanitized,
        validatedStructuredOutput: validatedOutput,
      };
    });

    // ── Step 5.3: 리뷰 검증 — 검수자 (verificationEnabled && 구조화 출력 존재 시) ──
    // 실패해도 리뷰 흐름을 막지 않는다 — status: "skipped"로 미검증 게시 (fail-open).
    const verification = await step.run("verify-findings", async (): Promise<VerificationResult | null> => {
      if (!verificationEnabled || !validatedStructuredOutput) return null;

      await renewReviewExecutionLease(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["RUNNING"],
          now: dependencies.now(),
        },
        dependencies.prisma,
      );

      const { issues, suggestions } = validatedStructuredOutput;
      if (issues.length === 0 && suggestions.length === 0) {
        return { status: "verified", issueVerdicts: [], suggestionVerdicts: [] };
      }

      try {
        return await dependencies.verifyReview({ diff, issues, suggestions, langCode });
      } catch (error) {
        console.warn("Review verification failed, continuing unverified", {
          error: getSafeExternalErrorSummary(error),
        });
        return { status: "skipped", issueVerdicts: [], suggestionVerdicts: [] };
      }
    });

    // ── Step 5.3 적용: 순수 함수 — 입력이 모두 step 반환값이므로 Inngest replay-safe ──
    const verified = validatedStructuredOutput
      ? applyVerification(validatedStructuredOutput, verification)
      : null;
    const finalOutput = verified ? verified.keptOutput : validatedStructuredOutput;

    let finalReview = review;
    if (verified) {
      const markdown = formatStructuredReviewToMarkdown(verified.keptOutput, langCode);
      finalReview = sanitizeMermaidSequenceDiagrams(markdown, langCode);
    }

    // ── 열화 고지: diff에서 뺀 파일 / 구조화 실패로 축소된 리뷰 ──
    // 로그만 남기면 조용히 묻힌다 — 사용자가 보는 본문 최상단에 적는다.
    const notice = buildReviewNotice({
      excludedFiles,
      limitedReview: validatedStructuredOutput === null,
      langCode,
    });
    if (notice) {
      finalReview = `${notice}\n\n${finalReview}`;
    }

    // ── Step 5.5: 반복 실수 감지 (wedge) ──
    // 실패해도 리뷰 흐름을 막지 않는다 — 배지 없는 리뷰로 진행.
    const repeatAnnotations = await step.run("detect-repeat-issues", async () => {
      const issues = finalOutput?.issues ?? [];
      if (issues.length === 0) return [];

      await renewReviewExecutionLease(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["RUNNING"],
          now: dependencies.now(),
        },
        dependencies.prisma,
      );

      try {
        return await dependencies.detectRepeatIssues({
          issues,
          userId,
          repositoryId: reviewRequest.repository.id,
          prNumber,
        });
      } catch (error) {
        console.warn("Repeat detection failed, continuing without badges", {
          error: getSafeExternalErrorSummary(error),
        });
        return [];
      }
    });

    const issueCount = finalOutput?.issues.length ?? 0;
    const suggestionCount = finalOutput?.suggestions.length ?? 0;
    const verdictsAligned =
      !verified ||
      checkLengthAlignment(
        "persist-review",
        "keptIssueVerdicts",
        issueCount,
        verified.keptIssueVerdicts.length,
      );
    const suggestionVerdictsAligned =
      !verified ||
      checkLengthAlignment(
        "persist-review",
        "keptSuggestionVerdicts",
        suggestionCount,
        verified.keptSuggestionVerdicts.length,
      );
    const repeatsAligned = checkRepeatsAligned(
      "persist-review",
      issueCount,
      repeatAnnotations.length,
    );
    const issuesWithRepeat = (finalOutput?.issues ?? []).map((issue, index) => {
      const annotation = repeatsAligned ? repeatAnnotations[index] : undefined;
      const confirmed =
        verdictsAligned &&
        verified?.keptIssueVerdicts[index]?.verdict === "CONFIRMED";
      return {
        ...issue,
        ...(annotation?.repeat ? { repeat: annotation.repeat } : {}),
        ...(confirmed ? { verifierConfirmed: true } : {}),
      };
    });
    const mainMarker = buildReviewArtifactMarker(reviewId, "main");

    // ── Step 6: canonical content와 child row를 외부 게시 전에 저장 ──
    const persisted = await step.run(
      "persist-review",
      async (): Promise<PersistedReviewPostingData | null> => {
        try {
          const outboundBody = buildGithubArtifactBody({
            content: finalReview,
            marker: mainMarker,
            title: "AI Code Review",
          });
          assertGithubArtifactBodyBudget({ body: outboundBody });
        } catch {
          await failReviewExecutionAndReleaseCredit({
            dependencies,
            reviewRequest,
            attempt,
            leaseToken,
            stage: "PERSIST",
            message: "The review exceeds the safe GitHub artifact budget.",
          });
          return null;
        }

        await renewReviewExecutionLease(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            allowedStatuses: ["RUNNING"],
            now: dependencies.now(),
          },
          dependencies.prisma,
        );

        return dependencies.prisma.$transaction(async (tx) => {
          const hasNewIssueShape = (finalOutput?.issues ?? []).every(
            (issue) => typeof (issue as { title?: unknown }).title === "string",
          );
          const verificationBlock = verification
            ? {
                status: verification.status,
                model: VERIFIER_MODEL_ID,
                issueVerdicts: verdictsAligned
                  ? verified?.keptIssueVerdicts ?? []
                  : [],
                suggestionVerdicts: suggestionVerdictsAligned
                  ? verified?.keptSuggestionVerdicts ?? []
                  : [],
                rejectedIssues: verified?.rejectedIssues ?? [],
                rejectedSuggestions: verified?.rejectedSuggestions ?? [],
              }
            : null;

          await tx.review.update({
            where: { id: reviewId },
            data: {
              prTitle: title,
              review: finalReview,
              reviewData: finalOutput
                ? ({
                    ...finalOutput,
                    ...(verificationBlock ? { verification: verificationBlock } : {}),
                    schemaVersion: hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1,
                  } as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
              langCode,
              maxSuggestions,
              verificationEnabled,
              headSha,
              artifactLookupMissedAt: null,
            },
          });
          await tx.suggestion.deleteMany({ where: { reviewId } });
          await tx.reviewIssue.deleteMany({ where: { reviewId } });

          const persistedSuggestions: PersistedReviewSuggestion[] = [];
          for (const suggestion of finalOutput?.suggestions ?? []) {
            const row = await tx.suggestion.create({
              data: {
                reviewId,
                filePath: suggestion.file,
                lineNumber: suggestion.line,
                beforeCode: suggestion.before,
                afterCode: suggestion.after,
                explanation: suggestion.explanation,
                severity: suggestion.severity,
                status: "PENDING",
              },
              select: { id: true },
            });
            persistedSuggestions.push({ ...suggestion, id: row.id });
          }

          const persistedIssues: PersistedReviewIssue[] = [];
          for (const [index, issue] of issuesWithRepeat.entries()) {
            const annotation = repeatsAligned ? repeatAnnotations[index] : undefined;
            const row = await tx.reviewIssue.create({
              data: {
                reviewId,
                userId,
                filePath: issue.file,
                lineNumber: issue.line,
                title: issue.title,
                body: issue.body,
                severity: issue.severity,
                category: issue.category,
                embedding: annotation?.embedding ?? Prisma.DbNull,
                isRepeat: annotation?.isRepeat ?? false,
                repeatOfIssueId: annotation?.repeatOfIssueId ?? null,
                repeatSimilarity: annotation?.repeatSimilarity ?? null,
              },
              select: { id: true },
            });
            persistedIssues.push({ ...issue, id: row.id });
          }

          await transitionReviewExecution(
            {
              reviewId,
              attempt,
              leaseToken,
              leaseOwner: "WORKER",
              now: dependencies.now(),
              from: ["RUNNING"],
              to: "POSTING",
              lastCompletedStage: "PERSISTED",
            },
            tx,
          );

          return {
            suggestions: persistedSuggestions,
            issues: persistedIssues,
          };
        });
      },
    );

    if (!persisted) {
      return { success: true };
    }

    // ── Step 7: marker lookup 후 primary artifact를 게시 ──
    const mainArtifact = await step.run(
      "post-review",
      async (): Promise<PostedGithubArtifact> => {
        const token = await getBoundGithubToken(dependencies, reviewRequest);
        await assertAndRenewCurrentReviewHead({
          dependencies,
          reviewRequest,
          attempt,
          leaseToken,
          allowedStatuses: ["POSTING"],
        });

        const existingArtifact = await dependencies.findGithubReviewArtifact({
          token,
          owner,
          repo,
          prNumber,
          marker: mainMarker,
          expectedAuthorId: reviewRequest.githubAuthorId,
          expectedHeadSha: headSha,
        });
        if (existingArtifact) {
          return existingArtifact;
        }

        try {
          return await dependencies.postPRReviewWithSuggestions({
            token,
            owner,
            repo,
            prNumber,
            reviewId,
            reviewContent: finalReview,
            mainMarker,
            suggestions: persisted.suggestions,
            issues: persisted.issues,
            headSha,
            langCode,
            beforeInlinePost: () =>
              assertAndRenewCurrentReviewHead({
                dependencies,
                reviewRequest,
                attempt,
                leaseToken,
                allowedStatuses: ["POSTING"],
              }),
          });
        } catch (error) {
          if (!isDeterministicGithubValidationError(error)) {
            throw error;
          }

          await assertAndRenewCurrentReviewHead({
            dependencies,
            reviewRequest,
            attempt,
            leaseToken,
            allowedStatuses: ["POSTING"],
          });
          return dependencies.postReviewComment({
            token,
            owner,
            repo,
            prNumber,
            content: finalReview,
            marker: mainMarker,
            title: "AI Code Review",
          });
        }
      },
    );

    await step.run("record-main-artifact", () =>
      recordMainArtifactAndConsumeCredit({
        dependencies,
        reviewRequest,
        attempt,
        leaseToken,
        artifact: mainArtifact,
      }),
    );

    // ── Step 7.5: 검수자가 제외한 항목은 advisory artifact로 게시 ──
    const verificationPosted = await step.run("post-verification-review", async () => {
      if (!verified || countExcluded(verified) === 0) return false;

      const content = buildVerificationReviewBody({
        rejectedIssues: verified.rejectedIssues,
        rejectedSuggestions: verified.rejectedSuggestions,
        langCode,
      });
      if (content === null) return false;

      try {
        const token = await getBoundGithubToken(dependencies, reviewRequest);
        await assertAndRenewCurrentReviewHead({
          dependencies,
          reviewRequest,
          attempt,
          leaseToken,
          allowedStatuses: ["POSTING"],
        });
        await dependencies.postVerificationReview({
          token,
          owner,
          repo,
          prNumber,
          headSha,
          content,
          marker: buildReviewArtifactMarker(reviewId, "verification"),
        });
        return true;
      } catch (error) {
        console.warn(
          "Verification review entry failed after the main review was posted",
          { error: getSafeExternalErrorSummary(error) },
        );
        return false;
      }
    });

    await step.run("complete-review", () =>
      transitionReviewExecution(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          now: dependencies.now(),
          from: ["POSTING"],
          to: "COMPLETED",
          lastCompletedStage: verificationPosted
            ? "VERIFICATION_POSTED"
            : "MAIN_POSTED",
        },
        dependencies.prisma,
      ),
    );

    return { success: true };
  };
}

const defaultReviewWorkerDependencies: ReviewWorkerDependencies = {
  prisma,
  getPullRequestDiff,
  postReviewComment,
  postPRReviewWithSuggestions,
  postVerificationReview,
  findGithubReviewArtifact,
  buildDeterministicPrContext,
  generateText,
  createGeneratorModel: google,
  verifyReview,
  detectRepeatIssues,
  assertCurrentReviewHead,
  consumeTrialCredit,
  releaseTrialCredit,
  createTimeoutSignal: AbortSignal.timeout,
  now: () => new Date(),
};

export const handleReviewFailure = createReviewFailureHandler({
  prisma,
  reviewType: "FULL_REVIEW",
  now: () => new Date(),
});

export const generateReview = inngest.createFunction(
  {
    id: "generate-review",
    onFailure: handleReviewFailure,
    concurrency: {
      key: "event.data.debounceKey",
      limit: 1,
    },
    cancelOn: [
      {
        event: "pr.review.superseded",
        if:
          "async.data.reviewId == event.data.reviewId && " +
          "async.data.attempt == event.data.attempt",
      },
    ],
  },
  { event: "pr.review.requested" },
  createGenerateReviewHandler(defaultReviewWorkerDependencies),
);
