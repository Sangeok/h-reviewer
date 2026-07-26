import prisma from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/lib/github/github";
import { postPRReviewWithSuggestions, postVerificationReview } from "@/features/review/lib/pr-review";
import {
  retrieveContext, classifyPRSize, getTopKForSizeMode,
  structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt,
  getIssueLimit, formatStructuredReviewToMarkdown, REVIEW_SCHEMA_VERSION, guardTextFeedback,
  detectRepeatIssues,
  verifyReview, applyVerification, buildVerificationTrace, buildVerificationReviewBody, VERIFIER_MODEL_ID,
} from "@/features/ai";
import type { ReviewSizeMode, VerificationResult } from "@/features/ai";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeMermaidSequenceDiagrams } from "@/lib/github/github-markdown";
import { isValidLanguageCode } from "@/features/settings";
import { SECTION_HEADERS, DIAGRAM_FALLBACK_TEXT } from "@/shared/constants";
import { parseDiffToChangedFiles, extractDiffFileSet, extractDiffAddedLinesMap, unescapeGitPath } from "@/lib/github/diff-parser";
import type { LanguageCode } from "@/features/settings";

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
  scope: "walkthrough" | "issues" | "suggestions",
): string | null {
  if (diffFiles.has(file)) return file;

  const unescaped = unescapeGitPath(file);
  if (unescaped !== file && diffFiles.has(unescaped)) return unescaped;

  const basename = file.split("/").pop() ?? file;
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
  scope: "walkthrough" | "issues" | "suggestions",
): T | null {
  const resolved = resolveToDiffPath(entry.file, diffFiles, diffArray, scope);
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
  scope: "post-review" | "post-verification-review" | "save-review",
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

export const generateReview = inngest.createFunction(
  { id: "generate-review" },
  { event: "pr.review.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, preferredLanguage = "en", maxSuggestions = null, verificationEnabled = false } = event.data;

    // ── Step 1: PR 데이터 + 크기 정보 가져오기 ──
    const { diff, title, description, token, additions, deletions, changedFiles, headSha } =
      await step.run("fetch-pr-data", async () => {
        const account = await prisma.account.findFirst({
          where: {
            userId,
            providerId: "github",
          },
        });

        if (!account?.accessToken) {
          throw new Error("Github access token not found");
        }

        const data = await getPullRequestDiff({ token: account.accessToken, owner, repo, prNumber });

        return { ...data, token: account.accessToken };
      });

    // ── Step 2: 크기 분류 + 언어 코드 (이후 모든 step에서 공유) ──
    const langCode: LanguageCode = isValidLanguageCode(preferredLanguage) ? preferredLanguage : "en";
    const sizeMode: ReviewSizeMode = classifyPRSize({ additions, deletions, changedFiles });
    const topK = getTopKForSizeMode(sizeMode);

    // ── Step 3: RAG 컨텍스트 (tiny면 생략) ──
    const context = await step.run("generate-context", async () => {
      if (topK === 0) return [];

      const query = `${title}\n\n${description}`;
      return await retrieveContext(query, `${owner}/${repo}`, topK);
    });

    // ── Step 4: AI 리뷰 생성 ──
    // BREAKING CHANGE: 기존 step은 plain string(text)을 반환했으나, 변경 후 { rawReview, structuredOutput } 객체를 반환한다.
    const { rawReview, structuredOutput } = await step.run("generate-ai-review", async () => {
      const headers = SECTION_HEADERS[langCode];
      const changedFilesSummary = parseDiffToChangedFiles(diff);

      // 구조화 출력 시도
      try {
        const prompt = buildStructuredPrompt({
          title, description, diff, context, langCode, sizeMode, changedFilesSummary, maxSuggestions,
        });

        const { experimental_output } = await generateText({
          model: google("gemini-2.5-flash"),
          experimental_output: Output.object({ schema: structuredReviewSchema }),
          prompt,
        });

        if (experimental_output) {
          // SDK 레벨 검증을 신뢰하지 않고 Zod로 재검증 — 비정상 line 값 등 방어
          const parsed = structuredReviewSchema.safeParse(experimental_output);
          if (!parsed.success) {
            console.warn("Structured output re-validation failed:", parsed.error.message);
            // fallback으로 진행
          } else {
            const markdown = formatStructuredReviewToMarkdown(parsed.data, langCode);
            return { rawReview: markdown, structuredOutput: parsed.data };
          }
        }
      } catch (error) {
        console.warn("Structured output failed, falling back to markdown:", error);
      }

      // 폴백: 기존 마크다운 경로
      const fallbackPrompt = buildFallbackPrompt({
        title, description, diff, context, langCode, sizeMode, headers,
      });
      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt: fallbackPrompt,
      });

      return { rawReview: text, structuredOutput: null };
    });

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

      // ── 3. walkthrough 검증: diff 파일 목록으로 필터링 + basename fallback ──
      if (validatedOutput?.walkthrough) {
        validatedOutput = {
          ...validatedOutput,
          walkthrough: validatedOutput.walkthrough
            .map((entry) => resolveEntryFile(entry, diffFiles, diffArray, "walkthrough"))
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
              const resolved = resolveToDiffPath(issue.file, diffFiles, diffArray, "issues");
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
            .map((s) => resolveEntryFile(s, diffFiles, diffArray, "suggestions"))
            .filter((s): s is NonNullable<typeof s> => s !== null),
        };
      }

      // ── 5-1. suggestions line 검증: diff added lines 범위 체크 ──
      if (validatedOutput?.suggestions && validatedOutput.suggestions.length > 0) {
        const addedLinesMap = extractDiffAddedLinesMap(diff);
        validatedOutput = {
          ...validatedOutput,
          suggestions: validatedOutput.suggestions.filter((s) => {
            // 타입 가드: line이 유효한 양의 정수인지 확인
            if (typeof s.line !== "number" || !Number.isFinite(s.line) || s.line < 1) {
              console.warn("[suggestions] dropped entry", {
                file: s.file, line: s.line, reason: "invalid_line_type",
              });
              return false;
            }

            const fileAddedLines = addedLinesMap.get(s.file);
            if (!fileAddedLines || fileAddedLines.size === 0) return true; // 삭제 파일 등 예외

            // range-based 검증: before 필드의 라인 수만큼 범위 확장
            const beforeLineCount = s.before.split("\n").length;
            for (let i = 0; i < beforeLineCount; i++) {
              if (fileAddedLines.has(s.line + i)) return true;
            }

            console.warn("[suggestions] dropped entry", {
              file: s.file, line: s.line, reason: "line_not_in_diff_added_lines",
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

      const { issues, suggestions } = validatedStructuredOutput;
      if (issues.length === 0 && suggestions.length === 0) {
        return { status: "verified", issueVerdicts: [], suggestionVerdicts: [] };
      }

      try {
        return await verifyReview({ diff, issues, suggestions, langCode });
      } catch (error) {
        console.warn("Review verification failed, continuing unverified:", error);
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
      const reviewedCount =
        (verification?.issueVerdicts.length ?? 0) + (verification?.suggestionVerdicts.length ?? 0);
      const excludedCount = verified.rejectedIssues.length + verified.rejectedSuggestions.length;
      const trace = buildVerificationTrace({ reviewedCount, excludedCount }, langCode);
      const markdown = formatStructuredReviewToMarkdown(verified.keptOutput, langCode);
      finalReview = sanitizeMermaidSequenceDiagrams(trace ? `${trace}\n\n${markdown}` : markdown, langCode);
    }

    // ── Step 5.5: 반복 실수 감지 (wedge) ──
    // 실패해도 리뷰 흐름을 막지 않는다 — 배지 없는 리뷰로 진행.
    const repeatAnnotations = await step.run("detect-repeat-issues", async () => {
      const issues = finalOutput?.issues ?? [];
      if (issues.length === 0) return [];

      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });
      if (!repository) return [];

      try {
        return await detectRepeatIssues({
          issues,
          userId,
          repositoryId: repository.id,
          prNumber,
        });
      } catch (error) {
        console.warn("Repeat detection failed, continuing without badges:", error);
        return [];
      }
    });

    // ── Step 6: GitHub에 리뷰 게시 ──
    // IMPORTANT: postedAsReview는 반드시 step.run()의 반환값으로 캡처해야 한다.
    const postedAsReview = await step.run("post-review", async () => {
      const suggestions = finalOutput?.suggestions ?? [];
      const issues = finalOutput?.issues ?? [];
      const issueCount = issues.length;
      const verdictsAligned =
        !verified ||
        checkLengthAlignment("post-review", "keptIssueVerdicts", issueCount, verified.keptIssueVerdicts.length);
      const repeatsAligned = checkRepeatsAligned("post-review", issueCount, repeatAnnotations.length);
      const issuesWithRepeat = issues.map((issue, index) => {
        const annotation = repeatsAligned ? repeatAnnotations[index] : undefined;
        const confirmed = verdictsAligned && verified?.keptIssueVerdicts[index]?.verdict === "CONFIRMED";
        return {
          ...issue,
          ...(annotation?.repeat ? { repeat: annotation.repeat } : {}),
          ...(confirmed ? { verifierConfirmed: true } : {}),
        };
      });
      const inlineIssues = issuesWithRepeat.filter(i => i.file !== null && i.line !== null);
      const hasInlineContent = suggestions.length > 0 || inlineIssues.length > 0;

      if (hasInlineContent) {
        try {
          await postPRReviewWithSuggestions({
            token, owner, repo, prNumber, reviewBody: finalReview,
            suggestions, issues: issuesWithRepeat, headSha, langCode,
          });
          return true;
        } catch (error) {
          console.warn("PR Review API failed, falling back to comment:", error);
          await postReviewComment(token, owner, repo, prNumber, finalReview);
          return false;
        }
      } else {
        await postReviewComment(token, owner, repo, prNumber, finalReview);
        return false;
      }
    });

    // ── Step 6.5: 검수자 별도 리뷰 엔트리 게시 (검증 수행 시에만) ──
    // 1차 리뷰(Step 6)와 독립 — 실패해도 리뷰 흐름을 막지 않는다.
    // 검증 비활성이거나 검증 생략(skipped)·검토 대상 0개면 no-op.
    await step.run("post-verification-review", async () => {
      if (!verified || !verification) return false;

      const keptIssues = finalOutput?.issues ?? [];
      const issueCount = keptIssues.length;
      // 판정 배열이 게시할 이슈와 어긋나면 잘못된 판정 목록 게시 방지를 위해 카드 전체 생략
      const verdictsAligned = checkLengthAlignment(
        "post-verification-review", "keptIssueVerdicts", issueCount, verified.keptIssueVerdicts.length,
      );
      if (!verdictsAligned) return false;

      const reviewedCount =
        verification.issueVerdicts.length + verification.suggestionVerdicts.length;
      if (reviewedCount === 0) return false;

      const body = buildVerificationReviewBody({
        keptIssues,
        keptIssueVerdicts: verified.keptIssueVerdicts,
        rejectedIssues: verified.rejectedIssues,
        rejectedSuggestions: verified.rejectedSuggestions,
        reviewedCount,
        langCode,
      });

      try {
        await postVerificationReview({ token, owner, repo, prNumber, headSha, body });
        return true;
      } catch (error) {
        console.warn("Verification review entry failed (main review was already posted):", error);
        return false;
      }
    });

    // ── Step 7: DB에 리뷰 저장 ──
    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      const issueCount = finalOutput?.issues?.length ?? 0;
      const suggestionCount = finalOutput?.suggestions?.length ?? 0;
      const verdictsAligned =
        !verified ||
        checkLengthAlignment("save-review", "keptIssueVerdicts", issueCount, verified.keptIssueVerdicts.length);
      const suggestionVerdictsAligned =
        !verified ||
        checkLengthAlignment("save-review", "keptSuggestionVerdicts", suggestionCount, verified.keptSuggestionVerdicts.length);
      const repeatsAligned = checkRepeatsAligned("save-review", issueCount, repeatAnnotations.length);

      await prisma.$transaction(async (tx) => {
        const createdReview = await tx.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review: finalReview,
            reviewData: finalOutput
              ? (() => {
                  // shape guard: 배포 경쟁 상태에서 구 shape(description-only)이
                  // memoize되어 resume될 때 schemaVersion이 실제 shape과 불일치하는 것을 방지.
                  // issues가 빈 배열이면 .every()는 true → 정상적으로 v2 저장.
                  const hasNewIssueShape = (finalOutput.issues ?? []).every(
                    (i) => typeof (i as { title?: unknown }).title === "string",
                  );
                  const storedSchemaVersion = hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1;
                  // verification 블록은 optional 추가 필드 — 버전 범프 불필요 (storedReviewDataSchema 참조)
                  // 판정 배열은 저장된 issues/suggestions와 index 정렬이 전제 —
                  // 어긋나면 빈 배열로 저장한다 (대시보드 패널은 entry 없는 row를 건너뜀).
                  const verificationBlock = verification
                    ? {
                        status: verification.status,
                        model: VERIFIER_MODEL_ID,
                        issueVerdicts: verdictsAligned ? verified?.keptIssueVerdicts ?? [] : [],
                        suggestionVerdicts: suggestionVerdictsAligned ? verified?.keptSuggestionVerdicts ?? [] : [],
                        rejectedIssues: verified?.rejectedIssues ?? [],
                        rejectedSuggestions: verified?.rejectedSuggestions ?? [],
                      }
                    : null;
                  // 인터페이스 타입 배열(VerdictEntry[] 등)은 인덱스 시그니처가 없어
                  // Prisma InputJsonValue에 구조적으로 미할당 — 값은 순수 JSON이므로 캐스트.
                  return {
                    ...finalOutput,
                    ...(verificationBlock ? { verification: verificationBlock } : {}),
                    schemaVersion: storedSchemaVersion,
                  } as unknown as Prisma.InputJsonValue;
                })()
              : Prisma.DbNull,
            langCode,
            reviewType: "FULL_REVIEW",
            status: "completed",
            headSha,
          },
        });

        if (finalOutput?.suggestions?.length) {
          await tx.suggestion.createMany({
            data: finalOutput.suggestions.map((s) => ({
              reviewId: createdReview.id,
              filePath: s.file,
              lineNumber: s.line,
              beforeCode: s.before,
              afterCode: s.after,
              explanation: s.explanation,
              severity: s.severity,
              status: "PENDING",
            })),
          });
        }

        if (finalOutput?.issues?.length) {
          await tx.reviewIssue.createMany({
            data: finalOutput.issues.map((issue, index) => {
              const annotation = repeatsAligned ? repeatAnnotations[index] : undefined;
              return {
                reviewId: createdReview.id,
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
              };
            }),
          });
        }
      });

      // postedAsReview 참조로 Inngest replay 경고 방지
      void postedAsReview;
    });

    return { success: true };
  },
);
