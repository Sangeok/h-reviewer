import type { StructuredReviewOutput } from "@/module/ai";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/module/ai/constants/review-emoji";
import {
  formatSuggestionSummaryItem,
  SUGGESTION_SECTION_HINT,
} from "@/module/ai/lib/suggestion-format";
import { SECTION_HEADERS, ISSUE_FIELD_LABELS } from "@/shared/constants";
import type { LanguageCode } from "@/shared/types/language";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  data: StructuredReviewOutput;
  langCode: LanguageCode;
  shouldRenderSuggestionSummary: boolean;
}

type SummaryData = StructuredReviewOutput["summary"];
type WalkthroughEntry = NonNullable<StructuredReviewOutput["walkthrough"]>[number];

const RISK_BADGE_STYLE: Record<string, string> = {
  low: "bg-green-500/15 text-green-400 border border-green-500/30",
  medium: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  high: "bg-red-500/15 text-red-400 border border-red-500/30",
};

const RISK_LABEL: Record<string, string> = {
  low: "\ud83d\udfe2 Low Risk",
  medium: "\ud83d\udfe1 Medium Risk",
  high: "\ud83d\udd34 High Risk",
};

const CHANGE_TYPE_STYLE: Record<string, string> = {
  added: "bg-green-500/15 text-green-400 border border-green-500/30",
  modified: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  deleted: "bg-red-500/15 text-red-400 border border-red-500/30",
  renamed: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
};

const CHANGE_EMOJI: Record<string, string> = {
  added: "\u2795",
  modified: "\ud83d\udd27",
  deleted: "\u274c",
  renamed: "\ud83d\udd04",
};

export function StructuredReviewBody({
  data,
  langCode,
  shouldRenderSuggestionSummary,
}: Props) {
  return (
    <div className="space-y-6">
      <SummarySection summary={data.summary} langCode={langCode} />
      {data.walkthrough && data.walkthrough.length > 0 && (
        <WalkthroughSection entries={data.walkthrough} langCode={langCode} />
      )}
      {data.strengths && data.strengths.length > 0 && (
        <StrengthsSection strengths={data.strengths} langCode={langCode} />
      )}
      <RemainingMarkdownSections
        data={data}
        langCode={langCode}
        shouldRenderSuggestionSummary={shouldRenderSuggestionSummary}
      />
    </div>
  );
}

function SummarySection({
  summary,
  langCode,
}: {
  summary: SummaryData;
  langCode: LanguageCode;
}) {
  const headers = SECTION_HEADERS[langCode];

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{headers.summary}</h2>
      <span
        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${RISK_BADGE_STYLE[summary.riskLevel]}`}
      >
        {RISK_LABEL[summary.riskLevel]}
      </span>
      <p className="text-sm leading-relaxed text-foreground/80">{summary.overview}</p>
      {summary.keyPoints.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{headers.reviewFocus}</p>
          <ul className="space-y-1">
            {summary.keyPoints.map((point, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-foreground/80"
              >
                <span className="mt-0.5 shrink-0">\u2022</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function WalkthroughSection({
  entries,
  langCode,
}: {
  entries: WalkthroughEntry[];
  langCode: LanguageCode;
}) {
  const headers = SECTION_HEADERS[langCode];

  return (
    <details className="group" open>
      <summary className="cursor-pointer list-none">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
          {headers.walkthrough}
          <span className="text-xs text-foreground/50 transition-transform group-open:rotate-90">
            &gt;
          </span>
        </h2>
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-foreground/60">
              <th className="py-2 pr-3 font-medium">File</th>
              <th className="py-2 pr-3 font-medium">Change</th>
              <th className="py-2 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={index} className="border-b border-border/30 last:border-0">
                <td className="py-2 pr-3 align-top">
                  <code className="break-all font-mono text-xs text-foreground/90">
                    {CHANGE_EMOJI[entry.changeType] ?? "\ud83d\udcc4"} {entry.file}
                  </code>
                </td>
                <td className="py-2 pr-3 align-top">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${CHANGE_TYPE_STYLE[entry.changeType] ?? ""}`}
                  >
                    {entry.changeType}
                  </span>
                </td>
                <td className="py-2 align-top leading-relaxed text-foreground/70">
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

function StrengthsSection({
  strengths,
  langCode,
}: {
  strengths: string[];
  langCode: LanguageCode;
}) {
  const headers = SECTION_HEADERS[langCode];

  return (
    <details className="group">
      <summary className="cursor-pointer list-none">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
          {headers.strengths}
          <span className="text-xs text-foreground/50 transition-transform group-open:rotate-90">
            &gt;
          </span>
        </h2>
      </summary>
      <ul className="mt-3 space-y-1.5">
        {strengths.map((strength, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-sm text-foreground/80"
          >
            <span className="mt-0.5 shrink-0">\u2022</span>
            <span>{strength}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RemainingMarkdownSections({
  data,
  langCode,
  shouldRenderSuggestionSummary,
}: {
  data: StructuredReviewOutput;
  langCode: LanguageCode;
  shouldRenderSuggestionSummary: boolean;
}) {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  if (data.sequenceDiagram) {
    sections.push(
      `## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${data.sequenceDiagram}\n\`\`\``,
    );
  }

  const bodyIssues = (data.issues ?? []).filter((issue) => issue.line === null);

  if (bodyIssues.length > 0) {
    const labels = ISSUE_FIELD_LABELS[langCode];
    const issueLines = bodyIssues.map((issue) => {
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
    });

    sections.push(`## ${headers.issues}\n\n${issueLines.join("\n\n")}`);
  }

  if (shouldRenderSuggestionSummary && data.suggestions.length > 0) {
    const items = data.suggestions
      .map(formatSuggestionSummaryItem)
      .join("\n\n");

    sections.push(
      `## ${headers.suggestions}\n\n${SUGGESTION_SECTION_HINT[langCode]}\n\n${items}`,
    );
  }

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {sections.join("\n\n")}
      </ReactMarkdown>
    </div>
  );
}
