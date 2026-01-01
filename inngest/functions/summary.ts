import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/module/github/lib/github";
import { searchSimilarCode } from "@/module/ai/lib/rag";
import type { SearchResult } from "@/module/ai/types";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

function stripFencedCodeBlocks(input: string): string {
  // Defensive post-processing: keep the summary concise and avoid leaking large code snippets.
  return input
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const generateSummary = inngest.createFunction(
  { id: "generate-summary" },
  { event: "pr.summary.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId } = event.data;

    // Fetch PR data
    const { diff, title, description, token } = await step.run("fetch-pr-data", async () => {
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

    // Generate AI summary with RAG context
    const summary = await step.run("generate-ai-summary", async () => {
      const relevantContext = await searchSimilarCode(diff, {
        topK: 3,
        namespace: `${owner}/${repo}`,
      });

      const relatedFiles = Array.from(
        new Set(
          relevantContext.map((ctx: SearchResult) => ctx.metadata?.file).filter((file): file is string => Boolean(file))
        )
      ).slice(0, 5);

      const contextSection =
        relatedFiles.length > 0
          ? `Related codebase signals (for reasoning only; do not quote):\n- ${relatedFiles.join("\n- ")}`
          : "Related codebase signals: none found in the indexed codebase.";

      const prompt = `You are an expert code reviewer. Produce a concise PR summary for a GitHub comment.

Rules:
- Use ONLY information present in the PR title, description, and diff. Do NOT guess.
- Do NOT include any fenced code blocks (no triple backticks) in your response.
- Do NOT quote code from the diff or codebase context. Mention file paths only when helpful.
- If something is unclear, write "Needs verification" rather than speculating.
- Keep it short and useful for reviewers. Maximum 300 words.

Output format (Markdown, EXACT sections, no extra preamble or closing text):
1. Overview
<2-3 sentences>

2. Key Changes
- <file path>: <one short sentence>
(3-5 bullets max)

3. Impact
<1-3 sentences or bullets describing affected modules/user flows. If negligible, say so explicitly.>

4. Risk Level
<LOW|MEDIUM|HIGH> - <one sentence justification>

PR Title: ${title}
PR Description: ${description || "No description provided"}

Code Changes (diff):
\`\`\`diff
${diff}
\`\`\`

${contextSection}`;

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      const sanitized = stripFencedCodeBlocks(text);
      return sanitized.length > 0 ? sanitized : text.trim();
    });

    // Step 3: Post comment to GitHub
    await step.run("post-comment", async () => {
      await postReviewComment(token, owner, repo, prNumber, summary, { title: "AI PR Summary" });
    });

    // Step 4: Save to database
    await step.run("save-summary", async () => {
      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
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
          review: summary,
          reviewType: "SUMMARY", // Summary 타입 명시
          status: "completed",
        },
      });
    });

    return { success: true };
  }
);
