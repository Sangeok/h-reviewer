# 설계: Encoding Suggestion False-Positive Guard

Generated: 2026-04-18
Branch: develop
Repo: Sangeok/hreviewer
Status: Implemented

## 문제 정의

현재 GitHub PR review body의 `개선 제안` 표에서, 모델이 **유효한 문자열을 "인코딩 문제"로 오탐**하는 사례가 발생한다.

대표 증상:

- `"40-60s"` 같은 **순수 ASCII** 문자열도 인코딩 문제로 지적됨
- `"1080×1920"`, `"delete—all"` 같은 **정상 유니코드 표기**가 인코딩 깨짐으로 분류됨
- 같은 파일에서 거의 동일한 설명이 여러 줄 반복되어 review noise가 커짐
- 설명이 `"올바른 문자로 수정"` 수준에 머물러 **무엇이 잘못되었는지, 무엇으로 바꿔야 하는지**가 드러나지 않음

현재 파이프라인의 빈틈은 두 가지다.

1. `module/ai/lib/review-prompt.ts`에 "언제 encoding issue라고 불러도 되는가"에 대한 강한 제약이 없다.
2. `inngest/functions/review.ts`의 validate 단계는 파일 경로/라인 번호만 검증하고, **suggestions / issues 본문에 들어간 encoding claim의 근거 강도**는 검증하지 않는다.
3. structured output이 실패하면 fallback markdown 경로가 사용되는데, 이 경로는 현재 구조적 post-filter 대상이 아니다.
4. 현재 `StructuredIssue`에는 source token이나 code snippet 필드가 없어, issue만 보고는 실제 깨진 문자열 존재 여부를 강하게 검증하기 어렵다.
5. 현재 `issues` 배열에는 line-specific inline issue와 file-level/general issue가 함께 존재하므로, general issue 재조합 시 inline issue를 실수로 누락시킬 위험이 있다.

이 상태에서는 모델이 `특수문자 존재 = 인코딩 문제`로 과잉 일반화해도 그대로 GitHub review에 게시된다.

## 목표

- **structured output 성공 경로의 suggestions / issues 섹션에서** `"인코딩 문제"`라는 표현은 evidence rules에 따라 제한한다.
- suggestion 경로에서는 `"인코딩 문제"`라는 표현을 **깨진 문자열 증거가 있을 때만** 허용한다.
- `×`, `–`, `—`, smart quote, ellipsis 같은 **정상 유니코드 기호는 기본적으로 정상 입력**으로 취급한다.
- 약한 케이스는 encoding bug가 아니라 **표기 일관성/가독성 이슈**로만 다룬다.
- 같은 파일에서 반복되는 약한 텍스트 제안은 **한 개의 file-level issue**로 압축한다.
- structured output 성공 경로의 **suggestions / issues 섹션**에는 **증거 없는 encoding claim**이 남지 않아야 한다.

## 비목표

- 제품 전반의 카피라이팅 규칙을 새로 정의하지 않는다.
- 모든 문자열 품질 문제를 자동 수정하지 않는다.
- Suggestion/Issue Prisma schema를 변경하지 않는다.
- free-form fallback markdown을 정규식으로 재작성하는 강한 post-filter는 이번 범위에 포함하지 않는다.
- `summary`, `keyPoints`, `walkthrough.summary` 문장을 구조적으로 재작성하는 post-filter는 이번 범위에 포함하지 않는다.

## 핵심 결정

### 1. Encoding claim은 "증거 기반"으로만 통과

이 규칙은 **suggestion 경로에만 강하게 적용**한다. 이유는 suggestion만 `before` 필드를 통해 실제 소스 substring을 갖기 때문이다.

다음은 **hard evidence**로 본다.

- replacement character: `�`
- 2자 이상 전형적 mojibake fragment: `â€`, `â€“`, `â€”`, `Ã©`, `Â·`, `Ã±` 등

다음은 **hard evidence로 보지 않는다**.

- 단일 문자 `Ã`, `Â`
- raw octal / hex escape literal 자체: `\353`, `\xE3`, `\u00E2`
- 정상 비라틴 문자 자체
- `×`, `–`, `—`, smart quote, ellipsis 같은 typography 문자

- ASCII hyphen / 숫자 범위: `40-60s`
- "보기 싫다", "익숙하지 않다" 수준의 선호 차이

즉, **보이는 문자열 자체가 이미 깨져 있지 않으면 encoding issue로 부르면 안 된다.**

### 2. Suggestions가 source of truth다

현재 타입 구조에서는 `CodeSuggestion.before`만 실제 소스 substring을 제공한다. 반면 `StructuredIssue`는 `title/body/impact/recommendation`만 있고 source token이 없다.

따라서 v1에서는:

- suggestion은 evidence 기반으로 keep / downgrade / drop 한다
- issue는 독립적인 encoding claim source로 신뢰하지 않는다
- model-authored issue가 encoding claim을 포함하면 기본적으로 drop한다
- file-level INFO issue는 **suggestion 분석 결과를 바탕으로만** synthesized 한다

이 결정은 일부 true positive issue를 놓칠 수 있지만, 현재 문제의 핵심인 false positive를 가장 확실히 줄인다.

### 3. Guard 범위는 "문자열 표시/표기 맥락"으로 제한

이 guard는 **encoding 관련 모든 코드 리뷰**를 다루지 않는다. 대상은 아래처럼 **사용자에게 보이는 문자열 표기/렌더링/복사 맥락에서, encoding claim이 명시되거나 문자열 손상/깨짐이 강하게 주장된 경우**로 제한한다.

- UI label, copy, text constant, placeholder, alt text
- markdown / HTML / 문자열 literal의 표기 형태
- explanation이 `"잘못 표시된다"`, `"깨진 문자"`, `"문자가 깨짐"`처럼 **문자열 손상/오표시를 직접 주장**하는 경우
- 단, `가독성`, `표기 일관성`, `copy` 같은 **style-only 표현만으로는** guard 대상에 포함하지 않는다

반대로 아래는 guard 대상이 아니다.

- `TextDecoder`, charset conversion, byte decode, escape decode
- parser / serializer / file path unescape
- transport / storage encoding 처리
- 실제 런타임 data corruption 가능성이 있는 low-level encoding logic

즉, explanation에 `encoding` 같은 단어가 있더라도 **표시 품질 문제인지, 실제 처리 로직 문제인지**를 먼저 구분해야 한다.

### 4. 약한 케이스는 suggestion이 아니라 file-level INFO issue로 전환

`"1080×1920"`, `"delete—all"`처럼 문자열은 정상인데 표기 일관성이 애매한 경우:

- inline suggestion / encoding claim으로 남기지 않는다
- 같은 파일 단위로 묶어 `line: null` file-level issue 하나로 전환한다
- severity는 `INFO`, category는 `general`로 고정한다

이 결정으로 false positive를 줄이면서도 "문자열 표기 정책을 점검할 필요"라는 약한 신호는 보존할 수 있다.

### 5. 같은 파일의 반복 텍스트 제안은 1개 issue로 압축

현재처럼 같은 파일에서 `"텍스트 인코딩 문제..."`가 4회 반복되면 review 품질이 급격히 떨어진다.

- weak text suggestion 1개 이상 발생 시 파일별로 group
- 각 file group은 issue 1개만 생성
- issue body에는 최대 3개의 예시 토큰만 넣는다

예시 title:

- `문자열 표기 일관성 점검 필요`

예시 body:

- `` `1080×1920`, `delete—all` 같은 문자열은 현재 증거만으로는 인코딩 깨짐이라 보기 어렵습니다. 이 파일의 사용자 노출 문자열 표기를 정책 기준으로 점검하세요. ``

### 6. 합성 issue는 `langCode` 기반으로 생성

현재 리뷰 시스템은 `langCode`를 기준으로 본문 언어를 맞춘다. 따라서 synthesized issue 문구도 helper 내부에서 하드코딩하지 않고, `langCode`에 따라 생성한다.

- `ko`: `문자열 표기 일관성 점검 필요`
- `en`: `Text notation consistency should be reviewed`

### 7. 합성 issue는 trimming에서 우선권을 가진다

약한 suggestion을 drop한 뒤 대체 issue를 append만 하면, 현재 general issue trimming에서 뒤쪽 항목이 잘릴 수 있다. 그러면 원래 suggestion도 사라지고 대체 issue도 사라진다.

따라서 synthesized issue는 일반 issue보다 앞에서 소비한다.

- final general issues = `synthesizedIssues + keptGeneralIssues`
- count trimming 시 synthesized issue를 먼저 유지
- 남은 슬롯만 모델이 만든 general issue에 할당

주의:

- 이 규칙은 synthesized issue가 `keptGeneralIssues`보다 뒤로 밀려 잘리는 일을 막기 위한 것이다.
- 기존 `maxGeneral` cap은 유지한다.
- 따라서 synthesized issue 수도 `maxGeneral`을 초과할 수 없고, cap을 넘는 synthesized issue는 잘릴 수 있다.

### 8. Inline issue는 항상 보존한다

현재 `issues`에는 두 종류가 섞여 있다.

- inline issues: `line !== null`
- general/file-level issues: `line === null`

합성 issue 우선순위 규칙은 **general/file-level issues에만** 적용한다. inline issues는 기존 순서와 의미를 유지한 채 그대로 보존한다.

재조합 규칙:

- `finalInlineIssues = keptInlineIssues`
- `finalGeneralIssues = synthesizedIssues + keptGeneralIssues`
- `finalIssues = finalInlineIssues + trimmedFinalGeneralIssues`

즉, non-encoding inline issue는 **guard/recomposition/general trimming** 때문에 사라지면 안 된다.

주의:

- 여기서 "보존"은 **guard/recomposition 때문에 누락시키지 않는다**는 뜻이다.
- 기존 `maxInline` cap은 유지한다.
- 즉, inline issue는 general issue 재조합 과정에서 손실되면 안 되지만, 기존 count trimming 정책까지 무효화하지는 않는다.
- 기존 suggestion-line dedup 규칙은 유지한다.
- 따라서 suggestion과 **동일한 `file + line`** 을 가진 inline issue는 기존 dedup 단계에서 제거될 수 있다.
- 이 섹션의 "보존" 범위는 dedup 이후 살아남은 inline issue에 한정한다.
- 또한 이 섹션의 "보존"은 **validate 결과와 reviewData 구성 기준**의 보존을 뜻한다.
- 현재 GitHub posting은 inline issues를 2차 `createReview()` 호출로 별도 전송하므로, 이 API 호출이 실패하면 inline issue는 최종 게시물에서 유실될 수 있다.

### 9. Fallback markdown 경로는 prompt-only best effort

free-form markdown은 현재 구조적 필드 단위 post-filter가 불가능하다. 따라서 이번 스펙의 **strict guarantee는 structured output 성공 경로에만 둔다.**

대신 `buildFallbackPrompt()`에도 같은 지침을 넣어 재발 확률을 낮춘다.

### 10. Summary / Walkthrough는 prompt-only best effort

현재 `summary.overview`, `summary.keyPoints`, `walkthrough.summary`는 source token을 갖지 않는다.

따라서 v1에서는:

- structured prompt에서 encoding claim 금지 규칙을 동일하게 강조
- validate 단계에서 summary/walkthrough 문장을 구조적으로 재작성하지 않음
- strict guarantee 범위는 suggestions / issues 섹션에 한정

## 구현 변경

### 1. `module/ai/lib/review-prompt.ts`

`buildStructuredPrompt()`와 `buildFallbackPrompt()` 모두에 아래 규칙을 추가한다.

- Do NOT call valid Unicode punctuation an encoding bug.
- Only report encoding issues when the visible source text itself is corrupted.
- Valid examples that are **not** encoding bugs: `×`, `–`, `—`, smart quotes, ellipsis.
- If the concern is wording/typography consistency without corrupted source text, classify it as `INFO` and prefer a file-level/general note over an inline suggestion. Do not call it encoding.
- When reporting a text issue, quote the exact token and the intended replacement in the explanation.
- Distinguish display/text notation issues from real encoding-processing bugs.
- Do NOT downgrade or suppress issues about decoding, charset conversion, byte handling, parser/unescape logic, or data corruption risks.
- Do not put unsupported encoding claims in summary, key points, or walkthrough text.

Bad example:

- `텍스트 인코딩 문제로 인해 "40-60s"가 잘못 표시됩니다`

Good example:

- `` 문자열에 `Ã—`가 보여 mojibake로 보입니다. `×`로 복구하세요 ``
- `` 이 파일의 user-facing copy에서 dash 표기가 혼재합니다. 정책상 ASCII hyphen을 요구한다면 file-level INFO note로 표기 일관성을 점검하세요 ``

### 2. `module/ai/lib/guard-text-feedback.ts` (신규)

새 pure helper를 추가한다.

```ts
type GuardTextFeedbackParams = {
  suggestions: CodeSuggestion[];
  issues: StructuredIssue[];
  langCode: LanguageCode;
};

type GuardTextFeedbackResult = {
  keptSuggestions: CodeSuggestion[];
  keptIssues: StructuredIssue[];
  synthesizedIssues: StructuredIssue[];
};

guardTextFeedback(params: GuardTextFeedbackParams): GuardTextFeedbackResult;
```

알고리즘:

1. suggestion / issue 텍스트에 아래 **1차 신호** 중 하나가 보이면 encoding-claim 후보로 분류
   - encoding keyword: `encoding`, `인코딩`, `mojibake`, `garbled`, `깨진 문자`
   - explanation/body 안에 직접 인용된 hard-evidence 토큰: `�`, `â€`, `â€“`, `â€”`, `Ã©`, `Â·`, `Ã±`
   - display-corruption phrase: `잘못 표시`, `깨져 보임`, `문자가 깨짐`, `garbled text`, `corrupted text`
   - 단, `가독성`, `표기 일관성`, `copy`, `user-facing text` 같은 **style-only phrase만으로는** 후보 탐지를 시작하지 않는다
2. 후보로 잡힌 항목에 대해, explanation/body가 **display/text notation 맥락**인지, **encoding-processing logic 맥락**인지 분류
3. processing logic 맥락이면 이 guard를 적용하지 않고 그대로 유지
4. display/text notation 맥락인 suggestion의 `before`에서 hard evidence 패턴을 검사
5. hard evidence가 있으면 suggestion을 그대로 유지
6. hard evidence는 없지만 정상 유니코드 typography만 보이면 weak case로 분류
7. weak case suggestion은 drop하고, 파일별로 묶어 localized file-level INFO issue를 생성
8. hard evidence도 없고 ASCII만 있는 경우는 pure false positive로 보고 suggestion을 완전히 drop
9. model-authored issue 중 encoding claim을 포함한 항목은, display/text notation 맥락일 때만 drop 대상으로 본다
10. encoding-processing logic issue는 source token이 없어도 그대로 유지한다
11. 1차 encoding 신호가 없는 issue는 기존 일반 텍스트 리뷰로 보고 그대로 `keptIssues`로 유지한다

issue 후보 탐지 필드:

- issue는 `title + body + impact + recommendation` 전체를 스캔 대상으로 본다
- `title`과 `body`를 1차 신호로 사용한다
- `impact`나 `recommendation`에만 keyword가 있고 `title/body`에 맥락 신호가 없으면, 단독으로는 drop 근거로 사용하지 않는다
- suggestion은 `explanation`을 1차 신호로 사용한다
- `잘못 표시`, `깨져 보임`, `문자가 깨짐`처럼 **문자열 손상/깨짐을 직접 주장하는 phrase**는 후보 탐지 트리거가 될 수 있다
- `가독성`, `표기 일관성`, `copy`, `user-facing text` 같은 style-only phrase는 **후보 탐지 트리거가 아니라 맥락 분류 보조 신호**로만 사용한다
- 즉, issue 경로의 분류는 `title/body` 우선, `impact/recommendation` 보조 원칙을 따른다

display/text notation 맥락의 명시적 신호:

- explanation/body가 `잘못 표시`, `깨져 보임`, `문자 표기`, `가독성`, `표기 일관성`, `user-facing text`, `copy`, `레이블`, `placeholder`, `alt text`를 직접 언급
- suggestion `before`가 문자열 literal 또는 markdown/html text fragment로 보임
- 추천 수정이 dash/quote/symbol 교체처럼 typography 정리임

encoding-processing logic 맥락의 명시적 신호:

- explanation/body가 `decode`, `encode`, `charset`, `utf-8`, `bytes`, `TextDecoder`, `Buffer`, `escape`, `unescape`, `parser`, `serializer`, `transcode`, `data corruption`을 직접 언급
- 추천 수정이 API 호출, decoder 옵션, byte handling, parser logic, conversion flow 변경임
- 문제 결과가 "표시가 어색함"이 아니라 "데이터가 손상됨", "round-trip 실패", "decode mismatch", "runtime corruption risk"임

주의:

- 단일 문자 `Ã`, `Â`만으로는 hard evidence로 인정하지 않는다
- raw octal / hex escape literal 자체는 hard evidence로 인정하지 않는다
- `file === null`인 weak suggestion group은 synthesized file-level issue로 바꾸지 않고 drop한다
- 이미 같은 `file + title`의 synthesized issue가 있으면 예시만 병합하고 중복 생성하지 않는다
- synthesized issue 생성은 suggestion 기반 file group에 대해서만 수행한다
- inline issue(`line !== null`)는 general issue 재조합 과정에서 절대 제거하지 않는다
- raw escape literal이 사용자 노출 문자열로 그대로 보이는 케이스는 explanation의 display/text notation 맥락일 때만 판단 대상으로 본다
- 이 경우 raw escape literal 자체만으로 hard evidence로 승격하지는 않는다
- raw escape literal이 user-facing text에 그대로 노출되었지만 다른 hard evidence가 없으면 **weak case**로 분류한다

weak case에서 생성하는 issue shape:

```ts
{
  file,
  line: null,
  title, // langCode 기반 localized string
  body,
  impact,
  recommendation,
  severity: "INFO",
  category: "general",
}
```

### 3. `inngest/functions/review.ts`

`validate-review` step에서 suggestion line 검증 직후, issue/suggestion dedup 이전에 guard를 호출한다.

순서:

1. 기존 경로 검증
2. 기존 added-line 검증
3. `guardTextFeedback({ suggestions, issues, langCode })` 호출
4. `keptSuggestions`로 suggestions 교체
5. `keptIssues`로 issues 교체
6. `keptIssues`를 inline/general로 분리
7. general issues를 `synthesizedIssues + keptGeneralIssues` 순서로 재조합
8. 기존 suggestion-line 중복 issue 제거 계속 수행
9. count trimming 시 synthesized general issues를 먼저 유지
10. 최종 issues는 `keptInlineIssues + trimmedGeneralIssues`로 합친다

이 변경은 기존 schema와 posting 구조를 그대로 사용한다. 새 DB migration은 없다.

주의:

- summary / walkthrough는 이 helper의 수정 대상이 아니다
- issue 경로에서도 encoding-processing logic issue는 keep한다
- inline issue는 trimming / 재조합 과정에서 누락되면 안 된다
- 단, suggestion과 동일한 `file + line`을 가진 inline issue는 기존 dedup 규칙에 따라 제거될 수 있다
- 이 단계에서 살아남은 inline issue도, 이후 GitHub posting 단계의 2차 inline-issue 호출 실패까지 방지하지는 않는다

### 4. `module/github/lib/pr-review.ts`

현행 posting 구조는 그대로 유지한다.

- review body + suggestions는 1차 `createReview()` 호출로 게시한다
- inline issues는 2차 `createReview()` 호출로 별도 게시한다
- 따라서 "inline issue 보존"은 validate/reviewData 기준의 보존이지, GitHub conversation 탭에서의 게시 성공까지를 의미하지 않는다
- 이번 스펙은 false-positive guard가 inline issue를 잘못 제거하지 않도록 하는 범위에 집중하고, inline posting 신뢰성 개선은 별도 과제로 둔다

### 5. `module/ai/lib/index.ts` + `module/ai/index.ts`

새 helper를 export하여 `review.ts`가 기존 barrel import 패턴을 유지하게 한다.

### 6. `docs/README.md`

새 spec 항목을 추가한다.

## 기대 동작

- structured output 성공 경로에서 `"40-60s"`를 인코딩 문제라고 지적한 suggestion / issue는 **drop**
- `"1080×1920"`, `"delete—all"`처럼 정상 유니코드 표기는 **개별 suggestion으로 남지 않음**
- 같은 파일에서 약한 텍스트 제안이 여러 개면 **INFO file-level issue 1개**로 축약
- 실제 mojibake 문자열(`Ã—`, `â€”`, `�`)은 기존처럼 suggestion 유지
- synthesized issue는 review 언어(`langCode`)와 동일한 언어로 생성
- synthesized issue는 `keptGeneralIssues`보다 앞에서 소비되므로, 같은 cap 안에서는 우선 유지됨
- non-encoding inline issue는 기존과 동일하게 유지됨
- 단, suggestion과 동일한 `file + line`인 inline issue는 기존 dedup 규칙에 따라 제거될 수 있음
- 또한 inline issue는 validate 결과에 남더라도, GitHub posting의 2차 inline-issue 호출 실패 시 실제 PR conversation에는 나타나지 않을 수 있음
- decoding / charset conversion / parser/unescape 같은 processing logic issue는 guard로 drop되지 않음
- summary / walkthrough의 유사 claim은 prompt-only best effort이며, strict post-filter 대상은 아님

## 검증

필수 검증 시나리오:

1. ASCII 정상 문자열 fixture: encoding claim suggestion이 최종 output에서 제거되는지 확인
2. 정상 유니코드 typography fixture: suggestion은 제거되고 file-level INFO issue가 1개 생성되는지 확인
3. 실제 mojibake fixture: suggestion이 유지되는지 확인
4. 같은 파일의 weak case 3개 fixture: issue가 1개만 생성되는지 확인
5. 영어 리뷰 fixture: synthesized issue가 영어로 생성되는지 확인
6. general issues가 이미 maxGeneral을 채운 fixture: synthesized issue가 trimming 후에도 유지되는지 확인
7. `npm run lint`
8. `npx tsc --noEmit`

## 리스크

- 일부 실제 encoding bug가 hard evidence 패턴에 걸리지 않아 drop될 수 있다
- model-authored display/text notation issue는 source token이 없어 기본 drop될 수 있으므로, issue-only true positive를 놓칠 수 있다
- style-only phrase만 있는 약한 표현은 guard 대상에서 제외되므로 일부 unsupported wording이 남을 수 있다
- validate 이후에도 GitHub의 2차 inline-issue posting 호출이 실패하면 inline issue는 실제 게시 단계에서 유실될 수 있다
- free-form fallback markdown 경로는 prompt-only best effort라서 동일 보장을 주지 못한다
- summary / walkthrough의 unsupported claim은 prompt-only best effort라서 동일 보장을 주지 못한다
- 이 리스크는 "근거 없는 encoding claim 게시"보다 작다
- 운영 로그에 `reason: weak_unicode_typography` / `reason: unsupported_encoding_claim`를 남겨 false negative를 관찰한다

## 범위 밖 후속 과제

- suggestion table 자체를 bullet list 또는 evidence-first 포맷으로 바꾸는 UI 개선
- 문자열 표기 정책(ASCII-only vs Unicode 허용)을 repo/user 설정으로 승격하는 기능
- fallback markdown 전용 post-filter 또는 재생성 전략
- weak case를 issue 대신 규칙 기반 rewrite suggestion으로 보정하는 후속 실험
