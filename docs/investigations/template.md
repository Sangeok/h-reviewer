---
status: "active"
created-at: "YYYY-MM-DD"
completed-at: null
owners: []
related: []
primary-area: null
observed-environments: []
conclusion-summary: null
follow-up: []
---

<!--
Template use:
- 런타임 확인이 필요한 버그, 환경 차이, 재현 조건이 불명확한 문제에 사용합니다.
- 이미 변경 방향이 확정된 문서는 proposals/를 사용합니다.
- 장기적으로 남길 의사결정은 ADR/를 사용합니다.
- 패키지 설치, 제거, 업그레이드, 교체가 중심이면 dependencies/를 사용합니다.

작성 규칙:
- status는 active 또는 completed만 사용하고 문서 위치와 일치시킵니다.
- 빈 배열과 null은 실제로 미정이거나 해당 없음일 때만 유지합니다.
- TODO 항목은 실제 내용으로 바꾸거나, 해당 없으면 "없음" 또는 "아직 불명확"으로 명시합니다.
- active 문서는 확인 전 결과를 `Not verified yet`으로 둘 수 있습니다.
- completed/로 이동할 때 completed-at, conclusion-summary, follow-up을 갱신합니다.
- 작성 후 이 안내 주석은 삭제합니다.
-->

# TODO: Investigation title

## Summary

TODO: 무슨 문제가 관찰됐고, 현재 가장 유력한 원인 후보가 무엇이며, 어떤 확인이
남아 있는지 2~4문장으로 요약합니다.

## Problem

- Symptom: TODO
- User impact: TODO: 사용자 또는 기능에 미치는 영향
- Frequency: TODO: 항상 발생, 간헐적 발생, 특정 조건에서만 발생 등
- Severity: TODO: blocker, high, medium, low 중 하나 또는 프로젝트 기준
- Reproduction: TODO: 재현 조건 또는 "아직 불명확"
- Environment notes: TODO: front matter `observed-environments`에 상세 환경을 적고, 본문에는 재현 또는 판단에 중요한 차이만 요약

## Scope

- In scope: TODO: 조사 대상 코드, 기능, 플랫폼, 환경
- Out of scope: TODO: 이번 조사에서 다루지 않는 영역

## Evidence

### Known Facts

코드, 로그, 설정, 요청/응답 등으로 이미 확인한 사실:

- TODO

### Unknowns

아직 코드만으로 확정할 수 없고 런타임에서 확인해야 하는 사실:

- TODO

## Hypotheses

| ID | 가설 | 근거 | 확인 방법 | 현재 판단 |
| --- | --- | --- | --- | --- |
| H1 | TODO | TODO | TODO | unverified |

현재 판단 값은 investigations/README.md의 가설 판단값(`unverified`, `likely`,
`confirmed`, `ruled-out`, `inconclusive`)을 사용한다. 이 값은 본문에서만 사용하고
front matter `status` 값으로 사용하지 않는다. Verification 섹션에서는 `H1`,
`H2` 같은 ID로 어떤 확인 항목이 어떤 가설을 검증하는지 연결한다.

## Verification

이 섹션은 확인 계획과 확인 결과를 함께 기록한다. 아직 확인 전이면 `결과`를
`Not verified yet`으로 둔다.

| 확인 항목 | 관련 가설 | 방법 또는 데이터 | 판단 기준 | 결과 | 해석 |
| --- | --- | --- | --- | --- | --- |
| TODO | H1 | TODO: command, log, request/response, console, device check 등 | TODO: 어떤 결과가 어떤 가설을 지지하거나 배제하는지 | Not verified yet | TODO |

## Conclusion

- Current conclusion: TODO: 진행 중이면 "아직 확정 전"으로 둔다. 완료 문서라면 확인된 원인 또는 배제된 원인을 적는다.
- Remaining uncertainty: TODO: 없으면 "없음"이라고 적는다.

## Follow-up Actions

- TODO: 필요한 proposal, ADR, dependency 작업, issue/PR. 없으면 "없음"이라고 적는다.

<!--
completed/로 이동할 때 필요하면 아래 섹션을 추가합니다.

## Completion Notes

- Evidence summary:
- Follow-up links:
- Remaining risk:
-->

## Review Checklist

- [ ] 모든 `TODO`를 처리했고, 빈 값은 "없음" 또는 "아직 불명확"처럼 이유가 드러나게 남겼다.
- [ ] `status`는 `active` 또는 `completed`만 사용했다.
- [ ] 문서 위치와 `status`가 일치한다. `active/`는 `active`, `completed/`는 `completed`다.
- [ ] `owners`, `related`, `primary-area`, `observed-environments`를 현재 조사에 맞게 채웠거나 빈 값으로 둘 이유가 명확하다.
- [ ] 증상, 사용자 영향, 발생 빈도, 심각도, 재현 조건, 환경 메모가 구분되어 있다.
- [ ] 코드로 확인된 사실과 런타임에서 확인해야 하는 사실이 분리되어 있다.
- [ ] 주요 가설마다 ID, 근거, 확인 방법이 있고, 현재 판단은 README의 가설 판단값을 사용했다.
- [ ] Verification 표에 관련 가설 ID, 확인 방법, 판단 기준, 결과, 해석을 기록했다.
- [ ] 후속 조치가 필요하면 proposal, ADR, dependency 문서 또는 issue/PR로 연결했다.
- [ ] 완료 문서라면 `completed-at`, `conclusion-summary`, `follow-up`이 실제 조사 결과와 일치한다.
