import type { StructuredReviewOutput } from "./review-schema";
import type { LanguageCode } from "@/shared/types/language";
import { SECTION_HEADERS } from "@/shared/constants";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "../constants/review-emoji";

export function formatStructuredReviewToMarkdown(
  output: StructuredReviewOutput,
  langCode: LanguageCode
): string {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  sections.push(`## ${headers.summary}\n\n${output.summary}`);

  if (output.walkthrough) {
    sections.push(`## ${headers.walkthrough}\n\n${output.walkthrough}`);
  }

  if (output.sequenceDiagram) {
    sections.push(`## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${output.sequenceDiagram}\n\`\`\``);
  }

  if (output.strengths.length > 0) {
    const items = output.strengths.map(s => `- ${s}`).join("\n");
    sections.push(`## ${headers.strengths}\n\n${items}`);
  }

  // line이 null인 issues(project-level + file-level)만 review body에 포함
  // line-specific issues는 inline comment로만 포스팅 (pr-review.ts에서 처리)
  const bodyIssues = output.issues.filter(i => i.line === null);

  if (bodyIssues.length > 0) {
    const items = bodyIssues.map(i => {
      const sev = `${SEVERITY_EMOJI[i.severity]} **${i.severity}**`;
      const cat = `${CATEGORY_EMOJI[i.category]} ${i.category}`;
      const fileTag = i.file ? ` · \`${i.file}\`` : "";
      const desc = i.description.replace(/[\r\n]+/g, " ").trim();
      return `- ${sev} · ${cat}${fileTag}  \n  ${desc}`;
    }).join("\n\n");
    sections.push(`## ${headers.issues}\n\n${items}`);
  }

  if (output.suggestions.length > 0) {
    const items = output.suggestions.map(s =>
      `- **${s.file}:${s.line}** [${s.severity}]: ${s.explanation}`
    ).join("\n");
    sections.push(`## ${headers.suggestions}\n\n${items}`);
  }

  return sections.join("\n\n");
}
