import { ISSUE_FIELD_LABELS } from "@/shared/constants";
import type { LanguageCode } from "@/shared/types/language";

import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "../constants/review-emoji";
import type { StructuredIssue } from "../types";

export function formatReviewBodyIssue(
  issue: StructuredIssue,
  langCode: LanguageCode,
): string {
  const labels = ISSUE_FIELD_LABELS[langCode];
  const severity = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
  const category = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
  const lineTag = issue.line === null ? "" : `:${issue.line}`;
  const fileTag = issue.file ? ` · \`${issue.file}${lineTag}\`` : "";
  const title = (issue.title ?? "").trim();
  const rawBody = (
    issue.body ??
    (issue as { description?: string }).description ??
    ""
  ).trim();
  const impact = (issue.impact ?? "").trim();
  const recommendation = (issue.recommendation ?? "").trim();
  const titleSuffix =
    title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
  const body =
    titleSuffix !== null && (titleSuffix === "" || /^[\s.,:;-]/.test(titleSuffix))
      ? titleSuffix.replace(/^[\s.,:;-]+/, "")
      : rawBody;
  const lines = [
    `### ${severity} · ${category}${fileTag}${title ? ` - ${title}` : ""}`,
  ];
  if (body) lines.push("", body);
  if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
  if (recommendation) {
    lines.push("", `**${labels.recommendation}:** ${recommendation}`);
  }
  return lines.join("\n");
}
