import type { ReviewSizeMode } from "./review-size-policy";
import type { LanguageCode } from "@/module/settings/constants";
import { SECTION_HEADERS } from "@/shared/constants";
import { getSectionPolicy } from "./review-size-policy";
import { MAX_SUGGESTION_CAP } from "@/module/ai/constants";
import { getLanguageName } from "@/module/settings";

/**
 * 기존 review.ts에서 이동한 함수.
 * size 모드별 프롬프트 섹션 지시문을 생성한다.
 */
export function buildSectionInstruction(
  mode: ReviewSizeMode,
  headers: (typeof SECTION_HEADERS)[LanguageCode],
): string {
  const policy = getSectionPolicy(mode);
  const sections: string[] = [];
  let idx = 1;

  if (policy.summary) {
    const extra = mode === "tiny" ? " (2-3 sentences only)" : mode === "large" ? " (focus on key changed files)" : "";
    sections.push(`${idx++}. **${headers.summary}**${extra}`);
  }
  if (policy.walkthrough) {
    const extra = mode === "small" ? " (brief, one line per file)" : mode === "large" ? " (top 10 changed files only)" : "";
    sections.push(`${idx++}. **${headers.walkthrough}**${extra}`);
  }
  if (policy.sequenceDiagram) {
    sections.push(`${idx++}. **${headers.sequenceDiagram}**: Use \`\`\`mermaid block.`);
  }
  if (policy.strengths) {
    sections.push(`${idx++}. **${headers.strengths}**`);
  }
  if (policy.issues) {
    const extra = mode === "tiny" ? " (max 1 issue unless critical)" : mode === "large" ? " (prioritized by severity)" : "";
    sections.push(`${idx++}. **${headers.issues}**${extra}`);
  }
  if (policy.suggestions) {
    const extra = mode === "tiny" ? " (max 2 suggestions)" : mode === "large" ? " (top 5 only)" : "";
    sections.push(`${idx++}. **${headers.suggestions}**${extra}`);
  }
  if (policy.poem) {
    sections.push(`${idx++}. **${headers.poem}**: A short creative poem.`);
  }

  return `Provide the review with these sections:\n${sections.join("\n")}`;
}

interface PromptParams {
  title: string;
  description: string;
  diff: string;
  context: string[];
  langCode: LanguageCode;
  sizeMode: ReviewSizeMode;
  changedFilesSummary: string;
  maxSuggestions: number | null;
}

export function buildStructuredPrompt(params: PromptParams): string {
  const { title, description, diff, context, langCode, sizeMode, changedFilesSummary, maxSuggestions } = params;

  const languageInstruction = langCode !== "en"
    ? `\n\nIMPORTANT: Write summary, walkthrough, strengths, issues, and suggestion explanations in ${getLanguageName(langCode)}. Keep code in the before/after fields in the original programming language.`
    : "";

  const suggestionLimit = getSuggestionLimit(sizeMode, maxSuggestions);
  const issueLimit = getIssueLimit(sizeMode);

  return `You are an expert code reviewer. Analyze this PR and provide structured feedback.${languageInstruction}

## PR Information
- Title: ${title}
- Description: ${description || "No description provided"}

## Changed Files (with added line numbers)
${changedFilesSummary}

${context.length > 0 ? `## Codebase Context\n${context.join("\n\n")}` : ""}

## Code Changes
\`\`\`diff
${diff}
\`\`\`

## Review Instructions
- Review Mode: ${sizeMode.toUpperCase()}
- Provide up to ${suggestionLimit} code suggestions, prioritized by severity
- For each suggestion:
  - file: must be an exact file path from the diff
  - line: must be a valid added line number from that file
  - before: must exactly match the current code at that location (copy from diff)
  - after: the improved version of that code
  - explanation: why this change is an improvement
  - severity: CRITICAL for bugs/security, WARNING for potential issues, SUGGESTION for improvements, INFO for style/convention
- Only suggest changes for added/modified lines (+ lines in the diff)
- The before field must be an exact substring of the current file content
- If adjacent lines need the same type of change, combine them into a SINGLE suggestion with multi-line before/after fields
- For each issue:
  - file: exact file path from the diff, or null for project-level issues (architecture, testing strategy)
  - line: line number in new file, or null for file-level or project-level issues
  - category: bug, design, security, performance, testing, or general
  - severity: CRITICAL for blocking issues, WARNING for important concerns, SUGGESTION for improvements, INFO for observations
- Provide up to ${issueLimit.inline} code-level issues (with file and line) and up to ${issueLimit.general} project-level issues (without line), prioritized by severity
- Do not generate an issue for a file+line that already has a suggestion — the suggestion's explanation already communicates the problem`;
}

// ⚠️ userPreference는 상한(cap)으로 적용, PR 크기 기본값을 초과하지 않음
// 예: user=10, tiny PR(default=2) → min(2, 10, 15) = 2
// 예: user=3, large PR(default=5) → min(5, 3, 15) = 3
export function getSuggestionLimit(
  mode: ReviewSizeMode,
  userPreference: number | null = null,
): number {
  const sizeDefault: Record<ReviewSizeMode, number> = {
    tiny: 2, small: 3, normal: 5, large: 5,
  };
  const base = sizeDefault[mode];
  const effective = userPreference !== null ? Math.min(base, userPreference) : base;
  return Math.min(effective, MAX_SUGGESTION_CAP);
}

// ⚠️ export 필수 — review.ts Step 5에서 count-trimming에 사용
export function getIssueLimit(mode: ReviewSizeMode): { inline: number; general: number } {
  const limits: Record<ReviewSizeMode, { inline: number; general: number }> = {
    tiny: { inline: 2, general: 1 },
    small: { inline: 4, general: 2 },
    normal: { inline: 6, general: 3 },
    large: { inline: 8, general: 4 },
  };
  return limits[mode];
}

interface FallbackPromptParams {
  title: string;
  description: string;
  diff: string;
  context: string[];
  langCode: LanguageCode;
  sizeMode: ReviewSizeMode;
  headers: (typeof SECTION_HEADERS)[LanguageCode];
}

export function buildFallbackPrompt(params: FallbackPromptParams): string {
  const { title, description, diff, context, langCode, sizeMode, headers } = params;

  const languageInstruction = langCode !== "en"
    ? `\n\nIMPORTANT: Write the entire review in ${getLanguageName(langCode)}. All section headers must be exactly as specified below. However, keep technical terms in English where appropriate.`
    : "";

  const mermaidInstruction = getSectionPolicy(sizeMode).sequenceDiagram
    ? `\nIf you include a Mermaid sequence diagram, follow these rules STRICTLY:
- Use ONLY sequenceDiagram type.
- participant ids must match [a-zA-Z0-9_]+ only.
- In message/note/label text: NEVER use backticks, quotes, braces, brackets, semicolons, or angle brackets. Parentheses are OK. Unicode letters (Korean, etc.) are allowed.
- Allowed control structures: loop/end, alt/else/end, opt/end, autonumber.
- Do NOT use activate/deactivate or +/- on arrows.
- If you are uncertain about the validity, output "Diagram omitted" instead.`
    : "";

  const sectionInstruction = buildSectionInstruction(sizeMode, headers);

  return `You are an expert code reviewer.${languageInstruction}

PR Title: ${title}
PR Description: ${description || "No description provided"}

${context.length > 0 ? `Context from Codebase:\n${context.join("\n\n")}` : ""}

Code Changes:
\`\`\`diff
${diff}
\`\`\`

Review Mode: ${sizeMode.toUpperCase()}
${sectionInstruction}
${mermaidInstruction}

Format your response in markdown.`;
}
