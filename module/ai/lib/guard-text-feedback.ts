import parseDiff from "parse-diff";
import { unescapeGitPath } from "@/module/github/lib/diff-parser";
import type { LanguageCode } from "@/shared/types/language";
import type { CodeSuggestion, StructuredIssue } from "../types";

type GuardTextFeedbackParams = {
  suggestions: CodeSuggestion[];
  issues: StructuredIssue[];
  langCode: LanguageCode;
  diffText: string;
};

type GuardTextFeedbackResult = {
  keptSuggestions: CodeSuggestion[];
  keptIssues: StructuredIssue[];
  synthesizedIssues: StructuredIssue[];
};

type FeedbackContext = "display" | "processing" | "non-text";
type EncodingEvidenceLevel = "hard" | "weak" | "none";
type TextSuggestionSanity =
  | "valid-replacement"
  | "separator-collapse"
  | "missing-target";
type TokenFamily = "dash" | "multiplication" | "mojibake" | "quote";
type CandidateStrength = Exclude<EncodingEvidenceLevel, "none">;

type SuspiciousTokenDescriptor = {
  token: string;
  family: TokenFamily;
  strength: CandidateStrength;
};

type SuspiciousTokenCandidate = SuspiciousTokenDescriptor & {
  file: string;
  line: number | null;
  hunkIndex: number;
  order: number;
};

type DiffHunkContext = {
  newStart: number;
  newEnd: number;
  candidates: SuspiciousTokenCandidate[];
};

type FileDiffContext = {
  file: string;
  candidates: SuspiciousTokenCandidate[];
  hunks: DiffHunkContext[];
};

type IssueEvidenceResult = {
  level: EncodingEvidenceLevel;
  exampleToken: string | null;
};

type SuggestionEvidenceResult = {
  level: EncodingEvidenceLevel;
  exampleToken: string | null;
};

type ParsedDiffFile = ReturnType<typeof parseDiff>[number];
type ParsedDiffChunk = ParsedDiffFile["chunks"][number];
type ParsedDiffChange = ParsedDiffChunk["changes"][number];

const ENCODING_KEYWORDS = [
  "encoding",
  "인코딩",
  "mojibake",
  "garbled",
  "replacement character",
  "깨진 문자",
] as const;

const CORRUPTION_CLAIM_PHRASES = [
  "잘못 표시",
  "깨져 보임",
  "문자가 깨짐",
  "손상",
  "손상되었습니다",
  "왜곡",
  "의미를 왜곡",
  "복구해야",
  "복구하세요",
  "garbled text",
  "corrupted text",
  "damaged",
  "distorted",
  "restore",
  "restore the original",
] as const;

const DISPLAY_CONTEXT_KEYWORDS = [
  "user-facing text",
  "copy",
  "label",
  "placeholder",
  "alt text",
  "button text",
  "caption",
  "string literal",
  "text notation",
  "typography",
  "notation",
  "문자열",
  "텍스트",
  "문구",
  "레이블",
  "버튼 텍스트",
  "표기",
  "가독성",
  "표기 일관성",
  "copy",
  "user-facing",
  "문자 표기",
  "caption",
  "title text",
  "tooltip",
] as const;

const PROCESSING_CONTEXT_KEYWORDS = [
  "decode",
  "encode",
  "charset",
  "utf-8",
  "utf8",
  "bytes",
  "textdecoder",
  "buffer",
  "escape",
  "unescape",
  "parser",
  "serializer",
  "transcode",
  "data corruption",
  "round-trip",
  "decode mismatch",
  "runtime corruption",
  "byte handling",
  "byte-order",
  "character set",
  "character decoding",
  "문자셋",
  "바이트",
  "디코드",
  "인코드",
  "파서",
  "언이스케이프",
] as const;

const RESTORE_CLAIM_PHRASES = [
  "복구",
  "복원",
  "restore",
  "restored",
  "restoration",
  "replace with",
  "normalized",
  "정상화",
] as const;

const HARD_TOKENS: readonly SuspiciousTokenDescriptor[] = [
  { token: "�", family: "mojibake", strength: "hard" },
  { token: "â€“", family: "mojibake", strength: "hard" },
  { token: "â€”", family: "mojibake", strength: "hard" },
  { token: "Ã—", family: "mojibake", strength: "hard" },
  { token: "Â·", family: "mojibake", strength: "hard" },
  { token: "Ã©", family: "mojibake", strength: "hard" },
  { token: "Ã±", family: "mojibake", strength: "hard" },
] as const;

const WEAK_TOKENS: readonly SuspiciousTokenDescriptor[] = [
  { token: "×", family: "multiplication", strength: "weak" },
  { token: "–", family: "dash", strength: "weak" },
  { token: "—", family: "dash", strength: "weak" },
  { token: "“", family: "quote", strength: "weak" },
  { token: "”", family: "quote", strength: "weak" },
  { token: "‘", family: "quote", strength: "weak" },
  { token: "’", family: "quote", strength: "weak" },
  { token: "…", family: "quote", strength: "weak" },
] as const;

const TOKEN_FAMILY_CUES: Record<TokenFamily, readonly string[]> = {
  dash: [
    "유니코드 대시",
    "엠 대시",
    "en dash",
    "em dash",
    "dash notation",
    "dash",
    "hyphen",
  ],
  multiplication: [
    "곱셈 기호",
    "multiplication sign",
    "resolution",
    "vertical framing",
  ],
  mojibake: [
    "mojibake",
    "replacement character",
    "garbled text",
    "broken encoding",
    "깨진 문자",
    "손상된 문자",
  ],
  quote: [
    "smart quotes",
    "apostrophe",
    "ellipsis",
    "quote style",
    "따옴표",
    "줄임표",
  ],
};

const FAMILY_REPLACEMENT_PATTERNS: Record<TokenFamily, RegExp> = {
  dash: /[-–—]/u,
  multiplication: /[x×]/iu,
  mojibake: /[�ÃÂâ×–—"'…x-]/u,
  quote: /["'“”‘’…]|\.{3}/u,
};

const RAW_ESCAPE_LITERAL_GLOBAL_PATTERN = /\\(?:x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|[0-7]{3})/g;
const INLINE_CODE_PATTERN = /`([^`\n]{1,80})`/g;
const QUOTED_TEXT_PATTERN = /["']([^"'\n]{1,80})["']/g;
const STRING_LITERAL_PATTERN = /["'`]([^"'`\n]{1,80})["'`]/g;
const STRING_LITERAL_TEST_PATTERN = /(["'`])([^"'`\n]{1,80})\1/;
const COLLAPSIBLE_SEPARATOR_PATTERN = /([\p{L}\p{N}]+)\s*([×–—])\s*([\p{L}\p{N}]+)/gu;

const SYNTHESIZED_ISSUE_COPY: Record<
  LanguageCode,
  {
    title: string;
    buildBody: (examples: string[]) => string;
    recommendation: string;
  }
> = {
  ko: {
    title: "문자열 표기 일관성 점검 필요",
    buildBody: (examples) => {
      if (examples.length === 0) {
        return "현재 증거만으로는 이 파일의 사용자 노출 문자열을 인코딩 깨짐으로 단정하기 어렵습니다. 문자열 표기를 정책 기준으로 점검하세요.";
      }

      const joinedExamples = examples.map((example) => `\`${example}\``).join(", ");
      return `${joinedExamples} 같은 문자열은 현재 증거만으로는 인코딩 깨짐이라 보기 어렵습니다. 이 파일의 사용자 노출 문자열 표기를 정책 기준으로 점검하세요.`;
    },
    recommendation: "이 파일의 사용자 노출 문자열 표기를 프로젝트 정책 기준으로 점검하세요.",
  },
  en: {
    title: "Text notation consistency should be reviewed",
    buildBody: (examples) => {
      if (examples.length === 0) {
        return "The current evidence is not strong enough to classify the user-facing text in this file as broken encoding. Review the text notation against the project style policy.";
      }

      const joinedExamples = examples.map((example) => `\`${example}\``).join(", ");
      return `${joinedExamples} do not provide strong enough evidence to classify this file as having broken encoding. Review the user-facing text notation against the project style policy.`;
    },
    recommendation: "Review the file's user-facing text notation against the project style policy.",
  },
};

export function guardTextFeedback(
  params: GuardTextFeedbackParams,
): GuardTextFeedbackResult {
  const { suggestions, issues, langCode, diffText } = params;
  const diffContextsByFile = buildDiffContextMap(diffText);
  const weakExamplesByFile = new Map<string, string[]>();
  const keptSuggestions: CodeSuggestion[] = [];
  const keptIssues: StructuredIssue[] = [];

  for (const suggestion of suggestions) {
    if (!isSuggestionEncodingCandidate(suggestion)) {
      keptSuggestions.push(suggestion);
      continue;
    }

    const context = classifyFeedbackContext({
      text: suggestion.explanation,
      before: suggestion.before,
      after: suggestion.after,
    });

    if (context !== "display") {
      keptSuggestions.push(suggestion);
      continue;
    }

    const evidence = scoreSuggestionEvidence(suggestion);
    const sanity = assessSuggestionSanity(suggestion);

    if (evidence.level === "hard" && sanity === "valid-replacement") {
      keptSuggestions.push(suggestion);
      continue;
    }

    if (
      evidence.level === "weak" &&
      sanity === "valid-replacement"
    ) {
      appendWeakExample(
        weakExamplesByFile,
        suggestion.file,
        evidence.exampleToken ?? extractSuggestionExampleToken(suggestion),
      );
    }
  }

  for (const issue of issues) {
    if (!isIssueEncodingCandidate(issue)) {
      keptIssues.push(issue);
      continue;
    }

    const context = classifyFeedbackContext({
      text: collectIssueText(issue),
    });

    if (context !== "display") {
      keptIssues.push(issue);
      continue;
    }

    const evidence = scoreIssueEvidence({
      issue,
      diffContextsByFile,
    });

    if (evidence.level === "hard") {
      keptIssues.push(issue);
      continue;
    }

    if (evidence.level === "weak" && issue.file !== null) {
      appendWeakExample(
        weakExamplesByFile,
        issue.file,
        evidence.exampleToken ?? extractIssueExampleToken(issue),
      );
    }
  }

  const synthesizedIssues = Array.from(weakExamplesByFile.entries()).map(
    ([file, examples]) => buildSynthesizedIssue({ file, examples, langCode }),
  );

  return {
    keptSuggestions,
    keptIssues,
    synthesizedIssues,
  };
}

function isSuggestionEncodingCandidate(suggestion: CodeSuggestion): boolean {
  return hasEncodingCandidateSignal(suggestion.explanation);
}

function isIssueEncodingCandidate(issue: StructuredIssue): boolean {
  return hasEncodingCandidateSignal(collectIssueText(issue));
}

function hasEncodingCandidateSignal(text: string): boolean {
  return (
    hasEncodingKeyword(text) ||
    hasCorruptionClaimPhrase(text) ||
    getMentionedFamilies(text).length > 0 ||
    collectConcreteTextCandidates(text).length > 0
  );
}

function classifyFeedbackContext(params: {
  text: string;
  before?: string;
  after?: string;
}): FeedbackContext {
  const { text, before = "", after = "" } = params;
  const combinedText = [text, before, after].filter(Boolean).join("\n");

  if (hasProcessingContextSignal(combinedText)) {
    return "processing";
  }

  if (
    hasDisplayContextSignal(text) ||
    looksLikeTextLiteral(before) ||
    looksLikeTextLiteral(after)
  ) {
    return "display";
  }

  return "non-text";
}

function scoreSuggestionEvidence(
  suggestion: CodeSuggestion,
): SuggestionEvidenceResult {
  const concreteCandidates = [
    ...collectConcreteTextCandidates(suggestion.before),
    ...collectConcreteTextCandidates(suggestion.explanation),
  ];

  const hardCandidate = concreteCandidates.find(
    (candidate) => candidate.strength === "hard",
  );
  if (hardCandidate) {
    return {
      level: "hard",
      exampleToken: hardCandidate.token,
    };
  }

  const weakCandidate = concreteCandidates.find(
    (candidate) => candidate.strength === "weak",
  );
  if (weakCandidate) {
    return {
      level: "weak",
      exampleToken: weakCandidate.token,
    };
  }

  return {
    level: "none",
    exampleToken: null,
  };
}

function scoreIssueEvidence(params: {
  issue: StructuredIssue;
  diffContextsByFile: Map<string, FileDiffContext>;
}): IssueEvidenceResult {
  const { issue, diffContextsByFile } = params;
  const issueText = collectIssueText(issue);
  const proseCandidates = collectConcreteTextCandidates(issueText);

  if (issue.file === null) {
    return scoreProjectLevelIssue({ proseCandidates, diffContextsByFile });
  }

  const fileContext = diffContextsByFile.get(issue.file);
  if (!fileContext) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  if (issue.line !== null) {
    return scoreInlineIssue({
      issue,
      issueText,
      proseCandidates,
      fileContext,
    });
  }

  return scoreFileLevelIssue({
    issueText,
    proseCandidates,
    fileContext,
  });
}

function scoreInlineIssue(params: {
  issue: StructuredIssue;
  issueText: string;
  proseCandidates: SuspiciousTokenDescriptor[];
  fileContext: FileDiffContext;
}): IssueEvidenceResult {
  const { issue, issueText, proseCandidates, fileContext } = params;
  if (issue.line === null) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  const scopeCandidates = getInlineScopeCandidates(fileContext, issue.line);
  if (scopeCandidates.length === 0) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  if (proseCandidates.length > 0) {
    const concreteMatches = filterConcreteMatches(scopeCandidates, proseCandidates);
    const selectedConcreteCandidate = selectNearestStrongestCandidate(
      concreteMatches,
      issue.line,
    );
    if (selectedConcreteCandidate) {
      return {
        level: selectedConcreteCandidate.strength,
        exampleToken: selectedConcreteCandidate.token,
      };
    }

    return {
      level: "none",
      exampleToken: null,
    };
  }

  const mentionedFamilies = getMentionedFamilies(issueText);
  if (mentionedFamilies.length !== 1) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  const familyCandidates = scopeCandidates.filter(
    (candidate) => candidate.family === mentionedFamilies[0],
  );
  const selectedFamilyCandidate = selectNearestStrongestCandidate(
    familyCandidates,
    issue.line,
  );
  if (!selectedFamilyCandidate) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  return {
    level: selectedFamilyCandidate.strength,
    exampleToken: selectedFamilyCandidate.token,
  };
}

function scoreFileLevelIssue(params: {
  issueText: string;
  proseCandidates: SuspiciousTokenDescriptor[];
  fileContext: FileDiffContext;
}): IssueEvidenceResult {
  const { issueText, proseCandidates, fileContext } = params;
  if (proseCandidates.length > 0) {
    const concreteMatches = filterConcreteMatches(
      fileContext.candidates,
      proseCandidates,
    );
    const selectedConcreteCandidate = selectUniqueStrongestCandidate(
      concreteMatches,
    );
    if (!selectedConcreteCandidate) {
      return {
        level: "none",
        exampleToken: null,
      };
    }

    return {
      level: selectedConcreteCandidate.strength,
      exampleToken: selectedConcreteCandidate.token,
    };
  }

  const mentionedFamilies = getMentionedFamilies(issueText);
  if (mentionedFamilies.length !== 1) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  const familyCandidates = fileContext.candidates.filter(
    (candidate) => candidate.family === mentionedFamilies[0],
  );
  const selectedFamilyCandidate = selectUniqueStrongestCandidate(familyCandidates);
  if (!selectedFamilyCandidate) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  return {
    level: selectedFamilyCandidate.strength,
    exampleToken: selectedFamilyCandidate.token,
  };
}

function scoreProjectLevelIssue(params: {
  proseCandidates: SuspiciousTokenDescriptor[];
  diffContextsByFile: Map<string, FileDiffContext>;
}): IssueEvidenceResult {
  const { proseCandidates, diffContextsByFile } = params;
  if (proseCandidates.length === 0) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  const allDiffCandidates = collectAllDiffCandidates(diffContextsByFile);
  const qualifyingMatches = proseCandidates.flatMap((proseCandidate) => {
    const tokenMatches = allDiffCandidates.filter(
      (diffCandidate) => diffCandidate.token === proseCandidate.token,
    );
    const matchedFiles = new Set(tokenMatches.map((match) => match.file));
    return matchedFiles.size >= 2 ? tokenMatches : [];
  });

  if (qualifyingMatches.length === 0) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  const highestStrength = getStrongestStrength(qualifyingMatches);
  if (!highestStrength) {
    return {
      level: "none",
      exampleToken: null,
    };
  }

  const strongestCandidate = qualifyingMatches.find(
    (candidate) => candidate.strength === highestStrength,
  );

  return {
    level: highestStrength,
    exampleToken: strongestCandidate?.token ?? null,
  };
}

function assessSuggestionSanity(
  suggestion: CodeSuggestion,
): TextSuggestionSanity {
  if (hasSeparatorCollapse(suggestion.before, suggestion.after)) {
    return "separator-collapse";
  }

  if (
    hasRestoreClaim(suggestion.explanation) &&
    isMissingTargetReplacement({
      before: suggestion.before,
      after: suggestion.after,
      explanation: suggestion.explanation,
    })
  ) {
    return "missing-target";
  }

  return "valid-replacement";
}

function buildDiffContextMap(diffText: string): Map<string, FileDiffContext> {
  const contextsByFile = new Map<string, FileDiffContext>();

  for (const parsedFile of parseDiff(diffText)) {
    const fileKeys = extractDiffFileKeys(parsedFile);
    if (fileKeys.length === 0) {
      continue;
    }

    const primaryFile = fileKeys[0];
    let candidateOrder = 0;
    const hunks = parsedFile.chunks.map((chunk, hunkIndex) => {
      const candidates = chunk.changes.flatMap((change) => {
        const line = getChangeLine(change);
        const visibleText = stripDiffMarker(change.content);
        const descriptors = collectConcreteTextCandidates(visibleText);

        return descriptors.map((descriptor) => {
          const candidate: SuspiciousTokenCandidate = {
            ...descriptor,
            file: primaryFile,
            line,
            hunkIndex,
            order: candidateOrder++,
          };
          return candidate;
        });
      });

      return {
        newStart: chunk.newStart,
        newEnd: chunk.newStart + Math.max(chunk.newLines - 1, 0),
        candidates,
      };
    });

    const fileContext: FileDiffContext = {
      file: primaryFile,
      candidates: hunks.flatMap((hunk) => hunk.candidates),
      hunks,
    };

    for (const fileKey of fileKeys) {
      contextsByFile.set(fileKey, fileContext);
    }
  }

  return contextsByFile;
}

function extractDiffFileKeys(parsedFile: ParsedDiffFile): string[] {
  const keys: string[] = [];
  const rawTo = parsedFile.to && parsedFile.to !== "/dev/null" ? parsedFile.to : null;
  const rawFrom = parsedFile.from && parsedFile.from !== "/dev/null" ? parsedFile.from : null;

  if (rawTo) {
    keys.push(unescapeGitPath(rawTo));
  }

  if (rawFrom) {
    const normalizedFrom = unescapeGitPath(rawFrom);
    if (!keys.includes(normalizedFrom)) {
      keys.push(normalizedFrom);
    }
  }

  return keys;
}

function getChangeLine(change: ParsedDiffChange): number | null {
  if (change.type === "add") {
    return change.ln;
  }

  if (change.type === "normal") {
    return change.ln2;
  }

  return null;
}

function stripDiffMarker(content: string): string {
  if (
    content.startsWith("+") ||
    content.startsWith("-") ||
    content.startsWith(" ")
  ) {
    return content.slice(1);
  }

  return content;
}

function getInlineScopeCandidates(
  fileContext: FileDiffContext,
  line: number,
): SuspiciousTokenCandidate[] {
  const containingHunk = fileContext.hunks.find(
    (hunk) => line >= hunk.newStart && line <= hunk.newEnd,
  );

  if (containingHunk) {
    return containingHunk.candidates;
  }

  return fileContext.candidates.filter(
    (candidate) => candidate.line !== null && Math.abs(candidate.line - line) <= 3,
  );
}

function filterConcreteMatches(
  diffCandidates: SuspiciousTokenCandidate[],
  proseCandidates: SuspiciousTokenDescriptor[],
): SuspiciousTokenCandidate[] {
  const concreteTokens = new Set(proseCandidates.map((candidate) => candidate.token));
  return diffCandidates.filter((candidate) => concreteTokens.has(candidate.token));
}

function selectNearestStrongestCandidate(
  candidates: SuspiciousTokenCandidate[],
  line: number,
): SuspiciousTokenCandidate | null {
  const strongestStrength = getStrongestStrength(candidates);
  if (!strongestStrength) {
    return null;
  }

  const strongestCandidates = candidates.filter(
    (
      candidate,
    ): candidate is SuspiciousTokenCandidate & { line: number } =>
      candidate.strength === strongestStrength && candidate.line !== null,
  );
  if (strongestCandidates.length === 0) {
    return null;
  }

  const minimumDistance = Math.min(
    ...strongestCandidates.map((candidate) => Math.abs(candidate.line - line)),
  );

  const nearestCandidates = strongestCandidates.filter(
    (candidate) => Math.abs(candidate.line - line) === minimumDistance,
  );

  return nearestCandidates.length === 1 ? nearestCandidates[0] : null;
}

function selectUniqueStrongestCandidate(
  candidates: SuspiciousTokenCandidate[],
): SuspiciousTokenCandidate | null {
  const strongestStrength = getStrongestStrength(candidates);
  if (!strongestStrength) {
    return null;
  }

  const strongestCandidates = candidates.filter(
    (candidate) => candidate.strength === strongestStrength,
  );

  return strongestCandidates.length === 1 ? strongestCandidates[0] : null;
}

function getStrongestStrength(
  candidates: { strength: CandidateStrength }[],
): CandidateStrength | null {
  if (candidates.some((candidate) => candidate.strength === "hard")) {
    return "hard";
  }

  if (candidates.some((candidate) => candidate.strength === "weak")) {
    return "weak";
  }

  return null;
}

function collectAllDiffCandidates(
  diffContextsByFile: Map<string, FileDiffContext>,
): SuspiciousTokenCandidate[] {
  const uniqueContexts = Array.from(new Set(diffContextsByFile.values()));
  return uniqueContexts.flatMap((context) => context.candidates);
}

function collectConcreteTextCandidates(text: string): SuspiciousTokenDescriptor[] {
  const indexedCandidates = [
    ...collectIndexedDescriptorMatches(text, HARD_TOKENS),
    ...collectIndexedDescriptorMatches(text, WEAK_TOKENS),
    ...collectIndexedRawEscapeMatches(text),
  ].sort((left, right) => left.index - right.index);

  return indexedCandidates.map(({ token, family, strength }) => ({
    token,
    family,
    strength,
  }));
}

function collectIndexedDescriptorMatches(
  text: string,
  descriptors: readonly SuspiciousTokenDescriptor[],
): Array<SuspiciousTokenDescriptor & { index: number }> {
  return descriptors.flatMap((descriptor) => {
    const matches: Array<SuspiciousTokenDescriptor & { index: number }> = [];
    let searchFrom = 0;

    while (searchFrom < text.length) {
      const matchIndex = text.indexOf(descriptor.token, searchFrom);
      if (matchIndex === -1) {
        break;
      }

      matches.push({
        ...descriptor,
        index: matchIndex,
      });
      searchFrom = matchIndex + descriptor.token.length;
    }

    return matches;
  });
}

function collectIndexedRawEscapeMatches(
  text: string,
): Array<SuspiciousTokenDescriptor & { index: number }> {
  return Array.from(text.matchAll(RAW_ESCAPE_LITERAL_GLOBAL_PATTERN), (match) => ({
    token: match[0],
    family: "mojibake" as const,
    strength: "weak" as const,
    index: match.index ?? 0,
  }));
}

function buildSynthesizedIssue(params: {
  file: string;
  examples: string[];
  langCode: LanguageCode;
}): StructuredIssue {
  const { file, examples, langCode } = params;
  const localizedCopy = SYNTHESIZED_ISSUE_COPY[langCode];
  const uniqueExamples = dedupeExamples(examples).slice(0, 3);

  return {
    file,
    line: null,
    title: localizedCopy.title,
    body: localizedCopy.buildBody(uniqueExamples),
    impact: "",
    recommendation: localizedCopy.recommendation,
    severity: "INFO",
    category: "general",
  };
}

function collectIssueText(issue: StructuredIssue): string {
  return [issue.title, issue.body, issue.impact, issue.recommendation]
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

function extractSuggestionExampleToken(suggestion: CodeSuggestion): string | null {
  const beforeCandidate = collectConcreteTextCandidates(suggestion.before)[0];
  if (beforeCandidate) {
    return beforeCandidate.token;
  }

  const explanationCandidate = collectConcreteTextCandidates(suggestion.explanation)[0];
  if (explanationCandidate) {
    return explanationCandidate.token;
  }

  return extractPreferredTextToken(`${suggestion.before}\n${suggestion.explanation}`);
}

function extractIssueExampleToken(issue: StructuredIssue): string | null {
  const issueText = collectIssueText(issue);
  const issueCandidate = collectConcreteTextCandidates(issueText)[0];
  if (issueCandidate) {
    return issueCandidate.token;
  }

  return extractPreferredTextToken(issueText);
}

function extractPreferredTextToken(text: string): string | null {
  const literalTokens = extractPatternMatches(text, STRING_LITERAL_PATTERN);
  const inlineCodeTokens = extractPatternMatches(text, INLINE_CODE_PATTERN);
  const quotedTextTokens = extractPatternMatches(text, QUOTED_TEXT_PATTERN);

  const prioritizedTokens = [...literalTokens, ...inlineCodeTokens, ...quotedTextTokens]
    .map((token) => token.replace(/\s+/g, " ").trim())
    .filter((token) => token.length > 0)
    .filter(
      (token) =>
        collectConcreteTextCandidates(token).length > 0 || !isPureAscii(token),
    );

  return prioritizedTokens[0] ?? null;
}

function extractPatternMatches(text: string, pattern: RegExp): string[] {
  const matches = Array.from(
    text.matchAll(pattern),
    (match) => match[1]?.trim() ?? "",
  );
  return matches.filter((match) => match.length > 0);
}

function appendWeakExample(
  examplesByFile: Map<string, string[]>,
  file: string,
  example: string | null,
): void {
  if (!example) {
    return;
  }

  const existingExamples = examplesByFile.get(file) ?? [];
  if (existingExamples.includes(example)) {
    return;
  }

  examplesByFile.set(file, [...existingExamples, example]);
}

function dedupeExamples(examples: string[]): string[] {
  return Array.from(new Set(examples));
}

function hasSeparatorCollapse(before: string, after: string): boolean {
  const normalizedAfter = after.replace(/\s+/g, "");

  for (const match of before.matchAll(COLLAPSIBLE_SEPARATOR_PATTERN)) {
    const [, left = "", separator = "", right = ""] = match;
    const collapsedText = `${left}${right}`;

    if (!normalizedAfter.includes(collapsedText)) {
      continue;
    }

    const family = separator === "×" ? "multiplication" : "dash";
    const separatedPattern = buildSeparatedReplacementPattern(left, right, family);

    if (!separatedPattern.test(after)) {
      return true;
    }
  }

  return false;
}

function buildSeparatedReplacementPattern(
  left: string,
  right: string,
  family: Extract<TokenFamily, "dash" | "multiplication">,
): RegExp {
  const replacementAlternatives =
    family === "dash"
      ? "[-–—]"
      : "[x×]";

  return new RegExp(
    `${escapeRegExp(left)}\\s*${replacementAlternatives}\\s*${escapeRegExp(right)}`,
    "iu",
  );
}

function isMissingTargetReplacement(params: {
  before: string;
  after: string;
  explanation: string;
}): boolean {
  const { before, after, explanation } = params;
  const families = new Set<TokenFamily>();

  for (const candidate of collectConcreteTextCandidates(`${before}\n${explanation}`)) {
    families.add(candidate.family);
  }

  for (const family of getMentionedFamilies(explanation)) {
    families.add(family);
  }

  if (families.size === 0) {
    return false;
  }

  return !Array.from(families).some((family) =>
    FAMILY_REPLACEMENT_PATTERNS[family].test(after),
  );
}

function hasEncodingKeyword(text: string): boolean {
  return hasAnySubstring(text.toLowerCase(), ENCODING_KEYWORDS);
}

function hasCorruptionClaimPhrase(text: string): boolean {
  return hasAnySubstring(text.toLowerCase(), CORRUPTION_CLAIM_PHRASES);
}

function hasDisplayContextSignal(text: string): boolean {
  return (
    hasCorruptionClaimPhrase(text) ||
    hasAnySubstring(text.toLowerCase(), DISPLAY_CONTEXT_KEYWORDS) ||
    getMentionedFamilies(text).length > 0 ||
    collectConcreteTextCandidates(text).length > 0
  );
}

function hasProcessingContextSignal(text: string): boolean {
  return hasAnySubstring(text.toLowerCase(), PROCESSING_CONTEXT_KEYWORDS);
}

function hasRestoreClaim(text: string): boolean {
  return hasAnySubstring(text.toLowerCase(), RESTORE_CLAIM_PHRASES);
}

function getMentionedFamilies(text: string): TokenFamily[] {
  const loweredText = text.toLowerCase();
  const mentionedFamilies = new Set<TokenFamily>();

  for (const [family, cues] of Object.entries(TOKEN_FAMILY_CUES) as Array<
    [TokenFamily, readonly string[]]
  >) {
    if (hasAnySubstring(loweredText, cues)) {
      mentionedFamilies.add(family);
    }
  }

  return Array.from(mentionedFamilies);
}

function isPureAscii(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text);
}

function looksLikeTextLiteral(text: string): boolean {
  return STRING_LITERAL_TEST_PATTERN.test(text);
}

function hasAnySubstring(text: string, values: readonly string[]): boolean {
  return values.some((value) => text.includes(value.toLowerCase()));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
