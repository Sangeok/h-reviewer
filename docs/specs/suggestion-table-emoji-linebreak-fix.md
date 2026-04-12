# 개선제안 테이블 이모지 줄바꿈 이슈

## 현상

리뷰 결과 페이지의 "개선 제안" 테이블에서 Severity 컬럼의 이모지와 텍스트가 같은 줄에 표시되지 않고 별도 줄로 분리되어 표시된다.

**기대 동작**: `⚠️ WARNING` (한 줄)  
**실제 동작**:
```
⚠️
WARNING
```

참고 스크린샷: `public/개선제안.png`

## 원인 분석

### 렌더링 경로

1. **이모지 정의** — `module/ai/constants/review-emoji.ts`
   ```typescript
   export const SEVERITY_EMOJI: Record<SuggestionSeverity, string> = {
     CRITICAL: "🚨", WARNING: "⚠️", SUGGESTION: "💡", INFO: "ℹ️",
   };
   ```

2. **마크다운 테이블 셀 생성** — `module/review/ui/parts/structured-review-body.tsx:204`
   ```typescript
   return `| ${SEVERITY_EMOJI[s.severity]} ${s.severity} | \`${s.file}\` | ${s.line} | ${safeExplanation} |`;
   //                                    ^ 일반 공백 (줄바꿈 허용 지점)
   ```

3. **마크다운 렌더링** — `structured-review-body.tsx:217-220`
   ```tsx
   <div className="prose prose-invert prose-sm max-w-none">
     <ReactMarkdown remarkPlugins={[remarkGfm]}>
       {sections.join("\n\n")}
     </ReactMarkdown>
   </div>
   ```

4. **동일 로직 존재** — `module/ai/lib/review-formatter.ts:114`
   ```typescript
   return `| ${SEVERITY_EMOJI[s.severity]} ${s.severity} | \`${s.file}\` | ${s.line} | ${safeExplanation} |`;
   ```

### 근본 원인

이모지와 텍스트 사이에 **일반 공백(` `)**을 사용하고 있다. ReactMarkdown + remarkGfm이 이를 `<td>` 태그로 렌더링할 때, Tailwind의 `prose` 클래스가 적용된 테이블 셀 폭이 좁으면 브라우저가 일반 공백 위치에서 **word-wrap(줄바꿈)**을 수행한다.

이모지 문자(⚠️ 등)는 일반 텍스트보다 넓은 폭을 차지하므로, Severity 컬럼에서 이모지가 윗줄, 텍스트가 아랫줄로 분리된다.

## 수정 방안

### 추천: non-breaking space (`\u00A0`) 사용

일반 공백을 `\u00A0`으로 교체하면 브라우저가 해당 위치에서 줄바꿈하지 않는다.

| 파일 | 라인 | before | after |
|------|------|--------|-------|
| `module/review/ui/parts/structured-review-body.tsx` | 204 | `} ${s.severity}` | `}\u00A0${s.severity}` |
| `module/ai/lib/review-formatter.ts` | 114 | `} ${s.severity}` | `}\u00A0${s.severity}` |

**선택 이유**:
- 2개 파일, 각 1글자 변경으로 최소 수정
- ReactMarkdown 커스터마이징 불필요 — 마크다운 소스 레벨에서 해결
- export용 formatter에도 동일 적용되어 일관성 유지

### 대안: ReactMarkdown `components` prop 커스터마이징

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    td: ({ children, ...props }) => {
      const text = String(children);
      const hasSeverity = /^[^\w]*(?:CRITICAL|WARNING|SUGGESTION|INFO)/.test(text);
      return (
        <td {...props} className={hasSeverity ? "whitespace-nowrap" : undefined}>
          {children}
        </td>
      );
    },
  }}
>
```

이 방법은 `structured-review-body.tsx`에만 적용 가능하고, `review-formatter.ts`(순수 마크다운 문자열 반환)에는 적용할 수 없어 일관성이 떨어진다.

## 검증 방법

1. `npm run dev` 실행 후 리뷰 결과 페이지에서 개선 제안 테이블 확인
2. Severity 컬럼에서 이모지와 텍스트가 같은 줄에 표시되는지 확인
3. 브라우저 창 크기를 줄여도 이모지-텍스트가 분리되지 않는지 확인
