import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/module/github/lib/github";
import { retrieveContext } from "@/module/ai";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeMermaidSequenceDiagrams } from "@/module/github/lib/github-markdown";
import { getLanguageName, isValidLanguageCode } from "@/module/settings/constants";
import { SECTION_HEADERS, DIAGRAM_FALLBACK_TEXT } from "@/shared/constants";
import { classifyPRSize, getTopKForSizeMode, getSectionPolicy } from "@/module/ai/lib/review-size-policy";
import type { ReviewSizeMode } from "@/module/ai/lib/review-size-policy";
import type { LanguageCode } from "@/module/settings/constants";

/** size 모드별 프롬프트 섹션 지시문 생성 */
function buildSectionInstruction(
  mode: ReviewSizeMode,
  headers: (typeof SECTION_HEADERS)[LanguageCode],
): string {
  const policy = getSectionPolicy(mode);
  const sections: string[] = [];
  let idx = 1;

  if (policy.summary) {
    const extra = mode === "tiny" ? " (2-3 sentences only)" : mode === "large" ? " (focus on key changed files)" : "";
    sections.push(`${idx++}. **${headers.summary}**${extra}`);
  }
  if (policy.walkthrough) {
    const extra = mode === "small" ? " (brief, one line per file)" : mode === "large" ? " (top 10 changed files only)" : "";
    sections.push(`${idx++}. **${headers.walkthrough}**${extra}`);
  }
  if (policy.sequenceDiagram) {
    sections.push(`${idx++}. **${headers.sequenceDiagram}**: Use \`\`\`mermaid block.`);
  }
  if (policy.strengths) {
    sections.push(`${idx++}. **${headers.strengths}**`);
  }
  if (policy.issues) {
    const extra = mode === "tiny" ? " (max 1 issue unless critical)" : mode === "large" ? " (prioritized by severity)" : "";
    sections.push(`${idx++}. **${headers.issues}**${extra}`);
  }
  if (policy.suggestions) {
    const extra = mode === "tiny" ? " (max 2 suggestions)" : mode === "large" ? " (top 5 only)" : "";
    sections.push(`${idx++}. **${headers.suggestions}**${extra}`);
  }
  if (policy.poem) {
    sections.push(`${idx++}. **${headers.poem}**: A short creative poem.`);
  }

  return `Provide the review with these sections:\n${sections.join("\n")}`;
}

export const generateReview = inngest.createFunction(
  { id: "generate-review" },
  { event: "pr.review.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, preferredLanguage = "en" } = event.data;

    // ── Step 1: PR 데이터 + 크기 정보 가져오기 ──
    const { diff, title, description, token, additions, deletions, changedFiles } =
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

        const data = await getPullRequestDiff(account.accessToken, owner, repo, prNumber);

        return { ...data, token: account.accessToken };
      });

    // ── Step 2: 크기 분류 + 언어 코드 (이후 모든 step에서 공유) ──
    const langCode = isValidLanguageCode(preferredLanguage) ? preferredLanguage : "en";
    const sizeMode = classifyPRSize({ additions, deletions, changedFiles });
    const topK = getTopKForSizeMode(sizeMode);

    // ── Step 3: RAG 컨텍스트 (tiny면 생략) ──
    const context = await step.run("generate-context", async () => {
      if (topK === 0) return [];

      const query = `${title}\n\n${description}`;
      return await retrieveContext(query, `${owner}/${repo}`, topK);
    });

    // ── Step 4: AI 리뷰 생성 ──
    const rawReview = await step.run("generate-ai-review", async () => {
      const headers = SECTION_HEADERS[langCode];

      const languageInstruction =
        langCode !== "en"
          ? `\n\nIMPORTANT: Write the entire review in ${getLanguageName(langCode)}. All section headers must be exactly as specified below. However, keep technical terms in English where appropriate.`
          : "";

      const mermaidInstruction = getSectionPolicy(sizeMode).sequenceDiagram
        ? `\nIf you include a Mermaid sequence diagram, follow these rules STRICTLY:
- Use ONLY sequenceDiagram type.
- participant ids must match [a-zA-Z0-9_]+ only.
- In message/note/label text: NEVER use backticks, quotes, braces, brackets, semicolons, or angle brackets. Parentheses are OK. Unicode letters (Korean, etc.) are allowed.
- Allowed control structures: loop/end, alt/else/end, opt/end, autonumber.
- Do NOT use activate/deactivate or +/- on arrows.
- If you are uncertain about the validity, output "Diagram omitted" instead.`
        : "";

      const sectionInstruction = buildSectionInstruction(sizeMode, headers);

      const prompt = `You are an expert code reviewer.${languageInstruction}

PR Title: ${title}
PR Description: ${description || "No description provided"}

${context.length > 0 ? `Context from Codebase:\n${context.join("\n\n")}` : ""}

Code Changes:
\`\`\`diff
${diff}
\`\`\`

Review Mode: ${sizeMode.toUpperCase()}
${sectionInstruction}
${mermaidInstruction}

Format your response in markdown.`;

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      return text;
    });

    // ── Step 5: 검증 게이트 (sanitize → validate → fallback) ──
    const { review, validationMeta } = await step.run("validate-review", async () => {
      const sanitized = sanitizeMermaidSequenceDiagrams(rawReview, langCode);

      const hadMermaidBlock = /```mermaid/i.test(rawReview);
      const hasFallback =
        sanitized.includes(DIAGRAM_FALLBACK_TEXT.en) ||
        sanitized.includes(DIAGRAM_FALLBACK_TEXT.ko);

      return {
        review: sanitized,
        validationMeta: {
          diagramPresent: hadMermaidBlock,
          diagramValidationPassed: hadMermaidBlock ? !hasFallback : null,
          diagramFailureReason: hasFallback ? "diagram replaced with fallback" : null,
          sanitizerApplied: true,
          sizeMode,
        },
      };
    });

    // ── Step 6: GitHub에 코멘트 게시 ──
    await step.run("post-comment", async () => {
      await postReviewComment(token, owner, repo, prNumber, review);
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

      await prisma.review.create({
        data: {
          repositoryId: repository.id,
          prNumber,
          prTitle: title,
          prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          review,
          reviewType: "FULL_REVIEW",
          status: "completed",
        },
      });
    });

    return { success: true };
  },
);
