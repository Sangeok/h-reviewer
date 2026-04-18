# 설계: Review Encoding False-Positive Hardening

Generated: 2026-04-18
Branch: develop
Repo: Sangeok/hreviewer
Status: TODO

## 문제 정의

현재 `hreviewer`는 PR 리뷰 생성 후 `validate-review` 단계에서 경로와 line 범위는 검증하지만, "이 제안이 정말 인코딩 문제를 근거 있게 지적한 것인가"는 충분히 검증하지 못한다.

이번 사례의 핵심 증상은 다음과 같다.

- 정상 유니코드 표기인 `40–60s`, `1080×1920`, `delete—all`이 인코딩 손상으로 오탐된다.
- 모델은 "`??` 또는 `횞`로 손상되었다"는 식의 설명을 만들지만, 실제 visible source text에는 그런 hard evidence가 없다.
- 제안 결과도 복구가 아니라 의미 손상이다.
  - `40–60s` 계열이 `4060s`로 붕괴
  - `1080×1920` 계열이 `10801920`으로 붕괴
  - `delete—all` 계열이 `deleteall`로 붕괴
- 같은 파일에 거의 동일한 encoding warning이 여러 개 반복되어 review noise가 커진다.

즉 이번 이슈는 "타깃 PR의 실제 버그"보다 **리뷰 시스템이 unsupported encoding claim을 통과시킨 품질 문제**다.

## 현재 방어가 실패한 이유

기존 구현에는 이미 1차 방어가 있다.

- `module/ai/lib/review-prompt.ts`
  - `×`, `–`, `—` 같은 정상 유니코드 문장부호를 encoding bug로 부르지 말라고 지시한다.
- `module/ai/lib/guard-text-feedback.ts`
  - weak typography token을 감지해 일부 suggestion을 drop 또는 file-level issue로 합성한다.
- `inngest/functions/review.ts`
  - `validate-review` 단계에서 `guardTextFeedback()`를 호출한다.

하지만 이번 사례는 여전히 통과했다. 가장 가능성이 높은 실패 지점은 아래다.

1. **candidate detection이 너무 좁다**
   - 현재 탐지 phrase는 `잘못 표시`, `깨져 보임`, `문자가 깨짐` 중심이다.
   - 이번 문구는 `손상되었습니다`, `의미를 왜곡할 수 있습니다`, `복구해야 합니다`처럼 다른 서술을 사용한다.
   - 그래서 guard가 애초에 "encoding claim 후보"로 분류하지 못했을 가능성이 크다.

2. **설명 텍스트와 제안 결과의 정합성을 보지 않는다**
   - 모델은 "복구"를 말하지만 실제 `after`는 구두점을 삭제해 의미를 망가뜨린다.
   - 현재 guard는 mostly `before` evidence 중심이라, "잘못된 복구 제안" 자체를 걸러내지 못한다.

3. **동일 파일 반복 제안 압축이 충분히 강하지 않다**
   - weak case가 후보로 잡히지 않으면 file-level issue synthesis도 일어나지 않는다.
   - 결과적으로 같은 설명이 line별 suggestion으로 중복 게시된다.

## 목표

- 정상 유니코드 표기를 encoding corruption으로 지적한 suggestion / issue를 `validate-review`에서 제거한다.
- "복구"를 주장하지만 실제로는 separator를 삭제해 의미를 손상시키는 suggestion을 제거한다.
- weak typography concern은 발견되면 inline suggestion으로 남기지 않고 file-level `INFO` note로 압축한다.
- 같은 파일의 반복 encoding warning은 최대 1개의 file-level `INFO` issue로 정리한다.
- 검증 규칙은 prompt 의존이 아니라 `validate-review` 후처리에서 재현 가능해야 한다.

## 비목표

- 실제 decode/charset/byte handling/parser/unescape 로직의 encoding bug를 억제하지 않는다.
- 전체 markdown fallback 경로를 완전히 재설계하지 않는다.
- 일반적인 UX wording suggestion 전체를 다시 분류하지 않는다.
- PR 본문 전체를 style guide 기준으로 rewrite하지 않는다.

## 해결 원칙

### 1. "Encoding issue"는 증거 기반 주장으로만 통과

다음 중 하나가 visible evidence로 확인될 때만 encoding claim을 유지한다.

- replacement character: `�`
- 전형적 mojibake fragment: `Ã—`, `â€“`, `â€”`, `Â·` 등
- raw text 자체가 이미 깨져 보이는 경우

반대로 아래는 기본적으로 hard evidence가 아니다.

- `×`, `–`, `—`, smart quotes, ellipsis
- ASCII 범위 문자열 `40-60s`
- "유니코드 대시", "곱셈 기호", "엠 대시" 같은 설명만 있고 source token은 정상인 경우

### 2. 약한 typography concern과 실제 corruption을 분리

- hard evidence 있음: keep 가능
- visible text는 정상이고 표기 일관성만 애매함: encoding이 아니라 notation concern으로 처리
- evidence 없음 + corruption claim만 강함: drop

### 3. 설명과 수정 결과가 맞지 않으면 drop

text issue suggestion은 explanation, `before`, `after`가 최소한 아래 조건을 만족해야 한다.

- explanation이 언급한 문제 token이 `before` 또는 explanation quoted token에서 식별 가능해야 한다.
- `after`는 복구 또는 대체여야 하며, 단순 separator 삭제로 양쪽 토큰을 붙여버리면 안 된다.

의미 보존형 대체 예시:

- `40–60s` -> `40-60s`
- `1080×1920` -> `1080x1920`
- `delete—all` -> `delete-all`

이 예시는 "separator collapse가 아닌 정상화 대체"의 예시다.  
단, `×`, `–`, `—`처럼 visible text가 정상인 weak typography case는 v1에서 inline suggestion으로 keep하지 않는다. 이 경우에는 아래 4번 규칙에 따라 file-level `INFO` note로만 남긴다.

차단 예:

- `40–60s` -> `4060s`
- `1080×1920` -> `10801920`
- `delete—all` -> `deleteall`

### 4. weak case는 개별 entry보다 synthesized file-level note를 우선

동일 파일에서 weak typography concern이 1개 이상 발견되면:

- 최초 1개부터 개별 suggestion / issue로 남기지 않는다
- 같은 파일의 weak case는 개수와 무관하게 `line: null`, `severity: INFO`, `category: general`인 file-level issue 최대 1개로 합성한다
- body에는 최대 3개의 example token만 노출한다

v1 정책은 아래처럼 고정한다.

- `weak + valid-replacement`도 inline suggestion으로 keep하지 않는다.
- `weak + separator-collapse / missing-target`는 즉시 drop한다.
- `file === null`인 weak suggestion / issue는 synthesized file-level issue로 바꾸지 않고 drop한다.

용어는 아래처럼 고정한다.

- `inline issue`
  - `file !== null`, `line !== null`인 이슈
- `file-level issue`
  - `file !== null`, `line === null`인 이슈
- `project-level issue`
  - `file === null`, `line === null`인 이슈
- `general issue bucket`
  - validate-review 구현에서 `line === null`인 이슈 전체를 세는 버킷
  - 즉 synthesized weak note는 `file-level issue`이지만, count trimming 단계에서는 `general issue bucket`에 포함된다

## 선택지 비교

### Option A. Prompt만 강화

- 장점: 구현이 가장 단순하다.
- 단점: 현재도 prompt rule이 존재하지만 이미 실패했다.
- 결론: 단독 선택 불가.

### Option B. Guard 탐지 범위 확장 + replacement sanity check

- 장점: 이번 문제를 직접 겨냥한다.
- 장점: structured output 성공 경로에서 deterministic 하다.
- 단점: 규칙이 조금 늘어난다.
- 결론: 기본안으로 채택.

### Option C. Summary / Walkthrough까지 post-filter 확대

- 장점: unsupported encoding claim이 다른 섹션으로 새는 것도 줄일 수 있다.
- 단점: source token이 없는 필드는 오탐 rewrite 위험이 있다.
- 결론: v1 범위에서는 제외한다. prompt-only best effort로만 둔다.

## 권장 설계

v1은 **Option B를 중심으로** 구현한다. summary/walkthrough는 validate 단계의 strict post-filter 대상에 넣지 않고, prompt-only best effort로 유지한다.

핵심은 5단계다.

1. encoding claim 후보 탐지를 넓힌다
2. suggestion과 issue를 display vs processing vs non-text context로 먼저 분리한다
3. hard evidence vs weak typography vs unsupported claim으로 분기한다
4. suggestion에만 `after` sanity check를 적용한다
5. weak case는 suggestion과 issue 모두 inline/file-level noise 대신 file-level `INFO` issue로 압축한다

## 상세 설계

### 1. candidate detection 확장

`module/ai/lib/guard-text-feedback.ts`의 후보 탐지 phrase를 확장한다.

- 추가 corruption-claim phrase 예시
  - `손상`
  - `손상되었습니다`
  - `왜곡`
  - `의미를 왜곡`
  - `복구해야`
  - `복구하세요`
  - `유니코드 대시`
  - `곱셈 기호`
  - `엠 대시`
- 영어도 동일하게 확장
  - `damaged`
  - `distorted`
  - `restore`
  - `restore the original`

단, phrase만으로 keep하지 않는다. phrase는 "후보 탐지" 트리거로만 쓴다.

### 2. evidence scoring

새 helper를 도입한다.

```ts
type EncodingEvidenceLevel = "hard" | "weak" | "none";
```

판정 규칙:

- `hard`
  - visible text나 quoted token에 replacement char / mojibake fragment 존재
- `weak`
  - token이 `×`, `–`, `—`, smart quotes, ellipsis 같은 정상 typography
- `none`
  - corruption claim은 있지만 source token evidence가 없음

fallback extraction에서 쓰는 핵심 용어는 아래처럼 고정한다.

- `suspicious token`
  - fallback candidate로 고려할 수 있는 토큰
  - 범위는 `hard evidence token + weak typography token + raw escape literal`로 제한한다
- `usable quoted token`
  - issue prose 안에서 직접 인용된 token 중, `suspicious token` 자체이거나 `token family`를 식별할 수 있는 quoted token
  - diff-anchored matching 후보로 연결될 수 있을 때만 usable로 인정한다
- `plausible candidate`
  - suspicious token이면서, issue prose가 지칭한 token family와 일치하고, 허용된 diff scope 안에서 추출된 후보
- `candidate strength`
  - evidence level과 동일한 우선순위를 따른다
  - `hard > weak`
- `token family`
  - prose cue와 fallback token을 연결하는 최소 분류 단위
  - 예시
    - `dash family`: `-`, `–`, `—`, `유니코드 대시`, `엠 대시`
    - `multiplication/resolution family`: `x`, `×`, `곱셈 기호`
    - `mojibake/replacement family`: `�`, `Ã—`, `â€“`, `â€”`, raw escape literal
    - `quote/ellipsis family`: smart quotes, apostrophes, ellipsis
  - usable quoted token이 없을 때 issue prose에서 2개 이상의 token family cue가 동시에 식별되면 fallback extraction을 하지 않고 evidence는 `none`으로 처리한다

entry type별 evidence source는 아래처럼 고정한다.

- `suggestion`
  - `before`, explanation 안의 quoted token, visible replacement candidate
- `issue`
  - `title`, `body`, `impact`, `recommendation` 안의 quoted token과 visible text를 1차 candidate extraction source로 사용한다
  - usable quoted token이 없으면 changed diff text를 2차 candidate extraction source로 사용할 수 있다
  - 단, 2차 candidate extraction은 issue prose에 token family를 식별할 수 있는 cue가 있을 때만 허용한다

v1의 evidence matching 범위는 full source file lookup이 아니라 `validate-review` 단계에서 이미 가진 changed diff text로 제한한다. 별도의 source fetch step은 도입하지 않는다.

`issue` evidence는 diff-anchored 규칙을 추가로 만족해야 한다.

- `inline issue`
  - issue prose에서 뽑은 token 또는 해당 `file`의 `issue.line`이 속한 changed hunk / 그 line 주변 visible diff text에서 직접 추출한 token만 evidence 후보로 사용한다
  - quoted token이 없을 때는 issue prose의 cue로 token family를 먼저 정하고, 그 family 안에서만 `issue.line`에 가장 가까운 suspicious token 1개를 fallback candidate로 선택한다
  - fallback candidate 선택 순서는 `candidate strength` 우선, 그 다음 distance다
  - 즉, selected family 안에 `hard` candidate가 1개라도 있으면 `weak` candidate보다 먼저 비교한다
  - strongest strength 안에서 가장 가까운 plausible candidate 1개만 선택 가능하다
  - strongest strength 안에서 같은 거리의 plausible candidate가 2개 이상이면 evidence는 `none`으로 처리한다
  - issue prose가 generic encoding claim만 있고 token family를 식별할 수 없으면 blind fallback extraction을 하지 않고 evidence는 `none`으로 처리한다
  - 최종 token이 실제 changed hunk 또는 그 line 주변 visible diff text와 매칭될 때만 `hard` 또는 `weak` evidence로 인정한다
- `file-level issue`
  - issue prose에서 뽑은 token 또는 해당 `file`의 changed diff text에서 직접 추출한 token만 evidence 후보로 사용한다
  - quoted token이 없을 때는 issue prose의 cue로 token family를 먼저 정하고, 해당 file diff 전체에서 그 family의 plausible candidate를 모두 수집한다
  - fallback candidate 선택 순서는 `candidate strength` 우선이다
  - strongest strength의 plausible candidate가 정확히 1개일 때만 그 후보를 fallback candidate로 선택한다
  - strongest strength의 plausible candidate가 2개 이상이면 evidence는 `none`으로 처리한다
  - issue prose가 generic encoding claim만 있고 token family를 식별할 수 없으면 blind file-wide fallback extraction을 하지 않고 evidence는 `none`으로 처리한다
  - 최종 token이 해당 `file`의 changed diff text와 실제로 매칭될 때만 `hard` 또는 `weak` evidence로 인정한다
- `project-level issue`
  - issue prose만으로는 `hard` 또는 `weak` evidence를 만들지 않는다
  - quoted token이 있으면 changed files의 changed diff text에서 same concrete token의 cross-file 매칭이 있을 때만 evidence 후보를 인정한다
  - quoted token이 있어도 same concrete token의 cross-file 매칭이 없으면 evidence는 `none`으로 처리한다
  - cross-file concrete token 매칭이 있으면 최종 evidence는 매칭된 후보 중 가장 높은 evidence level을 따른다. 우선순위는 `hard > weak`다
  - quoted token이 없을 때는 blind multi-file fallback extraction을 하지 않고 evidence는 `none`으로 처리한다

즉, issue prose 안에 깨진 토큰을 "설명으로 써 넣었다"는 사실만으로는 hard evidence가 되지 않는다.

### 3. replacement sanity check

새 helper를 도입한다.

```ts
type TextSuggestionSanity =
  | "valid-replacement"
  | "separator-collapse"
  | "missing-target";
```

먼저 entry context를 아래처럼 고정한다.

- `processing`
  - decode / encode / charset / bytes / parser / serializer / runtime corruption처럼 실제 처리 로직을 다루는 경우
- `display`
  - user-facing copy, label, placeholder, alt text, string literal, typography/notation처럼 화면에 보이는 텍스트 교정 맥락인 경우
- `non-text`
  - encoding keyword가 설명에 섞여 있어도 실제 제안 대상이 텍스트 표기 교정이 아닌 경우

context 판정 우선순위는 아래처럼 고정한다.

1. 실제 decode / encode / charset / parser / bytes / runtime corruption 키워드가 있으면 `processing`
2. 그 외에 user-facing text, string literal, typography token, quoted display token이 있으면 `display`
3. 둘 다 아니면 `non-text`

signal이 겹치면 `processing > display > non-text` 우선순위를 적용한다. 이 우선순위는 실제 처리 로직 관련 이슈를 오탐 필터가 잘못 제거하지 않도록 하기 위한 것이다.

`TextSuggestionSanity` helper는 `suggestion + display` 조합에서만 적용한다. `issue`, `processing`, `non-text`는 이 helper의 대상이 아니다.

차단 규칙:

- `before`의 separator가 `after`에서 빈 문자열로 사라져 양옆 토큰이 붙으면 drop
- explanation이 "복구"를 주장하지만 `after`에 대체 token이 없으면 drop
- 숫자 range / resolution / word separator 패턴이 collapse되면 drop

### 4. decision matrix

| Entry | Context | Evidence | Sanity | Decision |
|---|---|---|---|---|
| issue | non-text | any | n/a | keep |
| issue | processing | any | n/a | keep |
| issue | display | hard | n/a | keep |
| issue | display | weak | n/a | synthesize file-level INFO if `file !== null`, otherwise drop |
| issue | display | none | n/a | drop |
| suggestion | non-text | any | n/a | keep |
| suggestion | processing | any | n/a | keep |
| suggestion | display | hard | valid-replacement | keep |
| suggestion | display | hard | separator-collapse / missing-target | drop |
| suggestion | display | weak | valid-replacement | synthesize file-level INFO if `file !== null`, otherwise drop |
| suggestion | display | weak | separator-collapse / missing-target | drop |
| suggestion | display | none | n/a | drop |

### 5. validate-review 순서 조정

`inngest/functions/review.ts`의 `validate-review` 단계 순서를 아래로 고정한다.

1. path resolution
2. suggestion added-line validation
3. text feedback candidate detection + context classification + evidence scoring
4. suggestion-only replacement sanity check
5. weak suggestion / issue file-level synthesis
6. `line === null` issue bucket을 `synthesizedIssues + keptLineNullIssues` 순서로 재조합
7. suggestion-line dedup against inline issues
8. count trimming
9. markdown formatting

`general issue bucket` trimming 규칙도 명시적으로 고정한다.

- 구현 변수명도 의미가 드러나게 `keptLineNullIssues`를 사용한다
- `keptLineNullIssues`는 `file-level issue + project-level issue`를 모두 포함하는 `line === null` 버킷이다
- `finalLineNullIssues = synthesizedIssues + keptLineNullIssues`
- count trimming 시 `synthesizedIssues`를 먼저 소비한다
- 같은 `maxGeneral` cap 안에서는 synthesized issue가 기존 line-null issue보다 우선 유지된다
- 단, synthesized issue도 `maxGeneral` cap 자체를 초과해 보존되지는 않는다

### 6. summary / walkthrough 보호

v1에서는 summary / keyPoints / walkthrough를 validate 단계의 strict post-filter 대상으로 다루지 않는다.

- source token이 없는 필드는 후처리 rewrite 오탐 위험이 크다
- 따라서 이 영역은 기존과 동일하게 prompt-only best effort로 유지한다
- strict guarantee 범위는 `suggestions`와 `issues` 섹션으로 한정한다

## 수정 대상 파일

- `module/ai/lib/guard-text-feedback.ts`
  - candidate phrase 확장
  - evidence scoring helper 추가
  - replacement sanity check 추가
  - diff-anchored fallback token selection 규칙 추가
  - weak suggestion / issue aggregation 강화
- `inngest/functions/review.ts`
  - validate-review 순서 조정
  - synthesized line-null issue 우선순위 재조합 명시
- `module/ai/lib/review-prompt.ts`
  - bad example / good example 확장
  - "separator collapse는 복구가 아니다" 규칙 추가

## 대표 처리 사례

1. `40–60s`를 encoding bug로 지적한 suggestion은 drop 된다.
2. `1080×1920`를 `10801920`으로 바꾸는 suggestion은 drop 된다.
3. `delete—all`를 `deleteall`로 바꾸는 suggestion은 drop 된다.
4. `1080×1920` -> `1080x1920`은 weak typography concern으로 inline suggestion 대신 file-level `INFO` issue 1개만 남긴다.
5. `Ã—` -> `×`는 real corruption으로 keep 된다.
6. decode / charset / bytes / parser / unescape issue는 keep 된다.
7. 같은 파일의 weak suggestion / issue 4개는 synthesized issue 1개로 압축된다.
8. strict guarantee 범위는 summary/walkthrough가 아니라 suggestions/issues에 한정된다.

## 성공 기준

- 이번 사례와 동형인 false positive suggestion / issue가 `validatedStructuredOutput`에서 제거된다.
- destructive replacement가 suggestion table에 남지 않는다.
- real mojibake case는 계속 검출된다.
- weak typography concern은 inline suggestion이 아니라 file-level `INFO` issue로만 남는다.
- synthesized line-null issue는 같은 `maxGeneral` cap 안에서 기존 line-null issue보다 먼저 유지된다.

## 리스크

- candidate phrase를 과하게 넓히면 legitimate text corruption case까지 drop할 수 있다.
- summary / walkthrough는 prompt-only best effort이므로 unsupported claim이 남을 가능성은 여전히 있다.
- weak typography를 모두 drop하면 실제 팀 style policy를 반영하지 못할 수 있다.

## 후속 과제

- repo별 typography policy 설정 도입
- fallback markdown 경로까지 동일한 post-filter 적용
- review 생성 단계에서 explanation quoted token을 강제하는 schema 강화
