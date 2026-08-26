import type { StructuredReviewOutput } from "./review-schema";
import type { LanguageCode } from "@/shared/types/language";
import {
  SECTION_HEADERS,
  ISSUE_FIELD_LABELS,
  REVIEW_NOTICE_LABELS,
  VERDICT_LINE_LABELS,
  ISSUE_SECTION_HINT,
} from "@/shared/constants";
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

/**
 * 리뷰 본문 상단 고지문. 열화가 없으면 null.
 *
 * - excludedFiles: diff에서 제외한 기계 생성 파일 (리뷰 누락을 명시)
 * - limitedReview: 구조화 출력 실패로 마크다운 폴백을 쓴 경우
 *   (인라인 제안·이슈 행·검수·반복 감지가 모두 빠진다)
 *
 * 파일 목록은 6개까지만 나열한다 — 그 이상은 본문을 잡아먹는다.
 */
export function buildReviewNotice(params: {
  excludedFiles: string[];
  limitedReview: boolean;
  langCode: LanguageCode;
}): string | null {
  const { excludedFiles, limitedReview, langCode } = params;
  const labels = REVIEW_NOTICE_LABELS[langCode];
  const lines: string[] = [];

  if (limitedReview) {
    lines.push(`> ⚠️ ${labels.limitedReview}`);
  }

  if (excludedFiles.length > 0) {
    const MAX_LISTED = 6;
    const listed = excludedFiles.slice(0, MAX_LISTED).map((f) => `\`${f}\``);
    const rest = excludedFiles.length - listed.length;
    const suffix = rest > 0 ? `, +${rest}` : "";
    lines.push(`> ℹ️ ${labels.skippedFiles} ${listed.join(", ")}${suffix}`);
  }

  return lines.length > 0 ? lines.join("\n>\n") : null;
}

export function formatStructuredReviewToMarkdown(
  output: StructuredReviewOutput,
  langCode: LanguageCode,
): string {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  // ── 결론 줄: 배지 + 카운트. 전부 기존 필드 이동이거나 산술 — 판단 문장 금지 ──
  // (권장행동을 넣지 않는 이유는 VERDICT_LINE_LABELS 주석 참조)
  // 🚨/⚠️만 괄호 내역으로 센다. 0이면 괄호 생략.
  const criticalCount = output.issues.filter((i) => i.severity === "CRITICAL").length;
  const warningCount = output.issues.filter((i) => i.severity === "WARNING").length;
  const breakdownParts = [
    criticalCount > 0 ? `${SEVERITY_EMOJI.CRITICAL} ${criticalCount}` : null,
    warningCount > 0 ? `${SEVERITY_EMOJI.WARNING} ${warningCount}` : null,
  ].filter((p): p is string => p !== null);
  const breakdown = breakdownParts.length > 0 ? ` (${breakdownParts.join(" · ")})` : "";

  const verdictLabels = VERDICT_LINE_LABELS[langCode];
  const issuesPart =
    verdictLabels.issues.replace("{n}", String(output.issues.length)) + breakdown;
  const suggestionsPart = verdictLabels.suggestions.replace(
    "{n}",
    String(output.suggestions.length),
  );
  sections.push(
    `> **${RISK_BADGE[output.summary.riskLevel]}** — ${issuesPart} · ${suggestionsPart}`,
  );

  // ── 발견된 문제점: inline 게시 여부와 무관하게 전문을 전수 표시 ──
  if (output.issues.length > 0) {
    sections.push(
      `## ${headers.issues} (${output.issues.length})\n\n${ISSUE_SECTION_HINT[langCode]}\n\n${formatBodyIssues(output.issues, langCode)}`,
    );
  }

  if (output.suggestions.length > 0) {
    const items = output.suggestions
      .map(formatSuggestionSummaryItem)
      .join("\n\n");

    sections.push(
      `## ${headers.suggestions} (${output.suggestions.length})\n\n${SUGGESTION_SECTION_HINT[langCode]}\n\n${items}`,
    );
  }

  // ── 요약: 배지는 결론 줄로 이동, keyPoints(리뷰 포인트)는 렌더하지 않는다 ──
  sections.push(`## ${headers.summary}\n\n${output.summary.overview}`);

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

  // \uac15\uc810\uc740 \uc55e\uc758 2\uac1c\ub9cc \u2014 \uc11c\uc0ac\ub294 \uc18c\uc74c \uacc4\uce35\uc774\ubbc0\ub85c \uc0c1\ud55c\uc744 \ub454\ub2e4 (\ubc30\uc5f4 \uc21c\uc11c \uc758\uc874, \u00a77-2 \ucc38\uc870)
  const topStrengths = output.strengths.slice(0, 2);
  if (topStrengths.length > 0) {
    const items = topStrengths.map((strength) => `- ${strength}`).join("\n");
    sections.push(
      `<details>\n<summary>\n\n## ${headers.strengths}\n\n</summary>\n\n${items}\n\n</details>`,
    );
  }

  return sections.join("\n\n");
}

/** line === null \ub4f1 \uc778\ub77c\uc778 \ucf54\uba58\ud2b8\ub85c \ubabb \uac00\ub294 \uc774\uc288\uc758 \uc804\ubb38 \ub80c\ub354.
 *  SYNC:formatIssueBody \u2014 pr-review.ts \u00b7 structured-review-body.tsx \uc640 \ub3d9\uc77c \ub85c\uc9c1 \uc720\uc9c0 */
function formatBodyIssues(
  bodyIssues: StructuredReviewOutput["issues"],
  langCode: LanguageCode,
): string {
  const labels = ISSUE_FIELD_LABELS[langCode];
  return bodyIssues
    .map((issue) => {
      const severity = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
      const category = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
      const location = issue.file
        ? `${issue.file}${issue.line !== null ? `:${issue.line}` : ""}`
        : null;
      const fileTag = location ? ` \u00b7 \`${location}\`` : "";

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
}
