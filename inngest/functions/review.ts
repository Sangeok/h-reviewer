import { randomUUID } from "node:crypto";

import prisma from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/lib/github/github";
import {
  postInlineReviewIssues,
  postPRReviewWithSuggestions,
  postVerificationReview,
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
  checkpointReviewExecution,
  completeReviewExecution,
  recordGithubMainArtifact,
  renewReviewExecutionLease,
  transitionReviewExecution,
} from "@/features/review/lib/review-execution-state";
import { assertCurrentReviewHead } from "@/features/review/lib/review-head-guard";
import {
  GITHUB_ARTIFACT_ABSENCE_GRACE_MS,
  REVIEW_EXECUTION_LEASE_MS,
} from "@/features/review/constants";
import { buildReviewArtifactMarker } from "@/features/review/lib/review-artifact-marker";
import { buildGithubArtifactBody } from "@/lib/github/github-artifact-body";
import {
  findGithubMainReviewArtifact,
  findGithubPullRequestReviewArtifact,
  findGithubReviewCommentArtifact,
  isDeterministicGithubValidationError,
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
  postInlineReviewIssues: typeof postInlineReviewIssues;
  postVerificationReview: typeof postVerificationReview;
  findGithubMainReviewArtifact: typeof findGithubMainReviewArtifact;
  findGithubPullRequestReviewArtifact: typeof findGithubPullRequestReviewArtifact;
  findGithubReviewCommentArtifact: typeof findGithubReviewCommentArtifact;
  buildDeterministicPrContext: typeof buildDeterministicPrContext;
  generateText: typeof generateText;
  createGeneratorModel: typeof google;
  verifyReview: typeof verifyReview;
  detectRepeatIssues: typeof detectRepeatIssues;
  assertCurrentReviewHead: typeof assertCurrentReviewHead;
  createTimeoutSignal(milliseconds: number): AbortSignal;
  now(): Date;
};

type ClaimedReviewRequest = {
  id: string;
  attemptCount: number;
  headSha: string;
  githubAuthorId: string;
  langCode: string;
  maxSuggestions: number | null;
  verificationEnabled: boolean;
  review: string;
  lastCompletedStage: string | null;
  artifactLookupMissedAt: Date | null;
  repository: {
    id: string;
    owner: string;
    name: string;
    userId: string;
  };
  prNumber: number;
};

function getRenewedExecutionLease(now: Date): Date {
  return new Date(now.getTime() + REVIEW_EXECUTION_LEASE_MS);
}

async function markPostingLookupMiss(input: {
  dependencies: ReviewWorkerDependencies;
  reviewId: string;
  attempt: number;
  leaseToken: string;
}): Promise<void> {
  const now = input.dependencies.now();
  const result = await input.dependencies.prisma.review.updateMany({
    where: {
      id: input.reviewId,
      status: "POSTING",
      attemptCount: input.attempt,
      executionLeaseToken: input.leaseToken,
      executionLeaseOwner: "WORKER",
      executionLeaseExpiresAt: { gt: now },
    },
    data: {
      status: "FAILED",
      failureStage: "POST",
      failureMessage: "GitHub posting result requires marker reconciliation.",
      artifactLookupMissedAt: now,
      executionLeaseToken: randomUUID(),
      executionLeaseOwner: "RECONCILER",
      executionLeaseExpiresAt: new Date(
        now.getTime() + GITHUB_ARTIFACT_ABSENCE_GRACE_MS,
      ),
    },
  });
  if (result.count !== 1) {
    throw new Error(`Review ${input.reviewId} posting recovery fence was lost`);
  }
}

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
  scope: "post-review" | "save-review",
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
  scope: "post-review" | "save-review",
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
          attemptCount: true,
          headSha: true,
          githubAuthorId: true,
          langCode: true,
          maxSuggestions: true,
          verificationEnabled: true,
          review: true,
          lastCompletedStage: true,
          artifactLookupMissedAt: true,
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
        review.attemptCount !== attempt
      ) {
        throw new Error("Claimed review request data is incomplete");
      }

      return {
        ...review,
        headSha: review.headSha,
        githubAuthorId: review.githubAuthorId,
      } satisfies ClaimedReviewRequest;
    });
    const owner = reviewRequest.repository.owner;
    const repo = reviewRequest.repository.name;
    const prNumber = reviewRequest.prNumber;
    const userId = reviewRequest.repository.userId;
    const preferredLanguage = reviewRequest.langCode;
    const maxSuggestions = reviewRequest.maxSuggestions;
    const verificationEnabled = reviewRequest.verificationEnabled;

    const postingRecovery =
      reviewRequest.review.trim().length > 0 &&
      reviewRequest.lastCompletedStage !== null &&
      [
        "PERSISTED",
        "MAIN_POSTED",
        "INLINE_POSTED",
        "VERIFICATION_POSTED",
      ].includes(reviewRequest.lastCompletedStage)
        ? reviewRequest.artifactLookupMissedAt
          ? "LOOKUP_ONLY"
          : "REPOST_CONFIRMED_ABSENT"
        : null;

    if (postingRecovery) {
      const mainMarker = buildReviewArtifactMarker(reviewId, "main");
      if (postingRecovery === "REPOST_CONFIRMED_ABSENT") {
        try {
          buildGithubArtifactBody({
            content: reviewRequest.review,
            marker: mainMarker,
            title: "AI Code Review",
          });
        } catch {
          await transitionReviewExecution(
            {
              reviewId,
              attempt,
              leaseToken,
              leaseOwner: "WORKER",
              now: dependencies.now(),
              from: ["RUNNING"],
              to: "FAILED",
              failure: {
                stage: "PERSIST",
                message: "Persisted review content exceeds the GitHub body budget.",
              },
            },
            dependencies.prisma,
          );
          return { success: true };
        }
      }

      await step.run("resume-review-posting", () =>
        transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["RUNNING"],
            to: "POSTING",
            lastCompletedStage: "PERSISTED",
            leaseExpiresAt: getRenewedExecutionLease(dependencies.now()),
          },
          dependencies.prisma,
        ),
      );

      const recoveredArtifact = await step.run(
        "recover-review-main-artifact",
        async (): Promise<PostedGithubArtifact | null> => {
          const token = await getBoundGithubToken(dependencies, reviewRequest);
          await assertAndRenewCurrentReviewHead({
            dependencies,
            reviewRequest,
            attempt,
            leaseToken,
            allowedStatuses: ["POSTING"],
          });
          const existing = await dependencies.findGithubMainReviewArtifact({
            token,
            owner,
            repo,
            prNumber,
            marker: mainMarker,
            expectedAuthorId: reviewRequest.githubAuthorId,
            headSha: reviewRequest.headSha,
          });
          if (existing) return existing;

          if (postingRecovery === "LOOKUP_ONLY") {
            await markPostingLookupMiss({
              dependencies,
              reviewId,
              attempt,
              leaseToken,
            });
            return null;
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
            content: reviewRequest.review,
            marker: mainMarker,
            title: "AI Code Review",
          });
        },
      );

      if (!recoveredArtifact) return { success: true };

      await step.run("record-recovered-review-artifact", async () => {
        await recordGithubMainArtifact(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            from: ["POSTING"],
            artifactId: recoveredArtifact.id,
            postedAt: recoveredArtifact.postedAt,
            now: dependencies.now(),
          },
          dependencies.prisma,
        );
        await completeReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            from: ["POSTING"],
            now: dependencies.now(),
          },
          dependencies.prisma,
        );
      });
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

        await checkpointReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            allowedStatuses: ["RUNNING"],
            now: dependencies.now(),
            stage: "FETCHED",
          },
          dependencies.prisma,
        );

        return data;
      } catch {
        await transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["RUNNING"],
            to: "FAILED",
            failure: {
              stage: "FETCH",
              message: "Pull request data could not be fetched.",
            },
          },
          dependencies.prisma,
        );
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

    await step.run("checkpoint-review-verified", () =>
      checkpointReviewExecution(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          allowedStatuses: ["RUNNING"],
          now: dependencies.now(),
          stage: "VERIFIED",
        },
        dependencies.prisma,
      ),
    );

    const mainMarker = buildReviewArtifactMarker(reviewId, "main");
    const persistedIds = await step.run("persist-review-before-post", async () => {
      try {
        buildGithubArtifactBody({
          content: finalReview,
          marker: mainMarker,
          title: "AI Code Review",
        });
      } catch {
        await transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: dependencies.now(),
            from: ["RUNNING"],
            to: "FAILED",
            failure: {
              stage: "PERSIST",
              message: "Review content exceeds the GitHub body budget.",
            },
          },
          dependencies.prisma,
        );
        return null;
      }

      const issueCount = finalOutput?.issues?.length ?? 0;
      const suggestionCount = finalOutput?.suggestions?.length ?? 0;
      const verdictsAligned =
        !verified ||
        checkLengthAlignment(
          "save-review",
          "keptIssueVerdicts",
          issueCount,
          verified.keptIssueVerdicts.length,
        );
      const suggestionVerdictsAligned =
        !verified ||
        checkLengthAlignment(
          "save-review",
          "keptSuggestionVerdicts",
          suggestionCount,
          verified.keptSuggestionVerdicts.length,
        );
      const repeatsAligned = checkRepeatsAligned(
        "save-review",
        issueCount,
        repeatAnnotations.length,
      );

      return dependencies.prisma.$transaction(async (tx) => {
        await tx.suggestion.deleteMany({ where: { reviewId } });
        await tx.reviewIssue.deleteMany({ where: { reviewId } });
        await tx.review.update({
          where: { id: reviewId },
          data: {
            prTitle: title,
            review: finalReview,
            reviewData: finalOutput
              ? (() => {
                  const hasNewIssueShape = (finalOutput.issues ?? []).every(
                    (issue) =>
                      typeof (issue as { title?: unknown }).title === "string",
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
                  return {
                    ...finalOutput,
                    ...(verificationBlock
                      ? { verification: verificationBlock }
                      : {}),
                    schemaVersion: hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1,
                  } as unknown as Prisma.InputJsonValue;
                })()
              : Prisma.DbNull,
            langCode,
            maxSuggestions,
            verificationEnabled,
            headSha,
          },
        });

        const suggestionIds: string[] = [];
        for (const suggestion of finalOutput?.suggestions ?? []) {
          const created = await tx.suggestion.create({
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
          suggestionIds.push(created.id);
        }

        const issueIds: string[] = [];
        for (const [index, issue] of (finalOutput?.issues ?? []).entries()) {
          const annotation = repeatsAligned
            ? repeatAnnotations[index]
            : undefined;
          const created = await tx.reviewIssue.create({
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
          issueIds.push(created.id);
        }

        const transitionTime = dependencies.now();
        await transitionReviewExecution(
          {
            reviewId,
            attempt,
            leaseToken,
            leaseOwner: "WORKER",
            now: transitionTime,
            from: ["RUNNING"],
            to: "POSTING",
            lastCompletedStage: "PERSISTED",
            leaseExpiresAt: getRenewedExecutionLease(transitionTime),
          },
          tx,
        );
        return { suggestionIds, issueIds };
      });
    });

    if (!persistedIds) return { success: true };

    const persistedReview = await step.run("load-persisted-review", async () => {
      const persisted = await dependencies.prisma.review.findUnique({
        where: { id: reviewId },
        select: {
          review: true,
          suggestions: {
            where: { id: { in: persistedIds.suggestionIds } },
            select: {
              id: true,
              filePath: true,
              lineNumber: true,
              beforeCode: true,
              afterCode: true,
              explanation: true,
              severity: true,
            },
          },
          issues: {
            where: { id: { in: persistedIds.issueIds } },
            select: { id: true },
          },
        },
      });
      if (!persisted || persisted.review.trim().length === 0) {
        throw new Error("Persisted review content is unavailable for posting");
      }
      return persisted;
    });

    const suggestionById = new Map(
      persistedReview.suggestions.map((suggestion) => [suggestion.id, suggestion]),
    );
    const issueIdSet = new Set(persistedReview.issues.map((issue) => issue.id));
    const markedSuggestions = persistedIds.suggestionIds.map((id) => {
      const suggestion = suggestionById.get(id);
      if (!suggestion) throw new Error(`Persisted suggestion ${id} is unavailable`);
      return {
        file: suggestion.filePath,
        line: suggestion.lineNumber,
        before: suggestion.beforeCode,
        after: suggestion.afterCode,
        explanation: suggestion.explanation,
        severity: suggestion.severity,
        marker: buildReviewArtifactMarker(reviewId, {
          kind: "suggestion",
          id,
        }),
      };
    });

    const issues = finalOutput?.issues ?? [];
    const verdictsAligned =
      !verified ||
      checkLengthAlignment(
        "post-review",
        "keptIssueVerdicts",
        issues.length,
        verified.keptIssueVerdicts.length,
      );
    const repeatsAligned = checkRepeatsAligned(
      "post-review",
      issues.length,
      repeatAnnotations.length,
    );
    const markedIssues = issues.map((issue, index) => {
      const id = persistedIds.issueIds[index];
      if (!id || !issueIdSet.has(id)) {
        throw new Error("Persisted review issue alignment was lost");
      }
      const annotation = repeatsAligned ? repeatAnnotations[index] : undefined;
      const confirmed =
        verdictsAligned &&
        verified?.keptIssueVerdicts[index]?.verdict === "CONFIRMED";
      return {
        ...issue,
        ...(annotation?.repeat ? { repeat: annotation.repeat } : {}),
        ...(confirmed ? { verifierConfirmed: true } : {}),
        marker: buildReviewArtifactMarker(reviewId, { kind: "issue", id }),
      };
    });

    // ── Step 6: marker lookup 후 primary artifact 게시·즉시 기록 ──
    await step.run("post-review", async () => {
      const token = await getBoundGithubToken(dependencies, reviewRequest);
      await assertAndRenewCurrentReviewHead({
        dependencies,
        reviewRequest,
        attempt,
        leaseToken,
        allowedStatuses: ["POSTING"],
      });

      let artifact = await dependencies.findGithubMainReviewArtifact({
        token,
        owner,
        repo,
        prNumber,
        marker: mainMarker,
        expectedAuthorId: reviewRequest.githubAuthorId,
        headSha: reviewRequest.headSha,
      });

      if (!artifact && markedSuggestions.length > 0) {
        try {
          artifact = await dependencies.postPRReviewWithSuggestions({
            token,
            owner,
            repo,
            prNumber,
            reviewContent: persistedReview.review,
            mainMarker,
            suggestions: markedSuggestions,
            headSha,
          });
        } catch (error) {
          if (!isDeterministicGithubValidationError(error)) throw error;
          await assertAndRenewCurrentReviewHead({
            dependencies,
            reviewRequest,
            attempt,
            leaseToken,
            allowedStatuses: ["POSTING"],
          });
          artifact = await dependencies.postReviewComment({
            token,
            owner,
            repo,
            prNumber,
            content: persistedReview.review,
            marker: mainMarker,
            title: "AI Code Review",
          });
        }
      }

      if (!artifact) {
        artifact = await dependencies.postReviewComment({
          token,
          owner,
          repo,
          prNumber,
          content: persistedReview.review,
          marker: mainMarker,
          title: "AI Code Review",
        });
      }

      await recordGithubMainArtifact(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          from: ["POSTING"],
          artifactId: artifact.id,
          postedAt: artifact.postedAt,
          now: dependencies.now(),
        },
        dependencies.prisma,
      );
      return artifact;
    });

    const inlinePosted = await step.run("post-inline-issues", async () => {
      const inlineIssues = markedIssues.filter(
        (issue) => issue.file !== null && issue.line !== null,
      );
      if (inlineIssues.length === 0) {
        return false;
      }
      const token = await getBoundGithubToken(dependencies, reviewRequest);
      try {
        const pendingIssues = [];
        for (const issue of inlineIssues) {
          const existing = await dependencies.findGithubReviewCommentArtifact({
            token,
            owner,
            repo,
            prNumber,
            marker: issue.marker,
            expectedAuthorId: reviewRequest.githubAuthorId,
            headSha: reviewRequest.headSha,
          });
          if (!existing) pendingIssues.push(issue);
        }
        if (pendingIssues.length === 0) return true;
        await dependencies.postInlineReviewIssues({
          token,
          owner,
          repo,
          prNumber,
          issues: pendingIssues,
          headSha,
          langCode,
          beforePost: () =>
            assertAndRenewCurrentReviewHead({
              dependencies,
              reviewRequest,
              attempt,
              leaseToken,
              allowedStatuses: ["POSTING"],
            }),
        });
        return true;
      } catch (error) {
        console.warn("Inline review issues could not be posted", {
          error: getSafeExternalErrorSummary(error),
        });
        return false;
      }
    });

    // ── Step 6.5: 검수자가 제외한 항목 게시 (제외가 있을 때만) ──
    // 1차 리뷰(Step 6)와 독립 — 실패해도 리뷰 흐름을 막지 않는다.
    // 생존 항목의 판정은 인라인 배지와 대시보드 패널이 전달하므로 여기서 반복하지 않는다.
    const verificationPosted = await step.run("post-verification-review", async () => {
      if (!verified) return false;
      if (countExcluded(verified) === 0) return false;

      const token = await getBoundGithubToken(dependencies, reviewRequest);

      const body = buildVerificationReviewBody({
        rejectedIssues: verified.rejectedIssues,
        rejectedSuggestions: verified.rejectedSuggestions,
        langCode,
      });
      // string | null 좁히기 — 위 게이트는 타입을 좁히지 못한다.
      if (body === null) return false;

      try {
        await assertAndRenewCurrentReviewHead({
          dependencies,
          reviewRequest,
          attempt,
          leaseToken,
          allowedStatuses: ["POSTING"],
        });
        const verificationMarker = buildReviewArtifactMarker(
          reviewId,
          "verification",
        );
        const existing = await dependencies.findGithubPullRequestReviewArtifact({
          token,
          owner,
          repo,
          prNumber,
          marker: verificationMarker,
          expectedAuthorId: reviewRequest.githubAuthorId,
          headSha: reviewRequest.headSha,
        });
        if (existing) return true;
        await dependencies.postVerificationReview({
          token,
          owner,
          repo,
          prNumber,
          headSha,
          content: body,
          marker: verificationMarker,
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
      completeReviewExecution(
        {
          reviewId,
          attempt,
          leaseToken,
          leaseOwner: "WORKER",
          from: ["POSTING"],
          now: dependencies.now(),
          lastCompletedStage: verificationPosted
            ? "VERIFICATION_POSTED"
            : inlinePosted
              ? "INLINE_POSTED"
              : "MAIN_POSTED",
        },
        dependencies.prisma,
      ),
    );

    return { success: true };
  };
}

const ALLOWED_FAILURE_CODES = new Set([
  "DELIVERY_REQUEST_NOT_FOUND",
  "GITHUB_ARTIFACT_BODY_TOO_LARGE",
  "GITHUB_POST_AMBIGUOUS",
  "REVIEW_HEAD_SUPERSEDED",
]);

function buildSafeFailureMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : null;
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    ALLOWED_FAILURE_CODES.has(error.code)
      ? error.code
      : null;
  return [name, status === null ? null : `status=${status}`, code]
    .filter((part): part is string => part !== null)
    .join("; ")
    .slice(0, 1_000);
}

function getFailureStage(input: {
  status: "PENDING" | "RUNNING" | "POSTING";
  lastCompletedStage: string | null;
}): "QUEUE" | "FETCH" | "GENERATE" | "VERIFY" | "PERSIST" | "POST" {
  if (input.status === "PENDING") return "QUEUE";
  if (input.status === "POSTING") return "POST";
  if (input.lastCompletedStage === null || input.lastCompletedStage === "QUEUED") {
    return "FETCH";
  }
  if (input.lastCompletedStage === "GENERATED") return "VERIFY";
  if (input.lastCompletedStage === "VERIFIED") return "PERSIST";
  if (
    input.lastCompletedStage === "PERSISTED" ||
    input.lastCompletedStage === "MAIN_POSTED" ||
    input.lastCompletedStage === "INLINE_POSTED" ||
    input.lastCompletedStage === "VERIFICATION_POSTED"
  ) {
    return "POST";
  }
  return "GENERATE";
}

export async function handleReviewFailure(input: {
  event: { data: { event: { data?: unknown } } };
  error: unknown;
}): Promise<void> {
  const originalData = input.event.data.event.data;
  if (typeof originalData !== "object" || originalData === null) return;
  const reviewId =
    "reviewId" in originalData && typeof originalData.reviewId === "string"
      ? originalData.reviewId
      : null;
  const attempt =
    "attempt" in originalData &&
    typeof originalData.attempt === "number" &&
    Number.isInteger(originalData.attempt)
      ? originalData.attempt
      : null;
  if (!reviewId || attempt === null) return;

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      status: true,
      attemptCount: true,
      executionLeaseToken: true,
      executionLeaseOwner: true,
      lastCompletedStage: true,
    },
  });
  if (
    !review ||
    review.attemptCount !== attempt ||
    !["PENDING", "RUNNING", "POSTING"].includes(review.status) ||
    !review.executionLeaseToken
  ) {
    return;
  }

  const status = review.status as "PENDING" | "RUNNING" | "POSTING";
  const expectedOwner = status === "PENDING" ? "QUEUE" : "WORKER";
  if (review.executionLeaseOwner !== expectedOwner) return;
  const stage = getFailureStage({
    status,
    lastCompletedStage: review.lastCompletedStage,
  });
  const now = new Date();
  const postingAmbiguous = stage === "POST";
  await prisma.review.updateMany({
    where: {
      id: reviewId,
      status,
      attemptCount: attempt,
      executionLeaseToken: review.executionLeaseToken,
      executionLeaseOwner: expectedOwner,
    },
    data: {
      status: "FAILED",
      failureStage: stage,
      failureMessage: buildSafeFailureMessage(input.error),
      ...(postingAmbiguous
        ? {
            executionLeaseToken: randomUUID(),
            executionLeaseOwner: "RECONCILER" as const,
            executionLeaseExpiresAt: now,
          }
        : {
            executionLeaseToken: null,
            executionLeaseOwner: null,
            executionLeaseExpiresAt: null,
          }),
    },
  });
}

const defaultReviewWorkerDependencies: ReviewWorkerDependencies = {
  prisma,
  getPullRequestDiff,
  postReviewComment,
  postPRReviewWithSuggestions,
  postInlineReviewIssues,
  postVerificationReview,
  findGithubMainReviewArtifact,
  findGithubPullRequestReviewArtifact,
  findGithubReviewCommentArtifact,
  buildDeterministicPrContext,
  generateText,
  createGeneratorModel: google,
  verifyReview,
  detectRepeatIssues,
  assertCurrentReviewHead,
  createTimeoutSignal: AbortSignal.timeout,
  now: () => new Date(),
};

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
