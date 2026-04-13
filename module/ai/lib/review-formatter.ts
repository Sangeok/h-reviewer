import type { StructuredReviewOutput } from "./review-schema";
import type { LanguageCode } from "@/shared/types/language";
import { SECTION_HEADERS, ISSUE_FIELD_LABELS } from "@/shared/constants";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "../constants/review-emoji";

/**
 * 긴 파일 경로를 maxLength 이내로 축약한다.
 * 마지막 2개 세그먼트를 유지하고 앞을 '…/'로 대체한다.
 * 축약 후에도 초과하면 마지막 세그먼트만 유지한다.
 */
export function shortenFilePath(
  filePath: string,
  maxLength: number = 45,
): string {
  if (filePath.length <= maxLength) return filePath;
  const segments = filePath.split("/");
  if (segments.length <= 2) return filePath;

  const twoSegments = `…/${segments.slice(-2).join("/")}`;
  if (twoSegments.length <= maxLength) return twoSegments;

  return `…/${segments[segments.length - 1]}`;
}

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

  // Walkthrough: collapsible bullet list
  if (output.walkthrough && output.walkthrough.length > 0) {
    const items = output.walkthrough
      .map((entry) => {
        const emoji = CHANGE_EMOJI[entry.changeType] ?? "📄";
        const summaryOneLine = entry.summary.replace(/[\r\n]+/g, " ");
        return `- ${emoji} \`${entry.file}\` **(${entry.changeType})** — ${summaryOneLine}`;
      })
      .join("\n");

    sections.push(
      `<details>\n<summary>\n\n## ${headers.walkthrough}\n\n</summary>\n\n${items}\n\n</details>`
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
    const labels = ISSUE_FIELD_LABELS[langCode];
    const items = bodyIssues.map(i => {
      const sev = `${SEVERITY_EMOJI[i.severity]} ${i.severity}`;
      const cat = `${CATEGORY_EMOJI[i.category]} ${i.category}`;
      const fileTag = i.file ? ` · \`${i.file}\`` : "";

      // 방어적 기본값:
      // (1) Inngest in-flight resume 시 구 shape(description만 존재)으로 memoize된
      //     step 결과가 새 코드로 흘러올 수 있다. title/body 누락 시에도 런타임 에러 대신
      //     최선-노력 렌더를 수행한다. 구 description은 body로 승격.
      // (2) 새 스키마의 impact/recommendation은 .default("") 허용이므로 빈 값 가능.
      const title = (i.title ?? "").trim();
      const rawBody = (i.body ?? (i as { description?: string }).description ?? "").trim();
      const impact = (i.impact ?? "").trim();
      const recommendation = (i.recommendation ?? "").trim();

      // body가 title로 시작하면 중복 제거 (LLM이 title을 body 첫 문장에 반복하는 현상 방어).
      // 문장 경계 문자(. , : ; — -) 또는 EOS가 뒤따를 때만 strip. 공백만 뒤따르면 유지.
      const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
      const body =
        titleSuffix !== null && (titleSuffix === "" || /^[.,:;—\-]/.test(titleSuffix))
          ? titleSuffix.replace(/^[\s.,:;—\-]+/, "")
          : rawBody;

      const lines: string[] = [
        `### ${sev} · ${cat}${fileTag}${title ? ` — ${title}` : ""}`,
      ];
      if (body) lines.push("", body);
      if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
      if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
      return lines.join("\n");
      // SYNC:formatIssueBody — structured-review-body.tsx · pr-review.ts 와 동일 로직 유지
    }).join("\n\n");
    sections.push(`## ${headers.issues}\n\n${items}`);
  }

  if (output.suggestions.length > 0) {
    const rows = output.suggestions.map(s => {
      const safeExplanation = s.explanation.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
      const displayPath = shortenFilePath(s.file);
      const safeLine = typeof s.line === "number" && Number.isFinite(s.line) ? s.line : "–";
      return `| ${SEVERITY_EMOJI[s.severity]}\u00A0${s.severity} | \`${displayPath}\` | ${safeLine} | ${safeExplanation} |`;
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
