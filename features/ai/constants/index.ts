export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_OUTPUT_DIMENSION = 768;
export const EMBEDDING_CONTENT_MAX_LENGTH = 8000;
export const PINECONE_BATCH_SIZE = 100;
export const DEFAULT_TOP_K = 5;
export const GITHUB_PROVIDER_ID = "github";

// 반복 실수 감지 (wedge) — Track A 캘리브레이션 결과 반영
export const REPEAT_SIMILARITY_THRESHOLD = 0.9; // Track A: 0.90에서 FP 5.1%. category-primary 2차 결과(0.88 PASS) 확인 후 하향 검토
export const REPEAT_WINDOW_DAYS = 90;
export const REPEAT_MIN_TEXT_LENGTH = 20; // 빈/짧은 텍스트 임베딩 방지 (sim=1.0 인공물)

// 리뷰 검증(검수자) — 생성 모델(gemini-2.5-flash)보다 강한 모델이 산출물을 팩트체크.
// 같은 Gemini 계열이므로 독립 검증은 아님 — "강한 모델이 약한 모델을 검수"하는 구조.
export const VERIFIER_MODEL_ID = "gemini-2.5-pro";

export { CATEGORY_EMOJI, SEVERITY_EMOJI } from "./review-emoji";
