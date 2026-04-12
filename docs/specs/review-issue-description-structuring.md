# Review 이슈 description 구조화 명세

> **작성일**: 2026-04-10
> **개정일**: 2026-04-11 — 스키마 완화(`impact`/`recommendation` `.default("")`), 방어적 guard, title dedup, `file` 부착 드롭 리스크, 롤백 §6.1 정정 반영
> **2차 개정**: 2026-04-11 — save-review shape guard(`schemaVersion` 오염 방지, §3.9/§8.9), title dedup 문장 경계 강화(§3.5-3.7/§8.8), body 빈값 skip guard, `body` 80단어 상한 복원(§3.2/§3.8), large 모드 출력 토큰 예산 경고(§3.8/§5.2), Gemini `.default()` 실제 동작 E2E 검증(§5.1), `resolveToDiffPath` drop 로그 구조화(§3.8)
> **상태**: Draft
> **관련 파일**: `module/ai/lib/review-schema.ts`, `module/ai/lib/review-formatter.ts`, `module/ai/lib/review-prompt.ts`, `module/ai/types/suggestion.ts`, `module/github/lib/pr-review.ts`, `module/review/ui/parts/structured-review-body.tsx`, `app/dashboard/reviews/[id]/page.tsx`, `inngest/functions/review.ts`, `shared/constants/index.ts`

---

## 1. 문제 정의

### 1.1 관찰된 증상

GitHub에 포스팅된 PR Review의 **`발견된 문제점(Issues)`** 섹션이 한 덩어리의 벽돌 문단(wall of text)으로 렌더링된다. 아래 결함 표는 스펙 작성 시점에 프로덕션 PR 리뷰 3건을 직접 확인하여 정리한 것이다 (스크린샷은 레포지토리에 커밋되지 않음).

| # | 결함 | 증거 (프로덕션 PR 리뷰 직접 확인) |
|---|------|----------|
| 1 | 제목 문장과 본문이 구분자 없이 붙어버림 | `...모호성 및 일관성 부족명세 문서에서...` — "부족"(제목 끝)과 "명세"(본문 시작) 사이에 공백·개행·마침표가 전무 |
| 2 | 한 덩어리 문단화 | 첫 문장 → 서술 → `Impact:` → `Recommendation:`이 전부 단일 문단으로 연속 흐름. 줄바꿈 0개 |
| 3 | `Impact` / `Recommendation` 라벨이 볼드·개행 없이 본문 내 평문으로 박힘 | 스캔 불가. 본문과 시각적 구분 없음 |
| 4 | 헤딩에 이슈 고유 제목 부재 | `### ⚠️ WARNING · 🔀 design` 만 표시 → 이슈 주제가 본문 첫 구절에 숨어 있음 |
| 5 | 단일 파일 이슈가 `file: null`로 잘못 분류 | 첫 WARNING은 `module/github/lib/diff-parser.ts`의 `unescapeGitPath` 로직을 직접 거론하지만 헤딩에 파일 경로 없음 |

### 1.2 사용자 영향

- **스캔 불가**: 리뷰어가 이슈의 요지를 30초 내에 파악할 수 없음. Impact/Recommendation이 본문에 묻혀서 의사결정 직결 정보가 전달되지 않음.
- **신뢰도 저하**: 프로덕트의 핵심 산출물(AI 리뷰)이 "대충 만든 출력"처럼 보임. hreviewer의 상품성 직접 훼손.
- **재사용성 저하**: 팀원이 PR 본문을 복사하여 이슈 트래커에 붙여넣을 때 구조 재구성 필요.

### 1.3 영향 범위

- `formatStructuredReviewToMarkdown()` — GitHub 리뷰 본문 생성 (`review-formatter.ts:74-83`)
- `formatIssueComment()` — GitHub 인라인 이슈 코멘트 생성 (`pr-review.ts:111-113`)
- `RemainingMarkdownSections()` — 웹앱 내 리뷰 렌더링 (`structured-review-body.tsx:167-178`) — **동일 로직 중복**
- `structuredReviewSchema.issues` — AI 출력 검증 스키마 (`review-schema.ts:70-79`)
- `StructuredIssue` 타입 (`types/suggestion.ts:18-24`)
- `buildStructuredPrompt()` — AI 프롬프트 구성 (`review-prompt.ts:130-144`)

---

## 2. 근본 원인 분석

### 2.1 증상 → 파이프라인 역추적

```
AI (Gemini) → structuredReviewSchema 검증 → review.ts → formatter.description.trim() → GitHub API
```

각 단계를 조사한 결과:

1. **프롬프트는 올바른 규칙을 지시하고 있다** (`review-prompt.ts:137-144`):
   ```
   - Each issue description MUST use structured markdown:
     - First line: one-sentence summary of the problem
     - If relevant, use bullet lists or bold labels to separate:
       - **Affected:** ...
       - **Impact:** ...
       - **Recommendation:** ...
     - Keep the total under 150 words per issue
     - Do NOT write everything in a single paragraph
   ```

2. **스키마는 `description`을 자유 문자열 단일 필드로 둔다** (`review-schema.ts:73`):
   ```ts
   description: z.string().describe("Clear description of the issue")
   ```
   → LLM이 지시를 어겨도 스키마 레벨에서 검증/복구할 수단이 전혀 없다.

3. **포매터는 `.trim()`만 하고 통째로 붙인다** (`review-formatter.ts:79-80`):
   ```ts
   const desc = i.description.trim();
   return `### ${sev} · ${cat}${fileTag}\n\n${desc}`;
   ```
   → 어떤 정상화·재구조화 로직도 없다.

4. **파이프라인 중간 단계에 description 변환이 없다**. `review.ts:175-224`는 `issue.file` resolve와 dedupe만 수행. `text-sanitizer.ts`의 `stripFencedCodeBlocks`도 description에는 적용되지 않는다.

### 2.2 핵심 결론

**"부족명세"는 GFM 렌더링 버그가 아니다.** GFM에서 단일 `\n`은 paragraph 내에서 공백으로 렌더링된다. 공백조차 없다는 것은 **AI 출력 문자열 자체에 구분자가 존재하지 않는다**는 의미다. 즉 LLM이 프롬프트 지시를 무시하고 다음과 같은 문자열을 반환하고 있다:

```
"core.quotepath=true 설정의 모호성 및 일관성 부족명세 문서에서 ... Impact: ... Recommendation: ..."
```

프롬프트는 상세하지만, **프롬프트만으로는 LLM의 포맷 준수가 보장되지 않는다**. 구조화 출력 경로(`generateText({ experimental_output: Output.object({ schema: structuredReviewSchema }) })` — `ai@5.0.115`)를 사용 중임에도 `description`이 자유 문자열 단일 필드라서 스키마가 아무런 강제력을 행사하지 못한다.

**→ 해결책: 스키마에서 이슈 description을 개별 필드로 분해하여 구조적으로 강제한다. 추가로 각 필드에 `.min(1)`을 걸어 빈 문자열 우회를 차단한다 (자세한 근거는 §3.2 참고).**

---

## 3. 개선 방안

### 3.1 설계 원칙

1. **스키마 레벨 강제**: 프롬프트에만 의존하지 말고 Zod 스키마로 각 요소를 독립 필드화한다.
2. **그레이스풀 폴백**: 기존 리뷰(`schemaVersion: 1`)는 `page.tsx`의 기존 fallback 경로를 통해 안전하게 마크다운으로 렌더된다. 수동 마이그레이션 불필요.
3. **듀얼 렌더 동기화**: GitHub용(`review-formatter.ts`)과 웹앱용(`structured-review-body.tsx`) 렌더 경로에 동일한 출력을 강제한다.
4. **라벨 일관성**: `Impact` / `Recommendation` 등의 라벨은 언어별 상수로 관리하여 다국어 리뷰에서도 포맷이 일관되게 유지되도록 한다.

### 3.2 스키마 구조화 (핵심 변경)

**변경 전** (`module/ai/lib/review-schema.ts:70-79`):

```ts
issues: z.array(z.object({
  file: z.string().nullable().describe("File path from diff, or null for project-level issues"),
  line: z.number().nullable().describe("Line number in new file, or null for file/project-level issues"),
  description: z.string().describe("Clear description of the issue"),
  severity: severitySchema,
  category: issueCategorySchema,
})).describe(
  "List of issues found. Use file+line for specific code issues, " +
  "file only for file-level issues, null for both for architectural/design issues."
),
```

**변경 후**:

```ts
issues: z.array(z.object({
  file: z.string().nullable().describe(
    "File path from diff. Use null ONLY when the issue spans 2+ files " +
    "or concerns cross-cutting architecture. Default to attaching the " +
    "most relevant single file."
  ),
  line: z.number().nullable().describe(
    "Line number in new file, or null for file/project-level issues"
  ),
  title: z.string().min(1).describe(
    "One-sentence headline (<=15 words, no trailing period). " +
    "Will be rendered as the issue's visual title. Do NOT duplicate this in body."
  ),
  body: z.string().min(1).describe(
    "Supporting explanation of the issue (2-4 sentences, <=80 words). " +
    "Describes WHAT the problem is. Do NOT include impact or recommendation here. " +
    "Do NOT pack multiple paragraphs into a single run-on sentence."
  ),
  impact: z.string().default("").describe(
    "Concrete consequence if unaddressed (1-2 sentences). " +
    "Who/what breaks, what regressions occur. " +
    "Empty string allowed for INFO-level observations where impact is self-evident."
  ),
  recommendation: z.string().default("").describe(
    "Actionable next step (1-2 sentences). " +
    "Start with an imperative verb (Add, Remove, Refactor, ...). " +
    "Empty string allowed when no concrete action applies (pure observation)."
  ),
  severity: severitySchema,
  category: issueCategorySchema,
})).describe(
  "List of issues found. Use file+line for specific code issues, " +
  "file only for file-level issues, null for both for architectural/design issues."
),
```

**결과**: LLM이 하나의 자유 문자열로 네 요소를 섞어 반환하는 것이 불가능해진다. `title`과 `body`에 걸린 `.min(1)`은 "제목 없음" / "설명 없음" 케이스를 차단한다. `impact` / `recommendation`은 `.default("")`이므로 LLM이 필드를 누락하거나 빈 값으로 반환하면 자동으로 빈 문자열이 채워지며, 포매터(§3.5) · 웹 렌더러(§3.6) · 인라인 코멘트(§3.7)에서 **빈 라벨을 시각적으로 스킵**한다.

**왜 4필드 전부가 아닌 2필드(`title` / `body`)에만 `.min(1)`을 거는가**:

초기안은 4필드 모두 `.min(1)`로 엄격 강제하는 것이었다. 그러나 이 경우 한 이슈에서 `impact` 또는 `recommendation`만 빈 문자열이어도 Zod 검증 전체가 실패하며, `ai` SDK의 `Output.object`가 `experimental_output = undefined`를 반환한다. `inngest/functions/review.ts:124`의 falsy 검사는 이를 fallback 신호로 해석하여 **walkthrough 테이블 · summary 카드 · strengths · suggestions 테이블까지 모두 평문 마크다운 fallback으로 퇴행한다**. 한 이슈의 한 필드 누락으로 전체 구조화 출력이 증발하는 fragile한 설계.

또한 INFO · SUGGESTION 수준의 가벼운 관찰형 이슈(예: "이 함수는 명시적 return이 없다")는 "영향"이나 "권장 조치"가 자연스럽지 않은 경우가 있다. `.min(1)` 강제는 LLM이 억지로 템플릿 답변을 만들게 하여 품질 저하를 유발한다.

`title` / `body`는 모든 이슈가 반드시 가져야 할 최소 요소(제목과 설명이 없으면 이슈를 표현할 수 없음)이므로 `.min(1)` 유지. `impact` / `recommendation`은 부가 정보이므로 누락을 허용하고, 포매터에서 조건부 렌더한다. (결정 근거 상세: §8.6)

검증 실패(title/body 누락)나 모델 수준 예외가 발생하는 경우에만 `ai` SDK가 `experimental_output = undefined` 또는 throw 처리하며, `inngest/functions/review.ts:108-142`의 try/catch + falsy 검사가 기존 마크다운 fallback 경로로 안전하게 내려보낸다.

### 3.3 타입 동기화

**`module/ai/types/suggestion.ts:18-24`**:

```ts
// 변경 전
export interface StructuredIssue {
  file: string | null;
  line: number | null;
  description: string;
  severity: SuggestionSeverity;
  category: IssueCategory;
}

// 변경 후
export interface StructuredIssue {
  file: string | null;
  line: number | null;
  title: string;
  body: string;
  impact: string;
  recommendation: string;
  severity: SuggestionSeverity;
  category: IssueCategory;
}
```

### 3.4 섹션 라벨 국제화

**`shared/constants/index.ts`**에 `ISSUE_FIELD_LABELS` 추가 (현재 `LanguageCode = "en" | "ko"`만 존재):

```ts
export const ISSUE_FIELD_LABELS = {
  en: { impact: "Impact", recommendation: "Recommendation" },
  ko: { impact: "영향", recommendation: "권장 조치" },
} as const satisfies Record<LanguageCode, { impact: string; recommendation: string }>;
```

> `satisfies Record<LanguageCode, ...>`로 선언하면, 향후 `LanguageCode`에 새 언어가 추가될 때 TypeScript가 컴파일 에러로 누락을 알려준다 (`SECTION_HEADERS`와 동일한 패턴을 따르되 타입 안전성을 한 단계 강화).

기존 `SECTION_HEADERS` 옆에 나란히 배치. **포매터(`review-formatter.ts`, `pr-review.ts`, `structured-review-body.tsx`)만 이 상수를 참조**한다. 프롬프트(`review-prompt.ts`)는 Zod 스키마의 필드명(`title`/`body`/`impact`/`recommendation`)을 그대로 사용하며 표시 라벨과 무관하므로 참조하지 않는다.

### 3.5 포매터 개편 — `review-formatter.ts`

**변경 전** (`review-formatter.ts:72-83`):

```ts
const bodyIssues = output.issues.filter(i => i.line === null);
if (bodyIssues.length > 0) {
  const items = bodyIssues.map(i => {
    const sev = `${SEVERITY_EMOJI[i.severity]} ${i.severity}`;
    const cat = `${CATEGORY_EMOJI[i.category]} ${i.category}`;
    const fileTag = i.file ? ` · \`${i.file}\`` : "";
    const desc = i.description.trim();
    return `### ${sev} · ${cat}${fileTag}\n\n${desc}`;
  }).join("\n\n");
  sections.push(`## ${headers.issues}\n\n${items}`);
}
```

**변경 후** (파일 상단 import에 `ISSUE_FIELD_LABELS`를 추가):

```ts
// 파일 상단
import { SECTION_HEADERS, ISSUE_FIELD_LABELS } from "@/shared/constants";
```

```ts
// formatStructuredReviewToMarkdown() 내부
const labels = ISSUE_FIELD_LABELS[langCode];
const bodyIssues = output.issues.filter(i => i.line === null);
if (bodyIssues.length > 0) {
  const items = bodyIssues.map(i => {
    const sev = `${SEVERITY_EMOJI[i.severity]} ${i.severity}`;
    const cat = `${CATEGORY_EMOJI[i.category]} ${i.category}`;
    const fileTag = i.file ? ` · \`${i.file}\`` : "";

    // 방어적 기본값:
    // (1) Inngest in-flight resume 시 구 shape(`description`만 존재)으로 memoize된
    //     step 결과가 새 코드로 흘러올 수 있다. title/body 누락 시에도 런타임 에러 대신
    //     최선-노력 렌더를 수행한다. 구 `description`은 body로 승격. (상세: §8.7)
    // (2) 새 스키마의 impact/recommendation은 `.default("")` 허용이므로 빈 값 가능.
    const title = (i.title ?? "").trim();
    const rawBody = (i.body ?? (i as { description?: string }).description ?? "").trim();
    const impact = (i.impact ?? "").trim();
    const recommendation = (i.recommendation ?? "").trim();

    // body가 title로 시작하면 중복 제거 (LLM이 title을 body 첫 문장에 반복하는 현상 방어).
    // ⚠️ 공백만 뒤따를 때는 strip하지 않는다. "Missing null check on line 45..." 처럼
    //    title이 body의 종속절 도입구인 경우 strip 시 "on line 45..." 같은 fragment가 된다.
    //    문장 경계 문자(. , : ; — -) 또는 EOS가 뒤따를 때만 strip. (상세: §8.8)
    const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
    const body =
      titleSuffix !== null && (titleSuffix === "" || /^[.,:;—-]/.test(titleSuffix))
        ? titleSuffix.replace(/^[\s.,:;—-]+/, "")
        : rawBody;

    // body가 title dedup 결과 빈 문자열이 될 수 있으므로(title === rawBody 완전 일치 케이스),
    // 빈 값일 때 push를 건너뛰어 헤딩 아래 불필요한 빈 줄을 방지한다.
    const lines: string[] = [
      `### ${sev} · ${cat}${fileTag}${title ? ` — ${title}` : ""}`,
    ];
    if (body) lines.push("", body);
    if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
    if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
    return lines.join("\n");
    // SYNC:formatIssueBody — structured-review-body.tsx · pr-review.ts 와 동일 로직 유지
  }).join("\n\n");
  sections.push(`## ${headers.issues}\n\n${items}`);
}
```

**렌더링 결과 예시**:

```markdown
## 발견된 문제점

### ⚠️ WARNING · 🔀 design · `module/github/lib/diff-parser.ts` — core.quotepath 전제에 대한 검증 부족

GitHub API가 diff 텍스트에 octal escape를 포함해 반환한다는 전제에 의존하지만, 이는 로컬 git status 결과로만 확증되었고 GitHub 서버의 실제 동작은 명확하지 않다. core.quotepath 설정이 Git 클라이언트 실행에 따라 달라질 수 있음.

**영향:** GitHub API가 다른 인코딩 포맷(예: UTF-8 원문)을 반환하면 unescapeGitPath 로직이 오작동하여 한글 파일명이 깨지거나 basename 매칭 실패로 리뷰 항목이 드롭된다.

**권장 조치:** 서버 환경·CI 환경에서 core.quotepath를 명시적으로 제어하거나, diff 인코딩을 런타임에 감지하는 로직을 추가한다.
```

### 3.6 웹앱 렌더러 동기화 — `structured-review-body.tsx`

**변경 전** (`structured-review-body.tsx:167-178`):

```ts
const bodyIssues = (data.issues ?? []).filter((i) => i.line === null);
if (bodyIssues.length > 0) {
  const issueLines = bodyIssues.map((issue) => {
    const sev = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
    const cat = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
    const fileTag = issue.file ? ` · \`${issue.file}\`` : "";
    const desc = issue.description.trim();
    return `### ${sev} · ${cat}${fileTag}\n\n${desc}`;
  });
  sections.push(`## ${headers.issues}\n\n${issueLines.join("\n\n")}`);
}
```

→ **`review-formatter.ts`와 동일한 4-필드 렌더 로직 + 방어적 guard로 교체**. 파일 상단 import에 `ISSUE_FIELD_LABELS`를 추가한다:

```ts
import { SECTION_HEADERS, ISSUE_FIELD_LABELS } from "@/shared/constants";
```

`RemainingMarkdownSections()` 내부:

```ts
const labels = ISSUE_FIELD_LABELS[langCode];
const bodyIssues = (data.issues ?? []).filter((i) => i.line === null);
if (bodyIssues.length > 0) {
  const issueLines = bodyIssues.map((issue) => {
    const sev = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
    const cat = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
    const fileTag = issue.file ? ` · \`${issue.file}\`` : "";

    // 방어적 기본값: 레거시 description-only 데이터 + 빈 값 허용 필드 대비 (§3.5와 동일 패턴)
    const title = (issue.title ?? "").trim();
    const rawBody = (issue.body ?? (issue as { description?: string }).description ?? "").trim();
    const impact = (issue.impact ?? "").trim();
    const recommendation = (issue.recommendation ?? "").trim();

    // §3.5와 동일 패턴: 문장 경계 검사 + body 빈값 skip guard (§8.8)
    const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
    const body =
      titleSuffix !== null && (titleSuffix === "" || /^[.,:;—-]/.test(titleSuffix))
        ? titleSuffix.replace(/^[\s.,:;—-]+/, "")
        : rawBody;

    const lines: string[] = [
      `### ${sev} · ${cat}${fileTag}${title ? ` — ${title}` : ""}`,
    ];
    if (body) lines.push("", body);
    if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
    if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
    return lines.join("\n");
    // SYNC:formatIssueBody — review-formatter.ts · pr-review.ts 와 동일 로직 유지
  });
  sections.push(`## ${headers.issues}\n\n${issueLines.join("\n\n")}`);
}
```

> 📌 **중복 제거 검토**: 장기적으로는 `formatIssueBody(issue, labels): string` 같은 공용 헬퍼를 `module/ai/lib/` 아래에 두고 양쪽에서 import하는 것이 이상적이다. 단, 현재 `structured-review-body.tsx`는 `review-detail.tsx`의 `'use client'` 경계에 속하므로 (자체 `"use client"` 선언은 없지만 client 컴포넌트에서 import됨), Zod 및 `ai` SDK(`generateText`, `Output.object`) 의존을 클라이언트 번들에 끌어들이지 않도록 주의해야 한다. 실제로 page.tsx에서 Zod 파싱을 서버 측에서 수행하여 순수 객체만 클라이언트 props로 전달하는 경계 규약을 따르고 있다. **본 스펙 범위에서는 동일 로직을 양쪽에 복제하는 현 구조를 유지**하고, 공용 헬퍼 추출 리팩터링은 별도 명세로 분리한다.

### 3.7 인라인 이슈 코멘트 동기화 — `pr-review.ts`

이 섹션의 변경은 세 곳을 동시에 건드린다: (1) 포매터 함수 본문, (2) `PostPRReviewParams` 인터페이스, (3) `inngest/functions/review.ts`의 호출부. 한 곳만 바꾸면 TypeScript 컴파일 에러가 발생하므로 같은 PR에서 함께 변경한다.

**(1) 포매터 변경** (`pr-review.ts:111-113`)

**변경 전**:

```ts
function formatIssueComment(issue: StructuredIssue): string {
  return `### ${SEVERITY_EMOJI[issue.severity]} ${issue.severity} · ${CATEGORY_EMOJI[issue.category]} ${issue.category}\n\n${issue.description}`;
}
```

**변경 후**:

```ts
function formatIssueComment(
  issue: StructuredIssue,
  labels: { impact: string; recommendation: string },
): string {
  const sev = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
  const cat = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;

  // 방어적 기본값 — §3.5 / §3.6과 동일 패턴 (in-flight resume + 빈 값 대응)
  const title = (issue.title ?? "").trim();
  const rawBody = (issue.body ?? (issue as { description?: string }).description ?? "").trim();
  const impact = (issue.impact ?? "").trim();
  const recommendation = (issue.recommendation ?? "").trim();

  // §3.5와 동일 패턴: 문장 경계 검사 + body 빈값 skip guard (§8.8)
  const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
  const body =
    titleSuffix !== null && (titleSuffix === "" || /^[.,:;—-]/.test(titleSuffix))
      ? titleSuffix.replace(/^[\s.,:;—-]+/, "")
      : rawBody;

  const lines: string[] = [
    `### ${sev} · ${cat}${title ? ` — ${title}` : ""}`,
  ];
  if (body) lines.push("", body);
  if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
  if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
  return lines.join("\n");
  // SYNC:formatIssueBody — review-formatter.ts · structured-review-body.tsx 와 동일 로직 유지
}
```

**(2) `PostPRReviewParams` 인터페이스 변경** (`pr-review.ts:12-21`)

`langCode` 필드를 추가한다:

```ts
import type { LanguageCode } from "@/shared/types/language";
import { ISSUE_FIELD_LABELS } from "@/shared/constants";

interface PostPRReviewParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  reviewBody: string;
  suggestions: CodeSuggestion[];
  issues: StructuredIssue[];
  headSha: string;
  langCode: LanguageCode; // ← 추가
}
```

함수 본문에서 `langCode`를 구조 분해하고 `ISSUE_FIELD_LABELS[langCode]`를 `formatIssueComment`에 전달한다 (`pr-review.ts:61` 위치의 호출부):

```ts
const { token, owner, repo, prNumber, reviewBody, suggestions, issues, headSha, langCode } = params;
const labels = ISSUE_FIELD_LABELS[langCode];
// ...
const issueComments: ReviewComment[] = inlineIssues.map((i) => ({
  path: i.file,
  line: i.line,
  body: formatIssueComment(i, labels), // ← 변경
}));
```

**(3) 호출부 변경** (`inngest/functions/review.ts:252-254`)

`langCode`는 이미 같은 `step.run("post-review", ...)` 스코프의 상위(`review.ts:94`)에서 resolve되어 있으므로 그대로 전달한다:

```ts
await postPRReviewWithSuggestions({
  token, owner, repo, prNumber, reviewBody: review, suggestions, issues, headSha,
  langCode, // ← 추가
});
```

### 3.8 프롬프트 갱신 — `review-prompt.ts`

**변경 전** (`review-prompt.ts:130-144`의 이슈 지침 전체):

```
- For each issue:
  - file: exact file path from the diff, or null for project-level issues (architecture, testing strategy)
  - line: line number in new file, or null for file-level or project-level issues
  - category: bug, design, security, performance, testing, or general
  - severity: CRITICAL for blocking issues, WARNING for important concerns, SUGGESTION for improvements, INFO for observations
- Provide up to ${issueLimit.inline} code-level issues (with file and line) and up to ${issueLimit.general} project-level issues (without line), prioritized by severity
- Do not generate an issue for a file+line that already has a suggestion — the suggestion's explanation already communicates the problem
- Each issue description MUST use structured markdown:
  - First line: one-sentence summary of the problem
  - If relevant, use bullet lists or bold labels to separate:
    - **Affected:** list of affected items
    - **Impact:** why this matters
    - **Recommendation:** what to do
  - Keep the total under 150 words per issue
  - Do NOT write everything in a single paragraph
```

**변경 후** (기존 블록 전체를 아래로 교체):

```
- For each issue, populate these FOUR separate string fields:
  - title: ONE sentence headline, max 15 words, NO trailing period.
           This becomes the issue's visible title, so make it specific.
           Bad: "Error handling issue". Good: "getUserProfile throws while peers return Result objects".
  - body: 2-4 sentences (<=80 words) describing WHAT the problem is.
          Do NOT include "Impact" or "Recommendation" text here — those go in their own fields.
          Do NOT pack multiple paragraphs into a single run-on sentence.
  - impact: 1-2 sentences describing the concrete consequence if unfixed.
            MAY be empty string ("") for INFO-level observations where impact is self-evident.
  - recommendation: 1-2 sentences starting with an imperative verb
                    (Add, Remove, Refactor, Extract, Guard, ...).
                    MAY be empty string ("") when no concrete action applies.
- For file attribution:
  - file: exact file path from the diff whenever the issue references a
          specific source file by name or symbol, even if it spans the whole file.
  - file: null ONLY when the issue concerns 2+ files or cross-cutting architecture.
  - line: line number in the new file for code-level issues, null for file/project-level.
- category: bug, design, security, performance, testing, or general
- severity: CRITICAL for blocking, WARNING for important, SUGGESTION for improvements, INFO for observations
- Provide up to ${issueLimit.inline} code-level issues (with file and line) and up to ${issueLimit.general} project-level issues (without line), prioritized by severity
- Do not generate an issue for a file+line that already has a suggestion — the suggestion's explanation already communicates the problem
```

**삭제된 지침**: 구 "Each issue description MUST use structured markdown: ..." 블록(140자 이하 one-paragraph 금지, Affected/Impact/Recommendation 볼드 라벨, 150 words 상한). 새 스키마의 `title/body/impact/recommendation` 분리가 이 역할을 구조적으로 대체하므로 제거한다.

**보존된 지침**: issue count 상한(`${issueLimit.inline}` / `${issueLimit.general}`)과 suggestion-line 중복 방지 규칙은 프롬프트에 그대로 유지한다. 이 두 규칙은 스키마 구조화와 무관하게 여전히 필요하다:
- count 상한: `getIssueLimit(sizeMode)` 기반 size-mode별 예산 전달 (런타임 `review.ts:218-228`의 count-trimming이 backstop이지만, 프롬프트 지시가 없으면 모델이 초과 생성하여 토큰을 낭비함).
- suggestion-line 중복 방지: 런타임 `review.ts:200-214`의 dedup이 backstop이지만, 같은 라인에 suggestion과 issue가 중복 생성되는 것을 사전 차단하는 것이 비용·품질 면에서 유리.

**⚠️ 주의 — `file` 부착 지시의 부작용 (모니터링 필수)**

위 "file: null ONLY when ..." 지시는 기존 `file: null, line: null`로 뭉쳐 body에 렌더되던 project-level 이슈를 `file: X, line: null`로 승격시킨다. 이 경우 `inngest/functions/review.ts:175-188`의 `resolveToDiffPath()` 경로로 흘러 들어가므로 다음 두 부작용이 생긴다:

1. **드롭 리스크**: LLM이 파일명을 잘못 echo하거나 basename 충돌이 발생하면 해당 이슈는 **조용히 drop**된다. 사용자에게는 "이슈 없음"처럼 보이며 원인 추적이 불가능하다. 따라서 기존 `review.ts:43-52`의 `console.warn`을 **drop 사유가 구조화 필드로 분리된 로그**로 강화한다. 이는 본 스펙의 구현 범위에 포함된다(§4 step 7a):

   ```ts
   // review.ts:42-53 — resolveToDiffPath 교체
   if (matches.length === 0) {
     console.warn(`[${scope}] dropped entry`, { file, reason: "no_match" });
     return null;
   }
   if (matches.length > 1) {
     console.warn(`[${scope}] dropped entry`, {
       file, reason: "basename_collision", basename, candidates: matches,
     });
     return null;
   }
   ```

   **배포 직후 48시간 롤아웃 체크리스트**:
   - Inngest 로그에서 `rg '\[issues\] dropped entry' | wc -l` 로 drop 절대 건수 확인.
   - 같은 기간 생성된 리뷰 수(`prisma.review.count({ where: { createdAt: { gte: ... } } })`)와 나눠 drop률 산출.
   - 드롭률이 전체 이슈의 10%를 상회하면 프롬프트에서 "file 부착" 지시 강도를 낮춘다(§6 부분 완화 참고).
   - `reason: "basename_collision"`이 지배적이면 모노레포 구조에서 발생하는 것이므로, 임계치 미만이라도 즉시 프롬프트 강도 조정이 필요.

2. **general 버킷 쏠림**: `line: null && file != null` 이슈는 `review.ts:218-228`의 count-trim에서 **general 버킷**(tiny=1, small=2, normal=3, large=4)으로 집계된다. 프롬프트 변경 이후 general 카테고리에 이슈가 몰려 한도에 반복적으로 걸릴 수 있으므로, 실제 게시되는 general issue 수도 함께 관찰한다. 필요 시 `getIssueLimit`의 general 값을 후속 PR에서 상향한다.

**⚠️ 주의 — 출력 토큰 예산 회귀 리스크 (`large` 모드 필수 검증)**

기존 `description` 단일 필드가 4개 필드(`title`/`body`/`impact`/`recommendation`)로 분해되면서 이슈 1건당 **출력 토큰이 대략 3-4배**로 증가한다. `large` 모드(`inline: 8, general: 4`, 총 12 이슈)에서는 issues 섹션 뒤에 이어지는 `suggestions` 배열 생성 중 Gemini 2.5 Flash의 응답 budget이 고갈되어 JSON이 중간에 잘릴 수 있다. 이 경우:

- `Output.object` 파싱이 실패하고 `experimental_output === undefined` → `inngest/functions/review.ts:124`의 falsy 검사가 fallback markdown 경로로 전환.
- 결과적으로 walkthrough·summary·strengths·suggestions 섹션 전체가 평문 마크다운으로 퇴행.
- 즉, **본 스펙이 해결하려는 issues 섹션 포맷 문제뿐 아니라 리뷰 전체 구조가 사라지는 회귀**가 가능.

완화책 (본 스펙 구현과 함께 적용):
- `body.describe()`에 "`<=80 words`" 상한을 명시 (§3.2 / 위의 프롬프트 블록). Zod는 문자열 길이를 런타임 검증하지는 않지만, describe 텍스트가 JSON Schema description으로 Gemini에게 전달되어 출력 예산 힌트 역할을 한다.
- `impact` / `recommendation`은 "1-2 sentences"로 고정 (기존 프롬프트 지시 유지).
- 검증: §5.2에 **`large` 모드 실제 PR 최소 1건** 테스트 항목을 추가하여 회귀를 사전 차단.

### 3.9 스키마 버전 bump + `save-review` shape guard

**`review-schema.ts:18`**:

```ts
// 변경 전
export const REVIEW_SCHEMA_VERSION = 1;

// 변경 후
export const REVIEW_SCHEMA_VERSION = 2;
```

**`inngest/functions/review.ts:288-290` — shape guard 추가 (필수)**:

§8.7의 포매터 guard(`?? ""`)는 **런타임 렌더 경로만** 보호한다. 하지만 `save-review` step은 `validatedStructuredOutput`을 받아 그대로 DB에 저장하며 **무조건 `REVIEW_SCHEMA_VERSION` 상수를 찍는다**. 배포 경쟁 상태에서 `generate-ai-review` step이 **구 shape**(`description`만 있는 이슈)로 memoize되어 resume되면, 새 코드의 `save-review`는 구 shape 데이터에 `schemaVersion: 2`를 찍어 **"v2 태그가 붙은 오염된 row"**를 영속화한다.

이 row는 `page.tsx`에서 Zod `safeParse` 실패 → fallback markdown 렌더되므로 사용자 경험은 깨지지 않는다. 하지만:
- DB의 `schemaVersion`이 **실제 shape을 정확히 반영하지 못하게 된다** — 추후 백필·마이그레이션·분석 쿼리(`WHERE schemaVersion = 2`)에서 거짓 양성이 발생한다.
- 48시간 후 in-flight run이 모두 소진되어도 오염된 row는 영구적으로 남는다.

방어: `save-review` 직전에 `validatedStructuredOutput.issues`의 실제 shape을 확인하고 일치할 때만 `REVIEW_SCHEMA_VERSION`을 찍는다. 구 shape이 혼입되면 `schemaVersion: 1`로 저장되어 `page.tsx`의 version mismatch 경로로 자연스럽게 흘러간다.

```ts
// save-review step 내부 (현재 review.ts:288-290 위치)
const hasNewIssueShape = (validatedStructuredOutput?.issues ?? []).every(
  (i) => typeof (i as { title?: unknown }).title === "string",
);
// 구 shape가 섞여 들어오면 v1로 되돌려 저장하여 schemaVersion과 실제 shape의 일관성을 유지한다.
// page.tsx는 v1 row를 만나면 version mismatch 경로로 안전하게 마크다운 fallback.
const storedSchemaVersion = hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1;

// ...
reviewData: validatedStructuredOutput
  ? { ...validatedStructuredOutput, schemaVersion: storedSchemaVersion }
  : Prisma.DbNull,
```

**`issues`가 빈 배열인 경우 `.every()`는 true를 반환**하므로 이슈가 없는 리뷰는 정상적으로 v2로 저장된다(shape 판단이 moot). 이슈가 있는데 title 필드가 string 타입이 아닌 경우에만 v1으로 폴백한다.

**동작 요약**:
- 정상 배포 후 신규 리뷰: `schemaVersion: 2`로 저장되어 새 구조화 렌더링.
- 배포 경쟁 상태에서 구 shape resume: `schemaVersion: 1`로 저장되어 `page.tsx`의 version mismatch 경로 → 마크다운 fallback. **DB schemaVersion이 실제 shape을 정확히 반영**.
- 기존 `schemaVersion: 1` 리뷰: 영향 없음. `page.tsx:23`이 `console.warn` 출력 후 `structuredData = null` → `ReviewDetail`이 기존 마크다운 fallback 경로로 렌더.

이 guard는 §8.7의 포매터 guard와 함께 **in-flight resume 대비 2중 안전장치**를 구성한다. 자세한 근거는 §8.9.

---

## 4. 구현 단계

순서는 변경의 의존성을 따른다. 각 단계마다 `npm run lint`, `tsc --noEmit`, `npm run build` 통과 확인.

| # | 단계 | 파일 | 체크포인트 |
|---|------|------|-----------|
| 1 | `ISSUE_FIELD_LABELS` 상수 추가 | `shared/constants/index.ts` | 언어별 라벨 정의 완료 |
| 2 | Zod 스키마 업데이트 (`title`/`body`는 `.min(1)`, `impact`/`recommendation`은 `.default("")`), `description` 제거 | `module/ai/lib/review-schema.ts` | `tsc` 통과 (StructuredIssue 사용처 에러 발생 예정 — 정상) |
| 3 | 프롬프트 지침 개편 — **스키마 변경 직후 수행하여 AI 출력 불일치 구간 최소화** | `module/ai/lib/review-prompt.ts` | 구 "structured markdown" 블록 제거, 4필드 지시 + `impact/recommendation` optional 표기 |
| 4 | `StructuredIssue` 인터페이스 업데이트 | `module/ai/types/suggestion.ts` | 타입 에러가 사용처에만 남음 |
| 5 | `formatStructuredReviewToMarkdown()` 이슈 렌더 로직 교체 (방어적 guard + title dedup + 빈 값 스킵) | `module/ai/lib/review-formatter.ts` | `description` 참조 제거 + `?? ""` 방어 확인 |
| 6 | `RemainingMarkdownSections()` 이슈 렌더 로직 교체 (동일 guard 패턴) | `module/review/ui/parts/structured-review-body.tsx` | `description` 참조 제거 + `?? ""` 방어 확인 |
| 7 | `formatIssueComment()` 교체 (동일 guard 패턴) 및 `langCode` 전달 경로 연결 | `module/github/lib/pr-review.ts`, `inngest/functions/review.ts` | 인라인 코멘트도 동일 4-필드 포맷 |
| 7a | `resolveToDiffPath` drop 로그에 `reason` 필드 추가 (§3.8) | `inngest/functions/review.ts` | drop 사유가 구조화 로그 필드로 관찰 가능 (`no_match` / `basename_collision`) |
| 8 | `REVIEW_SCHEMA_VERSION = 2` | `module/ai/lib/review-schema.ts` | `page.tsx` fallback 경로 동작 확인 |
| 8a | `save-review` shape guard 추가 — `hasNewIssueShape` 체크 후 `storedSchemaVersion` 결정 (§3.9) | `inngest/functions/review.ts` | 구 shape을 수동 주입했을 때 v1로 저장되는지 단위 확인 |
| 9 | grep으로 `issue.description` 잔존 레퍼런스 제거 확인 | 전체 | `git grep -n "\.description"` in `module/ai`, `module/review`, `module/github` → 남아있으면 즉시 처리 |
| 10 | `git grep "SYNC:formatIssueBody"`로 3개 동기화 지점 앵커 존재 확인 | `review-formatter.ts`, `structured-review-body.tsx`, `pr-review.ts` | 3개 매치 — 향후 중복 로직 수정 시 일괄 검색용 |

---

## 5. 테스트 계획

### 5.1 단위 검증 (수동)

1. **신규 스키마 검증**:
   - 작성: 인위적 `StructuredReviewOutput` 객체 (title/body/impact/recommendation 모두 포함)
   - `structuredReviewSchema.safeParse()`가 success 반환 확인
   - `description` 필드만 있는 레거시 객체는 실패(invalid) 반환 확인
   - **`impact`만 누락** / **`recommendation`만 누락** / **둘 다 누락** 케이스 모두 success 반환 확인 (`.default("")` 동작)
   - **`title` 누락** / **`body` 누락** / **`title: ""`** / **`body: ""`** 케이스는 실패 반환 확인 (`.min(1)` 동작)
2. **포매터 출력 검증**:
   - 인위적 issues 배열을 `formatStructuredReviewToMarkdown()`에 넣어 출력 확인
   - 기대 출력에 `### ... — title` / `\n\n` 구분 / `**영향:**` / `**권장 조치:**` 존재
   - `file: null` 케이스는 파일 태그 생략 확인
   - `ko` / `en` langCode 양쪽에서 라벨이 올바르게 변환되는지 확인
3. **빈 값 스킵 검증 (신규)**:
   - `impact: ""`, `recommendation: ""` 이슈로 포매터 호출 → 출력에 `**영향:**` / `**권장 조치:**` 라벨이 **존재하지 않음** 확인 (빈 라벨 금지)
   - `impact`만 존재 / `recommendation`만 존재 케이스에서 해당 라벨만 렌더되는지 확인
   - 세 경로(`review-formatter.ts`, `structured-review-body.tsx`, `pr-review.ts`) 모두 동일 결과인지 확인
4. **레거시 shape fallback 검증 (Inngest in-flight resume 대비, 신규)**:
   - `description` 필드만 있는 레거시 객체를 type assertion으로 포매터에 주입 → **런타임 에러 없이** 최선-노력 렌더되는지 확인
   - 출력의 body 부분에 구 `description` 값이 사용됨을 확인
   - `title` 부재 시 헤딩에 `— title` 접미가 붙지 않음을 확인
5. **title 중복 스트립 검증 — 문장 경계 강화 반영 (신규)**:
   - **Strip 동작 케이스**: `title: "A is wrong"`, `body: "A is wrong. Because..."` → 출력의 body 부분이 `"Because..."`로 시작하는지 확인 (`.` 직후 strip).
   - **Strip 금지 케이스 (§8.8)**: `title: "Missing null check"`, `body: "Missing null check on line 45 causes..."` → body가 **그대로 유지**되는지 확인. 공백 뒤 소문자는 종속절 도입구이므로 strip되면 `"on line 45 causes..."`라는 fragment가 된다.
   - **완전 일치 케이스**: `title: "A is wrong"`, `body: "A is wrong"` → dedup 후 body가 빈 문자열이 되고, 포매터 출력에 `### ... — A is wrong` 헤딩 바로 뒤에 **body 줄이 렌더되지 않아 헤딩 아래 불필요한 빈 줄이 중복 생성되지 않는지** 확인 (body skip guard).
   - `title`이 body에 없는 경우에는 body 원본이 그대로 유지되는지 확인.
6. **Gemini `.default("")` 실제 동작 검증 (신규, 필수)**:
   - **목적**: Zod의 `.default("")`가 `ai@5.0.115` + `Output.object`를 거쳐 Gemini에게 "이 필드는 생략 가능"으로 전달되는지 실제 호출로 확인. 스펙 §3.2는 이 동작을 전제로 `impact`/`recommendation`의 fragility를 완화했지만, SDK의 JSON Schema 변환 동작은 문서만으로는 보장할 수 없다.
   - **수행**: 테스트 저장소의 소규모 PR에서 실제 리뷰를 **최소 5회** 생성. 저장된 `reviewData.issues`를 Prisma Studio 또는 직접 쿼리로 조회하여 `impact` 또는 `recommendation`이 **빈 문자열인 케이스가 최소 1회 관찰**되는지 확인.
   - **관찰되지 않는 경우**: Gemini가 `.default()`를 "생략 가능"으로 인식하지 못하고 모든 케이스에 템플릿 답변을 강제 생성하고 있다는 신호. 이 경우 §8.6이 회피하려던 "품질 저하" 시나리오가 실제로 발생 중이므로, 프롬프트의 `impact`/`recommendation` 지시를 `Write empty string ("") for INFO-level observations where impact is self-evident` 처럼 **LLM에게 명시적으로 빈 문자열 출력을 요청**하도록 강화한다.
   - **관찰되는 경우**: 의도대로 동작. 추가 조치 불필요.

### 5.2 통합 검증 (Inngest + GitHub)

1. 테스트 저장소에 소규모 PR (3-5 파일, 한글 파일명 1개 포함) 생성.
2. Inngest dev 서버(`npm run inngest-dev`) + Next 앱 기동.
3. PR 리뷰 트리거 → GitHub에 포스팅된 리뷰 본문 육안 확인:
   - 모든 이슈가 `###` 헤딩 + 4문단 구조로 렌더되는가
   - `영향:` / `권장 조치:` 라벨이 볼드로 보이는가
   - "부족명세" 같은 제목·본문 붙임이 **더 이상 발생하지 않는가**
   - 단일 파일 이슈에 file 태그가 붙는가
4. 웹앱(`/dashboard/reviews/[id]`)에서 동일 리뷰 렌더 — GitHub과 동일한 구조가 보이는가.
5. 인라인 이슈 코멘트(file+line 있는 이슈)도 동일 4-필드 포맷으로 달리는가.
6. **`large` 모드 토큰 예산 검증 (신규, 필수 — §3.8 참고)**:
   - 테스트 저장소에 **`large` 모드로 분류될 PR**(변경 파일 수 · diff 줄 수가 `classifyPRSize`의 large 임계치를 초과)을 최소 1건 생성.
   - 리뷰 트리거 후 Inngest 로그에서 `Structured output failed, falling back to markdown:` 경고가 **출력되지 않는지** 확인 (`inngest/functions/review.ts:124`의 falsy 분기가 발동하지 않아야 함).
   - DB의 `reviewData.issues`에 `title` / `body` / `impact` / `recommendation` 필드가 모두 채워진 상태로 저장되었는지 Prisma Studio로 확인.
   - `reviewData.suggestions` 배열도 정상 생성되었는지 확인 (JSON truncation 시 suggestions가 비어 있거나 잘릴 수 있음).
   - **구조화 출력이 실패하는 경우**: `body.describe()`의 80단어 상한이 Gemini에게 충분히 전달되지 않은 것. 후속 PR에서 (1) `body.max(400)` 같은 런타임 문자 수 검증 추가, (2) `getIssueLimit(large)` 값 하향, (3) `impact`/`recommendation`을 `large` 모드에서만 "한 문장" 이하로 강제하는 옵션을 검토한다.

### 5.3 폴백 회귀 검증

- 기존 DB에 남아있는 `schemaVersion: 1` 리뷰 1건을 `/dashboard/reviews/[id]`로 접근.
- `console.warn`이 출력되고, `review.review` (레거시 마크다운)가 정상 렌더되는지 확인.
- 404·500 에러 없이 기존 경험이 유지되는가.

### 5.4 다국어 라벨 검증

- 사용자 언어 설정을 `en`, `ko`로 토글하며 동일 PR을 리뷰.
- 언어에 맞는 `Impact:` / `영향:` 라벨이 선택되는가.

---

## 6. 롤백 계획

증상이 재발하거나 LLM 출력이 새 스키마를 반복적으로 위반하여 Zod 검증 실패가 급증하는 경우:

1. **1차 완화 (웹 UI 렌더링 문제 한정)**: `REVIEW_SCHEMA_VERSION`만 다시 `1`로 되돌리면 신규 리뷰가 DB에 `schemaVersion: 1`로 저장되고, `page.tsx:23`의 version mismatch 검사로 인해 웹 UI는 `structuredData = null` → 마크다운 fallback 경로로 렌더된다. **단, Zod 스키마와 포매터는 여전히 새 4-필드 구조이므로 LLM이 정상 출력한 경우 GitHub PR에는 새 포맷이 그대로 게시된다**. 즉 이 완화는 웹 UI 렌더링 문제만 덮으며, GitHub 리뷰 포스팅 포맷이 문제의 근원인 경우에는 **효과가 없다**. GitHub 측까지 원복하려면 2차 완화가 필요하다.
2. **2차 완화**: 본 PR을 revert. 모든 파일이 동일 PR에 있으므로 revert 한 번으로 GitHub · 웹 UI 모두 구 포맷으로 복귀.
3. **부분 완화**: LLM이 `title` 또는 `body`를 비워 Zod 검증 실패가 급증하는 경우 (본 스펙에서 `impact`/`recommendation`은 이미 `.default("")`로 완화됨), 해당 필드도 `z.string().default("(no title)")` 같은 형태로 추가 완화하는 긴급 패치 경로가 가능하다. 단 `title`이 비면 렌더 품질이 크게 떨어지므로, 이 경로는 실제로 장애가 발생했을 때만 사용.

---

## 7. Out of Scope

- **기존 `schemaVersion: 1` 리뷰의 백필 마이그레이션**: `page.tsx`의 기존 fallback 경로가 안전하게 처리하므로 수동 마이그레이션은 수행하지 않는다. 필요 시 별도 스크립트 스펙으로 분리.
- **이슈 렌더 로직 중복 제거 리팩터링**: `review-formatter.ts`와 `structured-review-body.tsx`의 이슈 렌더 로직을 공용 헬퍼로 추출하는 작업은 본 스펙 범위 밖. 서버/클라이언트 경계와 번들 사이즈를 고려해야 하므로 별도 리팩터링 스펙 필요.
- **Fallback 프롬프트 경로** (`buildFallbackPrompt`): 구조화 출력이 실패했을 때만 사용되며 free-form markdown을 생성한다. 본 스펙은 구조화 경로만 다룬다.
- **Suggestions 테이블 형식**: 현재 `### 💡 SUGGESTION` 헤딩과 별개로 `suggestions` 배열은 테이블로 렌더된다. 본 스펙은 `issues` 배열의 렌더만 다룬다. Suggestions의 `explanation` 필드도 유사한 벽돌 문단 이슈가 있다면 후속 스펙으로 분리.

---

## 8. 결정 로그

본 스펙 작성 시 내린 주요 판단과 근거.

### 8.1 왜 스키마 bump인가? (프롬프트 강화로 충분하지 않은가)

관찰된 출력이 `review-prompt.ts:137-144`의 기존 지침을 정면으로 위반한다. 프롬프트는 이미 "Do NOT write everything in a single paragraph"를 명시하고 있지만 LLM이 이를 무시한다. **프롬프트는 best-effort이고 스키마는 enforcement**다. 근본 해결은 스키마뿐.

### 8.2 왜 `file`을 nullable로 유지하는가?

`file: string` 강제 시 LLM이 크로스커팅 이슈(예: "테스트 전략 부재")에 대해 임의의 파일 경로를 fabricate할 위험이 더 크다. 잘못된 파일에 inline comment가 달리는 것이 null보다 나쁘다. 대신 프롬프트에서 "null은 2+ 파일 또는 아키텍처 수준 이슈에만" 기준을 명시하여 관찰된 오분류를 줄인다.

### 8.3 왜 `review-output-ux-improvement.md` 스펙을 수정·교체하지 않고 보완하는가?

기존 스펙은 archive 상태이며, 당시 전제("AI가 well-formed markdown을 반환한다")가 프로덕션에서 무너졌다는 사실을 후속 발견한 것이 본 스펙이다. 기존 헤딩 규약(`### sev · cat · file`)은 그대로 계승하고 하위 구조(4-필드)만 추가한다. 충돌 없음.

### 8.4 왜 라벨(`Impact`/`Recommendation`)을 언어별 상수로 분리하는가?

현재 섹션 헤더(`summary`, `issues` 등)는 이미 `SECTION_HEADERS[langCode]`로 국제화되어 있다. 이슈 내부 라벨만 하드코딩하면 `ko` 리뷰에서 섹션은 "발견된 문제점"인데 내부 라벨만 "Impact:"로 튀어나오는 일관성 파괴가 발생한다. 동일 패턴 재사용.

### 8.5 왜 중복 렌더 로직(`review-formatter` + `structured-review-body` + `pr-review`)을 지금 통합하지 않는가?

세 곳이 모두 같은 버그를 공유하므로 동시에 고쳐야 하는 것은 맞다. 하지만 공용 헬퍼로 추출하는 작업은 서버/클라이언트 경계 (`'use client'`, Zod 번들 분리)를 건드리는 **독립적 리팩터링**이다. 본 스펙에서 함께 하면 diff가 커져 리뷰·롤백 난이도가 올라간다. **일단 세 곳 동일 패치 → 추후 별도 리팩터링**이 더 안전하다.

세 구현의 동기화가 어긋나지 않도록 각 map 콜백 말미에 `// SYNC:formatIssueBody — ...` 앵커 주석을 추가한다. 이후 수정 시 `git grep "SYNC:formatIssueBody"`로 세 지점을 한 번에 찾아 일괄 갱신할 수 있다(§4 step 10).

### 8.6 왜 `impact` / `recommendation`은 `.default("")`로 완화하는가? (4필드 전부 `.min(1)`이 아니라)

초기안은 4필드 모두 `.min(1)`로 엄격 강제하는 것이었다. 그러나 이 설계에는 두 가지 fragility가 있다:

1. **전체 구조화 출력 붕괴 리스크**: 한 이슈의 한 필드가 빈 문자열이어도 Zod 검증이 실패하며, `ai` SDK의 `Output.object`가 `experimental_output = undefined`를 반환한다. `inngest/functions/review.ts:124`의 falsy 검사는 이를 fallback 신호로 해석해 **walkthrough · summary · strengths · suggestions 섹션까지 모두 평문 마크다운으로 퇴행**한다. 한 이슈의 한 필드 누락으로 전체 구조화 출력이 증발하는 설계는 수용 불가.

2. **LLM 강제가 품질 저하 유발**: INFO · SUGGESTION 수준의 가벼운 관찰형 이슈(예: "이 함수는 명시적 return이 없음")는 "영향"과 "권장 조치"가 자연스럽지 않다. `.min(1)`은 LLM이 억지로 문구를 만들게 하여 "impact: 코드 가독성이 떨어짐" 같은 알맹이 없는 템플릿 답변을 유도한다.

반면 `title` / `body`는 모든 이슈에 반드시 필요한 최소 요소(제목과 설명 없이 이슈를 표현할 수 없음)이므로 `.min(1)`을 유지한다. `impact` / `recommendation`은 부가 정보이므로 `.default("")`로 누락 허용하되, 포매터(§3.5-3.7)에서 빈 값 라벨을 시각적으로 스킵한다. 결과적으로 **핵심 벽돌 문단 버그는 해결**하면서 LLM 순응도에 대한 의존도를 낮춘다.

### 8.7 왜 Inngest in-flight resume에 대한 방어적 guard(`?? ""`)를 추가하는가?

Inngest는 step-level memoization을 사용한다. 함수 실행 중간에 배포가 일어나면, 이미 완료된 step은 직전 run의 직렬화된 반환값을 재사용하고 이후 step만 새 코드로 실행된다. 본 변경은 `generate-ai-review` step의 반환값 shape(`issues[].*`)을 바꾸므로, **배포 시점에 실행 중이던 리뷰가 resume될 때** memoized 결과는 구 shape(`description`)이고 후속 `validate-review` + 포매터는 새 shape(`title/body/...`)을 기대하는 불일치가 발생한다. 방어 없이 `i.title.trim()`을 호출하면 `TypeError: Cannot read properties of undefined`로 리뷰가 파손된다.

방어적 `?? ""` + 구 `description` 승격 로직은 이 드문 경쟁 상태에서도 리뷰가 "어느 정도 읽을 수 있는 형태"로 완주하게 한다. 배포 이후 48시간 정도가 지나면 in-flight run이 모두 소진되므로, 후속 리팩터링에서 제거해도 무방하다 — 이 방어는 **영구 코드가 아니라 배포 경쟁 상태 전용 안전장치**다.

### 8.8 왜 title dedup에 **문장 경계 검사**가 필요한가? (공백만으로는 strip 금지)

초기 dedup 로직은 단순했다:

```ts
const body = title && rawBody.startsWith(title)
  ? rawBody.slice(title.length).replace(/^[\s.,:;—-]+/, "")
  : rawBody;
```

이 방식은 LLM이 title 문구를 body의 **종속절 도입구**로 재사용하는 케이스에서 grammatical fragment를 생성한다:

- `title: "Missing null check"`
- `body: "Missing null check on line 45 causes a crash when ..."`

`startsWith(title)` = true → slice → `" on line 45 causes a crash when ..."` → `[\s.,:;—-]+` strip → `"on line 45 causes a crash when ..."`. 주어 없는 grammatical fragment로, 렌더 품질이 눈에 띄게 저하된다. 초기 검증 플랜(§5.1 item 5)은 "`A is wrong. Because...`"처럼 **이상적인 문장 경계** 케이스만 테스트하여 이 결함을 놓친다.

강화된 경계 검사: title 뒤에 **문장 경계 문자(`.`, `,`, `:`, `;`, `—`, `-`) 또는 EOS**가 있을 때만 strip한다. 공백만 뒤따르는 케이스는 "title이 body의 주어·도입구로 쓰이는 중"이라고 판단하여 body 원본 유지.

- `body: "Missing null check. Because ..."` → title + `.` 매치 → strip → `"Because ..."` ✓
- `body: "Missing null check on line 45 ..."` → title + ` ` (공백은 문장 경계 아님) → **strip 안함** ✓
- `body: "Missing null check"` (완전 일치) → title + EOS 매치 → strip → `""` → 포매터에서 body skip ✓

공백 뒤 대문자(예: `"Missing null check Because..."`)는 false positive로 strip되지 않지만, 이는 LLM이 문법적으로 깨진 문장을 생성한 특이 케이스이므로 수용 가능한 trade-off로 본다. 반대쪽 실패(fragment 생성)가 더 자주 · 더 눈에 띄게 발생한다.

### 8.9 왜 `save-review`에 shape guard가 필요한가? (schemaVersion 오염 방지)

§8.7의 in-flight resume defensive guard(`?? ""`)는 **포매터만** 보호한다. 하지만 `save-review` step은 `validatedStructuredOutput`을 받아 그대로 DB에 저장하면서 **무조건 `REVIEW_SCHEMA_VERSION = 2`를 찍는다**. 이는 구 shape 데이터가 "v2 태그가 붙은 오염된 row"로 영속화되는 경로를 만든다.

실제 이 row는 `page.tsx`에서 Zod `safeParse` 실패 → fallback markdown 렌더되므로 사용자 경험은 깨지지 않는다. 하지만:

- DB의 `schemaVersion`이 **실제 shape을 정확히 반영하지 못한다**. 이는 추후 백필·마이그레이션·분석 쿼리(`WHERE schemaVersion = 2`)에서 거짓 양성을 발생시킨다.
- 48시간 후 in-flight run이 모두 소진되어도 오염된 row는 **영구적으로 남는다**. §8.7의 포매터 guard는 "48시간 후 제거 가능한 임시 코드"지만, 이렇게 저장된 오염 row는 제거가 어렵다.

해결: `save-review` 직전에 `validatedStructuredOutput.issues`의 각 요소에 `title` 필드가 string 타입인지 확인한 뒤, **v2 shape일 때만** `REVIEW_SCHEMA_VERSION`을 찍는다. 구 shape이 혼입되면 `schemaVersion: 1`로 저장되어 `page.tsx`의 version mismatch 경로로 자연스럽게 흘러간다. **schemaVersion과 실제 shape의 일관성 불변조건을 DB 레벨에서 보존한다**.

`issues`가 빈 배열인 경우 `.every()`는 true를 반환하므로 정상적으로 v2 저장된다(이슈가 없는 리뷰는 shape 판단이 moot).

이 guard는 §8.7 포매터 guard와 함께 **in-flight resume 대비 2중 안전장치**를 구성한다:
- §8.7 포매터 guard: 런타임 렌더가 `TypeError` 없이 완주하게 한다 (GitHub · 웹 UI 사용자 경험 보호).
- §8.9 save-review guard: DB의 `schemaVersion` 필드가 실제 shape을 정확히 반영하게 한다 (장기 데이터 품질 보호).

둘 다 배포 경쟁 상태 전용 안전장치이지만, §8.9 guard는 **영구 코드로 유지**해도 부담이 거의 없다(한 번의 `.every()` 호출, O(n)). 추후 schemaVersion이 3으로 올라갈 때 guard 조건만 업데이트하면 된다.
