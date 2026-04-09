# PR Review 출력 UX 개선 명세

> **작성일**: 2026-04-10
> **상태**: Draft
> **관련 파일**: `module/ai/lib/review-formatter.ts`, `module/github/lib/pr-review.ts`, `module/review/ui/parts/structured-review-body.tsx`, `module/ai/lib/review-prompt.ts`, `shared/constants/index.ts`

---

## 1. 문제 정의

### 현재 상태

PR Review가 GitHub에 포스팅될 때, 특히 Issues 섹션이 **하나의 긴 문단(Wall of Text)** 으로 출력된다.

**현재 Issues 포맷** (`review-formatter.ts:72-78`):

```
- 🚨 **CRITICAL** · 🐛 bug · `file.ts`
  에러 설명이 한 줄로 길게 이어지는 텍스트...
```

**발생하는 UX 문제**:

| 문제 | 설명 |
|------|------|
| 스캔 불가 | 문제 설명 / 영향 / 권장 조치가 한 덩어리로 혼재 |
| 인라인 코드 과밀 | 함수명, 타입, 패턴명이 산문 사이에 뒤섞여 시선 끊김 |
| 핵심 메시지 매몰 | 결론(권장 조치)이 문단 끝에 묻힘 |
| 구조적 계층 부재 | 제목 → 분류 → 영향 → 권장의 시각적 분리가 없음 |

### 영향 범위

- `formatStructuredReviewToMarkdown()` — 전체 리뷰 본문 마크다운 변환 (`review-formatter.ts`)
- `postPRReviewWithSuggestions()` — GitHub API 포스팅 시 body 구성 (`pr-review.ts`)
- `formatIssueComment()` — 인라인 이슈 코멘트 포맷 (`pr-review.ts`)
- `RemainingMarkdownSections()` — 웹앱 내 리뷰 렌더링 (`structured-review-body.tsx`) — **동일 포맷 로직 중복 존재**

---

## 2. 경쟁사 분석

### 2.1 CodeRabbit

2M+ 리포지토리에 적용된 가장 널리 사용되는 AI 코드 리뷰 도구.

**포맷 특징**:

- `<details>/<summary>`로 Walkthrough를 접을 수 있게(collapsible) 처리
- 파일 변경 내역을 **테이블**로 그룹화 (관련 파일을 하나의 행으로 통합)
- PR description에 요약을 직접 삽입 (코멘트 열기 전에 요약 확인 가능)
- `@coderabbitai` 태그로 대화형 후속 질문 가능

**적용 가능 패턴**: collapsible 섹션, 테이블 기반 변경 요약

### 2.2 Qodo (구 CodiumAI / PR-Agent)

오픈소스로 구조가 가장 명확하게 문서화됨.

**포맷 특징**:

- **Review Effort 라벨** (`review effort [3/5]`) — PR 목록에서 리뷰 소요 시간을 사전 파악
- **Key Issues to Review** — 전체 이슈에서 가장 중요한 항목만 별도 추출
- 제안을 **테이블 형태**로 구조화 (file, line, severity, description 컬럼)
- File Walkthrough를 `<details>`로 기본 접기
- 카테고리 우선 정렬 (bugs → security → quality → testing → performance)
- 새 push가 오면 기존 코멘트를 **업데이트** (새 코멘트 생성 안 함)

**적용 가능 패턴**: key issues 분리, 테이블 기반 제안, 카테고리 우선 정렬

### 2.3 GitHub Copilot Code Review

GitHub 네이티브 코드 리뷰 (2026년 3월 기준 에이전틱 아키텍처로 전환).

**포맷 특징**:

- 요약 코멘트 없이 **인라인 코멘트만** 사용 (GitHub 네이티브 리뷰 시스템 활용)
- 리뷰당 평균 ~5.1개 코멘트 — 적은 수량, 높은 신호
- 관련 패턴 위반을 **하나의 코멘트로 클러스터링**
- 단일 라인이 아닌 **코드 범위(multi-line)** 어노테이션

**적용 가능 패턴**: 유사 이슈 클러스터링, 코멘트 수량 제한

### 2.4 SonarQube / SonarCloud

정적 분석 기반 품질 게이트.

**포맷 특징**:

- PR 코멘트는 **Quality Gate 상태만** 최소한으로 표시 (Pass/Fail 배지)
- 메트릭 중심: 새 버그 수, 취약점 수, 커버리지 %, 중복도
- 상세 내용은 대시보드 링크로 이동 — PR 스레드를 깨끗하게 유지
- **새 코드에서 발생한 이슈만** 표시 (기존 이슈 무시)

**적용 가능 패턴**: 메트릭 요약, 대시보드 연동

### 2.5 Augment Code Review

**포맷 특징**:

- 3단계 심각도: **Action Required** (머지 차단) / **Recommended** (권장) / **Minor** (선택)
- 두 가지 리뷰 모드: "Thorough" (포괄적) vs "Precise" (핵심만)
- 저가치 스타일 지적 회피 — 버그, 보안, 크로스시스템 문제에 집중

**적용 가능 패턴**: 머지 연관 심각도 체계

### 2.6 업계 공통 패턴 (2026년 기준)

| 패턴 | 채택 현황 | 효과 |
|------|-----------|------|
| `<details>` 접기 | CodeRabbit, Qodo, Greptile | 긴 섹션의 노이즈 제거 |
| 3단계 심각도 (차단/권장/선택) | Augment, Copilot, Qodo | 머지 의사결정 직결 |
| 요약 + 인라인 이중 레이어 | CodeRabbit, Qodo, Greptile | 스캔용/액션용 분리 |
| 테이블 기반 구조화 | Qodo, CodeRabbit | 다차원 데이터 스캔성 |
| PR 라벨 자동 부여 | Qodo | PR 목록 레벨 사전 트리아지 |
| 유사 이슈 클러스터링 | Copilot | 알림 피로도 감소 |
| `suggestion` 코드 블록 | 전체 | 원클릭 적용 |
| 코멘트 수량 제한 | Copilot (~5), Augment | 신호 대 잡음 비율 최적화 |

---

## 3. 개선 방안

### 3.1 Issues 섹션 구조화

**현재** (`review-formatter.ts:72-78`):

```markdown
## 발견된 문제점

- 🚨 **CRITICAL** · 🐛 bug · `file.ts`
  에러 처리 전략이 일관적이지 않습니다. 일부 함수(예: getUserProfile, getConnectedRepositories)는 Error 객체를 throw하는 반면...
```

**개선안**:

```markdown
## 발견된 문제점

### 🚨 CRITICAL · 🐛 bug · `module/settings/actions/index.ts`

에러 처리 전략이 일관적이지 않습니다.

**Throw 패턴:**
- `getUserProfile`, `getConnectedRepositories`, `disconnectRepository`

**Result 객체 패턴:**
- `updateUserProfile`, `disconnectAllRepositories`
- 반환: `{ success: false, message: string }`

**영향:** `useQuery` / `useMutation`에서 에러 처리 방식이 달라져 컴포넌트 혼란 발생
**권장:** 하나의 에러 처리 전략으로 통일
```

**핵심 변경 사항**:

| 변경 | 이유 |
|------|------|
| 이슈별 `###` 헤더 사용 | 각 이슈를 독립된 시각적 블록으로 분리 |
| description을 구조화된 마크다운으로 출력 | AI가 생성한 설명을 그대로 렌더링 (줄바꿈 보존) |
| `\n`을 공백으로 치환하는 로직 제거 | 현재 `.replace(/[\r\n]+/g, " ")` 가 구조를 파괴 |

**구현 변경** — `review-formatter.ts`:

```typescript
// 현재 (line 76) — 줄바꿈을 공백으로 치환
const desc = i.description.replace(/[\r\n]+/g, " ").trim();
return `- ${sev} · ${cat}${fileTag}  \n  ${desc}`;

// 개선안 — 구조 보존 + 헤더 분리 + bold 제거 (### 헤더 내에서 bold 불필요)
const sev = `${SEVERITY_EMOJI[i.severity]} ${i.severity}`;
const desc = i.description.trim();
return `### ${sev} · ${cat}${fileTag}\n\n${desc}`;
```

### 3.2 Walkthrough 섹션 Collapsible 처리

**현재**: Walkthrough가 항상 펼쳐져 있어 파일 수가 많으면 리뷰 본문을 지배.

**개선안**:

```markdown
<details>
<summary>

## 변경 사항 상세

</summary>

| 파일 | 변경 | 설명 |
|------|------|------|
| 🆕 `new-file.ts` | added | 새 유틸리티 함수 추가 |
| ✏️ `existing.ts` | modified | 에러 핸들링 로직 개선 |

</details>
```

**핵심 변경 사항**:

| 변경 | 이유 |
|------|------|
| `<details>` 래핑 | 파일 수 많을 때 접어서 노이즈 감소 |
| 리스트 → 테이블 전환 | 파일/변경유형/설명을 정렬된 컬럼으로 스캔성 향상 |

**구현 변경** — `review-formatter.ts`:

```typescript
// 현재 (line 44-56) — 리스트 형태
if (output.walkthrough && output.walkthrough.length > 0) {
  const walkthroughLines = [`## ${headers.walkthrough}`, ""];
  for (const entry of output.walkthrough) {
    const emoji = CHANGE_EMOJI[entry.changeType] ?? "📄";
    walkthroughLines.push(
      `${emoji} **\`${entry.file}\`**`,
      `> ${entry.summary}`,
      "",
    );
  }
  sections.push(walkthroughLines.join("\n"));
}

// 개선안 — collapsible 테이블
if (output.walkthrough && output.walkthrough.length > 0) {
  const tableRows = output.walkthrough.map((entry) => {
    const emoji = CHANGE_EMOJI[entry.changeType] ?? "📄";
    const safeSummary = entry.summary.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
    return `| ${emoji} \`${entry.file}\` | ${entry.changeType} | ${safeSummary} |`;
  });
  const table = [
    `| File | Change | Summary |`,
    `|------|--------|---------|`,
    ...tableRows,
  ].join("\n");

  sections.push(
    `<details>\n<summary>\n\n## ${headers.walkthrough}\n\n</summary>\n\n${table}\n\n</details>`
  );
}
```

### 3.3 Strengths 섹션 Collapsible 처리

리뷰의 핵심은 문제점과 제안이다. 강점은 참고 정보이므로 접어둔다.

**개선안**:

```markdown
<details>
<summary>

## 강점

</summary>

- 일관된 네이밍 컨벤션 사용
- 적절한 에러 바운더리 설정

</details>
```

**구현 변경** — `review-formatter.ts`:

```typescript
// 현재 (line 62-65)
if (output.strengths.length > 0) {
  const items = output.strengths.map(s => `- ${s}`).join("\n");
  sections.push(`## ${headers.strengths}\n\n${items}`);
}

// 개선안 — collapsible
if (output.strengths.length > 0) {
  const items = output.strengths.map(s => `- ${s}`).join("\n");
  sections.push(
    `<details>\n<summary>\n\n## ${headers.strengths}\n\n</summary>\n\n${items}\n\n</details>`
  );
}
```

### 3.4 Suggestions 섹션 테이블화

**현재**:

```markdown
## 개선 제안

- **file.ts:42** [WARNING]: 설명 텍스트
- **file.ts:87** [SUGGESTION]: 설명 텍스트
```

**개선안**:

```markdown
## 개선 제안

| 심각도 | 파일 | 라인 | 설명 |
|--------|------|------|------|
| ⚠️ WARNING | `file.ts` | 42 | 설명 텍스트 |
| 💡 SUGGESTION | `file.ts` | 87 | 설명 텍스트 |

> 각 제안은 해당 코드 라인에 인라인 코멘트로도 제공됩니다.
```

**구현 변경** — `review-formatter.ts`:

```typescript
// 현재 (line 82-87) — 리스트 형태
if (output.suggestions.length > 0) {
  const items = output.suggestions.map(s =>
    `- **${s.file}:${s.line}** [${s.severity}]: ${s.explanation}`
  ).join("\n");
  sections.push(`## ${headers.suggestions}\n\n${items}`);
}

// 개선안 — 테이블 형태 (파이프 이스케이프로 테이블 깨짐 방지)
if (output.suggestions.length > 0) {
  const rows = output.suggestions.map(s => {
    const safeExplanation = s.explanation.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
    return `| ${SEVERITY_EMOJI[s.severity]} ${s.severity} | \`${s.file}\` | ${s.line} | ${safeExplanation} |`;
  });
  const table = [
    `| Severity | File | Line | Description |`,
    `|----------|------|------|-------------|`,
    ...rows,
  ].join("\n");
  sections.push(`## ${headers.suggestions}\n\n${table}`);
}
```

### 3.5 인라인 이슈 코멘트 구조화

**현재** (`pr-review.ts:111-113`):

```
🐛 🚨 **CRITICAL** | bug

에러 설명이 한 줄로 길게 이어지는 텍스트...
```

**개선안**:

```
### 🚨 CRITICAL · 🐛 bug

에러 설명 (마크다운 구조 보존)
```

> 참고: `---\n*Generated by HReviewer*` 푸터는 `postPRReviewWithSuggestions()`의 review body에서 이미 추가됨 (pr-review.ts:70). 인라인 코멘트에는 별도 푸터 불필요.

**구현 변경** — `pr-review.ts`:

```typescript
// 현재 (line 111-113)
function formatIssueComment(issue: StructuredIssue): string {
  return `${CATEGORY_EMOJI[issue.category]} ${SEVERITY_EMOJI[issue.severity]} **${issue.severity}** | ${issue.category}\n\n${issue.description}`;
}

// 개선안 — 헤더 분리 + 구조 보존
function formatIssueComment(issue: StructuredIssue): string {
  return `### ${SEVERITY_EMOJI[issue.severity]} ${issue.severity} · ${CATEGORY_EMOJI[issue.category]} ${issue.category}\n\n${issue.description}`;
}
```

### 3.6 AI 프롬프트 측 구조화 지시

Issues의 `description` 필드가 현재 단일 문장/문단으로 생성되고 있다. AI 프롬프트에서 구조화된 마크다운 출력을 지시해야 한다.

**추가할 프롬프트 지시** — `review-prompt.ts`의 `buildStructuredPrompt()` 함수 (line 129-135, 기존 issue instruction 직후에 추가):

```
Each issue description MUST use structured markdown:
- First line: one-sentence summary of the problem
- If relevant, use bullet lists or bold labels to separate:
  - **Affected:** list of affected items
  - **Impact:** why this matters
  - **Recommendation:** what to do
- Keep the total under 150 words per issue
- Do NOT write everything in a single paragraph
```

### 3.7 웹앱 리뷰 렌더링 동기화

`module/review/ui/parts/structured-review-body.tsx`의 `RemainingMarkdownSections` 함수에 **동일한 포맷 로직이 중복 존재**한다. `review-formatter.ts` 변경 시 반드시 함께 수정해야 한다.

**현재 중복 코드** (`structured-review-body.tsx:128-135`):

```typescript
const bodyIssues = (data.issues ?? []).filter((i) => i.line === null);
if (bodyIssues.length > 0) {
  const issueLines = bodyIssues.map((issue) => {
    const sev = `${SEVERITY_EMOJI[issue.severity]} **${issue.severity}**`;
    const cat = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
    const fileTag = issue.file ? ` · \`${issue.file}\`` : "";
    const desc = issue.description.replace(/[\r\n]+/g, " ").trim();
    return `- ${sev} · ${cat}${fileTag}  \n  ${desc}`;
  });
  sections.push(`## ${headers.issues}\n\n${issueLines.join("\n\n")}`);
}
```

**개선안** — issues (`structured-review-body.tsx`):

```typescript
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

**현재 중복 코드** (`structured-review-body.tsx:138-142`):

```typescript
if (data.suggestions && data.suggestions.length > 0) {
  const sugLines = data.suggestions.map(
    (s) => `- **${s.file}:${s.line}** [${s.severity}]: ${s.explanation}`
  );
  sections.push(`## ${headers.suggestions}\n\n${sugLines.join("\n")}`);
}
```

**개선안** — suggestions (`structured-review-body.tsx`):

```typescript
if (data.suggestions && data.suggestions.length > 0) {
  const rows = data.suggestions.map(s => {
    const safeExplanation = s.explanation.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
    return `| ${SEVERITY_EMOJI[s.severity]} ${s.severity} | \`${s.file}\` | ${s.line} | ${safeExplanation} |`;
  });
  const table = [
    `| Severity | File | Line | Description |`,
    `|----------|------|------|-------------|`,
    ...rows,
  ].join("\n");
  sections.push(`## ${headers.suggestions}\n\n${table}`);
}
```

> **참고**: 웹앱은 `ReactMarkdown` + `remarkGfm`으로 렌더링하므로 GFM 테이블은 정상 지원된다. 단, `<details>/<summary>` HTML 태그는 `rehype-raw` 플러그인 없이는 렌더링되지 않는다. 웹앱의 `StructuredReviewBody`는 구조화 데이터에서 직접 렌더링하므로 collapsible이 불필요하지만, `structuredData`가 null인 fallback 경로(마크다운 직접 렌더링)에서는 `<details>` 태그가 제거될 수 있다. 이는 기존 리뷰 데이터의 fallback 렌더링에만 해당하며, 신규 리뷰는 `StructuredReviewBody` 경로를 사용하므로 영향이 제한적이다.

---

## 4. 전체 리뷰 출력 Before/After

### Before (현재)

```markdown
## AI Code Review

## 요약

> **🟡 Medium Risk**

설정 모듈의 에러 처리 전략이 불일치합니다.

## 변경 사항 상세

✏️ **`module/settings/actions/index.ts`**
> 에러 처리 로직 수정

✏️ **`module/settings/components/profile.tsx`**
> 프로필 컴포넌트 업데이트

## 강점

- 기존 코드 구조를 잘 유지
- 타입 안전성 확보

## 발견된 문제점

- ⚠️ **WARNING** · 🔀 design · `module/settings/actions/index.ts`
  파일 내 액션 함수들의 에러 처리 전략이 일관적이지 않습니다. 일부 함수(예: getUserProfile, getConnectedRepositories, disconnectRepository)는 에러 발생 시 Error 객체를 throw하는 반면, 다른 함수(예: updateUserProfile, disconnectAllRepositories - 제안 적용 시)는 { success: false, message: string } 형태의 객체를 반환합니다. 이로 인해 useQuery 및 useMutation 을 사용하는 컴포넌트에서 에러를 처리하는 방식이 혼란스러울 수 있으므로, 일관된 전략을 채택하는 것이 중요합니다.

## 개선 제안

- **module/settings/actions/index.ts:42** [WARNING]: updateUserProfile 함수의 에러 처리를 throw 패턴으로 통일

---
*Generated by HReviewer*
```

### After (개선안)

```markdown
## AI Code Review

## 요약

> **🟡 Medium Risk**

설정 모듈의 에러 처리 전략이 불일치합니다.

**리뷰 포인트**

- 에러 처리 패턴 통일 필요

<details>
<summary>

## 변경 사항 상세

</summary>

| File | Change | Summary |
|------|--------|---------|
| ✏️ `module/settings/actions/index.ts` | modified | 에러 처리 로직 수정 |
| ✏️ `module/settings/components/profile.tsx` | modified | 프로필 컴포넌트 업데이트 |

</details>

<details>
<summary>

## 강점

</summary>

- 기존 코드 구조를 잘 유지
- 타입 안전성 확보

</details>

## 발견된 문제점

### ⚠️ WARNING · 🔀 design · `module/settings/actions/index.ts`

에러 처리 전략이 일관적이지 않습니다.

**Throw 패턴:**
- `getUserProfile`, `getConnectedRepositories`, `disconnectRepository`

**Result 객체 패턴:**
- `updateUserProfile`, `disconnectAllRepositories`
- 반환: `{ success: false, message: string }`

**영향:** `useQuery` / `useMutation`에서 에러 처리 방식이 혼란스러워집니다.
**권장:** 하나의 에러 처리 전략으로 통일하세요.

## 개선 제안

| Severity | File | Line | Description |
|----------|------|------|-------------|
| ⚠️ WARNING | `module/settings/actions/index.ts` | 42 | updateUserProfile 함수의 에러 처리를 throw 패턴으로 통일 |

---
*Generated by HReviewer*
```

---

## 5. 수정 대상 파일 목록

| 파일 | 변경 내용 | 우선순위 |
|------|-----------|----------|
| `module/ai/lib/review-formatter.ts` | Issues 헤더 분리, 줄바꿈 치환 제거, Walkthrough collapsible + 테이블, Strengths collapsible, Suggestions 테이블 | P0 |
| `module/ai/lib/review-prompt.ts` | `buildStructuredPrompt()`의 issue instruction 직후에 description 구조화 마크다운 지시 추가 | P0 |
| `module/review/ui/parts/structured-review-body.tsx` | `RemainingMarkdownSections`의 issues/suggestions 포맷을 `review-formatter.ts`와 동기화 (줄바꿈 치환 제거, 헤더 분리, 테이블화) | P0 |
| `module/github/lib/pr-review.ts` | `formatIssueComment()` 헤더 분리 | P1 |
| `shared/constants/index.ts` | 테이블 헤더 다국어 상수 추가 (필요시) | P2 |

---

## 6. 구현 시 주의사항

### 테이블 셀 줄바꿈 처리

- Markdown 테이블에서 셀 내 `\n`은 행을 깨뜨림
- AI가 생성하는 `summary`(walkthrough), `explanation`(suggestions)은 `z.string()` 타입으로 줄바꿈을 포함할 수 있음
- **모든 테이블 셀 값**에 `.replace(/[\r\n]+/g, " ")`을 적용하여 줄바꿈을 공백으로 치환해야 함
- 파이프 이스케이프(`.replace(/\|/g, "\\|")`)와 함께 체이닝

### GitHub Markdown 렌더링 제약

- `<details>` 내부에서 마크다운 헤더(`##`)를 사용하려면 `<summary>` 태그 뒤에 **빈 줄**이 필요
- 테이블은 `<details>` 내부에서도 정상 렌더링됨
- Mermaid 코드 블록은 `<details>` 내부에서 정상 렌더링됨

### AI 프롬프트 변경 영향

- `description` 필드의 구조가 변경되므로, 기존 `replace(/[\r\n]+/g, " ")` 로직을 **반드시 제거**해야 함
- 프롬프트 변경 후 다양한 PR 크기(tiny/small/normal/large)에서 출력 검증 필요
- `structuredReviewSchema`의 `description` 필드는 `string` 타입이므로 마크다운을 포함해도 스키마 변경 불필요

### 웹앱 렌더링 경로와 `<details>` 태그

- **구조화 경로** (`StructuredReviewBody`): `reviewData` JSON에서 직접 렌더링 → `<details>` 미사용, 영향 없음
- **Fallback 경로** (`ReactMarkdown`): `review` 컬럼의 마크다운을 렌더링 → `<details>` 태그 제거됨 (`rehype-raw` 미사용)
- Fallback은 `schemaVersion` 불일치 또는 `reviewData` 파싱 실패 시에만 발동 (`page.tsx:23-30`)
- **권장**: 신규 리뷰는 `StructuredReviewBody` 경로를 통해 렌더링되므로 당장 문제 없음. 향후 `rehype-raw` 추가를 검토

### 하위 호환성

- `reviewData` JSON에 저장된 기존 리뷰 데이터는 구 포맷
- 앱 내에서 리뷰를 다시 렌더링하는 경우, 구/신 포맷을 모두 처리할 수 있어야 함
- `schemaVersion` 필드를 활용하여 포맷 버전 구분 가능
- `REVIEW_SCHEMA_VERSION` (`review-schema.ts:18`) 증가 여부: 이번 변경은 `StructuredReviewOutput`의 필드 구조를 변경하지 않으므로 (`description`은 여전히 `string`) 스키마 버전 변경 불필요. 단, AI가 생성하는 `description` 내용의 형태(단일 문단 → 구조화 마크다운)가 변경되므로, 구 리뷰의 `description`을 신 포맷으로 렌더링해도 깨지지 않는지 확인 필요

---

## 7. 향후 고려사항 (이번 스코프 밖)

다음 항목은 이번 개선 범위에 포함하지 않되, 추후 검토할 가치가 있다.

| 항목 | 참고 서비스 | 설명 |
|------|-------------|------|
| PR 라벨 자동 부여 | Qodo | `review effort [3/5]`, `risk: high` 등 PR 목록에서 사전 트리아지 |
| Review Effort 점수 | Qodo | 리뷰어가 시간 할당을 사전에 판단 |
| Key Issues 분리 | Qodo | 전체 이슈 중 가장 중요한 1-3개를 요약 상단에 별도 표시 |
| 유사 이슈 클러스터링 | GitHub Copilot | 같은 패턴의 이슈를 하나의 코멘트로 통합 |
| 기존 코멘트 업데이트 | Qodo | 새 push 시 새 코멘트 대신 기존 코멘트 수정 |
| PR description 요약 삽입 | CodeRabbit | 코멘트를 열기 전에 요약을 볼 수 있도록 |

---

## 8. 참고 자료

- [CodeRabbit Walkthroughs Documentation](https://docs.coderabbit.ai/pr-reviews/walkthroughs)
- [CodeRabbit Configuration Reference](https://docs.coderabbit.ai/reference/configuration)
- [Qodo Merge Review Tool Documentation](https://qodo-merge-docs.qodo.ai/tools/review/)
- [PR-Agent GitHub Repository](https://github.com/qodo-ai/pr-agent)
- [GitHub Copilot Code Review Docs](https://docs.github.com/copilot/using-github-copilot/code-review/using-copilot-code-review)
- [60 Million Copilot Code Reviews - GitHub Blog](https://github.blog/ai-and-ml/github-copilot/60-million-copilot-code-reviews-and-counting/)
- [SonarQube Cloud Pull Request Analysis](https://docs.sonarsource.com/sonarqube-cloud/improving/pull-request-analysis)
- [Codacy GitHub Integration Docs](https://docs.codacy.com/repositories-configure/integrations/github-integration/)
- [Greptile AI Code Review Guide](https://www.greptile.com/what-is-ai-code-review)
- [Augment Code Review Docs](https://docs.augmentcode.com/codereview/overview)
- [GitHub Collapsible Sections Docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections)
