import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/module/github/lib/github";
import { postPRReviewWithSuggestions } from "@/module/github/lib/pr-review";
import {
  retrieveContext, classifyPRSize, getTopKForSizeMode,
  structuredReviewSchema, buildStructuredPrompt, buildFallbackPrompt,
  getIssueLimit, formatStructuredReviewToMarkdown, REVIEW_SCHEMA_VERSION,
} from "@/module/ai";
import type { ReviewSizeMode } from "@/module/ai";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeMermaidSequenceDiagrams } from "@/module/github/lib/github-markdown";
import { isValidLanguageCode } from "@/module/settings";
import { SECTION_HEADERS, DIAGRAM_FALLBACK_TEXT } from "@/shared/constants";
import { parseDiffToChangedFiles, extractDiffFileSet } from "@/module/github/lib/diff-parser";
import type { LanguageCode } from "@/module/settings";

export const generateReview = inngest.createFunction(
  { id: "generate-review" },
  { event: "pr.review.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, preferredLanguage = "en", maxSuggestions = null } = event.data;

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
          const markdown = formatStructuredReviewToMarkdown(experimental_output, langCode);
          return { rawReview: markdown, structuredOutput: experimental_output };
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

    // ── Step 5: 검증 게이트 (sanitize → validate → fallback) ──
    const { review, validatedStructuredOutput } = await step.run("validate-review", async () => {
      const sanitized = sanitizeMermaidSequenceDiagrams(rawReview, langCode);

      // 구조화 출력의 sequenceDiagram도 검증
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

      // issues 검증: diff 파일 목록으로 사전 필터링 + count-trimming
      if (validatedOutput?.issues) {
        const diffFiles = extractDiffFileSet(diff);
        validatedOutput = {
          ...validatedOutput,
          issues: validatedOutput.issues.filter(issue => {
            // project-level issues (file: null)는 항상 유효
            if (issue.file === null) return true;
            // file이 diff에 존재하는지 검증
            if (!diffFiles.has(issue.file)) return false;
            // line-specific issue의 line이 양수인지만 기본 검증
            // (정확한 diff hunk 범위 검증은 비용 대비 효과가 낮음)
            if (issue.line !== null && issue.line < 1) return false;
            return true;
          }),
        };

        // ⚠️ AI가 prompt limit을 초과할 수 있으므로 count-trimming 적용
        // (Zod schema에는 동적 .max() 불가 — sizeMode 기반이므로 런타임 필터링)
        const { inline: maxInline, general: maxGeneral } = getIssueLimit(sizeMode);
        let inlineCount = 0, generalCount = 0;
        validatedOutput = {
          ...validatedOutput,
          issues: validatedOutput.issues.filter(issue => {
            if (issue.line !== null) return ++inlineCount <= maxInline;
            return ++generalCount <= maxGeneral;
          }),
        };

        // suggestion이 있는 file+line과 동일한 issue 제거 (중복 인라인 댓글 방지)
        // 업계 표준: 한 위치에 하나의 인라인 댓글 — suggestion의 explanation이 이미 문제를 설명함
        if (validatedOutput.suggestions && validatedOutput.suggestions.length > 0) {
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
      }

      return {
        review: sanitized,
        validatedStructuredOutput: validatedOutput,
      };
    });

    // ── Step 6: GitHub에 리뷰 게시 ──
    // IMPORTANT: postedAsReview는 반드시 step.run()의 반환값으로 캡처해야 한다.
    const postedAsReview = await step.run("post-review", async () => {
      const suggestions = validatedStructuredOutput?.suggestions ?? [];
      const issues = validatedStructuredOutput?.issues ?? [];
      const inlineIssues = issues.filter(i => i.file !== null && i.line !== null);
      const hasInlineContent = suggestions.length > 0 || inlineIssues.length > 0;

      if (hasInlineContent) {
        try {
          await postPRReviewWithSuggestions({
            token, owner, repo, prNumber, reviewBody: review, suggestions, issues, headSha,
          });
          return true;
        } catch (error) {
          console.warn("PR Review API failed, falling back to comment:", error);
          await postReviewComment(token, owner, repo, prNumber, review);
          return false;
        }
      } else {
        await postReviewComment(token, owner, repo, prNumber, review);
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

      await prisma.$transaction(async (tx) => {
        const createdReview = await tx.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review,
            reviewData: validatedStructuredOutput
              ? { ...validatedStructuredOutput, schemaVersion: REVIEW_SCHEMA_VERSION }
              : null,
            langCode,
            reviewType: "FULL_REVIEW",
            status: "completed",
            headSha,
          },
        });

        if (validatedStructuredOutput?.suggestions?.length) {
          await tx.suggestion.createMany({
            data: validatedStructuredOutput.suggestions.map((s) => ({
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
      });

      // postedAsReview 참조로 Inngest replay 경고 방지
      void postedAsReview;
    });

    return { success: true };
  },
);
