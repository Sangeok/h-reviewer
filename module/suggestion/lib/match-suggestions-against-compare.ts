import { applyCodeChange } from "./apply-code-change";

export type CompareFileInput = {
  path: string;
  status: "added" | "modified" | "removed" | "renamed" | "changed" | string;
  beforeContent: string | null;
  afterContent: string | null;
};

export type PendingSuggestion = {
  id: string;
  filePath: string;
  lineNumber: number;
  beforeCode: string;
  afterCode: string;
};

export type MatchInput = {
  compareFiles: CompareFileInput[];
  pendingSuggestions: PendingSuggestion[];
};

export type MatchResult = {
  matchedSuggestionIds: string[];
  matchedFilePaths: string[];
  unaccountedFilePaths: string[];
  ambiguousFilePaths: string[];
  skipReview: boolean;
  reason:
    | "exact_match_all_files"
    | "partial_match"
    | "ambiguous_match"
    | "no_changed_files"
    | "no_pending_suggestions";
};

export function matchSuggestionsAgainstCompare(input: MatchInput): MatchResult {
  const { compareFiles, pendingSuggestions } = input;

  if (compareFiles.length === 0) {
    return {
      matchedSuggestionIds: [],
      matchedFilePaths: [],
      unaccountedFilePaths: [],
      ambiguousFilePaths: [],
      skipReview: false,
      reason: "no_changed_files",
    };
  }

  if (pendingSuggestions.length === 0) {
    return {
      matchedSuggestionIds: [],
      matchedFilePaths: [],
      unaccountedFilePaths: compareFiles.map((f) => f.path),
      ambiguousFilePaths: [],
      skipReview: false,
      reason: "no_pending_suggestions",
    };
  }

  const matchedSuggestionIds: string[] = [];
  const matchedFilePaths: string[] = [];
  const unaccountedFilePaths: string[] = [];
  const ambiguousFilePaths: string[] = [];

  for (const file of compareFiles) {
    if (file.status === "removed" || file.status === "renamed") {
      unaccountedFilePaths.push(file.path);
      continue;
    }

    if (file.beforeContent === null || file.afterContent === null) {
      unaccountedFilePaths.push(file.path);
      continue;
    }

    const beforeContent = file.beforeContent.replace(/\r\n/g, "\n");
    const afterContent = file.afterContent.replace(/\r\n/g, "\n");

    const fileSuggestions = pendingSuggestions.filter((s) => s.filePath === file.path);

    if (fileSuggestions.length === 0) {
      unaccountedFilePaths.push(file.path);
      continue;
    }

    // Stage A: apply all suggestions in descending lineNumber order
    const sortedDesc = [...fileSuggestions].sort((a, b) => b.lineNumber - a.lineNumber);
    let stageAContent = beforeContent;
    let stageAAllChanged = true;

    for (const s of sortedDesc) {
      const result = applyCodeChange({
        fileContent: stageAContent,
        beforeCode: s.beforeCode,
        afterCode: s.afterCode,
        lineNumber: s.lineNumber,
        strict: true,
      });
      stageAContent = result.content;
      if (!result.changed) stageAAllChanged = false;
    }

    if (stageAAllChanged && stageAContent === afterContent) {
      for (const s of fileSuggestions) matchedSuggestionIds.push(s.id);
      matchedFilePaths.push(file.path);
      continue;
    }

    // Stage B: try each suggestion individually
    const stageBMatches: string[] = [];
    for (const s of fileSuggestions) {
      const result = applyCodeChange({
        fileContent: beforeContent,
        beforeCode: s.beforeCode,
        afterCode: s.afterCode,
        lineNumber: s.lineNumber,
        strict: true,
      });
      if (result.changed && result.content === afterContent) {
        stageBMatches.push(s.id);
      }
    }

    if (stageBMatches.length === 1) {
      matchedSuggestionIds.push(stageBMatches[0]);
      matchedFilePaths.push(file.path);
    } else if (stageBMatches.length > 1) {
      ambiguousFilePaths.push(file.path);
    } else {
      unaccountedFilePaths.push(file.path);
    }
  }

  const hasAnyMatch = matchedSuggestionIds.length > 0;
  const hasUnaccounted = unaccountedFilePaths.length > 0;
  const hasAmbiguous = ambiguousFilePaths.length > 0;

  if (!hasAnyMatch) {
    return {
      matchedSuggestionIds: [],
      matchedFilePaths: [],
      unaccountedFilePaths,
      ambiguousFilePaths,
      skipReview: false,
      reason: hasAmbiguous ? "ambiguous_match" : "partial_match",
    };
  }

  if (hasAmbiguous) {
    return {
      matchedSuggestionIds,
      matchedFilePaths,
      unaccountedFilePaths,
      ambiguousFilePaths,
      skipReview: false,
      reason: "ambiguous_match",
    };
  }

  if (hasUnaccounted) {
    return {
      matchedSuggestionIds,
      matchedFilePaths,
      unaccountedFilePaths,
      ambiguousFilePaths: [],
      skipReview: false,
      reason: "partial_match",
    };
  }

  return {
    matchedSuggestionIds,
    matchedFilePaths,
    unaccountedFilePaths: [],
    ambiguousFilePaths: [],
    skipReview: true,
    reason: "exact_match_all_files",
  };
}
