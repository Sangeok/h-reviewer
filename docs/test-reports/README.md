# Test Reports Documentation

이 디렉터리는 테스트 계획, 실행 과정, 판정 근거와 완료 결과를 저장소 안에
지속적으로 보존해야 하는 테스트 보고서를 관리한다.

테스트 보고서는 "무엇을 어떤 기준으로 검증했는지", "어떤 환경과 코드 상태를
대상으로 했는지", "실제 결과와 증거가 무엇인지", "발견 사항을 어디에서 후속
처리하는지"를 기록한다. 실행 가능한 테스트 코드나 일시적인 콘솔 로그를 모으는
폴더가 아니라, 사람이 재검토할 수 있는 범위와 판정 근거를 남기는 곳이다.

가장 중요한 원칙은 **문서 생명주기와 테스트 판정을 분리하는 것**이다. 테스트가
실패했거나 발견 사항이 남았더라도 정한 범위의 실행과 결과 문서화가 끝났다면
보고서는 `completed/`로 이동한다. 미해결 결함은 proposal, investigation, issue
또는 후속 테스트 보고서에서 별도로 추적한다.

## Directory Structure

```txt
docs/test-reports/
  README.md
  template.md
  active/
    <scope>-<descriptor>-<audit-or-report>.md
  completed/
    YYYY-MM-DD-<scope>-<descriptor>-<audit-or-report>.md
  assets/                          # 필요할 때만 생성
    <completed-report-stem>/
```

- `active/`: 범위 작성, 실행, 증거 수집, 차단 해소 또는 같은 테스트 캠페인의
  재실행이 남은 문서를 둔다.
- `completed/`: 범위별 판정, 증거, 최종 결과와 후속 조치가 정리되어 더 이상
  실행 중 문서로 갱신할 필요가 없는 기록을 둔다.
- `assets/`: 완료 보고서에 장기 보존해야 하는 정제된 이미지 등 작은 증거만 둔다.

`planned/`, `running/`, `blocked/`, `archive/` 같은 추가 디렉터리는 만들지 않는다.
진행 상태는 front matter의 `stage`로 관리하고, `completed/`가 역사적 기록을
보존하는 역할까지 담당한다. 문서 목록은 README에 수동으로 복제하지 않는다.

## Classification

다음 성격의 문서를 이 디렉터리에 둔다.

- Playwright, 브라우저, 실제 API를 사용한 end-to-end·런타임 감사
- 기능 인수, 회귀, smoke test, release gate와 contract acceptance 결과
- 수동 테스트와 자동 명령, UI·network·console·read-back을 합친 판정 보고서
- 테스트 데이터 정리 상태를 포함해 장기 보존해야 하는 실행 기록

다음 문서는 이 디렉터리에 넣지 않는다.

- Vitest, Playwright Test 등으로 실행되는 테스트 소스 코드와 fixture
- 구현 변경 범위와 절차가 중심인 문서: `docs/proposals/`
- 아직 원인이 확정되지 않은 문제의 가설과 원인 분석: `docs/investigations/`
- 의존성 변경 문서: `docs/dependencies/`; 아키텍처 결정: `docs/ADR/`
- 재현에 불필요한 원본 콘솔 덤프, 임시 메모, 대용량 생성 산출물
- 토큰, 세션, 계정 정보, 개인정보 또는 운영 비밀이 포함된 증거

테스트에서 문제를 발견했다는 이유만으로 보고서를 investigation으로 분류하지
않는다. 주된 목적이 정해진 기준에 따른 실행과 판정이면 이 디렉터리에 남기고,
원인 규명이 필요한 발견 사항만 별도 investigation으로 연결한다.

## Lifecycle Metadata

각 보고서는 다음 front matter를 사용한다.

```yaml
status: 'active'
stage: 'planned'
result: null
report-kind: null
report-size: 'standard'
test-levels: []
test-tools: []
created-at: 'YYYY-MM-DD'
completed-at: null
last-executed-at: null
tested-revision: null
owners: []
related: []
primary-area: null
observed-environments: []
test-summary: null
follow-up: []
```

### Metadata Value Contract

front matter는 검색과 자동 검증이 쉬운 평면 구조를 유지한다. 배열에는 문자열만
사용하고 중첩 객체는 넣지 않는다. 완료 보고서에서는 아래 형식을 따른다.

| 필드                    | 값 규약                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `owners`                | `team:<slug>` 또는 `user:<repository-handle>`. 판정 책임자를 최소 1개 기록                  |
| `related`               | 저장소 루트 기준 `docs/...md` 경로 또는 안정적인 `https://` URL. 없으면 `[]`                |
| `primary-area`          | `<domain>/<feature>` 형태의 안정적인 기능 식별자                                            |
| `observed-environments` | `환경 \| surface \| runtime/device \| role` 순서의 문자열. 실제 관찰 환경을 최소 1개 기록   |
| `test-tools`            | 제품명 또는 재실행 가능한 명령 계열. 수동 확인은 `manual browser inspection`처럼 명시       |
| `test-summary`          | `<result>: <검증 범위> — <핵심 판정 또는 영향>` 형식의 한 문장                              |
| `follow-up`             | 장기 추적하는 `docs/...md` 경로 또는 issue·PR URL만 기록. 단순 참고 링크는 `related`에 기록 |

예시:

```yaml
owners: ['team:admin-web']
related: ['docs/proposals/completed/2026-07-20-example.md']
primary-area: 'trip-v3/admin-reservations'
observed-environments:
  - 'develop | admin-web | Chrome/macOS | role:trip-admin'
test-tools: ['Playwright MCP', 'curl']
test-summary: 'fail: 예약 취소 인수 검증 — 필수 삭제 계약이 구현되지 않음'
follow-up: ['https://tracker.example/issues/123']
```

`active`의 `planned` 단계에서는 아직 모르는 값에 `null` 또는 빈 배열을 사용할 수
있다. 실행을 시작할 때 알려진 값을 채우고, 완료 시에는 `related`와 `follow-up`처럼
없을 수 있는 필드를 제외하고 실제 값을 확정한다. URL, 환경 문자열과 요약에는
비밀값, 계정 식별자 또는 개인정보를 넣지 않는다.

### Lifecycle Fields

`status`는 문서 생명주기만 표현한다.

| 값          | 위치         | 의미                                                             |
| ----------- | ------------ | ---------------------------------------------------------------- |
| `active`    | `active/`    | 범위 작성, 실행, 증거 수집 또는 같은 캠페인의 재실행이 남아 있음 |
| `completed` | `completed/` | 범위별 판정, 최종 결과, 증거와 후속 조치가 정리됨                |

`stage`는 `active` 문서에서만 사용한다.

| 값               | 의미                                                      |
| ---------------- | --------------------------------------------------------- |
| `planned`        | 범위, 환경, 데이터와 판정 기준을 준비 중                  |
| `running`        | 테스트 실행 또는 증거 수집 중                             |
| `blocked`        | 인증, 환경, 도구, 외부 계약 등으로 실행을 계속할 수 없음  |
| `awaiting-rerun` | 수정 또는 외부 상태 변경 후 같은 캠페인의 재실행을 기다림 |

`completed` 문서는 `stage: null`로 둔다. 제품 결함이 열려 있다는 이유만으로
`stage: "blocked"`를 유지하지 않는다. 해당 보고서의 실행과 증거 갱신이 실제로
계속될 예정인지로 판단한다.

### Deterministic Result Rules

`result`는 완료 보고서의 전체 판정이며 `pass`, `fail`, `blocked`만 사용한다.
진행 중에는 `null`이다. 각 테스트 항목은 전체 판정에 영향을 주는 `required`와
정보 제공용 `informational` 중 하나로 표시한다.

여기서 테스트 항목은 Test Matrix 행과 독립적인 Commands 행을 모두 뜻한다.
시나리오의 증거만 수집하는 보조 명령은 `informational`로 둘 수 있지만, 그 실패로
`required` 시나리오의 기대 결과를 확인할 수 없다면 해당 시나리오도 `BLOCKED`
또는 `FAIL`로 판정한다.

항목별 판정은 `PASS`, `FAIL`, `NOT IMPLEMENTED`, `BLOCKED`, `NOT RUN`,
`NOT APPLICABLE`을 사용한다. 전체 결과는 아래 우선순위를 기계적으로 적용한다.

1. `fail`: `required` 항목에 `FAIL` 또는 `NOT IMPLEMENTED`가 하나라도 있음
2. `blocked`: `fail` 조건은 없지만 `required` 항목에 `BLOCKED` 또는 `NOT RUN`이
   하나라도 있음
3. `pass`: 모든 `required` 항목이 `PASS` 또는 사유가 기록된
   `NOT APPLICABLE`임

즉 우선순위는 `fail > blocked > pass`다. `informational` 항목의 실패나 차단은
전체 결과를 바꾸지 않지만 Findings와 `test-summary`에 남긴다. 완료 보고서에
`NOT RUN`을 남기는 경우 전체 결과는 최소 `blocked`이며, 같은 캠페인에서 실행할
계획이 확정돼 있다면 완료하지 않고 `active/`에 유지한다.

### Classification Fields

서로 다른 분류 축을 한 값에 섞지 않는다.

- `report-kind`: 보고 목적. `audit`, `acceptance`, `regression`, `smoke`,
  `exploratory` 중 하나를 사용한다.
- `test-levels`: 검증 수준. `static`, `component`, `integration`, `contract`,
  `end-to-end`, `manual` 중 하나 이상을 배열로 기록한다.
- `test-tools`: 실제 사용한 도구와 명령 계열을 배열로 기록한다. 예:
  `Playwright MCP`, `Vitest`, `curl`, `manual browser inspection`.

### Report Size

`report-size`는 `compact` 또는 `standard`를 사용한다.

- `compact`: 필수 시나리오 5개 이하, 단일 환경, 영구 데이터 변경과 인증·권한
  위험이 없는 좁은 검증에만 사용한다. 템플릿의 상세 섹션을 합치거나 삭제할 수
  있지만 필수 정보는 남긴다.
- `standard`: 인증된 쓰기, 상태 전이, 삭제·복구, 계약 대조, 여러 환경, 영구
  side effect, 6개 이상 필수 시나리오 중 하나라도 포함하면 사용한다.

애매하면 `standard`를 사용한다.

두 크기의 최소 구성은 다음과 같다.

| 구성                       | `compact`                                               | `standard`                 |
| -------------------------- | ------------------------------------------------------- | -------------------------- |
| front matter               | 모든 필드 유지                                          | 모든 필드 유지             |
| Summary, Scope, Conclusion | 유지                                                    | 유지                       |
| Target, Preconditions      | 한 섹션으로 합칠 수 있음                                | 각각 유지                  |
| Test Matrix                | 유지. 명령과 인라인 Evidence를 합칠 수 있음             | 유지                       |
| Commands                   | 독립 gate가 없으면 Test Matrix에 합치고 삭제 가능       | 유지하고 각 행에 gate 지정 |
| Evidence Registry          | Test Matrix에 안전한 인라인 증거가 있으면 삭제 가능     | 유지                       |
| Findings, Data/Cleanup     | 각각 "없음" 또는 "변경 없음"이라는 명시적인 결론을 남김 | 각각 유지                  |
| Review Checklist           | 유지                                                    | 유지                       |

compact는 섹션 수만 줄이는 형식이며 판정 기준, 실행 대상, 실제 결과, 민감정보 검토,
데이터 최종 상태와 결론을 생략하는 형식이 아니다.

### Traceability Fields

- `created-at`은 최초 작성일, `completed-at`은 완료 이동일이며 완료 파일명의
  날짜와 같아야 한다.
- `last-executed-at`은 timezone이 포함된 ISO 8601 시각을 사용한다. 예:
  `2026-07-23T10:30:00+09:00`.
- `tested-revision`은 commit SHA, tag 또는 식별 가능한 working tree 기준이다.
  dirty라면 기준 commit과 변경 상태를 본문에 적는다.
- `owners`는 실행·판정 책임자, `related`는 기준 문서와 이전·후속 작업을 연결한다.
- `primary-area`와 `observed-environments`는 기능, URL, API, 브라우저, OS, 인증
  조건을 비밀값 없이 식별한다.
- `test-summary`는 전체 결과를 한 문장으로 요약하고, `follow-up`은 외부 추적
  위치를 연결한다. 진행 중 summary는 `null`, 후속 작업이 없으면 빈 배열이다.

### Canonical Information Ownership

같은 사실을 여러 곳에 복사하지 않고 아래 위치를 단일 기준으로 사용한다.

| 정보                                | 단일 기준 위치                  | 다른 섹션에서의 사용 방식                      |
| ----------------------------------- | ------------------------------- | ---------------------------------------------- |
| 상태, 최종 결과, 시각, revision     | front matter                    | 본문에는 제한이나 dirty tree 차이만 설명       |
| 요구사항과 기준 ID                  | Scope and Criteria              | Test Matrix와 Commands에서 기준 ID로 참조      |
| 실행 gate, 결과와 항목별 판정       | Test Matrix, Commands           | Conclusion에서 실패·차단 항목 ID만 인용        |
| 증거 내용, 보존 위치와 만료일       | Evidence Registry 또는 인라인 E | Findings와 Conclusion에서는 Evidence ID만 인용 |
| 발견 사항의 상세 내용과 재검증 조건 | Findings and Follow-up          | `follow-up`에는 장기 추적 위치만 요약          |
| 전체 판정 근거와 다음 결정          | Conclusion                      | `test-summary`에는 검색용 한 문장만 기록       |

compact 보고서가 Evidence Registry를 생략하면 Test Matrix의 실제 결과 셀을 인라인
Evidence의 단일 기준으로 삼는다. 그 경우 `[E1]`처럼 ID, 관찰값과 확인 방법을 한 셀에
함께 기록하고 다른 곳에서 같은 증거를 다시 서술하지 않는다.

## File Naming and Same-Day Reruns

범위와 식별자를 드러내는 kebab-case를 사용하고, 완료 문서는 `completed-at`과
같은 날짜를 앞에 붙인다.

```txt
active/<scope>-<descriptor>-<audit-or-report>.md
completed/YYYY-MM-DD-<scope>-<descriptor>-<audit-or-report>.md
```

예시:

```txt
active/trip-v3-admin-playwright-audit.md
completed/2026-07-23-trip-v3-admin-playwright-audit.md
```

같은 날짜에 동일 범위의 독립 실행이 둘 이상 완료되면 두 번째부터 `-r2`, `-r3`
순번을 붙인다. 각 보고서의 `related`에 바로 이전 실행을 연결한다.

```txt
completed/2026-07-23-trip-v3-admin-playwright-audit-r2.md
```

## Evidence Artifacts

판정에 필요한 핵심 증거는 보고서 본문에 안전하게 요약한다. 이미지처럼 본문에
담을 수 없고 장기 보존 가치가 있는 작은 증거만
`assets/<completed-report-stem>/`에 둔다.

- 파일명은 `E1-login-redirect.png`처럼 Evidence ID와 내용을 드러낸다.
- 보고서의 Evidence Registry에서 상대 경로와 의미를 연결한다.
- trace, video, HAR, 전체 로그처럼 크거나 민감할 수 있는 원본은 기본적으로
  commit하지 않는다. CI나 승인된 외부 저장소 링크를 사용하고 보존 만료일을
  적는다.
- 인증 state, token, cookie, Authorization header와 개인정보가 포함된 산출물은
  저장하지 않는다. 필요한 경우 정제한 사본만 보존한다.

## Lifecycle and Completion Criteria

1. [template.md](./template.md)를 `active/<topic>.md`로 복사한다.
2. `status: "active"`, `stage: "planned"`, `result: null`로 시작한다.
3. 범위, gate, 환경, revision, 기준과 데이터 정리 계획을 확정한다.
4. 실행할 때 `stage: "running"`으로 바꾸고 실제 결과와 증거를 기록한다.
5. 같은 캠페인의 재실행이 필요하면 `awaiting-rerun`, 실행이 막히면 `blocked`를
   사용하고 해소 조건을 본문에 적는다.
6. 완료할 때 결과 우선순위를 적용하고 `test-summary`, `follow-up`을 확정한다.
7. 아래 기준을 모두 만족하면 `status: "completed"`, `stage: null`,
   `completed-at`을 갱신하고 날짜가 포함된 파일명으로 이동한다.
8. 상대 링크를 갱신하고 저장소 루트에서 `node scripts/check-docs.mjs`를 실행한다.

완료 기준:

- 목적, 포함·제외 범위, 기준 문서와 기준 ID가 명확함
- revision, 실행 시각과 환경을 다시 식별할 수 있음
- 모든 기준 ID가 실행 항목에 연결되고, 모든 범위·독립 명령에
  `required`/`informational` gate, 실제 결과와 판정 또는 미실행 이유가 있음
- 핵심 판정에 Evidence ID와 command, UI, network, console, 로그 또는 read-back이
  연결됨
- 전체 `result`가 `fail > blocked > pass` 규칙과 일치함
- 테스트 데이터 변경·정리와 남은 영향이 기록됨
- 비밀값과 개인정보가 포함되지 않았음을 실제로 확인함
- 발견 사항이 적절한 proposal, investigation, issue, PR 또는 후속 테스트로 연결됨
- front matter와 본문 결론이 일치하고 문서가 시점이 고정된 기록으로 읽힘

`standard` 보고서는 명령·정적 검사, 상세 환경 제한, Evidence Registry와 데이터
최종 상태를 명시한다. 긴 원본 로그보다 판정에 필요한 요청, 응답, 오류 코드와
최종 상태를 요약한다.

## Revalidation and Supersession

완료 보고서는 당시 revision과 환경에 대한 불변 기록이다. 수정된 코드를 다시
검증할 때는 완료 문서를 `active/`로 되돌리거나 덮어쓰지 않고 새 보고서를 만든다.

- 새 보고서의 `related`에 이전 완료 보고서를 연결한다.
- 이전 보고서에는 필요한 경우 후속 보고서 링크와 변경 메모만 남긴다.
- 최신 보고서가 과거 결과를 대체해도 과거 문서는 `completed/`에 보존한다.

## Validation

문서를 추가, 이동 또는 완료 처리한 뒤 실행한다.

```bash
node scripts/check-docs.mjs
```

자동 검증과 사람의 판정 검토 범위를 구분한다.

`node scripts/check-docs.mjs`가 자동으로 확인하는 범위:

- `active/`·`completed/` 위치와 `status`, `stage`, `result`의 구조적 일치
- validator에 설정된 필수 front matter 키, 허용 enum·`test-levels` 배열 값과 완료
  파일명 날짜
- 완료 파일명과 `completed-at`의 일치 및 `stage: null`
- `related`의 로컬 문서 참조와 본문의 `./`·`../` Markdown 참조가 실제로
  존재하는지 여부

템플릿의 Review Checklist로 사람이 확인해야 하는 범위:

- 모든 Test Matrix 항목과 독립 명령에 `required` 또는 `informational` gate가
  있는지
- 항목별 판정에서 `fail > blocked > pass` 결과를 올바르게 계산했는지
- `last-executed-at`의 ISO 8601 timezone, revision과 실제 관찰 환경이 정확한지
- Evidence가 판정을 충분히 뒷받침하고 민감정보가 제거됐는지
- 데이터 정리, 발견 사항, `follow-up` 링크와 front matter·본문이 일치하는지

따라서 `docs:check` 통과는 완료의 필요조건이지만 충분조건은 아니다. 자동 검증
범위가 확장되기 전까지 Review Checklist를 완료 증거로 남긴다.

## Filled Examples

아래 값은 형식 설명을 위한 가상 값이다. 실제 보고서에서는 실행한 revision,
환경, 관찰값과 추적 위치로 모두 교체한다.

<details>
<summary>Compact 완료 보고서 예시</summary>

```markdown
---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'smoke'
report-size: 'compact'
test-levels: ['end-to-end', 'manual']
test-tools: ['manual browser inspection']
created-at: '2026-07-23'
completed-at: '2026-07-23'
last-executed-at: '2026-07-23T10:30:00+09:00'
tested-revision: 'example-sha'
owners: ['team:admin-web']
related: []
primary-area: 'trip-v3/admin-reservations'
observed-environments:
  - 'develop | admin-web | Chrome/macOS | role:trip-admin'
test-summary: 'pass: 예약 목록 smoke test — 목록과 상세 이동의 필수 동작 확인'
follow-up: []
---

# Trip v3 Reservation List Smoke Test

## Summary and Decision

develop 관리자 화면에서 예약 목록 조회와 상세 이동을 검증했다. 필수 항목이 모두
통과해 해당 revision의 기본 탐색 동작을 승인할 수 있다.

## Scope and Criteria

- 포함: 예약 목록 최초 조회, 첫 행의 상세 화면 이동
- 제외: 예약 수정·취소, 모바일 브라우저

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준                  |
| ------- | ----------------------- | --------- | ------------- | -------------------------- |
| R1      | 예약 목록 탐색 요구사항 | 목록·상세 | MUST          | 목록 표시 후 상세 URL 이동 |

## Test Target and Preconditions

- Working tree state: clean
- Application/API target: `https://admin.develop.example.test/reservations`
- Browser/runtime/device: Chrome on macOS
- Authentication and role: trip-admin 역할로 로그인됨
- Feature flags/configuration: 기본 develop 설정
- Environment limitations: 없음
- Preconditions and data: 기존 정제 fixture 사용, 데이터 변경 없음
- Cleanup rule: 변경이 없어 정리 불필요

## Test Matrix

| ID  | 기준 ID | Gate       | 시나리오/방법           | 기대 결과                | 실제 결과 및 인라인 Evidence | 판정   |
| --- | ------- | ---------- | ----------------------- | ------------------------ | ---------------------------- | ------ |
| T1  | R1      | `required` | 목록 진입 후 첫 행 선택 | 목록 표시 후 상세로 이동 | [E1] UI와 최종 URL 직접 확인 | `PASS` |

## Findings and Follow-up

발견 사항 없음. E1을 확인하면서 민감정보가 화면 캡처나 문서에 남지 않았음을
확인했다.

## Test Data and Cleanup

변경 없음. 영구 audit/log side effect와 남은 영향 없음.

## Conclusion

- Result rationale: 필수 T1이 PASS이므로 `pass`
- Remaining uncertainty: 제외 범위는 검증하지 않음
- Rerun decision: 이 revision에는 불필요

## Review Checklist

- [x] metadata와 완료 경로가 일치하고 TODO가 없다.
- [x] 모든 기준과 실행 항목에 gate·판정이 있다.
- [x] 결과 계산, 인라인 Evidence와 민감정보 검토를 확인했다.
- [x] 데이터 최종 상태와 단일 기준 위치를 확인했다.
- [x] `node scripts/check-docs.mjs` 통과 후 수동 검토를 완료했다.
```

</details>

<details>
<summary>Standard 완료 보고서 예시</summary>

```markdown
---
status: 'completed'
stage: null
result: 'fail'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['contract', 'end-to-end', 'manual']
test-tools: ['Playwright MCP', 'curl', 'node scripts/check-docs.mjs']
created-at: '2026-07-23'
completed-at: '2026-07-23'
last-executed-at: '2026-07-23T14:20:00+09:00'
tested-revision: 'example-sha'
owners: ['team:admin-web']
related: []
primary-area: 'trip-v3/admin-reservation-cancellation'
observed-environments:
  - 'develop | admin-web/API | Chrome/macOS | role:trip-admin'
test-summary: 'fail: 예약 취소 인수 검증 — 필수 삭제 계약이 구현되지 않음'
follow-up: ['https://tracker.example/issues/123']
---

# Trip v3 Reservation Cancellation Acceptance

## Summary and Decision

인증된 예약 생성·취소와 API read-back을 검증했다. 생성은 통과했지만 필수 취소
계약이 구현되지 않아 이 revision의 기능 인수를 승인할 수 없다.

## Scope and Criteria

포함 범위: 예약 생성, 취소, API read-back, 브라우저 console 확인.

제외 범위: 운영 환경, 일반 사용자 역할, 모바일 브라우저.

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준                   |
| ------- | ----------------------- | --------- | ------------- | --------------------------- |
| R1      | 예약 관리 계약          | 생성      | MUST          | 생성 성공 후 read-back 일치 |
| R2      | 예약 관리 계약          | 취소      | MUST          | 취소 성공 후 목록에서 제거  |
| R3      | UI 품질 기준            | console   | SHOULD        | 신규 error 없음             |

## Test Target

- Working tree state: clean
- Application/API target: `https://admin.develop.example.test` and `/api/reservations`
- Browser/runtime/device: Chrome on macOS
- Authentication and role: trip-admin 역할
- Feature flags/configuration: 기본 develop 설정
- Environment limitations: 없음

## Preconditions and Test Data

- Preconditions: develop 서버 정상, 예약 생성 권한 확인
- Test data plan: `example-reservation` 생성 후 종료 전에 제거
- Cleanup rule: 정상·실패 시 API 취소, 불가능하면 승인된 fixture reset 사용

## Test Matrix

| ID  | 기준 ID | Gate            | 시나리오/방법  | 기대 결과             | 실제 결과 및 Evidence ID | 판정              |
| --- | ------- | --------------- | -------------- | --------------------- | ------------------------ | ----------------- |
| T1  | R1      | `required`      | 예약 생성      | 201 및 read-back 일치 | 201, 필드 일치 — E1      | `PASS`            |
| T2  | R2      | `required`      | 생성 예약 취소 | 204 및 목록에서 제거  | 501 Not Implemented — E2 | `NOT IMPLEMENTED` |
| T3  | R3      | `informational` | console 확인   | 신규 error 없음       | 신규 error 없음 — E3     | `PASS`            |

### Scenario Details

#### T2 — Created reservation cancellation

- Preconditions: T1에서 생성한 예약 ID 확보
- Steps: 취소 UI 선택, 확인 후 응답과 목록을 관찰
- Read-back or final-state check: API가 501을 반환해 fixture reset으로 최종 제거
  확인 — E5

## Commands and Static Checks

| ID  | 연결 대상 | Gate            | 명령/방법            | 성공 기준           | 실제 결과 및 Evidence ID | 판정   |
| --- | --------- | --------------- | -------------------- | ------------------- | ------------------------ | ------ |
| C1  | T1, T2    | `required`      | `curl` read-back     | 생성·삭제 상태 일치 | 생성만 일치 — E1, E2     | `FAIL` |
| C2  | 문서      | `informational` | `node scripts/check-docs.mjs` | exit 0              | exit 0 — E4              | `PASS` |

## Evidence Registry

| ID  | 종류      | 안전하게 정리한 증거 또는 참조        | 보존 위치/만료일 |
| --- | --------- | ------------------------------------- | ---------------- |
| E1  | network   | 생성 201과 정제한 read-back 필드 일치 | 본문             |
| E2  | network   | 취소 요청이 501을 반환                | 본문             |
| E3  | console   | 실행 구간 신규 error 없음             | 본문             |
| E4  | command   | docs:check exit 0                     | 본문             |
| E5  | read-back | fixture reset 후 대상 없음            | 본문             |

- Existing failures versus new failures: T2는 이번 범위의 신규 발견
- Sensitive-data review: token, cookie, 계정·개인정보를 제거했음을 확인

## Findings and Follow-up

| ID  | 심각도 | 발견 사항과 Evidence ID | 추적 위치                          | 재검증 조건        |
| --- | ------ | ----------------------- | ---------------------------------- | ------------------ |
| F1  | high   | 취소 계약 미구현 — E2   | https://tracker.example/issues/123 | 구현 revision 배포 |

## Test Data and Cleanup

| 리소스              | 테스트 중 변경 | 정리 작업과 최종 상태              | 남은 영향 |
| ------------------- | -------------- | ---------------------------------- | --------- |
| example-reservation | 1건 생성       | 승인된 fixture reset으로 제거 — E5 | 없음      |

- Persistent audit/log side effects: develop audit log 1건
- Cleanup limitations: audit log는 정책상 삭제하지 않음

## Conclusion

- Result rationale: 필수 T2가 NOT IMPLEMENTED이고 C1이 FAIL이므로 `fail`
- Remaining uncertainty: 운영 환경과 일반 사용자 역할은 검증하지 않음
- Rerun decision: F1 구현 후 새 보고서로 재검증

## Review Checklist

- [x] metadata와 완료 경로가 일치하고 TODO가 없다.
- [x] 모든 기준, 시나리오와 독립 명령에 gate·판정이 있다.
- [x] 결과 계산, Evidence Registry와 민감정보 검토를 확인했다.
- [x] 발견 사항, 데이터 최종 상태와 단일 기준 위치를 확인했다.
- [x] `node scripts/check-docs.mjs` 통과 후 수동 검토를 완료했다.
```

</details>

## HReviewer 적용

P0와 이전 RAG 평가 영수증은 기존 섹션과 실행 근거를 보존해 `completed/`로 옮겼다. 두 보고서의 `result: "blocked"`는 원래의 미확인 release gate를 유지한다. 기존 자료의 미상 필드와 섹션 구조에는 [이관 규칙](../README.md)을 적용한다.

`p0-provider-binding.local.md`는 접근을 제한하는 로컬 감사 부속 자료이며 report가 아니다. lifecycle 검사와 공개 문서 목록에서 제외하고 기존 Git ignore를 유지한다. 내용을 다른 문서로 복사하거나 force-add하지 않는다.

현재 검사기는 JSON 호환 평면 front matter와 quoted YAML scalar를 지원한다. 템플릿의 예시, 코드 블록의 가상 경로, 원격 URL, 제목 anchor와 제품 판정의 진위는 검사하지 않는다. 문서 `status` 통과를 제품 gate 통과로 사용하지 않는다.
