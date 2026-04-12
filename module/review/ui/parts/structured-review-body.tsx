import type { StructuredReviewOutput } from "@/module/ai";
import type { LanguageCode } from "@/shared/types/language";
import { SECTION_HEADERS, ISSUE_FIELD_LABELS } from "@/shared/constants";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai/constants/review-emoji";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  data: StructuredReviewOutput;
  langCode: LanguageCode;
}

export function StructuredReviewBody({ data, langCode }: Props) {
  return (
    <div className="space-y-6">
      <SummarySection summary={data.summary} langCode={langCode} />
      {data.walkthrough && data.walkthrough.length > 0 && (
        <WalkthroughSection entries={data.walkthrough} langCode={langCode} />
      )}
      {data.strengths && data.strengths.length > 0 && (
        <StrengthsSection strengths={data.strengths} langCode={langCode} />
      )}
      <RemainingMarkdownSections data={data} langCode={langCode} />
    </div>
  );
}

type SummaryData = StructuredReviewOutput["summary"];

const RISK_BADGE_STYLE: Record<string, string> = {
  low: "bg-green-500/15 text-green-400 border border-green-500/30",
  medium: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  high: "bg-red-500/15 text-red-400 border border-red-500/30",
};

const RISK_LABEL: Record<string, string> = {
  low: "🟢 Low Risk",
  medium: "🟡 Medium Risk",
  high: "🔴 High Risk",
};

function SummarySection({ summary, langCode }: { summary: SummaryData; langCode: LanguageCode }) {
  const headers = SECTION_HEADERS[langCode];
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{headers.summary}</h2>
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${RISK_BADGE_STYLE[summary.riskLevel]}`}>
        {RISK_LABEL[summary.riskLevel]}
      </span>
      <p className="text-sm text-foreground/80 leading-relaxed">{summary.overview}</p>
      {summary.keyPoints.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{headers.reviewFocus}</p>
          <ul className="space-y-1">
            {summary.keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <span className="mt-0.5 shrink-0">⚡</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type WalkthroughEntry = NonNullable<StructuredReviewOutput["walkthrough"]>[number];

const CHANGE_TYPE_STYLE: Record<string, string> = {
  added: "bg-green-500/15 text-green-400 border border-green-500/30",
  modified: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  deleted: "bg-red-500/15 text-red-400 border border-red-500/30",
  renamed: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
};

const CHANGE_EMOJI: Record<string, string> = {
  added: "🆕",
  modified: "✏️",
  deleted: "🗑️",
  renamed: "📝",
};

function WalkthroughSection({ entries, langCode }: { entries: WalkthroughEntry[]; langCode: LanguageCode }) {
  const headers = SECTION_HEADERS[langCode];
  return (
    <details className="group" open>
      <summary className="cursor-pointer list-none">
        <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
          {headers.walkthrough}
          <span className="text-xs text-foreground/50 group-open:rotate-90 transition-transform">▶</span>
        </h2>
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/50 text-left text-foreground/60">
              <th className="py-2 pr-3 font-medium">File</th>
              <th className="py-2 pr-3 font-medium">Change</th>
              <th className="py-2 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i} className="border-b border-border/30 last:border-0">
                <td className="py-2 pr-3 align-top">
                  <code className="text-xs font-mono text-foreground/90 break-all">
                    {CHANGE_EMOJI[entry.changeType] ?? "📄"} {entry.file}
                  </code>
                </td>
                <td className="py-2 pr-3 align-top">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${CHANGE_TYPE_STYLE[entry.changeType] ?? ""}`}
                  >
                    {entry.changeType}
                  </span>
                </td>
                <td className="py-2 align-top text-foreground/70 leading-relaxed">
                  {entry.summary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function StrengthsSection({ strengths, langCode }: { strengths: string[]; langCode: LanguageCode }) {
  const headers = SECTION_HEADERS[langCode];
  return (
    <details className="group">
      <summary className="cursor-pointer list-none">
        <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
          {headers.strengths}
          <span className="text-xs text-foreground/50 group-open:rotate-90 transition-transform">▶</span>
        </h2>
      </summary>
      <ul className="mt-3 space-y-1.5">
        {strengths.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
            <span className="mt-0.5 shrink-0">✅</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * issues, suggestions, sequenceDiagram 등
 * 아직 구조화 렌더링이 불필요한 섹션은 reviewData의 원시 값을 마크다운으로 변환하여 렌더링.
 *
 * NOTE: SECTION_HEADERS[langCode]를 사용하여 다국어 헤더 지원.
 * langCode는 Review 모델의 별도 컬럼에서 가져오며, page.tsx에서 props로 전달된다.
 */
function RemainingMarkdownSections({ data, langCode }: { data: StructuredReviewOutput; langCode: LanguageCode }) {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  if (data.sequenceDiagram) {
    sections.push(`## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${data.sequenceDiagram}\n\`\`\``);
  }

  // ⚠️ line-specific issues는 GitHub inline comment로만 게시되므로 웹 UI에서도 제외.
  const bodyIssues = (data.issues ?? []).filter((i) => i.line === null);
  if (bodyIssues.length > 0) {
    const labels = ISSUE_FIELD_LABELS[langCode];
    const issueLines = bodyIssues.map((issue) => {
      const sev = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
      const cat = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
      const fileTag = issue.file ? ` · \`${issue.file}\`` : "";

      // 방어적 기본값: 레거시 description-only 데이터 + 빈 값 허용 필드 대비
      const title = (issue.title ?? "").trim();
      const rawBody = (issue.body ?? (issue as { description?: string }).description ?? "").trim();
      const impact = (issue.impact ?? "").trim();
      const recommendation = (issue.recommendation ?? "").trim();

      // 문장 경계 검사 + body 빈값 skip guard
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
      // SYNC:formatIssueBody — review-formatter.ts · pr-review.ts 와 동일 로직 유지
    });
    sections.push(`## ${headers.issues}\n\n${issueLines.join("\n\n")}`);
  }

  if (data.suggestions && data.suggestions.length > 0) {
    const rows = data.suggestions.map((s) => {
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

  if (sections.length === 0) return null;

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {sections.join("\n\n")}
      </ReactMarkdown>
    </div>
  );
}
