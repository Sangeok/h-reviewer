import type { StructuredReviewOutput } from "./review-schema";
import type { LanguageCode } from "@/shared/types/language";
import { SECTION_HEADERS } from "@/shared/constants";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "../constants/review-emoji";

const RISK_BADGE: Record<string, string> = {
  low: "🟢 Low Risk",
  medium: "🟡 Medium Risk",
  high: "🔴 High Risk",
};

const CHANGE_EMOJI: Record<string, string> = {
  added: "🆕",
  modified: "✏️",
  deleted: "🗑️",
  renamed: "📝",
};

export function formatStructuredReviewToMarkdown(
  output: StructuredReviewOutput,
  langCode: LanguageCode
): string {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  // Summary: 리스크 배지 + 개요 + 핵심 포인트
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
      ...output.summary.keyPoints.map(p => `- ${p}`),
    );
  }
  sections.push(summaryLines.join("\n"));

  // Walkthrough: collapsible 테이블
  if (output.walkthrough && output.walkthrough.length > 0) {
    const tableRows = output.walkthrough.map((entry) => {
      const emoji = CHANGE_EMOJI[entry.changeType] ?? "📄";
      const safeSummary = entry.summary.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
      return `| ${emoji} \`${entry.file}\` | ${entry.changeType} | ${safeSummary} |`;
    });
    const table = [
      `| File | Change | Summary |`,
      `|------|--------|---------|`,
      ...tableRows,
    ].join("\n");

    sections.push(
      `<details>\n<summary>\n\n## ${headers.walkthrough}\n\n</summary>\n\n${table}\n\n</details>`
    );
  }

  if (output.sequenceDiagram) {
    sections.push(`## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${output.sequenceDiagram}\n\`\`\``);
  }

  if (output.strengths.length > 0) {
    const items = output.strengths.map(s => `- ${s}`).join("\n");
    sections.push(
      `<details>\n<summary>\n\n## ${headers.strengths}\n\n</summary>\n\n${items}\n\n</details>`
    );
  }

  // line이 null인 issues(project-level + file-level)만 review body에 포함
  // line-specific issues는 inline comment로만 포스팅 (pr-review.ts에서 처리)
  const bodyIssues = output.issues.filter(i => i.line === null);

  if (bodyIssues.length > 0) {
    const items = bodyIssues.map(i => {
      const sev = `${SEVERITY_EMOJI[i.severity]} ${i.severity}`;
      const cat = `${CATEGORY_EMOJI[i.category]} ${i.category}`;
      const fileTag = i.file ? ` · \`${i.file}\`` : "";
      const desc = i.description.trim();
      return `### ${sev} · ${cat}${fileTag}\n\n${desc}`;
    }).join("\n\n");
    sections.push(`## ${headers.issues}\n\n${items}`);
  }

  if (output.suggestions.length > 0) {
    const rows = output.suggestions.map(s => {
      const safeExplanation = s.explanation.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
      return `| ${SEVERITY_EMOJI[s.severity]} ${s.severity} | \`${s.file}\` | ${s.line} | ${safeExplanation} |`;
    });
    const table = [
      `| Severity | File | Line | Description |`,
      `|----------|------|------|-------------|`,
      ...rows,
    ].join("\n");
    sections.push(`## ${headers.suggestions}\n\n${table}`);
  }

  return sections.join("\n\n");
}
