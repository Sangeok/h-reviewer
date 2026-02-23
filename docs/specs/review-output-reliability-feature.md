# 리뷰 출력 안정성 개선

## 문서 상태
- 상태: `TODO` (2026-02-22)
- 범위: `inngest/functions/review.ts`, `module/github/lib/github-markdown.ts`, `module/github/lib/github.ts`, `module/ai/lib/*` (신규), `module/github/lib/mermaid-validator.ts` (신규), `shared/constants/index.ts`
- 목표: AI 리뷰 출력 품질 및 Mermaid 렌더링 안정성 확보
- 범위 외: `inngest/functions/summary.ts` (SUMMARY 타입은 Mermaid 미사용, phase 1에서 size policy 미적용)

---

## 문제 요약

현재 리뷰 출력에 두 가지 실패가 반복 발생한다:
1. Mermaid 시퀀스 다이어그램이 GitHub에서 깨짐 (`Unable to render rich display`).
2. 작은 PR 리뷰가 지나치게 장황하고 유용한 정보가 적음.

관찰된 증상:
- message/note 텍스트에 안전하지 않은 문자가 포함되거나 자유 형식 구문이 사용될 때 Mermaid 파싱 에러 발생.

---

## 근본 원인

1. **Sanitizer가 너무 좁다.**
   - `activate/deactivate`와 화살표 `+/-`만 제거.
   - label 텍스트 정규화나 최종 Mermaid 구조 검증을 하지 않음.

2. **프롬프트가 자유 형식 Mermaid 생성을 허용한다.**
   - participant id, 화살표, message 텍스트, note에 대한 엄격한 스키마가 없음.

3. **포스팅 전 검증/fallback 게이트가 없다.**
   - 유효하지 않은 Mermaid가 그대로 GitHub 코멘트에 게시됨.

4. **PR 크기와 무관하게 고정 7섹션 템플릿을 사용한다.**
   - 작은 PR에도 반복적인 프로세스 코멘트가 포함되어 신호 대 잡음 비율이 낮음.

5. **대규모 PR에 대한 처리가 없다.**
   - 500줄 이상의 대규모 diff는 모델 컨텍스트 윈도우를 초과하거나 저품질 리뷰를 생성할 수 있음.

6. **Fallback 텍스트가 영어 전용이다.**
   - 한국어 리뷰에 영어 fallback 메시지가 삽입되면 i18n 일관성이 깨짐.

---

## 해결 전략

3단계 가드레일 적용:
1. **생성 제어**: 프롬프트에서 Mermaid 출력 형식을 제약.
2. **후처리 제어**: sanitize + validate.
3. **전달 제어**: 유효하지 않으면 다이어그램 섹션을 fallback 텍스트로 교체.

추가로 비례적 리뷰 모드 (`tiny`, `small`, `normal`, `large`)를 도입하여 잡음을 줄이고 엣지 케이스를 처리한다. fallback 텍스트는 지원 언어별로 현지화한다.

---

## 상세 계획

### 1) 프롬프트 하드닝

**대상**: `inngest/functions/review.ts`

**변경 사항**:
1. 프롬프트에 엄격한 Mermaid 서브셋 강제:
   - `sequenceDiagram`만 허용
   - participant id: `[a-zA-Z0-9_]+`
   - message/note/label 텍스트: 백틱, 따옴표, 중괄호, 대괄호, 세미콜론, 꺾쇠괄호 금지. 소괄호는 메서드 호출(`getData()`)에 빈번하므로 허용. 한국어 등 모든 Unicode 문자·숫자는 허용.
   - 프롬프트는 1차 방어(AI에게 위험 문자 사용 자제 요청), sanitizer는 2차 방어(실제 제거). 프롬프트가 sanitizer보다 더 보수적일 수 있음.
   - 허용 제어 구조: `loop/end`, `alt/else/end`, `opt/end`, `autonumber`

2. 명시적 생략 규칙 추가:
   - 유효한 다이어그램이 불확실하면 `Diagram omitted` 출력.

3. PR 크기 적응형 지시 추가:
   - `tiny|small|normal|large` 모드를 프롬프트에 주입 (섹션 4 참조).

**구현 참고**:
- GitHub API 필드 (`pr.additions`, `pr.deletions`, `pr.changed_files`)를 `pulls.get` 응답에서 활용.
- `changed_lines = additions + deletions`으로 정의.
- `module/github/lib/github.ts`의 `getPullRequestDiff()`에서 `{ additions, deletions, changedFiles }`를 기존 필드와 함께 반환하도록 수정.
- Inngest 함수에서 `fetch-pr-data` 스텝 이후, `generate-context` 스텝 이전에 size 모드 계산.

#### 코드 수정 예시: `inngest/functions/review.ts`

**현재 코드** (line 53-74):
```typescript
const prompt = `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.${languageInstruction}
  PR Title: ${title}
  PR Description: ${description || "No description provided"}
  // ... (기존 프롬프트)
  2. **${headers.sequenceDiagram}**: A Mermaid JS sequence diagram visualizing the flow of the changes (if applicable). Use \`\`\`mermaid ... \`\`\` block. **IMPORTANT**: Ensure the Mermaid syntax is valid on GitHub. Do NOT use Mermaid activation controls (no \`activate\`, \`deactivate\`, and no \`+\` or \`-\` on arrows like \`->>+\` or \`-->>-\`). Also avoid special characters (quotes, braces, parentheses) inside Note text or labels as it can break rendering. Keep the diagram simple.
  // ...
`;
```

**수정 후**:
```typescript
// ── 프롬프트에 Mermaid 하드닝 지시 추가 ──
const mermaidInstruction = `
If you include a Mermaid sequence diagram, follow these rules STRICTLY:
- Use ONLY \`sequenceDiagram\` type.
- participant ids must match [a-zA-Z0-9_]+ only.
- In message, note, and label text: NEVER use backticks (\`), quotes (" '), braces ({ }), brackets ([ ]), semicolons (;), or angle brackets (< >). Parentheses are OK. Unicode letters (Korean, etc.) and digits are allowed.
- Allowed control structures: loop/end, alt/else/end, opt/end, autonumber.
- Do NOT use activate/deactivate or +/- on arrows.
- If you are uncertain about the Mermaid syntax validity, output "Diagram omitted" instead.`;

// ── size 모드별 섹션 정책을 프롬프트에 주입 ──
const sectionInstruction = buildSectionInstruction(sizeMode, headers);

const prompt = `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.${languageInstruction}

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
```

---

### 2) Mermaid Sanitizer 강화

**대상**: `module/github/lib/github-markdown.ts`

**변경 사항**:
1. 구조적 정리로 sanitizer 확장:
   - participant id를 안전한 식별자로 정규화
   - Mermaid 본문 내 인라인 코드 펜스/백틱 제거
   - message/note label에서 위험 문자(백틱, 따옴표, 중괄호, 대괄호, 세미콜론, 꺾쇠괄호) 제거. 소괄호는 허용. 한국어 등 모든 Unicode 텍스트는 보존.
   - 멀티라인 label을 단일 라인으로 축소

2. `sequenceDiagram`용 라인 레벨 validator 추가 (`module/github/lib/mermaid-validator.ts`로 분리):

   허용 라인 패턴:
   - `sequenceDiagram`
   - `participant <ID> [as <LABEL>]`
   - `actor <ID> [as <LABEL>]`
   - `<ID><ARROW><ID>: <MESSAGE>` (화살표: `->>`, `-->>`, `->`, `-->`, `-x`, `--x`, `-)`, `--)`)
   - `Note over <ID>[,<ID>]: <TEXT>`
   - `Note right of <ID>: <TEXT>` / `Note left of <ID>: <TEXT>`
   - `loop <TEXT>` / `end`
   - `alt <TEXT>` / `else [<TEXT>]` / `end`
   - `opt <TEXT>` / `end`
   - `autonumber`
   - `%% <COMMENT>`
   - 빈 줄/공백만 있는 줄

3. 무결성 검사 추가:
   - 최소 2개 participant
   - 최소 1개 화살표 라인
   - 허용 패턴에 매칭되지 않는 미인식 라인 없음

4. Sanitizer 계약:
   - `sequenceDiagram` 선언, 모든 유효 participant 라인, 모든 유효 화살표 라인은 **반드시** 보존.
   - Note 라인과 미인식 라인은 제거/단순화 **가능**.
   - participant를 제거하는 경우 해당 participant를 참조하는 화살표 라인도 함께 제거.
   - 무결성 검사 최소치 이하로 다이어그램을 축소해서는 **안 됨**.

5. 실패 시:
   - Mermaid 블록을 제거하고 현지화된 fallback 텍스트 삽입.

   Fallback (현지화):
   - en: `Sequence diagram omitted due to Mermaid safety validation.`
   - ko: `Mermaid 검증으로 인해 시퀀스 다이어그램이 생략되었습니다.`
   - `shared/constants/index.ts`에 `DIAGRAM_FALLBACK_TEXT`를 `SECTION_HEADERS`와 함께 추가.

#### 코드 수정 예시: `module/github/lib/github-markdown.ts`

**현재 코드** (전체):
```typescript
export function sanitizeMermaidSequenceDiagrams(markdown: string): string {
  return markdown.replace(/```mermaid\s*\n([\s\S]*?)\n```/g, (fullMatch, mermaidBody: string) => {
    if (!/^\s*sequenceDiagram\b/m.test(mermaidBody)) {
      return fullMatch;
    }

    const sanitizedBody = mermaidBody
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("activate ")) return false;
        if (trimmed.startsWith("deactivate ")) return false;
        return true;
      })
      .map((line) =>
        line.replace(/(->>|-->>|->|-->)[ \t]*[+-]/g, "$1")
      )
      .join("\n");

    return `\`\`\`mermaid\n${sanitizedBody}\n\`\`\``;
  });
}
```

**수정 후**:
```typescript
import { validateMermaidSequenceDiagram } from "./mermaid-validator";
import { DIAGRAM_FALLBACK_TEXT } from "@/shared/constants";
import type { LanguageCode } from "@/module/settings/constants";

/** 위험 문자 패턴 - Unicode 텍스트(한국어 등)는 허용, 구문 파괴 문자만 금지. 소괄호는 메서드 호출에 빈번 사용되므로 허용, 대괄호는 Mermaid 노드 구문 파싱 위험으로 추가 */
const DANGEROUS_CHARS = /[`"'{};<>\[\]]/g;

/**
 * Mermaid 시퀀스 다이어그램 sanitize + validate 파이프라인.
 * 유효하지 않은 다이어그램은 현지화된 fallback 텍스트로 교체한다.
 */
export function sanitizeMermaidSequenceDiagrams(
  markdown: string,
  lang: LanguageCode = "en",
): string {
  return markdown.replace(
    /```mermaid\s*\n([\s\S]*?)\n```/g,
    (fullMatch, mermaidBody: string) => {
      // sequenceDiagram이 아닌 경우 원본 유지
      if (!/^\s*sequenceDiagram\b/m.test(mermaidBody)) {
        return fullMatch;
      }

      const sanitizedBody = mermaidBody
        .split(/\r?\n/)
        .filter((line) => {
          const trimmed = line.trimStart();
          // activate/deactivate 제거
          if (trimmed.startsWith("activate ")) return false;
          if (trimmed.startsWith("deactivate ")) return false;
          return true;
        })
        .map((line) => {
          // 화살표의 +/- 마커 제거
          let cleaned = line.replace(/(->>|-->>|->|-->)[ \t]*[+-]/g, "$1");
          // 위험 문자 제거 (sequenceDiagram 선언 라인과 주석 제외)
          const trimmed = cleaned.trimStart();
          if (
            trimmed !== "sequenceDiagram" &&
            !trimmed.startsWith("%%")
          ) {
            // HTML entity(&#NNN; 또는 &name;)를 임시 토큰으로 보호 후 위험 문자 제거
            cleaned = cleaned
              .replace(/&(#\d+|[a-zA-Z]+);/g, "§ENTITY§$1§END§")
              .replace(DANGEROUS_CHARS, "")
              .replace(/§ENTITY§(.*?)§END§/g, "&$1;");
          }
          // 멀티라인 label을 단일 라인으로 축소 (줄바꿈→공백)
          return cleaned.replace(/\\n/g, " ");
        })
        .join("\n");

      // validator로 최종 검증
      const { isValid, reason } = validateMermaidSequenceDiagram(sanitizedBody);

      if (!isValid) {
        const fallback = DIAGRAM_FALLBACK_TEXT[lang];
        return `> ${fallback}`;
      }

      return `\`\`\`mermaid\n${sanitizedBody}\n\`\`\``;
    },
  );
}
```

#### 신규 파일: `module/github/lib/mermaid-validator.ts`

```typescript
export interface MermaidValidationResult {
  isValid: boolean;
  reason: string | null;
}

// ── 허용 라인 패턴 정의 ──
const SAFE_ID = /[a-zA-Z0-9_]+/;
const ARROW = /(?:->>|-->>|->|-->|-x|--x|-\)|--\))/;

const LINE_PATTERNS: RegExp[] = [
  // sequenceDiagram 선언
  /^\s*sequenceDiagram\s*$/,
  // participant (as 별칭 포함)
  new RegExp(`^\\s*participant\\s+${SAFE_ID.source}(\\s+as\\s+.+)?\\s*$`),
  // actor (participant와 동일 구문)
  new RegExp(`^\\s*actor\\s+${SAFE_ID.source}(\\s+as\\s+.+)?\\s*$`),
  // 화살표 메시지: ID->>ID: 메시지
  new RegExp(
    `^\\s*${SAFE_ID.source}\\s*${ARROW.source}\\s*${SAFE_ID.source}\\s*:\\s*.+$`,
  ),
  // Note over ID[,ID]: TEXT
  new RegExp(
    `^\\s*Note\\s+over\\s+${SAFE_ID.source}(\\s*,\\s*${SAFE_ID.source})?\\s*:\\s*.+$`,
  ),
  // Note right of ID: TEXT / Note left of ID: TEXT
  new RegExp(
    `^\\s*Note\\s+(?:right|left)\\s+of\\s+${SAFE_ID.source}\\s*:\\s*.+$`,
  ),
  // 제어 구조
  /^\s*loop\s+.+$/,
  /^\s*alt\s+.+$/,
  /^\s*else(\s+.*)?$/,
  /^\s*opt\s+.+$/,
  /^\s*end\s*$/,
  // autonumber
  /^\s*autonumber\s*$/,
  // 주석
  /^\s*%%.*$/,
  // 빈 줄/공백
  /^\s*$/,
];

/**
 * Mermaid sequenceDiagram 라인 레벨 검증.
 * 모든 라인이 허용 패턴에 매칭되고, 무결성 조건을 만족해야 유효.
 */
export function validateMermaidSequenceDiagram(
  mermaidBody: string,
): MermaidValidationResult {
  const lines = mermaidBody.split(/\r?\n/);

  let participantCount = 0;
  let arrowCount = 0;
  const unknownLines: string[] = [];

  for (const line of lines) {
    const matched = LINE_PATTERNS.some((pattern) => pattern.test(line));

    if (!matched) {
      unknownLines.push(line);
      continue;
    }

    // participant/actor 카운트
    if (/^\s*(?:participant|actor)\s+/.test(line)) {
      participantCount++;
    }

    // 화살표 메시지에서 자동으로 participant 추론 (participant 선언 없이 사용 가능)
    const arrowMatch = line.match(
      new RegExp(
        `^\\s*(${SAFE_ID.source})\\s*${ARROW.source}\\s*(${SAFE_ID.source})`,
      ),
    );
    if (arrowMatch) {
      arrowCount++;
    }
  }

  // 무결성 검사
  if (unknownLines.length > 0) {
    return {
      isValid: false,
      reason: `미인식 라인 ${unknownLines.length}개 발견: "${unknownLines[0]}"`,
    };
  }

  // participant 선언이 없어도 화살표에서 추론하므로, 명시적 participant + 화살표 내 참여자 합산
  if (participantCount < 2 && arrowCount < 1) {
    return {
      isValid: false,
      reason: `participant ${participantCount}개, 화살표 ${arrowCount}개 - 최소 조건 미충족`,
    };
  }

  if (arrowCount < 1) {
    return {
      isValid: false,
      reason: "화살표 라인이 최소 1개 필요",
    };
  }

  return { isValid: true, reason: null };
}
```

---

### 3) 포스팅 전 검증 게이트

**대상**: `inngest/functions/review.ts`

**변경 사항**:
1. 포스팅 전:
   - `sanitizeMermaidSequenceDiagrams(reviewText, langCode)` 실행
   - validator (`isValid`, `reason`) 실행

2. 유효하지 않은 경우:
   - 시퀀스 다이어그램 섹션만 fallback으로 교체
   - 나머지 섹션은 그대로 유지

3. 검증 메타데이터를 Inngest 스텝 반환값으로 추가:
   - `{ diagramPresent: boolean, diagramValidationPassed: boolean | null, diagramFailureReason: string | null, sanitizerApplied: boolean, sizeMode: string }`
   - `diagramPresent`: Mermaid 블록 존재 여부. `diagramValidationPassed`: 다이어그램이 있을 때 검증 통과 여부 (없으면 `null`).
   - Inngest 대시보드에서 조회 가능하여 롤아웃 모니터링에 활용.
   - Phase 1에서는 DB 스키마 변경 불필요.
   - 참고: `validationMeta`는 이후 step에서 참조하지 않으나, Inngest 대시보드의 step output에 기록되어 모니터링 용도로 활용된다.

#### 코드 수정 예시: `inngest/functions/review.ts`

**현재 코드** (line 40-82):
```typescript
const review = await step.run("generate-ai-review", async () => {
  // ... 프롬프트 생성 ...
  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    prompt,
  });

  return sanitizeMermaidSequenceDiagrams(text);
});
```

**수정 후** (sanitize 분리 + 검증 게이트 추가):
```typescript
const rawReview = await step.run("generate-ai-review", async () => {
  // ... 프롬프트 생성 (sizeMode, mermaidInstruction 포함) ...
  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    prompt,
  });

  return text;
});

// ── 검증 게이트: sanitize → validate → fallback ──
const { review, validationMeta } = await step.run("validate-review", async () => {
  const sanitized = sanitizeMermaidSequenceDiagrams(rawReview, langCode);

  const hadMermaidBlock = /```mermaid/i.test(rawReview);
  const hasFallback =
    sanitized.includes(DIAGRAM_FALLBACK_TEXT.en) ||
    sanitized.includes(DIAGRAM_FALLBACK_TEXT.ko);

  return {
    review: sanitized,
    validationMeta: {
      diagramPresent: hadMermaidBlock,
      diagramValidationPassed: hadMermaidBlock ? !hasFallback : null,
      diagramFailureReason: hasFallback ? "diagram replaced with fallback" : null,
      sanitizerApplied: true,
      sizeMode,
    },
  };
});

await step.run("post-comment", async () => {
  await postReviewComment(token, owner, repo, prNumber, review);
});
```

---

### 4) 비례적 리뷰 모드

**대상**:
- `inngest/functions/review.ts`
- `module/ai/lib/review-size-policy.ts` (신규)
- `module/github/lib/github.ts` (수정 - PR 크기 필드 반환)

#### 크기 분류

GitHub API 필드 (`pr.additions + pr.deletions` = changed_lines, `pr.changed_files`) 사용:
- `tiny`: changed_lines <= 5 **AND** files <= 2
- `small`: changed_lines <= 30
- `normal`: changed_lines <= 500
- `large`: changed_lines > 500

#### 모드별 섹션 정책

| 섹션 | tiny | small | normal | large |
|------|------|-------|--------|-------|
| 요약 (Summary) | 2-3문장 | 포함 | 포함 | 포함 (핵심 파일 중심) |
| 변경 사항 상세 (Walkthrough) | 생략 | 간략 | 포함 | 상위 변경 10개 파일만 |
| 시퀀스 다이어그램 | 생략 | 선택적 | 포함 | 선택적 |
| 강점 (Strengths) | 생략 | 선택적 | 포함 | 포함 |
| 문제점 (Issues) | 최대 1개 (치명적 제외) | 포함 | 포함 | 포함 (우선순위 정렬) |
| 개선 제안 (Suggestions) | 최대 2개 | 포함 | 포함 | 상위 5개 |
| 마무리 시 (Poem) | 생략 | 생략 | 포함 | 생략 |

#### 프롬프트 주입

mode 문자열과 섹션 정책을 프롬프트에 주입한다. 포함되는 섹션의 다국어 헤더는 유지.

#### RAG 최적화

- `tiny`: RAG 컨텍스트 검색 **완전 생략**.
- `small`: `topK`를 2로 축소.
- `normal`/`large`: 현재 동작 유지 (topK: 5).

참고: size 계산은 Inngest 파이프라인에서 `generate-context` 스텝 **이전**에 수행해야 함.

#### `module/github/lib/github.ts` 변경

`getPullRequestDiff()`에서 기존 `pulls.get` API 호출 응답에 이미 존재하지만 반환하지 않던 `{ additions: number, deletions: number, changedFiles: number }`를 추가로 반환하도록 수정.

#### 신규 파일: `module/ai/lib/review-size-policy.ts`

```typescript
export type ReviewSizeMode = "tiny" | "small" | "normal" | "large";

export interface PRSizeInfo {
  additions: number;
  deletions: number;
  changedFiles: number;
}

/**
 * PR 크기에 따른 리뷰 모드를 결정한다.
 * changed_lines = additions + deletions
 */
export function classifyPRSize(info: PRSizeInfo): ReviewSizeMode {
  const changedLines = (info.additions ?? 0) + (info.deletions ?? 0);
  const files = info.changedFiles ?? 1;

  if (!Number.isFinite(changedLines)) return "normal";

  if (changedLines <= 5 && files <= 2) return "tiny";
  if (changedLines <= 30) return "small";
  if (changedLines <= 500) return "normal";
  return "large";
}

/**
 * size 모드에 따른 RAG topK 값을 반환한다.
 * tiny는 RAG를 건너뛰므로 0 반환.
 */
export function getTopKForSizeMode(mode: ReviewSizeMode): number {
  switch (mode) {
    case "tiny":
      return 0;  // RAG 완전 생략
    case "small":
      return 2;
    case "normal":
    case "large":
      return 5;  // 기본값 유지 (DEFAULT_TOP_K)
  }
}

/**
 * size 모드별 포함할 섹션 목록을 반환한다.
 */
export function getSectionPolicy(mode: ReviewSizeMode) {
  switch (mode) {
    case "tiny":
      return {
        summary: true,
        walkthrough: false,
        sequenceDiagram: false,
        strengths: false,
        issues: true,       // max 1 (치명적 제외)
        suggestions: true,  // max 2
        poem: false,
      };
    case "small":
      return {
        summary: true,
        walkthrough: true,  // 간략
        sequenceDiagram: false, // 선택적 → 기본 생략
        strengths: false,       // 선택적 → 기본 생략
        issues: true,
        suggestions: true,
        poem: false,
      };
    case "normal":
      return {
        summary: true,
        walkthrough: true,
        sequenceDiagram: true,
        strengths: true,
        issues: true,
        suggestions: true,
        poem: true,
      };
    case "large":
      return {
        summary: true,       // 핵심 파일 중심
        walkthrough: true,   // 상위 10개 파일만
        sequenceDiagram: false, // 선택적 → 기본 생략
        strengths: true,
        issues: true,        // 우선순위 정렬
        suggestions: true,   // 상위 5개
        poem: false,
      };
  }
}
```

#### 코드 수정 예시: `module/github/lib/github.ts` — `getPullRequestDiff()`

**현재 코드** (line 195-218):
```typescript
export async function getPullRequestDiff(token: string, owner: string, repo: string, prNumber: number) {
  const octokit = createOctokitClient(token);

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: "diff",
    },
  });

  return {
    title: pr.title,
    diff: diff as unknown as string,
    description: pr.body || "",
  };
}
```

**수정 후**:
```typescript
export async function getPullRequestDiff(token: string, owner: string, repo: string, prNumber: number) {
  const octokit = createOctokitClient(token);

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: "diff",
    },
  });

  return {
    title: pr.title,
    diff: diff as unknown as string,
    description: pr.body || "",
    // PR 크기 필드 추가 (pulls.get 응답에 이미 존재)
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
  };
}
```

#### 코드 수정 예시: `inngest/functions/review.ts` — 전체 흐름

**수정 후** (전체 파이프라인):
```typescript
import prisma from "@/lib/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/module/github/lib/github";
import { retrieveContext } from "@/module/ai";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { sanitizeMermaidSequenceDiagrams } from "@/module/github/lib/github-markdown";
import { getLanguageName, isValidLanguageCode } from "@/module/settings/constants";
import { SECTION_HEADERS, DIAGRAM_FALLBACK_TEXT } from "@/shared/constants";
import { classifyPRSize, getTopKForSizeMode, getSectionPolicy } from "@/module/ai/lib/review-size-policy";
import type { ReviewSizeMode } from "@/module/ai/lib/review-size-policy";
import type { LanguageCode } from "@/module/settings/constants";

/** size 모드별 프롬프트 섹션 지시문 생성 */
function buildSectionInstruction(
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

export const generateReview = inngest.createFunction(
  { id: "generate-review" },
  { event: "pr.review.requested" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, preferredLanguage = "en" } = event.data;

    // ── Step 1: PR 데이터 + 크기 정보 가져오기 ──
    const { diff, title, description, token, additions, deletions, changedFiles } =
      await step.run("fetch-pr-data", async () => {
        const account = await prisma.account.findFirst({
          where: { userId, providerId: "github" },
        });

        if (!account?.accessToken) {
          throw new Error("Github access token not found");
        }

        const data = await getPullRequestDiff(account.accessToken, owner, repo, prNumber);
        return { ...data, token: account.accessToken };
      });

    // ── Step 2: 크기 분류 + 언어 코드 (이후 모든 step에서 공유) ──
    const langCode = isValidLanguageCode(preferredLanguage) ? preferredLanguage : "en";
    const sizeMode = classifyPRSize({ additions, deletions, changedFiles });
    const topK = getTopKForSizeMode(sizeMode);

    // ── Step 3: RAG 컨텍스트 (tiny면 생략) ──
    const context = await step.run("generate-context", async () => {
      if (topK === 0) return []; // tiny: RAG 완전 생략

      const query = `${title}\n\n${description}`;
      return await retrieveContext(query, `${owner}/${repo}`, topK);
    });

    // ── Step 4: AI 리뷰 생성 ──
    const rawReview = await step.run("generate-ai-review", async () => {
      const headers = SECTION_HEADERS[langCode];

      const languageInstruction =
        langCode !== "en"
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

      const prompt = `You are an expert code reviewer.${languageInstruction}

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

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      return text;
    });

    // ── Step 5: 검증 게이트 (sanitize → validate → fallback) ──
    const { review, validationMeta } = await step.run("validate-review", async () => {
      const sanitized = sanitizeMermaidSequenceDiagrams(rawReview, langCode);

      const hadMermaidBlock = /```mermaid/i.test(rawReview);
      const hasFallback =
        sanitized.includes(DIAGRAM_FALLBACK_TEXT.en) ||
        sanitized.includes(DIAGRAM_FALLBACK_TEXT.ko);

      return {
        review: sanitized,
        validationMeta: {
          diagramPresent: hadMermaidBlock,
          diagramValidationPassed: hadMermaidBlock ? !hasFallback : null, // null = 다이어그램 없음
          diagramFailureReason: hasFallback ? "diagram replaced with fallback" : null,
          sanitizerApplied: true,
          sizeMode,
        },
      };
    });

    // ── Step 6: GitHub에 코멘트 게시 ──
    await step.run("post-comment", async () => {
      await postReviewComment(token, owner, repo, prNumber, review);
    });

    // ── Step 7: DB에 리뷰 저장 ──
    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      await prisma.review.create({
        data: {
          repositoryId: repository.id,
          prNumber,
          prTitle: title,
          prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          review,
          reviewType: "FULL_REVIEW",
          status: "completed",
        },
      });
    });

    return { success: true };
  },
);
```

#### 코드 수정 예시: `shared/constants/index.ts`

**현재 코드**:
```typescript
export const SECTION_HEADERS = {
  en: {
    walkthrough: "Walkthrough",
    sequenceDiagram: "Sequence Diagram",
    summary: "Summary",
    strengths: "Strengths",
    issues: "Issues",
    suggestions: "Suggestions",
    poem: "Poem",
  },
  ko: {
    walkthrough: "변경 사항 상세",
    sequenceDiagram: "시퀀스 다이어그램",
    summary: "요약",
    strengths: "강점",
    issues: "발견된 문제점",
    suggestions: "개선 제안",
    poem: "마무리 시",
  },
} as const;
```

**수정 후**:
```typescript
import type { LanguageCode } from "@/module/settings/constants";

export const SECTION_HEADERS = {
  en: {
    walkthrough: "Walkthrough",
    sequenceDiagram: "Sequence Diagram",
    summary: "Summary",
    strengths: "Strengths",
    issues: "Issues",
    suggestions: "Suggestions",
    poem: "Poem",
  },
  ko: {
    walkthrough: "변경 사항 상세",
    sequenceDiagram: "시퀀스 다이어그램",
    summary: "요약",
    strengths: "강점",
    issues: "발견된 문제점",
    suggestions: "개선 제안",
    poem: "마무리 시",
  },
} as const;

/** Mermaid 검증 실패 시 현지화된 fallback 텍스트. LanguageCode 추가 시 여기도 추가 필수. */
export const DIAGRAM_FALLBACK_TEXT: Record<LanguageCode, string> = {
  en: "Sequence diagram omitted due to Mermaid safety validation.",
  ko: "Mermaid 검증으로 인해 시퀀스 다이어그램이 생략되었습니다.",
};
```

---

### 5) 선택적 Phase 2 (필요 시)

Phase 1 이후에도 파서 실패가 계속되는 경우:
1. JSON 중간 형식으로 다이어그램 생성 전환:
   - 모델이 `participants[]`, `edges[]` 출력
   - 서버가 Mermaid를 결정론적으로 렌더링
2. 장점:
   - 자유 형식 모델 텍스트에서 발생하는 구문 드리프트 제거

---

## 파일 변경 계획

**신규 파일**:
- `module/ai/lib/review-size-policy.ts` — 크기 분류 (tiny/small/normal/large), 섹션 정책, RAG topK
- `module/github/lib/mermaid-validator.ts` — 라인 레벨 validator + 무결성 검사 + 실패 사유

**수정 파일**:
- `inngest/functions/review.ts` — size 기반 프롬프트 주입, 검증 게이트, RAG 최적화, 로깅, 기존 `qeury` 오타 → `query` 수정
- `module/github/lib/github-markdown.ts` — blocklist 확장 sanitizer, Unicode 지원, sanitizer 계약
- `module/github/lib/github.ts` — PR 크기 필드 반환 (additions, deletions, changedFiles)
- `module/ai/lib/index.ts` — barrel export에 `review-size-policy` 함수/타입 추가 (`classifyPRSize`, `getTopKForSizeMode`, `getSectionPolicy`, `ReviewSizeMode`, `PRSizeInfo`)
- `module/ai/index.ts` — barrel re-export 추가
- `shared/constants/index.ts` — `DIAGRAM_FALLBACK_TEXT` 현지화 상수 추가

Phase 1에서는 DB 스키마 변경 불필요.
검증 메타데이터는 Inngest 스텝 반환값으로 저장.

---

## 인수 기준

1. 깨진 Mermaid가 GitHub에 게시되지 않아야 함.
2. 20개 샘플 PR 실행에서 게시된 다이어그램이 정상 렌더링되어야 함.
3. 다이어그램 검증 실패 시 현지화된 fallback 텍스트가 게시되어야 함 (en/ko).
4. Tiny PR 출력은 요약 + 문제점 + 제안 3개 섹션만 포함해야 함.
5. Large PR 출력은 전체 diff가 아닌 주요 변경 파일에 집중해야 함.
6. 한국어 Mermaid 다이어그램 (Unicode label 포함)이 검증을 통과하고 정상 렌더링되어야 함.
7. 기존 언어 동작 (`en`, `ko`)이 변경되지 않아야 함.
8. Tiny PR에서 RAG 컨텍스트 검색이 생략되어야 함.

---

## 검증 계획

### 자동화:
1. sanitizer/validator 불량 케이스 단위 테스트:
   - label 내 백틱
   - note 내 따옴표/중괄호
   - 유효하지 않은 participant id
   - 무작위 미인식 Mermaid 라인

2. 타입/린트:
```bash
npx tsc --noEmit
npx eslint module/github/lib module/ai/lib inngest/functions/review.ts --max-warnings=0
```

3. 통합 테스트 (vitest):
   - sanitize → validate → fallback 파이프라인 (mock 입력)
   - 유효한 다이어그램이 변경 없이 통과하는지 확인
   - 유효하지 않은 다이어그램이 현지화된 fallback을 트리거하는지 확인
   - 한국어 Unicode label 다이어그램이 검증을 통과하는지 확인
   - tiny/small/normal/large 크기 분류 정확성 확인

### 수동:
1. Tiny PR (`+1 line`) 리뷰 생성 테스트.
2. Normal 멀티 파일 PR 리뷰 생성 테스트.
3. 한국어 리뷰 생성 테스트.
4. GitHub 렌더링 확인 (다이어그램 또는 fallback만 표시).

---

## 롤아웃 계획

1. Phase 1 배포 (validator + fallback 활성화).
2. 3일간 Inngest 대시보드(스텝 반환값)로 모니터링:
   - fallback 비율 (diagramValidationPassed = false 비율)
   - size 모드 분포 (tiny/small/normal/large)
   - tiny PR 평균 리뷰 길이
   - 사용자 보고 가독성 이슈
3. fallback 비율 > 10%이면 Phase 2 JSON 렌더러 실행.

---

## 위험 요소 및 완화 방안

1. **과도한 sanitization으로 세부 정보가 제거될 수 있음.**
   - 완화: 다이어그램 외 섹션은 보존하고 제거된 라인을 로깅.

2. **Validator 오판(false-negative)으로 유효한 다이어그램이 차단될 수 있음.**
   - 완화: 처음에는 허용적으로 시작하고 운영 로그에서 튜닝.

3. **프롬프트 하드닝으로 다이어그램 풍부함이 줄어들 수 있음.**
   - 완화: 다이어그램 섹션에만 엄격함을 적용.

4. **Blocklist가 새로운 위험 문자를 놓칠 수 있음.**
   - 완화: 배포 후 Mermaid 파싱 에러를 모니터링하고 발견 시 문자 추가.

5. **Large PR의 상위 10개 파일 선택 시 작은 파일의 중요 변경을 놓칠 수 있음.**
   - 완화: 절대 줄 수가 아닌 변경 밀도(change density) 기준으로 파일 우선순위 결정.

---

## 버전 이력

| 버전 | 날짜 | 변경 내용 |
| --- | --- | --- |
| 1.0 | 2026-02-22 | 초기 안정성 강화 계획 |
| 1.1 | 2026-02-23 | large PR 모드, blocklist sanitizer, 현지화 fallback, RAG 최적화, 모니터링 상세 추가 |
| 1.2 | 2026-02-23 | 전체 한글화 및 파일별 코드 수정 예시 추가 |
| 1.3 | 2026-02-23 | 코드예시 이슈 14건 수정: ARROW regex 확장(C1), Note 방향 패턴(C2), classifyPRSize NaN 방어(C3), barrel export 등록(C4), langCode 중복 제거(C5), DANGEROUS_CHARS 조정(S1/S2/S5), actor 지원(S3), HTML entity 보존(S4), validationMeta 용도 명시(M1), qeury 오타 수정 언급(M2), 빈 context 프롬프트 처리(M3), 타입 export 등록(M4) |
| 1.4 | 2026-02-23 | 2차 검증 이슈 수정: buildSectionInstruction 타입 에러 해결, 소괄호 정책 프롬프트/sanitizer/설명 일관성 확보, DIAGRAM_FALLBACK_TEXT를 Record<LanguageCode, string>으로 타입 연동, validationMeta에 diagramPresent 필드 추가 |
