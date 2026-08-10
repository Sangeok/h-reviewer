/**
 * 설정된 Google AI 모델이 실제로 호출 가능한지 확인한다.
 *
 * 왜 필요한가 (2026-08-10 사고):
 *   VERIFIER_MODEL_ID가 "gemini-2.5-pro"였고 이 모델은 API에서 거부되고 있었다
 *   ("no longer available to new users"). 그런데
 *     - ListModels 응답에는 여전히 나온다
 *     - 공식 폐기 페이지에도 "No shutdown date announced"로 표시된다
 *   즉 목록·문서로는 탐지 불가하고, 실제 호출만이 진실을 말한다.
 *   그동안 verifyReview()는 매번 throw → review.ts의 fail-open으로 조용히
 *   status:"skipped" 처리되어, 검증 기능이 3주간 미동작인 채 방치됐다.
 *
 * 판정 정책 — "모델이 죽었다"만 빌드를 막는다:
 *   FAIL  : 404 / "no longer available" / "not found" / "not supported"
 *           → 모델 ID가 더 이상 유효하지 않다. 코드 수정이 필요하다.
 *   WARN  : 429 / 5xx / 네트워크 / 타임아웃 / 인증 오류
 *           → 일시적이거나 환경 문제. 배포를 막지 않는다.
 *   SKIP  : API 키 없음 → 검사 불가(부재는 죽음의 증거가 아니다)
 *
 * 실행:
 *   node scripts/check-model-availability.mjs
 *   CHECK_MODELS_SOFT=1  → 죽은 모델도 exit 0 (긴급 배포용 탈출구)
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const CONSTANTS_PATH = path.join("features", "ai", "constants", "index.ts");
const TIMEOUT_MS = 20_000;
const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 모델 ID가 죽었음을 뜻하는 신호. 이 경우에만 빌드를 막는다. */
const DEAD_MODEL_SIGNALS = [
  "no longer available",
  "is not found",
  "not found",
  "not supported",
  "does not exist",
];

/** constants/index.ts에서 `export const X_MODEL_ID = "..."`를 뽑는다.
 *  .mjs라 TS를 import할 수 없어 소스를 파싱한다 — 상수 이름이 바뀌면 여기도 바뀐다. */
function readModelIds() {
  const source = readFileSync(CONSTANTS_PATH, "utf8");
  const found = [];
  const pattern = /export const (\w*MODEL_ID)\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    found.push({ constant: match[1], model: match[2] });
  }
  return found;
}

/** 임베딩 모델은 generateContent가 아니라 embedContent를 쓴다. */
function buildProbe(constant, model) {
  if (constant.includes("EMBEDDING")) {
    return {
      url: `${API_ROOT}/${model}:embedContent`,
      body: { content: { parts: [{ text: "ping" }] } },
    };
  }
  return {
    url: `${API_ROOT}/${model}:generateContent`,
    body: {
      contents: [{ parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 1 },
    },
  };
}

async function probe(constant, model, apiKey) {
  const { url, body } = buildProbe(constant, model);

  let response;
  try {
    response = await fetch(`${url}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // 네트워크·타임아웃 — 모델 상태를 알 수 없다
    return { level: "WARN", detail: `요청 실패: ${error?.message ?? error}` };
  }

  if (response.ok) return { level: "OK", detail: "" };

  let message = `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    if (payload?.error?.message) message = payload.error.message;
  } catch {
    // 본문 파싱 실패 시 status만 사용
  }

  const lowered = message.toLowerCase();
  const isDead =
    response.status === 404 || DEAD_MODEL_SIGNALS.some((s) => lowered.includes(s));

  return { level: isDead ? "FAIL" : "WARN", detail: message };
}

// Vercel 빌드에서는 env가 이미 주입돼 있다. 로컬 실행 편의를 위해 .env도 시도한다.
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: ".env.local", quiet: true });
    dotenv.config({ path: ".env", quiet: true });
  } catch {
    // dotenv 없거나 .env 없음 — 아래 SKIP 분기로 처리
  }
}

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  console.log("[check-models] SKIP — GOOGLE_GENERATIVE_AI_API_KEY 없음 (검사 불가)");
  process.exit(0);
}

const models = readModelIds();
if (models.length === 0) {
  console.error(`[check-models] FAIL — ${CONSTANTS_PATH}에서 *_MODEL_ID를 찾지 못했다.`);
  console.error("  상수 이름이 바뀌었다면 이 스크립트의 정규식도 함께 수정할 것.");
  process.exit(1);
}

const results = await Promise.all(
  models.map(async ({ constant, model }) => ({
    constant,
    model,
    ...(await probe(constant, model, apiKey)),
  })),
);

const icon = { OK: "✅", WARN: "⚠️ ", FAIL: "❌" };
for (const r of results) {
  const head = `[check-models] ${icon[r.level]} ${r.constant} = ${r.model}`;
  if (r.level === "OK") console.log(head);
  else console.log(`${head}\n    ${r.detail}`);
}

const dead = results.filter((r) => r.level === "FAIL");
if (dead.length === 0) {
  const warned = results.filter((r) => r.level === "WARN").length;
  console.log(
    `[check-models] 통과 — ${results.length}개 확인${warned ? `, ${warned}개 경고(일시적)` : ""}`,
  );
  process.exit(0);
}

console.error("");
console.error("[check-models] ❌ 사용할 수 없는 모델이 있다:");
for (const r of dead) {
  console.error(`  ${r.constant} = ${r.model}`);
  console.error(`    ${r.detail}`);
}
console.error("");
console.error(`  ${CONSTANTS_PATH}에서 모델 ID를 교체할 것.`);
console.error("  후보 선정은 scripts/verify-calibration.test.ts로 측정할 수 있다.");
console.error("  preview 모델과 '-latest' 별칭은 피할 것 — 예고 없이 사라지거나 바뀐다.");

if (process.env.CHECK_MODELS_SOFT) {
  console.error("");
  console.error("[check-models] CHECK_MODELS_SOFT 설정됨 — 실패를 무시하고 계속한다.");
  process.exit(0);
}
process.exit(1);
