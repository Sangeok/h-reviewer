import type { StructuredReviewOutput } from "@/module/ai";
import type { LanguageCode } from "@/shared/types/language";
import { SECTION_HEADERS } from "@/shared/constants";
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
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{headers.walkthrough}</h2>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
            <span
              className={`shrink-0 mt-0.5 inline-block px-1.5 py-0.5 rounded text-xs font-medium ${CHANGE_TYPE_STYLE[entry.changeType] ?? ""}`}
            >
              {CHANGE_EMOJI[entry.changeType] ?? "📄"} {entry.changeType}
            </span>
            <div className="min-w-0 space-y-1">
              <code className="text-xs font-mono text-foreground/90 break-all">{entry.file}</code>
              <p className="text-sm text-foreground/70 leading-relaxed">{entry.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * strengths, issues, suggestions, sequenceDiagram 등
 * 아직 구조화 렌더링이 불필요한 섹션은 reviewData의 원시 값을 마크다운으로 변환하여 렌더링.
 *
 * NOTE: SECTION_HEADERS[langCode]를 사용하여 다국어 헤더 지원.
 * langCode는 Review 모델의 별도 컬럼에서 가져오며, page.tsx에서 props로 전달된다.
 */
function RemainingMarkdownSections({ data, langCode }: { data: StructuredReviewOutput; langCode: LanguageCode }) {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  if (data.strengths && data.strengths.length > 0) {
    const items = data.strengths.map((s) => `- ${s}`).join("\n");
    sections.push(`## ${headers.strengths}\n\n${items}`);
  }

  // ⚠️ line-specific issues는 GitHub inline comment로만 게시되므로 웹 UI에서도 제외.
  const bodyIssues = (data.issues ?? []).filter((i) => i.line === null);
  if (bodyIssues.length > 0) {
    const issueLines = bodyIssues.map((issue) => {
      const fileTag = issue.file ? ` · \`${issue.file}\`` : "";
      return `- **[${issue.severity}]** ${issue.category}${fileTag}  \n  ${issue.description}`;
    });
    sections.push(`## ${headers.issues}\n\n${issueLines.join("\n\n")}`);
  }

  if (data.suggestions && data.suggestions.length > 0) {
    const sugLines = data.suggestions.map(
      (s) => `- **${s.file}:${s.line}** [${s.severity}]: ${s.explanation}`
    );
    sections.push(`## ${headers.suggestions}\n\n${sugLines.join("\n")}`);
  }

  if (data.sequenceDiagram) {
    sections.push(`## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${data.sequenceDiagram}\n\`\`\``);
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
