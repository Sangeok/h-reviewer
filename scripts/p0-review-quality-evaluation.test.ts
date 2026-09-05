import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import dotenv from "dotenv";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  EMBEDDING_MODEL_ID,
  GENERATOR_MODEL_ID,
  REPEAT_MIN_TEXT_LENGTH,
  VERIFIER_MODEL_ID,
} from "@/features/ai/constants";
import {
  buildDeterministicPrContext,
  type DeterministicPrContext,
  type DeterministicPrContextRepositoryReader,
} from "@/features/ai/lib/build-deterministic-pr-context";
import { generateEmbedding } from "@/features/ai/lib/generate-embedding";
import {
  findBestRepeatCandidate,
  type RepeatCandidateEmbedding,
} from "@/features/ai/lib/repeat-detection";
import { buildStructuredPrompt } from "@/features/ai/lib/review-prompt";
import {
  issueCategorySchema,
  structuredReviewSchema,
  type StructuredReviewOutput,
} from "@/features/ai/lib/review-schema";
import {
  classifyPRSize,
  type ReviewSizeMode,
} from "@/features/ai/lib/review-size-policy";
import {
  verifyReview,
  type VerificationResult,
} from "@/features/ai/lib/verify-review";
import { parseDiffToChangedFiles } from "@/lib/github/diff-parser";

vi.mock("server-only", () => ({}));

const execFileAsync = promisify(execFile);
const FIXTURE_PATH = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "p0-review-quality-cases.json",
);
const ADJUDICATION_PATH = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "p0-review-quality-adjudications.json",
);
const GENERATION_TIMEOUT_MS = 150_000;
const MAX_GIT_OUTPUT_BYTES = 200 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FULL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const MODEL_INPUT_PRICE_PER_MILLION = 0.25;
const MODEL_OUTPUT_PRICE_PER_MILLION = 1.5;

const modeSchema = z.enum(["validate", "capture", "score"]);
const lineRangeSchema = z
  .tuple([z.number().int().positive(), z.number().int().positive()])
  .refine(([start, end]) => start <= end, "lineRange must be ascending");
const capturedLineRangeSchema = z
  .tuple([z.number().finite(), z.number().finite()])
  .refine(([start, end]) => start <= end, "captured lineRange must be ascending");

const expectedFindingSchema = z.object({
  findingId: z.string().min(1),
  file: z.string().min(1),
  lineRange: lineRangeSchema,
  category: issueCategorySchema,
  claim: z.string().min(1),
  crossFile: z.boolean(),
}).strict();

const historicalFindingSchema = z.object({
  findingId: z.string().min(1),
  category: issueCategorySchema,
  claim: z.string().min(1),
}).strict();

const qualityCaseSchema = z.object({
  caseId: z.string().min(1),
  mergeCommit: z.string().regex(FULL_COMMIT_SHA_PATTERN),
  title: z.string().min(1),
  description: z.string(),
  expectedFindings: z.array(expectedFindingSchema),
  historicalFindings: z.array(historicalFindingSchema),
}).strict();

const corpusSchema = z.object({
  schemaVersion: z.literal(1),
  cases: z.array(qualityCaseSchema).min(1),
}).strict();

const adjudicatedFindingSchema = z.object({
  findingId: z.string().min(1),
  actionable: z.boolean(),
  supported: z.boolean(),
  stale: z.boolean(),
  expectedFindingId: z.string().min(1).nullable(),
  repeatExpected: z.boolean(),
  reviewer: z.string().min(1),
}).strict();

const pendingAdjudicationSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal("pending"),
  outputSha256: z.null(),
  findings: z.array(z.never()).length(0),
}).strict();

const completeAdjudicationSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal("complete"),
  outputSha256: z.string().regex(SHA256_PATTERN),
  findings: z.array(adjudicatedFindingSchema).min(1),
}).strict();

const adjudicationSchema = z.discriminatedUnion("status", [
  pendingAdjudicationSchema,
  completeAdjudicationSchema,
]);

const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).strict();

const capturedFindingSchema = z.object({
  findingId: z.string().min(1),
  kind: z.enum(["issue", "suggestion"]),
  file: z.string().nullable(),
  lineRange: capturedLineRangeSchema.nullable(),
  category: issueCategorySchema,
  severity: z.string().min(1),
  claim: z.string(),
  payload: z.unknown(),
  verifier: z.object({
    verdict: z.enum(["CONFIRMED", "UNCERTAIN", "REJECTED"]),
    reason: z.string(),
  }).strict(),
  repeat: z.object({
    isRepeat: z.boolean(),
    candidateFindingId: z.string().nullable(),
    similarity: z.number().finite().nullable(),
  }).strict(),
}).strict();

const capturedCaseSchema = z.object({
  caseId: z.string().min(1),
  source: z.object({
    mergeCommit: z.string().regex(FULL_COMMIT_SHA_PATTERN),
    parents: z.tuple([
      z.string().regex(FULL_COMMIT_SHA_PATTERN),
      z.string().regex(FULL_COMMIT_SHA_PATTERN),
    ]),
    mergeBase: z.string().regex(FULL_COMMIT_SHA_PATTERN),
    sizeMode: z.enum(["tiny", "small", "normal", "large"]),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    changedFiles: z.number().int().nonnegative(),
  }).strict(),
  hashes: z.object({
    mergeCommitSha256: z.string().regex(SHA256_PATTERN),
    parentsSha256: z.string().regex(SHA256_PATTERN),
    mergeBaseSha256: z.string().regex(SHA256_PATTERN),
    titleSha256: z.string().regex(SHA256_PATTERN),
    descriptionSha256: z.string().regex(SHA256_PATTERN),
    diffSha256: z.string().regex(SHA256_PATTERN),
    sizeModeSha256: z.string().regex(SHA256_PATTERN),
    contextSha256: z.string().regex(SHA256_PATTERN),
    manifestSha256: z.string().regex(SHA256_PATTERN),
    canonicalInputSha256: z.string().regex(SHA256_PATTERN),
  }).strict(),
  contextManifest: z.array(z.object({
    path: z.string(),
    source: z.enum(["changed", "related-test", "direct-import"]),
    selection: z.enum(["full", "changed-line-window"]),
    characters: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }).strict()),
  generation: z.object({
    model: z.string(),
    usage: tokenUsageSchema,
  }).strict(),
  verification: z.object({
    model: z.string(),
    usage: tokenUsageSchema,
  }).strict(),
  embedding: z.object({
    model: z.string(),
    callCount: z.number().int().nonnegative(),
  }).strict(),
  findings: z.array(capturedFindingSchema),
}).strict();

const captureOutputSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string().datetime(),
  corpusSha256: z.string().regex(SHA256_PATTERN),
  models: z.object({
    generation: z.string(),
    verification: z.string(),
    embedding: z.string(),
  }).strict(),
  cases: z.array(capturedCaseSchema).min(1),
  totals: z.object({
    generationUsage: tokenUsageSchema,
    verificationUsage: tokenUsageSchema,
    embeddingCallCount: z.number().int().nonnegative(),
    estimatedModelCostUsd: z.number().nonnegative(),
  }).strict(),
}).strict();

type QualityCase = z.infer<typeof qualityCaseSchema>;
type Corpus = z.infer<typeof corpusSchema>;
type Adjudication = z.infer<typeof adjudicationSchema>;
type CapturedFinding = z.infer<typeof capturedFindingSchema>;
type CapturedCase = z.infer<typeof capturedCaseSchema>;
type CaptureOutput = z.infer<typeof captureOutputSchema>;
type TokenUsage = z.infer<typeof tokenUsageSchema>;

type LoadedCase = {
  definition: QualityCase;
  parent1: string;
  parent2: string;
  mergeBase: string;
  diff: string;
  sizeMode: ReviewSizeMode;
  additions: number;
  deletions: number;
  changedFiles: number;
  context: DeterministicPrContext;
  hashes: CapturedCase["hashes"];
};

async function runGit(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  return stdout;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function serializeLengthPrefixed(
  parts: readonly { name: string; value: string }[],
): Buffer {
  const chunks: Buffer[] = [];

  for (const part of parts) {
    const name = Buffer.from(part.name, "utf8");
    const value = Buffer.from(part.value, "utf8");
    chunks.push(
      Buffer.from(`${name.length}:`, "utf8"),
      name,
      Buffer.from(`${value.length}:`, "utf8"),
      value,
    );
  }

  return Buffer.concat(chunks);
}

function countFileLines(content: string): number {
  if (content.length === 0) return 0;
  const lineCount = content.split("\n").length;
  return content.endsWith("\n") ? lineCount - 1 : lineCount;
}

function assertUnique(values: readonly string[], label: string): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicate IDs: ${[...new Set(duplicates)].join(", ")}`);
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function loadCorpus(): Promise<{ corpus: Corpus; sha: string }> {
  const raw = await readFile(FIXTURE_PATH);
  const corpus = corpusSchema.parse(JSON.parse(raw.toString("utf8")) as unknown);

  assertUnique(corpus.cases.map((entry) => entry.caseId), "caseId");
  assertUnique(
    corpus.cases.flatMap((entry) => [
      ...entry.expectedFindings.map((finding) => finding.findingId),
      ...entry.historicalFindings.map((finding) => finding.findingId),
    ]),
    "fixture findingId",
  );

  return { corpus, sha: sha256(raw) };
}

async function loadAdjudication(): Promise<Adjudication> {
  return adjudicationSchema.parse(await readJsonFile(ADJUDICATION_PATH));
}

function createLocalGitRepositoryReader(): DeterministicPrContextRepositoryReader {
  return {
    async getFileContent({ path: filePath, ref }): Promise<{
      content: string;
      sha: string;
    } | null> {
      try {
        const content = await runGit(["show", `${ref}:${filePath}`]);
        return { content, sha: sha256(content) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("does not exist") || message.includes("exists on disk")) {
          return null;
        }
        throw error;
      }
    },
    async getRepositoryFileTree({ commitSha }): Promise<{
      files: { path: string; size: null }[];
      truncated: false;
    }> {
      const output = await runGit([
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        commitSha,
      ]);
      return {
        files: output
          .split("\0")
          .filter((filePath) => filePath.length > 0)
          .map((filePath) => ({ path: filePath, size: null })),
        truncated: false,
      };
    },
  };
}

function parseNumstat(value: string): {
  additions: number;
  deletions: number;
  changedFiles: number;
} {
  let additions = 0;
  let deletions = 0;
  let changedFiles = 0;

  for (const line of value.split("\n")) {
    if (line.length === 0) continue;
    const [added = "-", deleted = "-"] = line.split("\t");
    additions += Number.parseInt(added, 10) || 0;
    deletions += Number.parseInt(deleted, 10) || 0;
    changedFiles += 1;
  }

  return { additions, deletions, changedFiles };
}

async function loadAndValidateCase(definition: QualityCase): Promise<LoadedCase> {
  const objectType = (await runGit([
    "cat-file",
    "-t",
    definition.mergeCommit,
  ])).trim();
  if (objectType !== "commit") {
    throw new Error(`${definition.caseId} mergeCommit is not a commit`);
  }

  const parents = (await runGit([
    "show",
    "-s",
    "--format=%P",
    definition.mergeCommit,
  ])).trim().split(/\s+/);
  if (parents.length !== 2 || !parents.every((parent) => FULL_COMMIT_SHA_PATTERN.test(parent))) {
    throw new Error(`${definition.caseId} must reference a two-parent merge commit`);
  }
  const [parent1, parent2] = parents as [string, string];
  const mergeBase = (await runGit(["merge-base", parent1, parent2])).trim();
  if (!FULL_COMMIT_SHA_PATTERN.test(mergeBase)) {
    throw new Error(`${definition.caseId} has no valid merge base`);
  }

  const diff = await runGit([
    "diff",
    "--find-renames",
    "--find-copies",
    `${mergeBase}..${parent2}`,
    "--",
  ]);
  if (diff.length === 0) {
    throw new Error(`${definition.caseId} canonical diff is empty`);
  }

  const numstat = parseNumstat(await runGit([
    "diff",
    "--numstat",
    `${mergeBase}..${parent2}`,
    "--",
  ]));
  const sizeMode = classifyPRSize(numstat);
  const repositoryReader = createLocalGitRepositoryReader();
  const contextParams = {
    token: "local-git-fixture",
    owner: "local-fixture",
    repo: "hreviewer",
    headSha: parent2,
    diff,
    sizeMode,
    repositoryReader,
  } as const;
  const firstContext = await buildDeterministicPrContext(contextParams);
  const secondContext = await buildDeterministicPrContext(contextParams);
  if (JSON.stringify(firstContext) !== JSON.stringify(secondContext)) {
    throw new Error(`${definition.caseId} deterministic context changed between identical runs`);
  }

  for (const expected of definition.expectedFindings) {
    const file = await repositoryReader.getFileContent({
      token: contextParams.token,
      owner: contextParams.owner,
      repo: contextParams.repo,
      path: expected.file,
      ref: parent2,
    });
    if (!file) {
      throw new Error(`${definition.caseId} expected file is absent at head: ${expected.file}`);
    }
    const lineCount = countFileLines(file.content);
    if (expected.lineRange[1] > lineCount) {
      throw new Error(
        `${definition.caseId} expected line ${expected.lineRange[1]} exceeds ${expected.file} (${lineCount})`,
      );
    }
  }

  const manifestJson = JSON.stringify(firstContext.manifest);
  const canonicalInput = serializeLengthPrefixed([
    { name: "mergeCommit", value: definition.mergeCommit },
    { name: "parent1", value: parent1 },
    { name: "parent2", value: parent2 },
    { name: "mergeBase", value: mergeBase },
    { name: "title", value: definition.title },
    { name: "description", value: definition.description },
    { name: "diff", value: diff },
    { name: "sizeMode", value: sizeMode },
    { name: "deterministicContext", value: firstContext.content },
    { name: "orderedManifest", value: manifestJson },
  ]);

  return {
    definition,
    parent1,
    parent2,
    mergeBase,
    diff,
    sizeMode,
    ...numstat,
    context: firstContext,
    hashes: {
      titleSha256: sha256(definition.title),
      descriptionSha256: sha256(definition.description),
      diffSha256: sha256(diff),
      mergeCommitSha256: sha256(definition.mergeCommit),
      parentsSha256: sha256(JSON.stringify([parent1, parent2])),
      mergeBaseSha256: sha256(mergeBase),
      sizeModeSha256: sha256(sizeMode),
      contextSha256: sha256(firstContext.content),
      manifestSha256: sha256(manifestJson),
      canonicalInputSha256: sha256(canonicalInput),
    },
  };
}

async function validateInputs(): Promise<{
  loadedCases: LoadedCase[];
  corpusSha256: string;
  adjudication: Adjudication;
}> {
  const [{ corpus, sha: corpusSha256 }, adjudication] = await Promise.all([
    loadCorpus(),
    loadAdjudication(),
  ]);
  const loadedCases = [];

  for (const definition of corpus.cases) {
    loadedCases.push(await loadAndValidateCase(definition));
  }

  if (adjudication.status === "complete") {
    assertUnique(
      adjudication.findings.map((finding) => finding.findingId),
      "adjudication findingId",
    );
  }

  return { loadedCases, corpusSha256, adjudication };
}

function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function normalizeUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}): TokenUsage {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const reasoningTokens = usage.reasoningTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens + reasoningTokens,
  };
}

function createGeneratedFindingId(input: {
  caseId: string;
  kind: "issue" | "suggestion";
  index: number;
  value: unknown;
}): string {
  const digest = sha256(JSON.stringify(input.value)).slice(0, 16);
  return `${input.caseId}:${input.kind}:${input.index}:${digest}`;
}

async function generateReviewForCase(
  loadedCase: LoadedCase,
): Promise<{ output: StructuredReviewOutput; usage: TokenUsage }> {
  const prompt = buildStructuredPrompt({
    title: loadedCase.definition.title,
    description: loadedCase.definition.description,
    diff: loadedCase.diff,
    deterministicContext: loadedCase.context.content,
    langCode: "ko",
    sizeMode: loadedCase.sizeMode,
    changedFilesSummary: parseDiffToChangedFiles(loadedCase.diff),
    maxSuggestions: null,
  });
  const result = await generateText({
    model: google(GENERATOR_MODEL_ID),
    experimental_output: Output.object({ schema: structuredReviewSchema }),
    prompt,
    abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });
  const output = structuredReviewSchema.parse(result.experimental_output);

  return { output, usage: normalizeUsage(result.usage) };
}

async function verifyGeneratedReview(
  loadedCase: LoadedCase,
  output: StructuredReviewOutput,
): Promise<VerificationResult> {
  if (output.issues.length === 0 && output.suggestions.length === 0) {
    return {
      status: "verified",
      issueVerdicts: [],
      suggestionVerdicts: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      },
    };
  }

  return verifyReview({
    diff: loadedCase.diff,
    issues: output.issues,
    suggestions: output.suggestions,
    langCode: "ko",
  });
}

async function embedHistoricalFindings(
  definition: QualityCase,
): Promise<{ candidates: RepeatCandidateEmbedding[]; callCount: number }> {
  const candidates: RepeatCandidateEmbedding[] = [];

  for (const historical of definition.historicalFindings) {
    candidates.push({
      id: historical.findingId,
      category: historical.category,
      embedding: await generateEmbedding(historical.claim),
    });
  }

  return { candidates, callCount: candidates.length };
}

async function captureCase(loadedCase: LoadedCase): Promise<CapturedCase> {
  const generated = await generateReviewForCase(loadedCase);
  const verification = await verifyGeneratedReview(loadedCase, generated.output);
  if (!verification.usage) {
    throw new Error(`${loadedCase.definition.caseId} verification usage is missing`);
  }

  const historical = await embedHistoricalFindings(loadedCase.definition);
  let embeddingCallCount = historical.callCount;
  const findings: CapturedFinding[] = [];

  for (const [index, issue] of generated.output.issues.entries()) {
    const embeddingText = [issue.title, issue.body].filter(Boolean).join("\n").trim();
    let repeat: CapturedFinding["repeat"] = {
      isRepeat: false,
      candidateFindingId: null,
      similarity: null,
    };

    if (embeddingText.length >= REPEAT_MIN_TEXT_LENGTH) {
      const embedding = await generateEmbedding(embeddingText);
      embeddingCallCount += 1;
      const candidate = findBestRepeatCandidate({
        category: issue.category,
        embedding,
        candidates: historical.candidates,
      });
      repeat = {
        isRepeat: candidate !== null,
        candidateFindingId: candidate?.id ?? null,
        similarity: candidate?.similarity ?? null,
      };
    }

    findings.push({
      findingId: createGeneratedFindingId({
        caseId: loadedCase.definition.caseId,
        kind: "issue",
        index,
        value: issue,
      }),
      kind: "issue",
      file: issue.file,
      lineRange: issue.line === null ? null : [issue.line, issue.line],
      category: issue.category,
      severity: issue.severity,
      claim: [issue.title, issue.body].join(" — "),
      payload: issue,
      verifier: verification.issueVerdicts[index] ?? {
        verdict: "UNCERTAIN",
        reason: "",
      },
      repeat,
    });
  }

  for (const [index, suggestion] of generated.output.suggestions.entries()) {
    findings.push({
      findingId: createGeneratedFindingId({
        caseId: loadedCase.definition.caseId,
        kind: "suggestion",
        index,
        value: suggestion,
      }),
      kind: "suggestion",
      file: suggestion.file,
      lineRange: [suggestion.line, suggestion.line],
      category: "general",
      severity: suggestion.severity,
      claim: suggestion.explanation,
      payload: suggestion,
      verifier: verification.suggestionVerdicts[index] ?? {
        verdict: "UNCERTAIN",
        reason: "",
      },
      repeat: {
        isRepeat: false,
        candidateFindingId: null,
        similarity: null,
      },
    });
  }

  assertUnique(findings.map((finding) => finding.findingId), "captured findingId");

  return {
    caseId: loadedCase.definition.caseId,
    source: {
      mergeCommit: loadedCase.definition.mergeCommit,
      parents: [loadedCase.parent1, loadedCase.parent2],
      mergeBase: loadedCase.mergeBase,
      sizeMode: loadedCase.sizeMode,
      additions: loadedCase.additions,
      deletions: loadedCase.deletions,
      changedFiles: loadedCase.changedFiles,
    },
    hashes: loadedCase.hashes,
    contextManifest: loadedCase.context.manifest,
    generation: { model: GENERATOR_MODEL_ID, usage: generated.usage },
    verification: { model: VERIFIER_MODEL_ID, usage: verification.usage },
    embedding: { model: EMBEDDING_MODEL_ID, callCount: embeddingCallCount },
    findings,
  };
}

function calculateEstimatedModelCostUsd(
  generation: TokenUsage,
  verification: TokenUsage,
): number {
  const combined = addUsage(generation, verification);
  return (
    (combined.inputTokens / 1_000_000) * MODEL_INPUT_PRICE_PER_MILLION +
    ((combined.outputTokens + combined.reasoningTokens) / 1_000_000) *
      MODEL_OUTPUT_PRICE_PER_MILLION
  );
}

async function captureEvaluation(
  loadedCases: LoadedCase[],
  corpusSha256: string,
): Promise<void> {
  if (process.env.CALIBRATION !== "1") {
    throw new Error("CALIBRATION=1 is required for paid P0 quality capture");
  }
  if (process.env.GENERATOR_MODEL !== GENERATOR_MODEL_ID) {
    throw new Error(`GENERATOR_MODEL must equal ${GENERATOR_MODEL_ID}`);
  }
  if (process.env.VERIFIER_MODELS !== VERIFIER_MODEL_ID) {
    throw new Error(`VERIFIER_MODELS must equal ${VERIFIER_MODEL_ID}`);
  }
  const outputPath = process.env.P0_QUALITY_OUTPUT_PATH;
  if (!outputPath) {
    throw new Error("P0_QUALITY_OUTPUT_PATH is required for capture mode");
  }

  dotenv.config({ path: ".env.local" });
  dotenv.config({ path: ".env" });
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for capture mode");
  }

  const cases: CapturedCase[] = [];
  for (const loadedCase of loadedCases) {
    cases.push(await captureCase(loadedCase));
  }

  const generationUsage = cases.reduce(
    (total, entry) => addUsage(total, entry.generation.usage),
    { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
  );
  const verificationUsage = cases.reduce(
    (total, entry) => addUsage(total, entry.verification.usage),
    { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
  );
  const capture: CaptureOutput = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    corpusSha256,
    models: {
      generation: GENERATOR_MODEL_ID,
      verification: VERIFIER_MODEL_ID,
      embedding: EMBEDDING_MODEL_ID,
    },
    cases,
    totals: {
      generationUsage,
      verificationUsage,
      embeddingCallCount: cases.reduce(
        (total, entry) => total + entry.embedding.callCount,
        0,
      ),
      estimatedModelCostUsd: calculateEstimatedModelCostUsd(
        generationUsage,
        verificationUsage,
      ),
    },
  };

  captureOutputSchema.parse(capture);
  await writeFile(outputPath, `${JSON.stringify(capture, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function rangesOverlap(
  left: readonly [number, number],
  right: readonly [number, number],
): boolean {
  return left[0] <= right[1] && right[0] <= left[1];
}

function validateApprovedMatches(input: {
  output: CaptureOutput;
  loadedCases: LoadedCase[];
  adjudication: z.infer<typeof completeAdjudicationSchema>;
}): void {
  const caseDefinitions = new Map(
    input.loadedCases.map((entry) => [entry.definition.caseId, entry.definition]),
  );
  const generatedById = new Map<string, {
    caseId: string;
    finding: CapturedFinding;
  }>();

  for (const capturedCase of input.output.cases) {
    for (const finding of capturedCase.findings) {
      generatedById.set(finding.findingId, {
        caseId: capturedCase.caseId,
        finding,
      });
    }
  }

  for (const adjudicated of input.adjudication.findings) {
    if (adjudicated.expectedFindingId === null) continue;
    const generated = generatedById.get(adjudicated.findingId);
    if (!generated) {
      throw new Error(`Unknown generated finding: ${adjudicated.findingId}`);
    }
    const definition = caseDefinitions.get(generated.caseId);
    const expected = definition?.expectedFindings.find(
      (finding) => finding.findingId === adjudicated.expectedFindingId,
    );
    if (!expected) {
      throw new Error(
        `${adjudicated.expectedFindingId} is not ground truth for ${generated.caseId}`,
      );
    }
    if (
      generated.finding.file === null ||
      generated.finding.lineRange === null ||
      generated.finding.file.toLowerCase() !== expected.file.toLowerCase() ||
      generated.finding.category !== expected.category ||
      !rangesOverlap(generated.finding.lineRange, expected.lineRange)
    ) {
      throw new Error(
        `${adjudicated.findingId} does not satisfy the approved path, line, and category match rule`,
      );
    }
  }
}

function validateCaptureIdentity(input: {
  output: CaptureOutput;
  loadedCases: LoadedCase[];
  corpusSha256: string;
}): void {
  if (input.output.corpusSha256 !== input.corpusSha256) {
    throw new Error("Capture corpus SHA does not match the current fixture corpus");
  }
  if (
    input.output.models.generation !== GENERATOR_MODEL_ID ||
    input.output.models.verification !== VERIFIER_MODEL_ID ||
    input.output.models.embedding !== EMBEDDING_MODEL_ID
  ) {
    throw new Error("Capture model bindings do not match production constants");
  }
  assertUnique(
    input.output.cases.map((entry) => entry.caseId),
    "capture caseId",
  );
  if (input.output.cases.length !== input.loadedCases.length) {
    throw new Error("Capture and fixture case counts differ");
  }

  for (const loadedCase of input.loadedCases) {
    const capturedCase = input.output.cases.find(
      (entry) => entry.caseId === loadedCase.definition.caseId,
    );
    if (!capturedCase) {
      throw new Error(`Capture is missing case ${loadedCase.definition.caseId}`);
    }
    const expectedSource: CapturedCase["source"] = {
      mergeCommit: loadedCase.definition.mergeCommit,
      parents: [loadedCase.parent1, loadedCase.parent2],
      mergeBase: loadedCase.mergeBase,
      sizeMode: loadedCase.sizeMode,
      additions: loadedCase.additions,
      deletions: loadedCase.deletions,
      changedFiles: loadedCase.changedFiles,
    };
    const hashesMatch = (
      Object.keys(loadedCase.hashes) as Array<keyof CapturedCase["hashes"]>
    ).every(
      (key) => capturedCase.hashes[key] === loadedCase.hashes[key],
    );
    if (
      JSON.stringify(capturedCase.source) !== JSON.stringify(expectedSource) ||
      !hashesMatch ||
      JSON.stringify(capturedCase.contextManifest) !==
        JSON.stringify(loadedCase.context.manifest)
    ) {
      throw new Error(
        `Capture identity does not match canonical local input for ${loadedCase.definition.caseId}`,
      );
    }

    const historicalIds = new Set(
      loadedCase.definition.historicalFindings.map(
        (finding) => finding.findingId,
      ),
    );
    for (const finding of capturedCase.findings) {
      const candidateId = finding.repeat.candidateFindingId;
      if (
        finding.repeat.isRepeat !== (candidateId !== null) ||
        (candidateId !== null && !historicalIds.has(candidateId))
      ) {
        throw new Error(
          `Invalid repeat candidate reference for ${finding.findingId}`,
        );
      }
    }
  }
}

async function scoreEvaluation(input: {
  loadedCases: LoadedCase[];
  corpusSha256: string;
  adjudication: Adjudication;
}): Promise<void> {
  if (input.adjudication.status !== "complete") {
    throw new Error("P0 quality scoring requires complete human adjudication");
  }
  const outputPath = process.env.P0_QUALITY_OUTPUT_PATH;
  if (!outputPath) {
    throw new Error("P0_QUALITY_OUTPUT_PATH is required for score mode");
  }
  const outputBytes = await readFile(outputPath);
  const outputSha256 = sha256(outputBytes);
  if (outputSha256 !== input.adjudication.outputSha256) {
    throw new Error(
      `Adjudication output SHA mismatch: expected ${input.adjudication.outputSha256}, received ${outputSha256}`,
    );
  }
  const output = captureOutputSchema.parse(
    JSON.parse(outputBytes.toString("utf8")) as unknown,
  );
  validateCaptureIdentity({
    output,
    loadedCases: input.loadedCases,
    corpusSha256: input.corpusSha256,
  });

  const generatedFindings = output.cases.flatMap((entry) => entry.findings);
  const generatedIds = generatedFindings.map((finding) => finding.findingId);
  const adjudicatedIds = input.adjudication.findings.map(
    (finding) => finding.findingId,
  );
  assertUnique(generatedIds, "capture findingId");
  assertUnique(adjudicatedIds, "adjudication findingId");
  if (
    generatedIds.length !== adjudicatedIds.length ||
    generatedIds.some((findingId) => !adjudicatedIds.includes(findingId))
  ) {
    throw new Error("Capture and adjudication finding ID sets differ");
  }

  validateApprovedMatches({
    output,
    loadedCases: input.loadedCases,
    adjudication: input.adjudication,
  });

  const expectedFindings = input.loadedCases.flatMap(
    (entry) => entry.definition.expectedFindings,
  );
  const matchedExpectedIds = new Set(
    input.adjudication.findings.flatMap((finding) =>
      finding.expectedFindingId === null ? [] : [finding.expectedFindingId],
    ),
  );
  const repeatFindingIds = new Set(
    generatedFindings
      .filter((finding) => finding.repeat.isRepeat)
      .map((finding) => finding.findingId),
  );
  const actionableCount = input.adjudication.findings.filter(
    (finding) => finding.actionable,
  ).length;
  const unsupportedCount = input.adjudication.findings.filter(
    (finding) => !finding.supported,
  ).length;
  const staleCount = input.adjudication.findings.filter(
    (finding) => finding.stale,
  ).length;
  const crossFileExpected = expectedFindings.filter((finding) => finding.crossFile);
  const crossFileMissCount = crossFileExpected.filter(
    (finding) => !matchedExpectedIds.has(finding.findingId),
  ).length;
  const repeatFalsePositiveCount = input.adjudication.findings.filter(
    (finding) => repeatFindingIds.has(finding.findingId) && !finding.repeatExpected,
  ).length;

  if (generatedFindings.length === 0) {
    throw new Error("actionable precision is not-evaluable: generated finding denominator is zero");
  }
  if (expectedFindings.length === 0) {
    throw new Error("known-defect recall is not-evaluable: expected finding denominator is zero");
  }
  if (repeatFindingIds.size === 0) {
    throw new Error("repeat false-positive rate is not-evaluable: repeat denominator is zero");
  }

  const actionablePrecision = actionableCount / generatedFindings.length;
  const knownDefectRecall = matchedExpectedIds.size / expectedFindings.length;
  const repeatFalsePositiveRate = repeatFalsePositiveCount / repeatFindingIds.size;
  const metrics = {
    actionablePrecision: {
      numerator: actionableCount,
      denominator: generatedFindings.length,
      value: actionablePrecision,
    },
    knownDefectRecall: {
      numerator: matchedExpectedIds.size,
      denominator: expectedFindings.length,
      value: knownDefectRecall,
    },
    unsupportedClaims: {
      numerator: unsupportedCount,
      denominator: generatedFindings.length,
    },
    staleClaims: {
      numerator: staleCount,
      denominator: generatedFindings.length,
    },
    crossFileMiss: {
      numerator: crossFileMissCount,
      denominator: crossFileExpected.length,
    },
    repeatFalsePositiveRate: {
      numerator: repeatFalsePositiveCount,
      denominator: repeatFindingIds.size,
      value: repeatFalsePositiveRate,
    },
  };

  console.info(`[p0-quality] ${JSON.stringify(metrics)}`);
  expect(repeatFalsePositiveRate).toBeLessThanOrEqual(0.2);
}

describe("P0 personal review coach quality evaluation", () => {
  it(
    "validates, captures, or scores the fixed local merge corpus",
    async () => {
      const modeResult = modeSchema.safeParse(
        process.env.P0_QUALITY_MODE ?? "validate",
      );
      if (!modeResult.success) {
        throw new Error(
          `Unknown P0_QUALITY_MODE: ${process.env.P0_QUALITY_MODE ?? ""}`,
        );
      }

      const validated = await validateInputs();
      if (modeResult.data === "validate") {
        console.info(`[p0-quality:validate] ${JSON.stringify({
          corpusSha256: validated.corpusSha256,
          cases: validated.loadedCases.map((entry) => ({
            caseId: entry.definition.caseId,
            mergeCommit: entry.definition.mergeCommit,
            parents: [entry.parent1, entry.parent2],
            mergeBase: entry.mergeBase,
            sizeMode: entry.sizeMode,
            hashes: entry.hashes,
          })),
        })}`);
        expect(validated.loadedCases).toHaveLength(4);
        return;
      }
      if (modeResult.data === "capture") {
        await captureEvaluation(
          validated.loadedCases,
          validated.corpusSha256,
        );
        return;
      }
      await scoreEvaluation(validated);
    },
    15 * 60 * 1_000,
  );
});
