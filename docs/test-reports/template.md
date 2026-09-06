---
# Lifecycle:
# - status: active | completed
# - stage: planned | running | blocked | awaiting-rerun (completed는 null)
# - result: pass | fail | blocked (active는 null)
# Classification:
# - report-kind: audit | acceptance | regression | smoke | exploratory
# - report-size: compact | standard
# - test-levels: static | component | integration | contract | end-to-end | manual
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
---

<!--
사용 규칙:
- 모든 TODO를 실제 값으로 바꾸거나 해당 없음을 명시합니다.
- status는 문서 생명주기, stage는 실행 진행도, result는 최종 판정입니다.
- 전체 result는 README의 fail > blocked > pass 규칙으로 계산합니다.
- front matter는 상태·revision·실행 시각의 단일 기준입니다. 본문에 같은 값을
  복사하지 말고 dirty tree 차이, 제한과 판정 근거만 보충합니다.
- Scope and Criteria의 기준 ID, Test Matrix·Commands의 판정, Evidence Registry의
  Evidence ID를 연결하고 같은 내용을 여러 섹션에 반복하지 않습니다.
- compact 보고서는 Target과 Preconditions를 합칠 수 있고, 독립 gate가 없는
  Commands 및 충분한 인라인 증거가 있는 Evidence Registry를 삭제할 수 있습니다.
  필수 정보 자체는 생략할 수 없습니다.
- standard 보고서는 섹션을 유지하고 무관한 항목에는 이유를 적습니다.
- 토큰, 쿠키, 계정, 개인정보와 운영 비밀을 남기지 않습니다.
- completed로 이동할 때 stage를 null로 바꾸고 result, completed-at,
  last-executed-at, tested-revision, test-summary를 확정합니다.
- 값 형식과 compact·standard 완성 예시는 README의 Metadata Value Contract와
  Filled Examples를 참고합니다.
- 작성 후 이 안내 주석은 삭제합니다.
-->

# TODO: Test Report Title

## Summary and Decision

TODO: 테스트 목적, 대상, 현재 실행 상태를 2~4문장으로 요약합니다. 완료
보고서에서는 front matter의 `test-summary`를 반복 복사하지 말고, 그 판정으로
어떤 승인·차단·후속 결정을 내릴 수 있는지 설명합니다.

## Scope and Criteria

포함 범위:

- TODO

제외 범위:

- TODO

판정 기준과 근거:

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| ------- | ----------------------- | --------- | ------------- | --------- |
| R1      | `{path-or-url}`         | TODO      | TODO          | TODO      |

기준의 원문 우선순위와 충돌 시 이번 보고서의 해석을 적습니다. 전체 판정에 영향을
주는 `required`와 정보 제공용 `informational` gate는 아래 실행 항목에서만
지정합니다. 각 기준 ID를 하나 이상의 Test Matrix 또는 Commands 행에서 참조하고,
MUST 등 필수 요구사항에는 최소 하나의 `required` 실행 항목을 연결합니다.

## Test Target

- Working tree state: TODO: clean 또는 기준 commit 대비 변경 사항
- Application/API target: TODO
- Browser/runtime/device: TODO
- Authentication and role: TODO: 비밀값 없이 조건과 역할만 기록
- Feature flags/configuration: TODO
- Environment limitations: TODO: 없으면 "없음"

`tested-revision`과 `last-executed-at`은 front matter에만 기록합니다.
`test-tools`와 `observed-environments`는 front matter에 검색용 요약을 두고, 이
섹션에서는 그 문자열을 반복하지 않고 정확한 target 조건과 제한만 보충합니다.

## Preconditions and Test Data

- Preconditions: TODO: 권한, 서버 상태, fixture 또는 선행 데이터
- Test data plan: TODO: 생성·변경할 데이터와 예상 최종 상태. 없으면 "없음"
- Cleanup rule: TODO: 정상 종료, 실패, 차단 시 각각의 정리 방법

## Test Matrix

| ID  | 기준 ID | Gate       | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정      |
| --- | ------- | ---------- | ------------- | --------- | ------------------------ | --------- |
| T1  | R1      | `required` | TODO          | TODO      | Not run yet              | `NOT RUN` |

허용 판정은 `PASS`, `FAIL`, `NOT IMPLEMENTED`, `BLOCKED`, `NOT RUN`,
`NOT APPLICABLE`이다. 단계가 길거나 재현 조건이 복잡한 시나리오만 아래 형식으로
보충하고, 표의 내용을 그대로 반복하지 않습니다.

### Scenario Details

#### T1 — TODO: Scenario name

- Preconditions: TODO
- Steps: TODO
- Read-back or final-state check: TODO

복잡한 시나리오가 없으면 `Scenario Details`를 삭제합니다.

## Commands and Static Checks

`standard` 보고서에서 유지합니다. 실행할 명령이 없다면 이유를 적습니다.

| ID  | 연결 대상 | Gate       | 명령/방법   | 성공 기준 | 실제 결과 및 Evidence ID | 판정      |
| --- | --------- | ---------- | ----------- | --------- | ------------------------ | --------- |
| C1  | R1/T1     | `required` | `{command}` | TODO      | Not run yet              | `NOT RUN` |

각 독립 명령에도 gate를 지정하고 전체 결과 계산에 포함합니다. 시나리오의 증거를
수집하기만 하는 보조 명령은 연결 대상을 적고 `informational`로 둘 수 있지만, 그
명령의 실패로 required 시나리오의 기대 결과를 확인할 수 없다면 해당 시나리오도
`BLOCKED` 또는 `FAIL`로 판정합니다.

## Evidence Registry

판정에 필요한 증거만 정제해 등록합니다. compact 보고서는 Test Matrix의 증거
열만으로 충분하면 이 섹션을 삭제할 수 있습니다.

| ID  | 종류                                   | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | -------------------------------------- | ------------------------------ | ---------------- |
| E1  | TODO: UI/network/console/log/read-back | TODO                           | TODO             |

- Existing failures versus new failures: TODO
- Sensitive-data review: TODO: 실제 확인 후 "없음" 또는 제거·조치 내용을 기록

원본 trace, HAR, 인증 state와 대용량 로그는 기본적으로 commit하지 않습니다.
장기 보존할 정제된 파일은 README의 `assets/<completed-report-stem>/` 규칙을
따릅니다.

## Findings and Follow-up

| ID  | 심각도                        | 발견 사항과 Evidence ID | 추적 위치                             | 재검증 조건 |
| --- | ----------------------------- | ----------------------- | ------------------------------------- | ----------- |
| F1  | TODO: blocker/high/medium/low | TODO                    | TODO: proposal/investigation/issue/PR | TODO        |

발견 사항이 없으면 "없음"이라고 적고 예시 행을 삭제합니다. 원인 규명이 필요하면
investigation으로, 변경 방향이 확정되면 proposal 또는 issue/PR로 연결합니다.
front matter의 `follow-up`에는 장기 추적할 위치만 중복 없이 연결합니다.
심각도는 후속 처리 우선순위이며 전체 `result`를 직접 결정하지 않습니다. 전체
판정은 Test Matrix와 Commands의 gate 및 판정만으로 계산합니다.

## Test Data and Cleanup

데이터를 변경하지 않았다면 "변경 없음"이라고 적고 표를 삭제할 수 있습니다.

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향           |
| ------ | -------------- | --------------------- | ------------------- |
| TODO   | TODO           | TODO                  | TODO: 없으면 "없음" |

- Persistent audit/log side effects: TODO
- Cleanup limitations: TODO

## Conclusion

- Result rationale: TODO: 어떤 required 항목 때문에 `pass`, `fail`, `blocked`가
  됐는지 README의 우선순위에 따라 설명
- Remaining uncertainty: TODO: 없으면 "없음"
- Rerun decision: TODO: 불필요 또는 조건과 새 보고서 생성 계획

front matter의 `result`와 `test-summary`가 이 결론, Test Matrix 및 Commands와
일치해야 합니다. 테스트가 실패했더라도 실행과 결과 정리가 끝났다면
`completed`가 될 수 있습니다.

## Review Checklist

- [ ] 모든 TODO를 처리했고 무관한 예시 행과 선택 섹션을 삭제했다.
- [ ] `status`, `stage`, `result`가 위치와 README의 생명주기 규칙에 맞는다.
- [ ] metadata가 README의 값 규약을 따르고 `owners`, `report-kind`, `report-size`,
      `test-levels`, `test-tools`를 실제 범위에 맞게 채웠다.
- [ ] `completed-at`, `last-executed-at`, `tested-revision`으로 대상을 다시
      식별할 수 있다.
- [ ] 모든 기준 ID가 실행 항목에 연결되고, 모든 Test Matrix 항목과 독립 Commands
      항목에 기준 ID 또는 연결 대상, `required`/`informational` gate와 판정이 있다.
- [ ] 전체 결과가 `fail > blocked > pass` 규칙으로 계산됐다.
- [ ] 핵심 판정에 Evidence ID 또는 충분한 인라인 증거가 연결됐다.
- [ ] 기존 실패와 신규 실패, 테스트 데이터 최종 상태를 구분했다.
- [ ] 민감정보 검토를 실제 수행했고 비밀값이나 개인정보가 남지 않았다.
- [ ] 발견 사항은 외부 추적 위치로 연결하고 보고서가 결함 생명주기를 대신하지
      않는다.
- [ ] 본문과 front matter의 revision, result, summary, follow-up이 모순되지
      않는다.
- [ ] front matter, Criteria, 실행 결과, Evidence, Findings와 Conclusion의 단일
      기준 위치를 지켰고 같은 사실을 불필요하게 반복하지 않았다.
- [ ] 완료 보고서는 실행·증거 갱신이 더 남아 있지 않은 시점 고정 기록이다.
- [ ] 상대 링크와 증거 경로를 확인하고 `node scripts/check-docs.mjs`를 실행한 뒤, 자동
      검증이 다루지 않는 판정·증거·민감정보 항목을 수동 검토했다.
