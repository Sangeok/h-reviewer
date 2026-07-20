import type { StructuredReviewOutput } from "./review-schema";
import type { LanguageCode } from "@/shared/types/language";
import { SECTION_HEADERS, ISSUE_FIELD_LABELS } from "@/shared/constants";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "../constants/review-emoji";
import {
  formatSuggestionSummaryItem,
  SUGGESTION_SECTION_HINT,
} from "./suggestion-format";

const RISK_BADGE: Record<string, string> = {
  low: "\ud83d\udfe2 Low Risk",
  medium: "\ud83d\udfe1 Medium Risk",
  high: "\ud83d\udd34 High Risk",
};

const CHANGE_EMOJI: Record<string, string> = {
  added: "\u2795",
  modified: "\ud83d\udd27",
  deleted: "\u274c",
  renamed: "\ud83d\udd04",
};

export function formatStructuredReviewToMarkdown(
  output: StructuredReviewOutput,
  langCode: LanguageCode,
): string {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  const summaryLines = [
    `## ${headers.summary}`,
    "",
    `> **${RISK_BADGE[output.summary.riskLevel]}**`,
    "",
    output.summary.overview,
  ];

  if (output.summary.keyPoints.length > 0) {
    summaryLines.push(
      "",
      `**${headers.reviewFocus}**`,
      "",
      ...output.summary.keyPoints.map((point) => `- ${point}`),
    );
  }

  sections.push(summaryLines.join("\n"));

  if (output.walkthrough && output.walkthrough.length > 0) {
    const items = output.walkthrough
      .map((entry) => {
        const emoji = CHANGE_EMOJI[entry.changeType] ?? "\ud83d\udcc4";
        const summaryOneLine = entry.summary.replace(/[\r\n]+/g, " ");
        return `- ${emoji} \`${entry.file}\` **(${entry.changeType})** - ${summaryOneLine}`;
      })
      .join("\n");

    sections.push(
      `<details>\n<summary>\n\n## ${headers.walkthrough}\n\n</summary>\n\n${items}\n\n</details>`,
    );
  }

  if (output.sequenceDiagram) {
    sections.push(
      `## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${output.sequenceDiagram}\n\`\`\``,
    );
  }

  if (output.strengths.length > 0) {
    const items = output.strengths.map((strength) => `- ${strength}`).join("\n");
    sections.push(
      `<details>\n<summary>\n\n## ${headers.strengths}\n\n</summary>\n\n${items}\n\n</details>`,
    );
  }

  const bodyIssues = output.issues.filter((issue) => issue.line === null);

  if (bodyIssues.length > 0) {
    const labels = ISSUE_FIELD_LABELS[langCode];
    const items = bodyIssues
      .map((issue) => {
        const severity = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
        const category = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
        const fileTag = issue.file ? ` \u00b7 \`${issue.file}\`` : "";

        const title = (issue.title ?? "").trim();
        const rawBody = (issue.body ?? (issue as { description?: string }).description ?? "").trim();
        const impact = (issue.impact ?? "").trim();
        const recommendation = (issue.recommendation ?? "").trim();

        const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
        const body =
          titleSuffix !== null && (titleSuffix === "" || /^[\s.,:;-]/.test(titleSuffix))
            ? titleSuffix.replace(/^[\s.,:;-]+/, "")
            : rawBody;

        const lines: string[] = [
          `### ${severity} \u00b7 ${category}${fileTag}${title ? ` - ${title}` : ""}`,
        ];

        if (body) {
          lines.push("", body);
        }

        if (impact) {
          lines.push("", `**${labels.impact}:** ${impact}`);
        }

        if (recommendation) {
          lines.push("", `**${labels.recommendation}:** ${recommendation}`);
        }

        return lines.join("\n");
      })
      .join("\n\n");

    sections.push(`## ${headers.issues}\n\n${items}`);
  }

  if (output.suggestions.length > 0) {
    const items = output.suggestions
      .map(formatSuggestionSummaryItem)
      .join("\n\n");

    sections.push(
      `## ${headers.suggestions}\n\n${SUGGESTION_SECTION_HINT[langCode]}\n\n${items}`,
    );
  }

  return sections.join("\n\n");
}
