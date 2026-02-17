import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/module/github/lib/github";
import { retrieveContext } from "@/module/ai/lib/rag";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeMermaidSequenceDiagrams } from "@/module/github/lib/github-markdown";
import { type LanguageCode, getLanguageName, isValidLanguageCode } from "@/module/settings/constants";
import { SECTION_HEADERS } from "@/shared/constants";

export const generateReview = inngest.createFunction(
  { id: "generate-review" },
  { event: "pr.review.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, preferredLanguage = "en" } = event.data;

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

    const context = await step.run("generate-context", async () => {
      const qeury = `${title}\n\n${description}`;

      return await retrieveContext(qeury, `${owner}/${repo}`);
    });

    const review = await step.run("generate-ai-review", async () => {
      // Validate language code and get localized headers
      const langCode = isValidLanguageCode(preferredLanguage) ? preferredLanguage : "en";
      const headers = SECTION_HEADERS[langCode];

      // Generate language instruction for non-English languages
      const languageInstruction =
        langCode !== "en"
          ? `\n\nIMPORTANT: Write the entire review in ${getLanguageName(
              langCode,
            )}. All section headers must be exactly as specified below. However, keep technical terms (e.g., library names, standard coding terms like "Pull Request", "Commit") in English where appropriate for clarity.`
          : "";

      const prompt = `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.${languageInstruction}
        PR Title: ${title}
        PR Description: ${description || "No description provided"}

        Context from Codebase:
        ${context.join("\n\n")}

        Code Changes:
        \`\`\`diff
        ${diff}
        \`\`\`

        Please provide the review with the following specific sections:
        1. **${headers.walkthrough}**: A file-by-file explanation of the changes.
        2. **${headers.sequenceDiagram}**: A Mermaid JS sequence diagram visualizing the flow of the changes (if applicable). Use \`\`\`mermaid ... \`\`\` block. **IMPORTANT**: Ensure the Mermaid syntax is valid on GitHub. Do NOT use Mermaid activation controls (no \`activate\`, \`deactivate\`, and no \`+\` or \`-\` on arrows like \`->>+\` or \`-->>-\`). Also avoid special characters (quotes, braces, parentheses) inside Note text or labels as it can break rendering. Keep the diagram simple.
        3. **${headers.summary}**: Brief overview.
        4. **${headers.strengths}**: What's done well.
        5. **${headers.issues}**: Bugs, security concerns, code smells.
        6. **${headers.suggestions}**: Specific code improvements.
        7. **${headers.poem}**: A short, creative poem summarizing the changes at the very end.

        Format your response in markdown.`;

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      return sanitizeMermaidSequenceDiagrams(text);
    });

    await step.run("post-comment", async () => {
      await postReviewComment(token, owner, repo, prNumber, review);
    });

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
