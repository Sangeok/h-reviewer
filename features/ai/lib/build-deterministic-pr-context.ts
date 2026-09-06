import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";

import {
  getFileContent,
  getRepositoryFileTree,
  type RepositoryFileTree,
  type RepositoryTreeFile,
} from "@/lib/github/github";
import {
  parseDiffFiles,
  type ChangedFileInfo,
} from "@/lib/github/diff-parser";

import {
  getDeterministicContextBudget,
  type DeterministicContextBudget,
  type ReviewSizeMode,
} from "./review-size-policy";

const CONTEXT_START_MARKER = "<<<HREVIEWER_CONTEXT_FILE>>>";
const CONTEXT_END_MARKER = "<<<HREVIEWER_CONTEXT_FILE_END>>>";
const MAX_RELATED_FILE_CHARACTERS = 6_000;

const CONTEXT_FILE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".d.ts",
  ".json", ".md", ".prisma", ".sql", ".py", ".go", ".rs",
  ".java", ".kt", ".kts", ".rb", ".php", ".cs", ".c", ".cpp",
  ".h", ".hpp", ".swift", ".vue", ".svelte", ".css", ".scss",
  ".html", ".yaml", ".yml", ".toml", ".graphql", ".gql", ".sh",
]);

const CONTEXT_FILE_NAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Procfile",
  ".dockerignore",
  ".gitignore",
]);

const EXCLUDED_FILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

const EXCLUDED_PATH_SEGMENTS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
]);

const SCRIPT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

const TEST_MARKERS = ["test", "spec"] as const;

const MODULE_RESOLUTION_SUFFIXES = [
  ".ts",
  ".tsx",
  ".d.ts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.d.ts",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
] as const;

export type PrContextSource =
  | "changed"
  | "related-test"
  | "direct-import";

export type PrContextSelection = "full" | "changed-line-window";

export type PrContextTreeStatus =
  | "not-requested"
  | "complete"
  | "truncated"
  | "failed";

export type PrContextManifestEntry = {
  path: string;
  source: PrContextSource;
  selection: PrContextSelection;
  characters: number;
  truncated: boolean;
};

export type DeterministicPrContext = {
  content: string;
  headSha: string;
  manifest: PrContextManifestEntry[];
  manifestIdentitySha256: string | null;
  omittedByBudgetCount: number;
  failedFileCount: number;
  treeStatus: PrContextTreeStatus;
};

type DeterministicPrContextFile = {
  content: string;
  sha: string;
};

export type DeterministicPrContextRepositoryReader = {
  getFileContent(params: {
    token: string;
    owner: string;
    repo: string;
    path: string;
    ref: string;
    signal?: AbortSignal;
  }): Promise<DeterministicPrContextFile | null>;
  getRepositoryFileTree(params: {
    token: string;
    owner: string;
    repo: string;
    commitSha: string;
    signal?: AbortSignal;
  }): Promise<RepositoryFileTree>;
};

const githubRepositoryReader: DeterministicPrContextRepositoryReader = {
  getFileContent,
  getRepositoryFileTree,
};

export type BuildDeterministicPrContextParams = {
  token: string;
  owner: string;
  repo: string;
  headSha: string;
  diff: string;
  sizeMode: ReviewSizeMode;
  signal?: AbortSignal;
  repositoryReader?: DeterministicPrContextRepositoryReader;
};

type ChangedFileContent = {
  change: ChangedFileInfo;
  content: string;
};

type RelatedCandidate = {
  path: string;
  source: Exclude<PrContextSource, "changed">;
  size: number | null;
};

type ContextFileSelection = {
  path: string;
  source: PrContextSource;
  selection: PrContextSelection;
  body: string;
  truncated: boolean;
};

type ChangedFileFetchResult = {
  change: ChangedFileInfo;
  file: DeterministicPrContextFile | null;
};

type RelatedFileFetchResult = {
  candidate: RelatedCandidate;
  file: DeterministicPrContextFile | null;
};

type FindRelatedCandidatesParams = Omit<
  BuildDeterministicPrContextParams,
  "repositoryReader"
> & {
  repositoryReader: DeterministicPrContextRepositoryReader;
  changedFiles: ChangedFileContent[];
  allChangedPaths: ReadonlySet<string>;
  maxRelatedFiles: number;
};

type FormatWithinBudgetParams = {
  headSha: string;
  changedFiles: ChangedFileContent[];
  relatedResults: PromiseSettledResult<RelatedFileFetchResult>[];
  treeStatus: PrContextTreeStatus;
  budget: DeterministicContextBudget;
  initialOmittedByBudgetCount: number;
  initialFailedFileCount: number;
};

type BuildChangedFileSelectionParams = {
  file: ChangedFileContent;
  maxSectionCharacters: number;
  changedLineRadius: number;
};

type ResolveRelativeModuleCandidatesParams = {
  importerPath: string;
  specifier: string;
};

function getFileName(filePath: string): string {
  return path.posix.basename(filePath);
}

function getScriptExtension(filePath: string): string | null {
  const lowercasePath = filePath.toLowerCase();
  return SCRIPT_EXTENSIONS.find((extension) =>
    lowercasePath.endsWith(extension),
  ) ?? null;
}

function isRelationshipSearchRoot(filePath: string): boolean {
  const lowercasePath = filePath.toLowerCase();
  return getScriptExtension(lowercasePath) !== null &&
    !lowercasePath.endsWith(".d.ts") &&
    !/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(lowercasePath);
}

export function isSupportedContextPath(filePath: string): boolean {
  const lowercasePath = filePath.toLowerCase();
  const fileName = getFileName(filePath);
  const lowercaseFileName = fileName.toLowerCase();
  const pathSegments = lowercasePath.split("/");

  if (EXCLUDED_FILE_NAMES.has(lowercaseFileName)) return false;
  if (pathSegments.some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment))) {
    return false;
  }
  if (lowercasePath.endsWith(".min.js") || lowercasePath.endsWith(".map")) {
    return false;
  }

  if (CONTEXT_FILE_NAMES.has(fileName)) return true;

  return [...CONTEXT_FILE_EXTENSIONS].some((extension) =>
    lowercasePath.endsWith(extension),
  );
}

export function selectChangedFileCandidates(
  changes: ChangedFileInfo[],
  maxFiles: number,
): { selected: ChangedFileInfo[]; omittedByLimitCount: number } {
  const selected: ChangedFileInfo[] = [];
  const seenPaths = new Set<string>();
  let omittedByLimitCount = 0;

  for (const change of changes) {
    if (
      change.changeType === "deleted" ||
      !isSupportedContextPath(change.filePath) ||
      seenPaths.has(change.filePath)
    ) {
      continue;
    }

    seenPaths.add(change.filePath);

    if (selected.length >= maxFiles) {
      omittedByLimitCount += 1;
      continue;
    }

    selected.push(change);
  }

  return { selected, omittedByLimitCount };
}

export function collectSuccessfulChangedFiles(
  results: PromiseSettledResult<ChangedFileFetchResult>[],
): { files: ChangedFileContent[]; failedFileCount: number } {
  const files: ChangedFileContent[] = [];
  let failedFileCount = 0;

  for (const result of results) {
    if (
      result.status === "rejected" ||
      !result.value.file ||
      result.value.file.content.length === 0
    ) {
      failedFileCount += 1;
      continue;
    }

    files.push({
      change: result.value.change,
      content: result.value.file.content,
    });
  }

  return { files, failedFileCount };
}

export function escapeContextMarkers(value: string): string {
  return value
    .replaceAll(
      CONTEXT_START_MARKER,
      "[escaped HREVIEWER context start marker]",
    )
    .replaceAll(
      CONTEXT_END_MARKER,
      "[escaped HREVIEWER context end marker]",
    );
}

function renderContextSection(selection: ContextFileSelection): string {
  const metadata = escapeContextMarkers(JSON.stringify({
    path: selection.path,
    source: selection.source,
    selection: selection.selection,
  }));
  const body = escapeContextMarkers(selection.body);

  return [
    CONTEXT_START_MARKER,
    metadata,
    body,
    CONTEXT_END_MARKER,
  ].join("\n");
}

function createWindowBody(
  sourceLines: string[],
  selectedLines: Set<number>,
): string {
  const sortedLines = [...selectedLines].sort((left, right) => left - right);
  const ranges: Array<{ start: number; end: number }> = [];

  for (const lineNumber of sortedLines) {
    const lastRange = ranges.at(-1);
    if (lastRange && lineNumber === lastRange.end + 1) {
      lastRange.end = lineNumber;
    } else {
      ranges.push({ start: lineNumber, end: lineNumber });
    }
  }

  return ranges.map(({ start, end }) => {
    const header = start === end ? `[line ${start}]` : `[lines ${start}-${end}]`;
    return `${header}\n${sourceLines.slice(start - 1, end).join("\n")}`;
  }).join("\n\n");
}

export function buildChangedFileSelection({
  file,
  maxSectionCharacters,
  changedLineRadius,
}: BuildChangedFileSelectionParams): ContextFileSelection | null {
  const fullSelection: ContextFileSelection = {
    path: file.change.filePath,
    source: "changed",
    selection: "full",
    body: file.content,
    truncated: false,
  };

  if (renderContextSection(fullSelection).length <= maxSectionCharacters) {
    return fullSelection;
  }

  const sourceLines = file.content.split("\n");
  const addedLines = [...new Set(file.change.addedLines)]
    .filter((lineNumber) =>
      Number.isInteger(lineNumber) &&
      lineNumber >= 1 &&
      lineNumber <= sourceLines.length,
    )
    .sort((left, right) => left - right);

  if (addedLines.length === 0) return null;

  const candidateLines: number[] = [...addedLines];
  for (let distance = 1; distance <= changedLineRadius; distance += 1) {
    for (const addedLine of addedLines) {
      candidateLines.push(addedLine - distance, addedLine + distance);
    }
  }

  const selectedLines = new Set<number>();
  const seenCandidates = new Set<number>();

  for (const lineNumber of candidateLines) {
    if (
      lineNumber < 1 ||
      lineNumber > sourceLines.length ||
      seenCandidates.has(lineNumber)
    ) {
      continue;
    }

    seenCandidates.add(lineNumber);
    const nextSelectedLines = new Set(selectedLines).add(lineNumber);
    const candidateSelection: ContextFileSelection = {
      path: file.change.filePath,
      source: "changed",
      selection: "changed-line-window",
      body: createWindowBody(sourceLines, nextSelectedLines),
      truncated: true,
    };

    if (renderContextSection(candidateSelection).length <= maxSectionCharacters) {
      selectedLines.add(lineNumber);
    }
  }

  if (selectedLines.size === 0) return null;

  return {
    path: file.change.filePath,
    source: "changed",
    selection: "changed-line-window",
    body: createWindowBody(sourceLines, selectedLines),
    truncated: true,
  };
}

export function buildRelatedTestCandidates(filePath: string): string[] {
  if (!isRelationshipSearchRoot(filePath)) return [];

  const originalExtension = getScriptExtension(filePath);
  if (!originalExtension) return [];

  const directory = path.posix.dirname(filePath);
  const fileName = path.posix.basename(filePath);
  const stem = fileName.slice(0, -originalExtension.length);
  const extensionOrder = [
    originalExtension,
    ...SCRIPT_EXTENSIONS.filter((extension) => extension !== originalExtension),
  ];
  const locations = [directory, path.posix.join(directory, "__tests__")];
  const candidates: string[] = [];

  for (const location of locations) {
    for (const extension of extensionOrder) {
      for (const marker of TEST_MARKERS) {
        candidates.push(
          path.posix.join(location, `${stem}.${marker}${extension}`),
        );
      }
    }
  }

  return candidates;
}

export function extractRelativeModuleSpecifiers(content: string): string[] {
  const matches: Array<{ specifier: string; index: number }> = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) {
        matches.push({ specifier, index: match.index });
      }
    }
  }

  matches.sort((left, right) => left.index - right.index);

  const seen = new Set<string>();
  return matches.flatMap(({ specifier }) => {
    if (seen.has(specifier)) return [];
    seen.add(specifier);
    return [specifier];
  });
}

export function resolveRelativeModuleCandidates({
  importerPath,
  specifier,
}: ResolveRelativeModuleCandidatesParams): string[] {
  if (
    !specifier.startsWith(".") ||
    specifier.includes("?") ||
    specifier.includes("#")
  ) {
    return [];
  }

  const joinedPath = path.posix.normalize(
    path.posix.join(path.posix.dirname(importerPath), specifier),
  );

  if (
    path.posix.isAbsolute(joinedPath) ||
    joinedPath === ".." ||
    joinedPath.startsWith("../")
  ) {
    return [];
  }

  if (path.posix.extname(joinedPath)) {
    return [joinedPath];
  }

  return [
    joinedPath,
    ...MODULE_RESOLUTION_SUFFIXES.map((suffix) => `${joinedPath}${suffix}`),
  ];
}

function collectRelationshipCandidates(
  changedFiles: ChangedFileContent[],
): Array<{ path: string; source: RelatedCandidate["source"] }> {
  const candidates: Array<{
    path: string;
    source: RelatedCandidate["source"];
  }> = [];

  for (const changedFile of changedFiles) {
    for (const candidatePath of buildRelatedTestCandidates(
      changedFile.change.filePath,
    )) {
      candidates.push({ path: candidatePath, source: "related-test" });
    }
  }

  for (const changedFile of changedFiles) {
    if (!isRelationshipSearchRoot(changedFile.change.filePath)) continue;

    for (const specifier of extractRelativeModuleSpecifiers(changedFile.content)) {
      for (const candidatePath of resolveRelativeModuleCandidates({
        importerPath: changedFile.change.filePath,
        specifier,
      })) {
        candidates.push({ path: candidatePath, source: "direct-import" });
      }
    }
  }

  return candidates;
}

export async function findRelatedCandidates({
  token,
  owner,
  repo,
  headSha,
  signal,
  changedFiles,
  allChangedPaths,
  maxRelatedFiles,
  repositoryReader,
}: FindRelatedCandidatesParams): Promise<{
  candidates: RelatedCandidate[];
  treeStatus: PrContextTreeStatus;
  omittedByBudgetCount: number;
}> {
  if (
    maxRelatedFiles < 1 ||
    !changedFiles.some((file) =>
      isRelationshipSearchRoot(file.change.filePath),
    )
  ) {
    return {
      candidates: [],
      treeStatus: "not-requested",
      omittedByBudgetCount: 0,
    };
  }

  let treeFiles: RepositoryTreeFile[];
  let treeStatus: PrContextTreeStatus;

  try {
    const tree = await repositoryReader.getRepositoryFileTree({
      token,
      owner,
      repo,
      commitSha: headSha,
      signal,
    });
    treeFiles = tree.files;
    treeStatus = tree.truncated ? "truncated" : "complete";
  } catch {
    return {
      candidates: [],
      treeStatus: "failed",
      omittedByBudgetCount: 0,
    };
  }

  const treeFilesByPath = new Map(
    treeFiles.map((file) => [file.path, file] as const),
  );
  const seenPaths = new Set<string>(allChangedPaths);
  const candidates: RelatedCandidate[] = [];
  let omittedByBudgetCount = 0;

  for (const relationship of collectRelationshipCandidates(changedFiles)) {
    if (seenPaths.has(relationship.path)) continue;

    const treeFile = treeFilesByPath.get(relationship.path);
    if (!treeFile || !isSupportedContextPath(relationship.path)) continue;

    seenPaths.add(relationship.path);

    if (
      treeFile.size !== null &&
      treeFile.size > MAX_RELATED_FILE_CHARACTERS
    ) {
      omittedByBudgetCount += 1;
      continue;
    }

    if (candidates.length >= maxRelatedFiles) {
      omittedByBudgetCount += 1;
      continue;
    }

    candidates.push({
      path: relationship.path,
      source: relationship.source,
      size: treeFile.size,
    });
  }

  return { candidates, treeStatus, omittedByBudgetCount };
}

export function createManifestIdentitySha256(
  manifest: PrContextManifestEntry[],
): string | null {
  if (manifest.length === 0) return null;

  const canonicalLines = manifest.map((entry) =>
    JSON.stringify({
      path: entry.path,
      source: entry.source,
      selection: entry.selection,
    }),
  );

  return createHash("sha256")
    .update(canonicalLines.join("\n"), "utf8")
    .digest("hex");
}

function getTotalCandidateContent(
  headSha: string,
  sections: string[],
): string {
  if (sections.length === 0) return "";
  return [`Context head SHA: ${headSha}`, ...sections].join("\n\n");
}

export function formatWithinBudget({
  headSha,
  changedFiles,
  relatedResults,
  treeStatus,
  budget,
  initialOmittedByBudgetCount,
  initialFailedFileCount,
}: FormatWithinBudgetParams): DeterministicPrContext {
  const sections: string[] = [];
  const manifest: PrContextManifestEntry[] = [];
  let omittedByBudgetCount = initialOmittedByBudgetCount;
  let failedFileCount = initialFailedFileCount;

  const includeSelection = (selection: ContextFileSelection): boolean => {
    const section = renderContextSection(selection);
    const candidateContent = getTotalCandidateContent(
      headSha,
      [...sections, section],
    );

    if (candidateContent.length > budget.totalCharacters) return false;

    sections.push(section);
    manifest.push({
      path: selection.path,
      source: selection.source,
      selection: selection.selection,
      characters: escapeContextMarkers(selection.body).length,
      truncated: selection.truncated,
    });
    return true;
  };

  for (const file of changedFiles) {
    const existingContent = getTotalCandidateContent(headSha, sections);
    const separatorCharacters = sections.length === 0 ? 2 : 2;
    const headerCharacters = sections.length === 0
      ? `Context head SHA: ${headSha}`.length
      : 0;
    const remainingTotalCharacters = budget.totalCharacters -
      existingContent.length -
      separatorCharacters -
      headerCharacters;
    const maxSectionCharacters = Math.min(
      budget.perChangedFileCharacters,
      remainingTotalCharacters,
    );
    const selection = buildChangedFileSelection({
      file,
      maxSectionCharacters,
      changedLineRadius: budget.changedLineRadius,
    });

    if (!selection || !includeSelection(selection)) {
      omittedByBudgetCount += 1;
    }
  }

  for (const result of relatedResults) {
    if (
      result.status === "rejected" ||
      !result.value.file ||
      result.value.file.content.length === 0
    ) {
      failedFileCount += 1;
      continue;
    }

    if (result.value.file.content.length > MAX_RELATED_FILE_CHARACTERS) {
      omittedByBudgetCount += 1;
      continue;
    }

    const selection: ContextFileSelection = {
      path: result.value.candidate.path,
      source: result.value.candidate.source,
      selection: "full",
      body: result.value.file.content,
      truncated: false,
    };

    if (!includeSelection(selection)) {
      omittedByBudgetCount += 1;
    }
  }

  const content = getTotalCandidateContent(headSha, sections);

  return {
    content,
    headSha,
    manifest,
    manifestIdentitySha256: createManifestIdentitySha256(manifest),
    omittedByBudgetCount,
    failedFileCount,
    treeStatus,
  };
}

export function createEmptyDeterministicPrContext(
  headSha: string,
): DeterministicPrContext {
  return {
    content: "",
    headSha,
    manifest: [],
    manifestIdentitySha256: null,
    omittedByBudgetCount: 0,
    failedFileCount: 0,
    treeStatus: "not-requested",
  };
}

export async function buildDeterministicPrContext(
  params: BuildDeterministicPrContextParams,
): Promise<DeterministicPrContext> {
  const repositoryReader = params.repositoryReader ?? githubRepositoryReader;
  const budget = getDeterministicContextBudget(params.sizeMode);
  const parsedChanges = parseDiffFiles(params.diff);
  const {
    selected: changes,
    omittedByLimitCount: changedLimitOmissionCount,
  } = selectChangedFileCandidates(
    parsedChanges,
    budget.maxChangedFiles,
  );
  const allChangedPaths = new Set(
    parsedChanges.map((change) => change.filePath),
  );

  const changedResults = await Promise.allSettled(
    changes.map(async (change): Promise<ChangedFileFetchResult> => ({
      change,
      file: await repositoryReader.getFileContent({
        token: params.token,
        owner: params.owner,
        repo: params.repo,
        path: change.filePath,
        ref: params.headSha,
        signal: params.signal,
      }),
    })),
  );

  const {
    files: changedFiles,
    failedFileCount: changedFailedFileCount,
  } = collectSuccessfulChangedFiles(changedResults);

  const {
    candidates: relatedCandidates,
    treeStatus,
    omittedByBudgetCount: relatedCandidateOmissionCount,
  } = await findRelatedCandidates({
    ...params,
    repositoryReader,
    changedFiles,
    allChangedPaths,
    maxRelatedFiles: budget.maxRelatedFiles,
  });

  const relatedResults = await Promise.allSettled(
    relatedCandidates.map(async (candidate): Promise<RelatedFileFetchResult> => ({
      candidate,
      file: await repositoryReader.getFileContent({
        token: params.token,
        owner: params.owner,
        repo: params.repo,
        path: candidate.path,
        ref: params.headSha,
        signal: params.signal,
      }),
    })),
  );

  return formatWithinBudget({
    headSha: params.headSha,
    changedFiles,
    relatedResults,
    treeStatus,
    budget,
    initialOmittedByBudgetCount:
      changedLimitOmissionCount + relatedCandidateOmissionCount,
    initialFailedFileCount: changedFailedFileCount,
  });
}
