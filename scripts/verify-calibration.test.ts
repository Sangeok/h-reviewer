/**
 * 검수자(review verification) 캘리브레이션 하니스 — 일회용 측정 스크립트.
 *
 * 설계: fixture당 **생성 1회** → 그 동일 산출물을 **여러 검수 모델**에 각각 물린다.
 * 생성이 비결정적이라 모델별로 따로 생성하면 비교가 성립하지 않는다.
 *
 * 실행:
 *   CALIBRATION=1 npx vitest run scripts/verify-calibration.test.ts
 *   VERIFIER_MODELS="a,b" 로 비교 대상 지정 (기본: 2.5-flash-lite vs 3.1-pro-preview)
 *   (CALIBRATION 미설정 시 `npm test`에서 자동 skip — LLM 호출 비용 방어)
 *
 * ⚠️ 이 스크립트는 레포 소스를 Google AI로 전송한다.
 *    CLAUDE.md 규칙대로 `Plan: Paid` 키인지 확인 후 실행할 것.
 *
 * ⚠️ 프로덕션과의 의도적 차이 2개 (해석 시 감안):
 *   1) deterministicContext = "" — 로컬 git만 쓰므로 GitHub API 미사용.
 *   2) review.ts Step 5(validate-review) 필터 미적용 — 경로 해결·guard·count-trim 생략.
 *   둘 다 검수자에게 "거를 거리"를 더 주므로 REJECTED 비율을 위로 편향시킨다.
 */
import { describe, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";

import { buildStructuredPrompt } from "@/features/ai/lib/review-prompt";
import { structuredReviewSchema } from "@/features/ai/lib/review-schema";
import { classifyPRSize } from "@/features/ai/lib/review-size-policy";
import { verifyReview } from "@/features/ai/lib/verify-review";
import { parseDiffToChangedFiles } from "@/lib/github/diff-parser";
import type { StructuredReviewOutput } from "@/features/ai/lib/review-schema";
import type { ReviewSizeMode } from "@/features/ai/lib/review-size-policy";
import type { LanguageCode } from "@/shared/types/language";

// review-prompt → @/features/settings 배럴 → prisma/db 경유로 server-only가 끌려온다.
// (features/ai/lib/review-prompt.test.ts와 동일한 이유·동일한 처리)
vi.mock("server-only", () => ({}));

/**
 * verifyReview()는 VERIFIER_MODEL_ID를 하드코딩 참조한다. 프로덕션 상수를 건드리지 않고
 * 모델별 비교를 하기 위해, 호출 시점에 값을 읽는 getter로 바꿔 하니스에서만 스왑한다.
 * (2026-08-07 확인: 현 API 키에서 gemini-2.5-pro는 generateContent 거부 →
 *  "no longer available to new users". 즉 프로덕션 검수는 항상 실패 후 fail-open 중.)
 */
const verifierModel = vi.hoisted(() => ({ current: "" }));
vi.mock("@/features/ai/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/ai/constants")>();
  return {
    ...actual,
    get VERIFIER_MODEL_ID() {
      return verifierModel.current || actual.VERIFIER_MODEL_ID;
    },
  };
});

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const GENERATOR_MODEL = process.env.GENERATOR_MODEL ?? "gemini-2.5-flash";
const VERIFIER_MODELS = (
  process.env.VERIFIER_MODELS ?? "gemini-2.5-flash-lite,gemini-3.1-pro-preview"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const LANG_CODE: LanguageCode = "ko";
const GENERATION_TIMEOUT_MS = 100_000; // 프로덕션 AI_GENERATION_TIMEOUT_MS와 동일

/** 결과 덤프 위치. CALIBRATION_OUT으로 덮어쓸 수 있다. */
const OUT_DIR = process.env.CALIBRATION_OUT ?? path.join(tmpdir(), "hreviewer-calibration");

/**
 * 머지 커밋 → PR diff 복원. `^1`=base, `^2`=PR head.
 * PR#62(99e774a, 138 files / 30.8k tokens)는 제외 — 프로덕션과 같은 100초 제한에서
 * flash 생성이 타임아웃한다(그 자체가 별도 발견이라 여기서 재확인할 필요 없음).
 */
const ALL_FIXTURES = [
  { merge: "c902f22", label: "PR#65 parallel-array-assert" },
  { merge: "cf41f00", label: "PR#64 rename-verification" },
  { merge: "6dc7eda", label: "PR#60 frontend-clean-code" },
  { merge: "a240c85", label: "PR#59 frontend-clean-code" },
];

const FIXTURES = process.env.CALIBRATION_LIMIT
  ? ALL_FIXTURES.slice(0, Number.parseInt(process.env.CALIBRATION_LIMIT, 10))
  : ALL_FIXTURES;

type VerdictCounts = { CONFIRMED: number; UNCERTAIN: number; REJECTED: number };
type RejectedEntry = { kind: "issue" | "suggestion"; label: string; reason: string };

type VerifierRun = {
  model: string;
  issueVerdicts: VerdictCounts;
  suggestionVerdicts: VerdictCounts;
  /** 판정 문자열 시퀀스 — 모델 간 일치도 계산용 (index 정렬 보장됨) */
  issueSeq: string[];
  suggestionSeq: string[];
  rejected: RejectedEntry[];
  error?: string;
  elapsedMs: number;
};

type FixtureResult = {
  label: string;
  merge: string;
  sizeMode: ReviewSizeMode;
  stats: { additions: number; deletions: number; changedFiles: number; diffChars: number };
  generation: {
    model: string;
    issues: { severity: string; category: string; file: string | null; title: string }[];
    suggestions: { file: string; line: number; severity: string; explanation: string }[];
    error?: string;
  } | null;
  verifiers: VerifierRun[];
};

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
}

function loadFixture(merge: string) {
  const diff = git(["diff", `${merge}^1`, `${merge}^2`]);
  const title = git(["log", "-1", "--format=%s", `${merge}^2`]).trim();
  const description = git(["log", "-1", "--format=%b", `${merge}^2`]).trim();

  let additions = 0;
  let deletions = 0;
  let changedFiles = 0;
  for (const line of git(["diff", "--numstat", `${merge}^1`, `${merge}^2`]).split("\n")) {
    if (!line.trim()) continue;
    changedFiles += 1;
    const [add, del] = line.split("\t");
    additions += Number.parseInt(add, 10) || 0; // binary는 "-"
    deletions += Number.parseInt(del, 10) || 0;
  }

  return { diff, title, description, additions, deletions, changedFiles };
}

function emptyCounts(): VerdictCounts {
  return { CONFIRMED: 0, UNCERTAIN: 0, REJECTED: 0 };
}

function tally(entries: { verdict: keyof VerdictCounts }[]): VerdictCounts {
  const counts = emptyCounts();
  for (const e of entries) counts[e.verdict] += 1;
  return counts;
}

async function generate(
  fixture: ReturnType<typeof loadFixture>,
  sizeMode: ReviewSizeMode,
): Promise<StructuredReviewOutput> {
  const prompt = buildStructuredPrompt({
    title: fixture.title,
    description: fixture.description,
    diff: fixture.diff,
    deterministicContext: "", // 위 주석 ⚠️1 참조
    langCode: LANG_CODE,
    sizeMode,
    changedFilesSummary: parseDiffToChangedFiles(fixture.diff),
    maxSuggestions: null,
  });

  const { experimental_output } = await generateText({
    model: google(GENERATOR_MODEL),
    experimental_output: Output.object({ schema: structuredReviewSchema }),
    prompt,
    abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  const parsed = structuredReviewSchema.safeParse(experimental_output);
  if (!parsed.success) {
    throw new Error(`generation re-validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

function pct(n: number, total: number): string {
  return total === 0 ? "—" : `${((n / total) * 100).toFixed(1)}%`;
}

function short(verdict: string): string {
  return verdict === "CONFIRMED" ? "C" : verdict === "UNCERTAIN" ? "U" : "R";
}

describe.skipIf(!process.env.CALIBRATION)("verifier calibration", () => {
  it(
    "compares verifier models on identical generated output",
    async () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const results: FixtureResult[] = [];

      console.log(`\n검수 모델 비교: ${VERIFIER_MODELS.join("  vs  ")}`);
      console.log(`생성 모델: ${GENERATOR_MODEL} (fixture당 1회, 모든 검수자가 동일 산출물 공유)`);

      for (const { merge, label } of FIXTURES) {
        const fixture = loadFixture(merge);
        const sizeMode = classifyPRSize({
          additions: fixture.additions,
          deletions: fixture.deletions,
          changedFiles: fixture.changedFiles,
        });

        const result: FixtureResult = {
          label,
          merge,
          sizeMode,
          stats: {
            additions: fixture.additions,
            deletions: fixture.deletions,
            changedFiles: fixture.changedFiles,
            diffChars: fixture.diff.length,
          },
          generation: null,
          verifiers: [],
        };

        console.log(
          `\n=== ${label} (${merge}) | ${sizeMode} | ${fixture.changedFiles} files, ${fixture.diff.length} chars`,
        );

        let output: StructuredReviewOutput | null = null;
        try {
          output = await generate(fixture, sizeMode);
          result.generation = {
            model: GENERATOR_MODEL,
            issues: output.issues.map((i) => ({
              severity: i.severity,
              category: i.category,
              file: i.file,
              title: i.title,
            })),
            suggestions: output.suggestions.map((s) => ({
              file: s.file,
              line: s.line,
              severity: s.severity,
              explanation: s.explanation,
            })),
          };
          console.log(
            `  생성: ${output.issues.length} issues, ${output.suggestions.length} suggestions`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          result.generation = { model: GENERATOR_MODEL, issues: [], suggestions: [], error: msg };
          console.log(`  생성 FAILED — ${msg}`);
        }

        if (output && (output.issues.length > 0 || output.suggestions.length > 0)) {
          for (const model of VERIFIER_MODELS) {
            verifierModel.current = model;
            const started = Date.now();
            try {
              const v = await verifyReview({
                diff: fixture.diff,
                issues: output.issues,
                suggestions: output.suggestions,
                langCode: LANG_CODE,
              });
              const elapsedMs = Date.now() - started;

              const rejected: RejectedEntry[] = [];
              v.issueVerdicts.forEach((entry, i) => {
                if (entry.verdict === "REJECTED") {
                  rejected.push({
                    kind: "issue",
                    label: output!.issues[i]?.title ?? `#${i}`,
                    reason: entry.reason,
                  });
                }
              });
              v.suggestionVerdicts.forEach((entry, i) => {
                if (entry.verdict === "REJECTED") {
                  const s = output!.suggestions[i];
                  rejected.push({
                    kind: "suggestion",
                    label: s ? `${s.file}:${s.line}` : `#${i}`,
                    reason: entry.reason,
                  });
                }
              });

              const run: VerifierRun = {
                model,
                issueVerdicts: tally(v.issueVerdicts),
                suggestionVerdicts: tally(v.suggestionVerdicts),
                issueSeq: v.issueVerdicts.map((e) => short(e.verdict)),
                suggestionSeq: v.suggestionVerdicts.map((e) => short(e.verdict)),
                rejected,
                elapsedMs,
              };
              result.verifiers.push(run);

              console.log(
                `  ${model.padEnd(24)} i[${run.issueSeq.join("")}] s[${run.suggestionSeq.join("")}]  ${(elapsedMs / 1000).toFixed(1)}s`,
              );
              for (const r of rejected) {
                console.log(`      ✗ [${r.kind}] ${r.label}`);
                console.log(`         → ${r.reason}`);
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              result.verifiers.push({
                model,
                issueVerdicts: emptyCounts(),
                suggestionVerdicts: emptyCounts(),
                issueSeq: [],
                suggestionSeq: [],
                rejected: [],
                error: msg,
                elapsedMs: Date.now() - started,
              });
              console.log(`  ${model.padEnd(24)} FAILED — ${msg}`);
            }
          }
        }

        results.push(result);
        writeFileSync(
          path.join(OUT_DIR, "compare.json"),
          JSON.stringify(results, null, 2),
          "utf8",
        );
      }

      // ── 모델별 집계 ──
      const lines: string[] = [
        "",
        "══════════════════════════════════════════════════════════════",
        "  검수 모델 비교 결과",
        "══════════════════════════════════════════════════════════════",
      ];

      for (const model of VERIFIER_MODELS) {
        const runs = results.flatMap((r) => r.verifiers.filter((v) => v.model === model));
        const ok = runs.filter((r) => !r.error);
        const totals = emptyCounts();
        for (const run of ok) {
          for (const k of ["CONFIRMED", "UNCERTAIN", "REJECTED"] as const) {
            totals[k] += run.issueVerdicts[k] + run.suggestionVerdicts[k];
          }
        }
        const total = totals.CONFIRMED + totals.UNCERTAIN + totals.REJECTED;
        const avgMs = ok.length ? ok.reduce((s, r) => s + r.elapsedMs, 0) / ok.length : 0;

        lines.push(
          "",
          `  ${model}`,
          `    실패      : ${runs.length - ok.length}/${runs.length} fixture`,
          `    CONFIRMED : ${totals.CONFIRMED} (${pct(totals.CONFIRMED, total)})`,
          `    UNCERTAIN : ${totals.UNCERTAIN} (${pct(totals.UNCERTAIN, total)})`,
          `    REJECTED  : ${totals.REJECTED} (${pct(totals.REJECTED, total)})`,
          `    평균 소요 : ${(avgMs / 1000).toFixed(1)}s`,
        );
      }

      // ── 모델 간 판정 일치도 (2개일 때만) ──
      if (VERIFIER_MODELS.length === 2) {
        const [m1, m2] = VERIFIER_MODELS;
        let agree = 0;
        let compared = 0;
        for (const r of results) {
          const a = r.verifiers.find((v) => v.model === m1);
          const b = r.verifiers.find((v) => v.model === m2);
          if (!a || !b || a.error || b.error) continue;
          const seqA = [...a.issueSeq, ...a.suggestionSeq];
          const seqB = [...b.issueSeq, ...b.suggestionSeq];
          if (seqA.length !== seqB.length) continue;
          seqA.forEach((v, i) => {
            compared += 1;
            if (v === seqB[i]) agree += 1;
          });
        }
        lines.push(
          "",
          `  판정 일치도 (${m1} vs ${m2})`,
          `    ${agree}/${compared} (${pct(agree, compared)})`,
        );
      }

      lines.push("══════════════════════════════════════════════════════════════");
      console.log(lines.join("\n"));
      writeFileSync(path.join(OUT_DIR, "compare-summary.txt"), lines.join("\n"), "utf8");
      console.log(`\n상세: ${path.join(OUT_DIR, "compare.json")}`);
    },
    { timeout: 1_800_000 },
  );
});
