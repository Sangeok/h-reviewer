import type { StructuredReviewOutput } from "./review-schema";
import type { LanguageCode } from "@/module/settings/constants";
import { SECTION_HEADERS } from "@/shared/constants";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai/constants/review-emoji";

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

  // line이 null인 issues(project-level + file-level)만 review body에 테이블로 포함
  // line-specific issues는 inline comment로만 포스팅 (pr-review.ts에서 처리)
  // ⚠️ Known limitation: AI가 description에 | 문자를 포함하면 markdown table 깨짐.
  // 현재 단계에서는 허용 (발생 빈도 낮음).
  const bodyIssues = output.issues.filter(i => i.line === null);

  if (bodyIssues.length > 0) {
    const rows = bodyIssues.map(i => {
      const cat = `${CATEGORY_EMOJI[i.category] ?? "📋"}\u00A0${i.category}`;
      const sev = `${SEVERITY_EMOJI[i.severity] ?? ""}\u00A0${i.severity}`;
      const filePrefix = i.file ? `\`${i.file}\`: ` : "";
      return `| ${cat} | ${sev} | ${filePrefix}${i.description} |`;
    }).join("\n");
    // \u00A0 padding in headers forces GitHub to allocate minimum column width
    const catHeader = `Category${"\u00A0".repeat(8)}`;
    const sevHeader = `Severity${"\u00A0".repeat(8)}`;
    sections.push(`## ${headers.issues}\n\n| ${catHeader} | ${sevHeader} | Description |\n|----------|----------|-------------|\n${rows}`);
  }

  if (output.suggestions.length > 0) {
    const items = output.suggestions.map(s =>
      `- **${s.file}:${s.line}** [${s.severity}]: ${s.explanation}`
    ).join("\n");
    sections.push(`## ${headers.suggestions}\n\n${items}`);
  }

  return sections.join("\n\n");
}
