export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_OUTPUT_DIMENSION = 768;
export const GITHUB_PROVIDER_ID = "github";

// 반복 실수 감지 (wedge) — Track A 캘리브레이션 결과 반영
export const REPEAT_SIMILARITY_THRESHOLD = 0.9; // Track A: 0.90에서 FP 5.1%. category-primary 2차 결과(0.88 PASS) 확인 후 하향 검토
export const REPEAT_WINDOW_DAYS = 90;
export const REPEAT_MIN_TEXT_LENGTH = 20; // 빈/짧은 텍스트 임베딩 방지 (sim=1.0 인공물)

// 리뷰 검증(검수자) — 생성 모델(gemini-2.5-flash) 산출물을 팩트체크.
// 같은 Gemini 계열이므로 독립 검증은 아니다.
//
// 2026-08-10 교체: 이전 값 "gemini-2.5-pro"는 현 API 키에서 generateContent가
// 거부한다("no longer available to new users"). ListModels에는 여전히 나오고
// 폐기 페이지에도 "No shutdown date announced"로 표시되므로 목록·문서만으로는
// 잡히지 않는다. 그동안 verifyReview()는 매번 throw → review.ts의 fail-open으로
// status:"skipped" 처리되어, 검증이 사실상 미동작 상태였다.
//
// 선정 근거(scripts/verify-calibration.test.ts, fixture 4개 / 검증된 오탐 5건):
//   2.5-flash-lite  recall 0/5   $0.0015/리뷰   ← 오탐을 거의 통과시킴
//   3.1-flash-lite  recall 4/5   $0.0036/리뷰   ← 채택
//   3.5-flash-lite  recall 3/5   $0.0051/리뷰
//   3.1-pro-preview recall 5/5   $0.0963/리뷰   ← thinking 5.3k토큰, 과잉 거부(60.7%)
//
// ⚠️ preview 모델을 넣지 말 것 — gemini-2.5-pro, gemini-3-pro-preview 모두 사라졌다.
// ⚠️ "-latest" 별칭도 금지 — 가리키는 모델이 바뀌면 위 측정이 무효가 된다.
export const VERIFIER_MODEL_ID = "gemini-3.1-flash-lite";

export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./review-emoji";
