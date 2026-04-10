# Walkthrough 테이블 렌더링/인코딩 버그 수정 명세

> **작성일**: 2026-04-10
> **최종 업데이트**: 2026-04-10 (2차 리스크 분석 반영: GitHub API 인코딩 선행 검증, rename 처리, bullet list fallback, basename 충돌 모니터링)
> **상태**: TODO
> **관련 파일**: `module/ai/lib/review-formatter.ts`, `module/ai/lib/review-prompt.ts`, `module/github/lib/diff-parser.ts`, `inngest/functions/review.ts`

## 0. 필수 선행 검증 (🚨 구현 착수 전 P0)

본 스펙의 모든 fix는 **"GitHub API가 diff 텍스트에 octal escape(`\353\263\200...`)를 포함해 반환한다"**는 전제에 의존한다. 증거는 로컬 `git status` 결과이며, 이는 *로컬 git CLI*의 `core.quotepath` 동작이다. GitHub 서버(`octokit.rest.pulls.get({ mediaType: { format: "diff" } })`)가 같은 포맷을 낸다는 보장이 없다.

**구현 시작 전 반드시 다음을 확인한다** (1회, ~30분):

1. 테스트 저장소에 한글 파일(`public/테스트.png`) 하나를 포함한 PR 생성
2. `module/github/lib/github.ts:232-243`의 `getPullRequestDiff` 호출 직후 임시 로그 삽입:
   ```ts
   const { data: diff } = await octokit.rest.pulls.get({ ... });
   console.log("[diff-encoding-probe] hex head:", Buffer.from(diff as string).toString("hex").slice(0, 300));
   console.log("[diff-encoding-probe] has octal escape:", /\\\d{3}/.test(diff as string));
   console.log("[diff-encoding-probe] has UTF-8 Hangul:", /[\uAC00-\uD7A3]/.test(diff as string));
   ```
3. Inngest dev 서버에서 PR 리뷰를 한 번 트리거해 로그 확인

**결과별 행동**:
- `has octal escape: true` → 본 스펙 그대로 진행
- `has UTF-8 Hangul: true` (escape 없음) → **본 스펙 전체 재작성 필요**. mojibake의 원인은 다른 계층(예: Gemini 응답 인코딩, HTML escape 누락, DB JSON 직렬화 등)에 있으므로 증상 재재현·원인 재분석이 선행돼야 한다
- 둘 다 true (혼재) → 스펙 3.1의 `unescapeGitPath`를 유지하되, 별도 UTF-8 경로에도 pass-through가 작동하는지 재검증

본 검증이 본 스펙의 **유일한 P0 precondition**이다. 통과해야 구현 착수.

---

## 범위 명시 (Out of Scope)

- **Fallback 경로 (비구조화 출력)**: `buildFallbackPrompt` 경로(`review.ts:85-93`)는 구조화 출력이 실패했을 때만 사용된다. 이 경로는 free-form markdown을 생성하고 walkthrough 재생성이 불가능하므로 **본 스펙의 수정은 적용되지 않는다**. 결과: 구조화 출력 실패 시 한글 파일명은 여전히 raw diff를 echo한 AI 출력에 의존한다. 프로덕션 영향도는 낮음 (구조화 출력 성공률 기준).
- **기존 DB `reviewData`**: `REVIEW_SCHEMA_VERSION`을 올리지 않으므로 과거 리뷰에 저장된 escape 경로는 **그대로 남는다**. `app/dashboard/.../page.tsx`에서 기존 `reviewData`로 walkthrough를 재렌더링하는 뷰가 있다면 과거 기록은 mojibake 상태를 유지한다 (신규 리뷰부터만 정상화). 필요 시 별도 백필 스크립트가 필요하지만 본 스펙 범위 밖.

---

## 1. 문제 정의

GitHub에 포스팅된 PR Review의 **"변경 사항 상세"(Walkthrough)** 테이블에서 두 개의 시각적 결함이 관찰된다.

### 1.1 증상

| # | 결함 | 관찰된 현상 |
|---|------|-------------|
| 1 | **컬럼 폭 붕괴** | `Change` 헤더가 세로로 `Ch / an / ge`로 줄바꿈. File 컬럼은 긴 경로가 어색하게 wrap됨. Summary 컬럼만 넓게 차지. |
| 2 | **한글 파일명 mojibake** | `public/변경 사항 상세.png`가 `public/∞╟ß╡...`처럼 깨진 문자로 렌더링됨. |

두 결함 모두 hreviewer의 핵심 제품(AI가 생성한 PR 리뷰)의 신뢰성을 직접 훼손한다.

### 1.2 영향 범위

- `formatStructuredReviewToMarkdown()` — walkthrough 테이블 마크다운 생성 (`review-formatter.ts`)
- `extractFileMeta()` — diff에서 파일 목록 추출 후 AI 프롬프트 구성 (`review-prompt.ts`)
- `parseDiffFiles()` / `extractDiffFileSet()` — diff 파일 경로 정규화 및 검증 (`diff-parser.ts`)
- `generateReview` Inngest 함수 — walkthrough 검증 누락 (`inngest/functions/review.ts`)

---

## 2. 근본 원인 분석

### 2.1 Bug 1 — 컬럼 폭 붕괴

**위치**: `module/ai/lib/review-formatter.ts:44-60`

```typescript
const table = [
  `| File | Change | Summary |`,
  `|------|--------|---------|`,
  ...tableRows,
].join("\n");
```

GitHub GFM 렌더러는 **separator의 dash 개수를 완전히 무시**한다. 컬럼 폭은 CSS `table-layout: auto` 규칙에 따라 **가장 긴 토큰 기준**으로 자동 결정된다. 백틱으로 감싼 긴 파일 경로(`<code>`)가 File 컬럼을 확장하고, Summary가 대부분의 남은 공간을 가져가서 Change 컬럼은 최소 폭까지 눌린다. 그 결과 `Change` 헤더가 폭에 맞지 않아 세로로 줄바꿈된다.

**Dash 개수 조정이나 pipe-table alignment(`:---:`)로는 해결되지 않는다.** 테이블 구조를 유지하는 한 auto-layout 엔진에 의해 같은 현상이 반복되므로, **테이블 자체를 포기하고 bullet list로 전환**하는 것이 가장 확실한 해결책이다 (3.3 참조).

### 2.2 Bug 2 — 한글 파일명 mojibake

**근본 원인**: Git의 기본 설정 `core.quotepath=true`는 non-ASCII 경로 바이트를 **octal 이스케이프 시퀀스**로 직렬화한다. 로컬 `git status` 실행으로 확증됨:

```
?? "public/\353\263\200\352\262\275 \354\202\254\355\225\255 \354\203\201\354\204\270.png"
```

`\353\263\200` (octal) = `0xEB 0xB3 0x80` (hex) = UTF-8 `변`.

**오염 파이프라인**:

```
GitHub API (format: "diff")
    ↓  diff 헤더에 "a/public/\353\263\200..." 포함
getPullRequestDiff() — module/github/lib/github.ts:232-243
    ↓
┌───────────────────────────────┬─────────────────────────────────┐
↓                               ↓                                 ↓
extractFileMeta()               parseDiffFiles()                  (raw diff)
review-prompt.ts:8-29           diff-parser.ts:11-30              │
정규식이 escape를 그대로 캡처   parse-diff가 escape를 그대로 반환 │
    ↓                               ↓                             │
fileContext (AI 프롬프트)       extractDiffFileSet()              │
"\353\263\200..."              "\353\263\200..."                  │
    ↓                               ↓                             ↓
               buildStructuredPrompt() — 프롬프트에 raw diff + fileContext 주입
                                   ↓
                              Gemini (구조화 출력)
                                   ↓
                   walkthrough[].file: "..." ← AI가 escape를 부분 해석 시도 → mojibake
                                   ↓
validate-review step (review.ts:97-164)
  - issues는 extractDiffFileSet으로 검증됨 (line 115-128) ✓
  - walkthrough는 검증 없음 ✗  ← 오염된 filename이 그대로 통과
                                   ↓
formatStructuredReviewToMarkdown() — 마크다운에 오염된 파일명 삽입
                                   ↓
                              GitHub에 포스팅 → mojibake 렌더링
```

**결정적 취약점**: `issues`는 `extractDiffFileSet`과 교집합으로 검증(`review.ts:115-128`)되는 반면 `walkthrough`는 검증 없이 통과한다. 이 비대칭으로 AI가 echo한 오염된 filename이 최종 마크다운에 도달한다.

---

## 3. 해결 방안

총 4개 파일을 수정한다. 인코딩 수정은 **소스(diff parser) 경계**에서 1회 적용하여 하위 모든 소비자가 자동으로 정상 경로를 받도록 한다. 테이블 수정은 formatter에 국소화한다.

### 3.1 `unescapeGitPath` 유틸 추가 + diff parser에 적용

**파일**: `module/github/lib/diff-parser.ts`

Git의 quoted path 포맷을 역변환하는 유틸을 추가한다. Quote 제거 → `\NNN` octal escape를 raw byte로 디코드 → UTF-8 Buffer로 최종 문자열 생성.

> **parse-diff 동작 확인 (2026-04-10)**: `node_modules/parse-diff/index.js`의 `parseOldOrNewFile`는 `qoutedFileNameRegex = /^\\?['"]|\\?['"]$/g`로 **앞뒤 quote만** 제거하고 octal escape(`\353` 등)는 **그대로 보존**한다. 따라서 `parseDiffFiles`의 `f.to`/`f.from`은 `public/\353\263\200.png` 형태(quote 없음, escape 유지)로 들어온다. `unescapeGitPath`의 quote 제거 분기(`path.startsWith('"')`)는 parseDiffFiles 경로에서는 dead code이지만, raw diff를 직접 파싱하는 `extractFileMeta`(3.2)에서는 여전히 유효하므로 유지한다.

**추가 함수**:

```typescript
/**
 * Git core.quotepath=true 모드가 출력하는 quoted path를 역변환한다.
 *   입력: "public/\353\263\200\352\262\275 \354\202\254\355\225\255.png"
 *   출력: public/변경 사항.png
 * Quote가 없거나 backslash가 없는 경우 그대로 반환 (fast path).
 */
export function unescapeGitPath(path: string): string {
  const unquoted =
    path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
  if (!unquoted.includes("\\")) return unquoted;

  const bytes: number[] = [];
  let i = 0;
  while (i < unquoted.length) {
    const ch = unquoted[i];
    if (
      ch === "\\" &&
      i + 3 < unquoted.length &&
      /^[0-7]{3}$/.test(unquoted.slice(i + 1, i + 4))
    ) {
      bytes.push(parseInt(unquoted.slice(i + 1, i + 4), 8));
      i += 4;
    } else if (ch === "\\" && i + 1 < unquoted.length) {
      const next = unquoted[i + 1];
      // git은 다음 C-style escape도 생성할 수 있다 (core.quotepath 참조).
      // 실전 파일명에 \a\b\v\f는 거의 없지만 silent corruption을 방지하기 위해 포함한다.
      const cEscape: Record<string, number> = {
        a: 0x07, b: 0x08, t: 0x09, n: 0x0a, v: 0x0b,
        f: 0x0c, r: 0x0d, '"': 0x22, "\\": 0x5c,
      };
      bytes.push(cEscape[next] ?? next.charCodeAt(0));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0) & 0xff);
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf-8");
}
```

**`parseDiffFiles` 적용** (`diff-parser.ts:11-30`):

현재 구현은 `f.to && f.to !== "/dev/null"` 필터로 **삭제 파일을 제외**한다. 이 상태로 3.4의 walkthrough 검증을 추가하면 `extractFileMeta`가 프롬프트에 넣은 `deleted` 엔트리를 AI가 정상 생성하더라도 검증 단계에서 전부 drop되어 **삭제 행이 walkthrough 표에서 사라지는 기능 회귀**가 발생한다. 따라서 필터와 매핑을 함께 완화한다.

```typescript
// 현재 (line 14-29)
return files
  .filter((f) => f.to && f.to !== "/dev/null")
  .map((f) => {
    const addedLines: number[] = [];
    for (const chunk of f.chunks) {
      for (const change of chunk.changes) {
        if (change.type === "add" && "ln" in change) {
          addedLines.push(change.ln);
        }
      }
    }
    return {
      filePath: f.to!,
      addedLines,
    };
  });

// 개선안 — rename은 from/to 둘 다 유효 경로임에 유의
return files
  .filter((f) => {
    const hasTo = f.to && f.to !== "/dev/null";
    const hasFrom = f.from && f.from !== "/dev/null";
    return hasTo || hasFrom;
  })
  .map((f) => {
    const hasTo = f.to && f.to !== "/dev/null";
    const hasFrom = f.from && f.from !== "/dev/null";
    // 삭제: from만 존재 / 추가: to만 존재 / 수정·rename: 둘 다 존재
    const rawPath = hasTo ? f.to! : f.from!;
    // rename이면 originalPath도 노출해 validator가 AI가 old/new 어느 쪽을 써도 매치하게 함
    const isRename = hasTo && hasFrom && f.to !== f.from;
    const addedLines: number[] = [];
    for (const chunk of f.chunks) {
      for (const change of chunk.changes) {
        if (change.type === "add" && "ln" in change) {
          addedLines.push(change.ln);
        }
      }
    }
    return {
      filePath: unescapeGitPath(rawPath),
      addedLines,
      originalPath: isRename ? unescapeGitPath(f.from!) : undefined,
    };
  });
```

**`ChangedFileInfo` 인터페이스 갱신** (`diff-parser.ts:3-6`) — optional 필드 추가이므로 기존 소비자는 영향 없음:

```ts
export interface ChangedFileInfo {
  filePath: string;
  addedLines: number[];
  /** rename 케이스일 때만 존재. diff의 `a/` 쪽(old path). */
  originalPath?: string;
}
```

**`extractDiffFileSet` 갱신** (`diff-parser.ts:50-52`) — rename의 old path도 set에 포함하여 AI가 두 경로 중 어느 쪽을 echo하더라도 정확 매치가 되도록 한다:

```ts
export function extractDiffFileSet(diffText: string): Set<string> {
  const set = new Set<string>();
  for (const f of parseDiffFiles(diffText)) {
    set.add(f.filePath);
    if (f.originalPath) set.add(f.originalPath);
  }
  return set;
}
```

**`parseDiffToChangedFiles` 출력 포맷 개선** (`diff-parser.ts:35-44`) — 기존에는 added 파일 중심이었기 때문에 `- path: added lines [n1, n2]` 포맷만 있었으나, 필터 완화로 삭제/rename 파일이 포함되면서 `added lines [none]`이라는 **changeType 정보가 없는** 모호한 라인이 AI 프롬프트에 주입된다. 다음과 같이 changeType 라벨을 붙여 의미를 명확히 한다:

```ts
export function parseDiffToChangedFiles(diffText: string): string {
  const files = parseDiffFiles(diffText);

  return files
    .map((f) => {
      const lineRanges = summarizeLineRanges(f.addedLines);
      if (f.addedLines.length === 0) {
        // 삭제 또는 rename(내용 변경 없음) — 라벨로 의도 명시
        return f.originalPath
          ? `- ${f.filePath} (renamed from ${f.originalPath})`
          : `- ${f.filePath} (deleted)`;
      }
      return `- ${f.filePath}: added lines [${lineRanges}]`;
    })
    .join("\n");
}
```

이 변경으로:

- **삭제 파일까지 포함한** 완전한 파일 목록을 `parseDiffFiles`, `parseDiffToChangedFiles`, `extractDiffFileSet`이 반환
- **rename의 old/new 경로를 둘 다** `extractDiffFileSet`에 포함 → AI가 old 경로를 walkthrough entry에 써도 3.4 검증을 통과
- **정규화된 UTF-8 경로**를 모든 소비자가 수신
- `## Changed Files` 섹션과 `extractFileMeta`의 `fileContext` 섹션이 일관된 의미(`(deleted)`, `(renamed from ...)`)를 전달 → AI가 삭제/rename 파일을 "added line 없음 ≒ 무시"로 오해할 가능성이 사라짐

기존 `issues` 검증(`review.ts:115-128`)과 신규 walkthrough 검증(3.4)이 모두 add/modify/delete/rename 전 범위에서 한글 파일에 대해 올바르게 작동한다.

### 3.2 AI 프롬프트의 파일 목록 정규화

**파일**: `module/ai/lib/review-prompt.ts`

`extractFileMeta`가 `diff --git` 헤더에서 정규식으로 캡처한 경로를 그대로 쓰고 있다. `unescapeGitPath`를 적용한다.

```typescript
// 파일 상단에 import 추가
import { unescapeGitPath } from "@/module/github/lib/diff-parser";

// 현재 (line 18)
const file = fileMatch[1];

// 개선안
const file = unescapeGitPath(fileMatch[1]);
```

이 변경으로 프롬프트의 `## Changed Files` 블록이 `- public/변경 사항 상세.png (deleted)`처럼 정상 한글로 주입된다. 기존 프롬프트의 지시문(`review-prompt.ts:151` — `Use EXACTLY these file paths and changeType values in your walkthrough entries`)과 결합되어, 하위 diff 블록에 여전히 escape가 남아 있더라도 AI는 정상 파일명을 echo하게 된다.

### 3.3 Markdown pipe-table → Bullet list 전환

**파일**: `module/ai/lib/review-formatter.ts`

Bug 1(컬럼 폭 붕괴)의 근본 원인은 GitHub GFM 렌더러가 가장 긴 토큰 기준으로 컬럼 폭을 자동 결정하기 때문이다. 이 동작은 pipe-table과 HTML 테이블 모두에서 공통이므로, **테이블 구조 자체를 포기하고 bullet list로 전환**한다. 밀도는 다소 감소하지만 컬럼 폭 문제가 원천 차단되고 모든 GitHub 환경에서 동일하게 렌더링된다.

**Walkthrough 블록 교체** (`review-formatter.ts:44-60`):

```typescript
// 현재
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

// 개선안 — bullet list 전환
if (output.walkthrough && output.walkthrough.length > 0) {
  const items = output.walkthrough
    .map((entry) => {
      const emoji = CHANGE_EMOJI[entry.changeType] ?? "📄";
      const summaryOneLine = entry.summary.replace(/[\r\n]+/g, " ");
      return `- ${emoji} \`${entry.file}\` **(${entry.changeType})** — ${summaryOneLine}`;
    })
    .join("\n");

  sections.push(
    `<details>\n<summary>\n\n## ${headers.walkthrough}\n\n</summary>\n\n${items}\n\n</details>`
  );
}
```

**주의 사항**:

- 파일명은 백틱(`` ` ``)으로 감싸 monospace로 렌더링됨. 파일명에 `` ` ``가 포함되는 극단 케이스는 실전에서 거의 없으므로 별도 이스케이프 생략.
- `<details>`/`<summary>` 래퍼는 유지되어 collapsible 동작이 그대로 보존됨.
- changeType은 `**(added)**` / `**(deleted)**` 등 bold로 시각적 구분.
- Summary 줄바꿈 처리는 7.1 참조.

### 3.4 Walkthrough 검증 + validation 후 마크다운 재생성

**파일**: `inngest/functions/review.ts`

Changes 3.1/3.2에도 불구하고 AI가 raw diff 블록에서 escape 경로를 copy할 수 있다. `issues`와 동일한 패턴으로 walkthrough를 검증하고, validation 후 마크다운을 재생성한다.

**삽입 위치**: `validate-review` step(line 97), diagram 검증 다음, issues 검증 이전.

**⚠️ 검증 플로우 전체 재구성 필수**: 현재 코드는 line 98에서 `sanitized = sanitizeMermaidSequenceDiagrams(rawReview, ...)`를 **가장 먼저** 호출하고 validation을 뒤에 수행한다. 본 변경을 "한 줄 교체"로 적용하면 sanitize가 여전히 validation 이전의 rawReview에 대해 실행되어 의도와 어긋난다. **반드시 아래 순서로 `validate-review` step 전체를 재배열해야 한다**:

```typescript
const { review, validatedStructuredOutput } = await step.run("validate-review", async () => {
  // ── 1. sequenceDiagram 검증 (기존 로직 유지) ──
  let validatedOutput = structuredOutput;
  if (structuredOutput?.sequenceDiagram) {
    // ... 기존 sequenceDiagram 검증 ...
  }

  // ── 2. diffFiles / diffArray 한 번만 계산해서 공유 ──
  // ⚠️ Inngest step 재시도 시 동일 입력에 대해 동일 출력이 나오려면
  // Set 이터레이션 순서가 parseDiffFiles의 배열 순서와 같아야 한다.
  // JavaScript Set은 삽입 순서를 보장하므로 현재 구현에서는 안전하다.
  const diffFiles = extractDiffFileSet(diff);
  const diffArray = Array.from(diffFiles);

  // ── 3. walkthrough 검증 (본 섹션) ──
  // ── 4. issues 필터링 + count-trimming (3.5) ──
  // ── 5. suggestions 검증 (3.5) ──
  // ── 6. suggestion-line 중복 issue 제거 (기존 로직) ──

  // ── 7. 마크다운 재생성: validatedOutput 기반 ──
  const finalMarkdown = validatedOutput
    ? formatStructuredReviewToMarkdown(validatedOutput, langCode)
    : rawReview;
  const sanitized = sanitizeMermaidSequenceDiagrams(finalMarkdown, langCode);

  return { review: sanitized, validatedStructuredOutput: validatedOutput };
});
```

기존 line 98의 `const sanitized = sanitizeMermaidSequenceDiagrams(rawReview, langCode);` 라인은 **삭제하고** 위 구조의 마지막 단계(step 7)로 이동한다. 단순 교체가 아니라 이동임에 유의.

**walkthrough 검증 로직 (위 구조의 step 3에 삽입)**:

```typescript
// walkthrough 검증: diff 파일 목록으로 필터링 + basename 매칭 fallback
// diffFiles, diffArray는 step 2에서 한 번만 계산된 것을 재사용
if (validatedOutput?.walkthrough) {
  validatedOutput = {
    ...validatedOutput,
    walkthrough: validatedOutput.walkthrough
      .map((entry) => resolveEntryFile(entry, diffFiles, diffArray, "walkthrough"))
      .filter((e): e is NonNullable<typeof e> => e !== null),
  };
}
```

실제 매칭 로직은 `resolveToDiffPath`(3.5)에 통합되어 있으며 basename 충돌 가드를 포함한다.

> **⚠️ C3 — Raw diff escape 잔존 리스크**: 3.1/3.2의 정규화로 `## Changed Files`와 `fileContext`는 정상 UTF-8이지만, 프롬프트에 동시 주입되는 **raw diff 블록(`review-prompt.ts:112-114`)은 여전히 escape 경로 그대로**이다. AI가 지시문(`Use EXACTLY these file paths`)을 무시하고 raw diff에서 파일명을 copy할 경우, 본 walkthrough 검증의 basename 충돌 가드가 **유일한 방어선**이 된다.
>
> **운영 모니터링 필수**: Inngest 로그에서 `[walkthrough] dropped entry (basename collision)` / `[walkthrough] dropped entry (no match)` 빈도를 추적한다. drop율이 **한글 파일 포함 PR의 20%를 초과**하면 후속 이슈로 다음 중 하나를 검토:
>
> 1. `buildStructuredPrompt`에서 raw diff 블록 삽입 전, `diff --git` 헤더 라인만 `unescapeGitPath`로 전처리 (parse-diff가 이미 완료된 후이므로 AI 입력용 사본만 조작 — `parseDiffFiles` 결과에 영향 없음)
> 2. `walkthroughEntrySchema.file`을 `fileIndex: z.number()`로 교체 (스펙 5의 기각 대안을 부활)

**마크다운 재생성** — 기존 `sanitizeMermaidSequenceDiagrams(rawReview, langCode)` 호출을 교체:

```typescript
// 현재 (line 98)
const sanitized = sanitizeMermaidSequenceDiagrams(rawReview, langCode);

// 개선안 — validation 완료 후 재생성
const finalMarkdown = validatedOutput
  ? formatStructuredReviewToMarkdown(validatedOutput, langCode)
  : rawReview;
const sanitized = sanitizeMermaidSequenceDiagrams(finalMarkdown, langCode);
```

**부수 효과**: 기존 코드는 line 77에서 마크다운을 먼저 생성하고 line 115에서 issues를 필터링하는 순서라서, 검증된 issues와 마크다운에 담긴 issues가 일치하지 않는 잠재 버그가 있었다. 재생성으로 이 불일치도 해결된다.

> `formatStructuredReviewToMarkdown`은 `review.ts:9`에서 이미 import되어 있으므로 추가 import 불필요.

### 3.5 `issues` / `suggestions` 경로 정규화 보완

**파일**: `inngest/functions/review.ts`

**배경**: 3.1 변경으로 `extractDiffFileSet`의 의미가 *escape 경로의 set*에서 *UTF-8 정규화 경로의 set*으로 바뀐다. 이는 기존 `issues` 검증(`review.ts:115-128`)의 성공 조건도 함께 바꾼다. 또한 `suggestions[].file`은 `pr-review.ts:41`에서 GitHub API의 `path` 필드로 그대로 전달되므로, AI가 raw diff 블록의 escape 경로를 copy해 올 경우 **createReview 호출 전체가 422로 실패**해 fallback comment 경로로 돌아가며 모든 인라인 suggestion이 손실된다.

walkthrough에 적용한 것과 동일한 basename fallback을 `issues`와 `suggestions`에도 일관되게 적용한다.

**공통 헬퍼**: `validate-review` step 내부에 로컬 함수를 둔다.

**⚠️ Basename 충돌 가드 (필수)**: 한 PR에 동일 basename을 가진 파일이 둘 이상 있을 수 있다 (예: `src/user/index.ts` + `src/admin/index.ts`, `components/Button.tsx` + `ui/Button.tsx`). 단순히 `.find()`로 첫 매치를 반환하면:
- **walkthrough**: 엉뚱한 파일에 요약이 달림 (시각적 버그)
- **suggestions/issues**: **다른 파일의 라인에 인라인 코멘트가 포스팅됨** — 422 회피로는 피하지만 데이터 정확성 면에서 422 실패보다 더 나쁨 (사용자가 잘못된 위치를 실제 문제로 오인할 수 있음)

따라서 basename fallback은 **충돌이 없는 경우에만** 허용한다.

```typescript
function resolveToDiffPath(
  file: string,
  diffFiles: Set<string>,
  diffArray: string[],
  scope: "walkthrough" | "issues" | "suggestions",
): string | null {
  // 1. 완전 매치 (정상 경로)
  if (diffFiles.has(file)) return file;

  // 2. basename fallback — 충돌 가드 포함
  const basename = file.split("/").pop() ?? file;
  const matches = diffArray.filter(
    (f) => f.endsWith("/" + basename) || f === basename,
  );

  if (matches.length === 0) {
    console.warn(`[${scope}] dropped entry (no match)`, { file });
    return null;
  }
  if (matches.length > 1) {
    // 충돌 — 안전하게 drop. 잘못된 경로에 코멘트를 다는 것보다 누락이 낫다.
    console.warn(`[${scope}] dropped entry (basename collision)`, {
      file,
      basename,
      candidates: matches,
    });
    return null;
  }
  return matches[0];
}

// 3.4의 walkthrough 검증에서 사용하는 래퍼
function resolveEntryFile<T extends { file: string }>(
  entry: T,
  diffFiles: Set<string>,
  diffArray: string[],
  scope: "walkthrough" | "issues" | "suggestions",
): T | null {
  const resolved = resolveToDiffPath(entry.file, diffFiles, diffArray, scope);
  if (!resolved) return null;
  return resolved === entry.file ? entry : { ...entry, file: resolved };
}
```

walkthrough(3.4) / issues / suggestions 모두 이 헬퍼를 사용하도록 통일한다.

**issue 필드 조합별 처리** (M4 명확화):

| `issue.file` | `issue.line` | 의미 | 처리 |
|--------------|--------------|------|------|
| `null` | `null` | project-level (architecture, testing strategy) | **그대로 통과** — diff 파일 검증 생략 |
| `null` | *any* | (비정상 — AI 오류) | 기존 코드가 `file === null` 조기 return으로 통과시켜 왔음 — 행동 유지 |
| *path* | `null` | file-level (파일 전체 관련) | `resolveToDiffPath`로 경로 정정, 매치 실패 시 drop |
| *path* | ≥1 | inline code issue | `resolveToDiffPath`로 경로 정정, `line < 1` 사전 drop |
| *path* | <1 | (비정상) | drop |

개선안은 위 표의 모든 행이 일관되게 처리되도록 한다.

**`issues` 검증 갱신** (`review.ts:119-128`):

```typescript
issues: validatedOutput.issues
  .map((issue) => {
    if (issue.file === null) return issue; // project-level
    if (issue.line !== null && issue.line < 1) return null;
    const resolved = resolveToDiffPath(issue.file, diffFiles, diffArray, "issues");
    if (!resolved) return null;
    return resolved === issue.file ? issue : { ...issue, file: resolved };
  })
  .filter((e): e is NonNullable<typeof e> => e !== null),
```

**`suggestions` 검증 추가** — 기존 코드에는 suggestions 단계 검증이 없다. issues 검증과 동일한 위치에 추가한다.

```typescript
if (validatedOutput?.suggestions) {
  validatedOutput = {
    ...validatedOutput,
    suggestions: validatedOutput.suggestions
      .map((s) => resolveEntryFile(s, diffFiles, diffArray, "suggestions"))
      .filter((s): s is NonNullable<typeof s> => s !== null),
  };
}
```

`resolveToDiffPath`의 내부 `console.warn`이 drop 사유(`no match` / `basename collision`)를 기록하므로 호출부에서는 별도 로깅 불필요.

**적용 순서**: walkthrough → issues 경로 해결 → suggestions 경로 해결 → (suggestion-line set으로 issue 제거) → **issues count-trimming**. `diffFiles` / `diffArray`는 step 2에서 한 번만 계산해서 모든 단계에서 재사용한다.

**⚠️ Count-trimming 위치 변경 주의**: 현재 코드(`review.ts:131-141`)는 `issues 필터 → count-trimming → suggestion 라인 중복 제거` 순서로, **count-trimming이 중복 제거 이전**에 적용된다. 본 스펙은 count-trimming을 **가장 마지막**에 적용한다. 이로 인한 행동 변화:

- **변경 전**: inline issue 6개 cap → 6개로 trim → 이 중 2개가 suggestion과 라인 중복 → 최종 4개
- **변경 후**: 모든 issue 수집 → suggestion 중복 2개 제거 → (남은 inline이 8개이면) 6개로 trim → 최종 6개

즉, **변경 후 issue가 cap만큼 채워질 가능성이 높아진다** (기존 코드의 "중복 제거로 인한 cap 미달" 버그가 해소됨). 이는 의도된 개선이며, 기존 동작이 cap 미달로 적게 나오는 것은 사실상 버그였다. 회귀 모니터링이 필요하면 Inngest step 로그의 issue 수를 변경 전후로 비교할 것.

**효과**:
- 한글 파일명을 가진 issues/suggestions가 silent drop 없이 정상 경로로 정정되어 통과
- AI가 raw diff에서 escape 경로를 copy해도 GitHub API 422를 사전 차단 → 인라인 suggestion 전량 손실 방지
- walkthrough/issues/suggestions가 동일한 정규화 규칙을 공유 → 한 PR 내 비대칭 동작 제거

---

## 4. 수정 대상 파일 목록

아래 4개 파일을 모두 P0으로 함께 변경한다.

| 파일 | 변경 내용 |
|------|-----------|
| `module/github/lib/diff-parser.ts` | `unescapeGitPath()` 추가 + `parseDiffFiles` 필터 완화(삭제 파일 포함) + `unescapeGitPath` 적용 |
| `module/ai/lib/review-prompt.ts` | `extractFileMeta`에 `unescapeGitPath` 적용 |
| `module/ai/lib/review-formatter.ts` | walkthrough 블록을 pipe-table에서 bullet list로 전환 |
| `inngest/functions/review.ts` | `resolveToDiffPath` 헬퍼 + walkthrough/issues/suggestions 일관 검증 + drop 로깅 + validation 후 마크다운 재생성 |

---

## 5. 채택하지 않은 대안

| 대안 | 기각 사유 |
|------|-----------|
| Pipe-table separator dash 조정 (`\|:---:\|--:\|:---\|`) | GFM이 dash 개수를 무시. Alignment colon만 작동, width는 불가. Bug 1 해결 안 됨. |
| HTML `<table>` + `<th width="40%">`로 컬럼 폭 강제 | GitHub sanitizer가 `width` 속성을 context별로 strip할 수 있어 보증 불가. 3.3은 테이블 구조 자체를 포기하는 방향을 채택. |
| `walkthroughEntrySchema.file`을 `fileIndex: number`로 교체 | 가장 견고한 접근이지만 prompt + schema + formatter 모두 수정 + DB에 저장된 `reviewData` 마이그레이션 필요 (review.ts:213). 버그 수정으로는 과도. |
| 전체 diff 텍스트를 pre-process하여 escape 해제 | `diff --git` / `+++` / `---` 헤더 및 hunk 경계가 경로에 의존. `parse-diff` 또는 모델의 diff 이해가 깨질 위험. |
| ~~`suggestions[].file` / `issues[].file`까지 정규화 확장~~ | **본 스펙에 포함되도록 변경** — 3.1로 인해 `extractDiffFileSet`의 의미가 바뀌어 기존 issues 검증의 동작이 함께 바뀌고, suggestions는 422로 인한 전량 손실 위험이 실재하므로 한 스펙에서 일관 처리한다 (3.5 참조). |

---

## 6. 검증

### 6.1 유닛 수준 sanity check

Node REPL 또는 임시 테스트로 `unescapeGitPath` 입출력 확인:

```js
unescapeGitPath('"public/\\353\\263\\200\\352\\262\\275 \\354\\202\\254\\355\\225\\255 \\354\\203\\201\\354\\204\\270.png"')
// → "public/변경 사항 상세.png"

unescapeGitPath("src/app/page.tsx")
// → "src/app/page.tsx"  (ASCII passthrough)

unescapeGitPath('"path with spaces.ts"')
// → "path with spaces.ts"  (quote만 있는 경우)
```

### 6.2 End-to-end (Inngest dev)

1. `npm run dev` + `npm run inngest-dev` 실행
2. **다음 시나리오의 PR을 각각 생성**해 검증한다:
   - **(a) 한글 파일 추가**: 브랜치에 `public/테스트.png` 추가 → PR 오픈
   - **(b) 한글 파일 삭제**: 기존 한글 파일을 제거하는 PR (3.1의 삭제 파일 필터 완화 회귀 케이스)
   - **(c) 한글 파일 이름 변경**: 한글 파일을 다른 한글 이름으로 rename (예: `public/이전.png` → `public/신규.png`)
     - **회귀 검증 목표**: 3.1의 rename 처리(`originalPath` 필드 + `extractDiffFileSet`의 old/new 포함)가 작동하는지 확인
     - walkthrough에 rename 행이 **반드시 표시**되어야 한다 — drop되면 C2 회귀
     - AI가 walkthrough entry에 old 경로(`public/이전.png`)를 썼을 때도 정확 매치로 통과하는지 Inngest 로그로 확인
3. hreviewer가 포스팅한 GitHub PR Review 확인:
   - Walkthrough 블록이 bullet list로 정상 렌더링 — 각 항목이 `- 🆕 \`public/테스트.png\` **(added)** — ...` 형태
   - `<details>` collapsible 동작이 정상 작동 (클릭 시 목록 전개)
   - 한글 파일명이 정상 렌더링 (mojibake 없음)
   - **삭제·rename 케이스의 행이 walkthrough에 표시됨** (3.1 회귀 검증)
4. **ASCII-only PR에서도 회귀 없음 확인** — 기존 파일명 렌더링 정상 유지

### 6.3 회귀 — `issues` / `suggestions` / 삭제 파일 / basename 충돌 검증

3.1, 3.5의 변경이 인접 경로에 미치는 영향을 확인한다.

- **issues**: 정상 UTF-8 경로 issues 통과, 기존에 escape로 소실되던 한글 파일명 issues가 이제 통과
- **suggestions**: 한글 파일명 suggestion이 GitHub API 422 없이 인라인 코멘트로 정상 포스팅 (이전에는 createReview가 실패해 comment fallback으로 빠짐)
- **삭제 파일**: deleted 엔트리가 walkthrough/issues 양쪽에서 drop되지 않고 표시됨 — 3.1의 필터 완화가 적용되지 않으면 본 회귀 테스트가 실패한다
- **basename 충돌 (신규 필수 케이스)**: 동일 basename을 갖는 두 파일을 포함한 PR을 만든다 — 예: `src/user/index.ts`와 `src/admin/index.ts`를 함께 수정. AI가 (가상 시나리오로) 경로를 `index.ts`로만 출력한 경우를 시뮬레이션하려면 drop 로그를 확인한다:
  - `[<scope>] dropped entry (basename collision)` 로그가 출력되는가
  - 해당 entry가 **drop**되며, 잘못된 파일에 코멘트가 달리지 **않았는가** (GitHub 최종 렌더링 확인)
- **count-trimming 순서 회귀**: suggestion과 라인 중복인 issue가 있는 PR에서 inline issue 수가 cap(예: normal 모드 6개)까지 정상 채워지는지 확인 — 변경 전에는 dedup 이전에 trim되어 cap 미달로 나오던 케이스
- **drop 로깅**: 임의로 raw diff에는 없는 fake 경로를 가진 entry를 주입했을 때 `console.warn("[walkthrough|issues|suggestions] dropped entry (no match)", ...)`가 출력되는지 확인
- **C3 drop율 모니터링 (신규)**: 6.2의 모든 한글 PR 시나리오에서 `[walkthrough|issues|suggestions] dropped entry (*)` 로그를 수집해 drop율을 기록한다. baseline 확보 후 프로덕션 롤아웃 시 동일 지표를 7일 관찰한다. 임계치(한글 파일 포함 PR의 20%) 초과 시 3.4의 C3 경고박스에 명시된 후속 조치로 에스컬레이션
- **rename 회귀 (C2)**: 6.2 (c) 케이스에서 walkthrough 행이 표시되는 것 외에, Inngest 로그에 `[walkthrough] dropped entry (basename collision)` 또는 `(no match)`가 rename 파일에 대해 출력되지 **않음**을 확인 (3.1의 `originalPath` 노출로 정확 매치가 성공해야 함)

### 6.4 Sanity — 검증 플로우 순서 회귀

3.4의 `validate-review` step 재배열이 올바르게 적용됐는지 확인한다.

- walkthrough/issues/suggestions 검증 후 `finalMarkdown`이 `validatedStructuredOutput` 기반으로 재생성됐는가 (drop된 entry가 최종 PR 본문에 **나타나지 않음**)
- `sanitizeMermaidSequenceDiagrams`가 여전히 최종 markdown에 적용되는가 (sequenceDiagram fallback 텍스트가 정상 작동)
- 기존에 존재하던 "검증된 issues와 마크다운의 issues 불일치" 버그가 해소되었는가 (3.4 부수 효과 검증)

---

## 7. 구현 시 주의사항

### 7.1 Bullet list summary 줄바꿈 처리

`entry.summary`는 AI가 생성한 자연어로 줄바꿈이 포함될 수 있다. Bullet list 아이템 내부에 `\n`이 들어가면 마크다운 파서가 리스트 구조를 깰 수 있으므로, 반드시 `replace(/[\r\n]+/g, " ")`로 단일 라인화한다. Pipe 이스케이프(`\|`)는 더 이상 필요 없다.

### 7.2 `unescapeGitPath` 경계

- 입력이 이미 quote/backslash 없는 정상 경로인 경우 fast path로 즉시 반환 (성능 + 안전).
- ASCII + 공백만 있는 quoted path(`"path with spaces.ts"`)도 올바르게 unquote된다.
- C-style escape (`\n`, `\t`, `\"`, `\\`)도 처리하지만 실전에서 파일명에 `\n`이 들어가는 일은 없음 (안전을 위한 방어 코드).

### 7.3 walkthrough/issues/suggestions drop 시 동작

basename 매칭까지 실패한 항목은 **drop**된다. 이는 의도된 동작이다 — 오염된 엔트리를 그대로 렌더링/포스팅하느니 누락하는 편이 낫다. drop 시 운영 디버깅을 위해 `console.warn("[<scope>] dropped entry", { file })`를 남기며, 이는 3.4·3.5 구현에 포함된다 (해결됨).

### 7.4 `REVIEW_SCHEMA_VERSION` 변경 불필요

본 변경은 `structuredReviewSchema`의 필드 타입을 변경하지 않으므로 (여전히 `file: z.string()`) `REVIEW_SCHEMA_VERSION` 증가 불필요. DB에 저장된 기존 `reviewData` JSON의 fallback 렌더링 경로도 영향 없음. 단, **기존 리뷰에 저장된 escape 경로는 본 수정으로 정화되지 않는다** (범위 명시 참조).

### 7.5 사전 확인 결과

#### 7.5.1 완료된 확인 사항 (2026-04-10)

구현 전 본 스펙에서 가정한 외부 동작을 코드/소스 레벨로 확인했다. 이 사실들은 구현 중 재검증하지 말고 참고만 하면 된다.

- **`walkthroughEntrySchema.changeType`**: `module/ai/lib/review-schema.ts:36`에서 `z.enum(["added", "modified", "deleted", "renamed"])`로 정의 — 3.1의 삭제/rename 필터 완화 후에도 Zod 검증이 통과함을 보장한다.
- **`parse-diff` quoted path 동작**: 3.1 blockquote 참조. `f.to`/`f.from`은 escape를 보존한 상태로 들어와 `unescapeGitPath`가 그대로 처리 가능.
- **`extractFileMeta` 정규식 한계**: `review-prompt.ts:14`의 `^"?a\/.+"?\s+"?b\/(.+?)"?\s*$/m` 정규식은 greedy `.+`와 선택적 quote가 섞여 있어, 경로 **내부**에 `"`가 포함된 극단 케이스(예: `"a/path \" with quote.txt"`)에서 캡처가 밀릴 수 있다. 본 스펙은 정규식 자체 강화는 포함하지 않으며, 실전 파일명에서 극히 드문 케이스이므로 허용한다. 회귀가 발생하면 후속 이슈로 분리.

#### 7.5.2 미확인 전제 (🚨 Section 0 선행 검증으로 해소)

- **GitHub API가 octal escape를 반환한다는 전제**: 로컬 `git status`로만 확증됐으며, `octokit.rest.pulls.get({ mediaType: { format: "diff" } })`의 실제 응답 포맷은 미확인. Section 0의 1회성 검증으로 해소해야 함. UTF-8로 반환된다면 본 스펙 전체 재작성 필요.

---

## 8. 미해결 질문

- **C1 (신규, 최우선)** — GitHub API 선행 검증(Section 0) 결과 UTF-8로 반환된다면 본 스펙은 전면 재작성이 필요하다. 구현 착수 전 반드시 Section 0을 수행할 것
- **C2 (신규)** — rename의 `originalPath` 노출이 `ChangedFileInfo` 타입 시그니처를 변경한다 (optional 필드이므로 역호환). `inngest/functions/review.ts` 외의 소비자(`parseDiffToChangedFiles`, 다른 모듈의 import 등)에서 타입 에러가 없는지 `tsc --noEmit`으로 사전 확인 필요
- **C3 (신규)** — basename 충돌 drop율 임계치(3.4의 "한글 파일 포함 PR의 20%")가 합리적 기준인가? 롤아웃 초기 1주일 관찰 후 재조정 필요
- Bullet list 전환 후 파일 수가 많은 PR(예: 30+)에서 스캔성이 기존 테이블 대비 얼마나 저하되는지 — 실사용 피드백 기반 재검토
- 3.5의 suggestions fallback이 `validate-review` step 내부에서 `validatedOutput.suggestions`를 재작성하는 현재 위치가 적절한지, 아니면 `postPRReviewWithSuggestions` 호출 직전에 한 번 더 sanitize하는 이중 안전장치가 필요한지
- Fallback markdown 경로(비구조화 출력)의 한글 mojibake를 복구할지 여부 — 별도 후속 이슈로 분리 권장 (본 스펙 범위 밖)
- 기존 DB에 저장된 escape 경로를 백필할 스크립트 필요 여부 — 대시보드 뷰가 `reviewData`에서 walkthrough를 재렌더링한다면 과거 리뷰는 깨진 상태 유지
- `parseDiffFiles`가 삭제 파일을 포함하게 되면서 `addedLines: []`로 반환되는 엔트리가 늘어난다 — 3.1에서 `(deleted)` / `(renamed from ...)` 라벨을 붙이도록 개선했으나, 파일 수가 매우 많은 PR에서 프롬프트 토큰 예산에 미치는 영향이 무시 가능한 수준인지
