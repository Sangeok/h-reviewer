# Investigations Documentation

이 폴더는 코드 변경 전에 원인을 확정해야 하는 문제 조사 문서를 관리한다.

Investigation은 "무슨 문제가 관찰됐는지", "코드상 어떤 원인 후보가 있는지",
"무엇을 런타임에서 확인해야 확정할 수 있는지", "확인 결과에 따라 다음 조치가
무엇인지"를 정리하는 문서다. 바로 실행할 변경안이 확정된 문서는 `proposals/`로
옮기고, 장기적으로 남길 의사결정은 `ADR/`로 기록한다.

## Directory Structure

```txt
investigations/
  README.md
  template.md
  active/
  completed/
```

- `active/`: 아직 원인이 확정되지 않았거나 추가 확인이 필요한 조사 문서를 둔다.
- `completed/`: 원인 확인, 결론, 후속 조치 정리까지 끝난 조사 기록을 둔다.

`draft/`, `blocked/`, `archive/` 같은 추가 폴더는 현재 만들지 않는다. 세부 상태가
필요하면 문서 본문에 확인 필요 항목, 보류 사유, 후속 작업을 남긴다.

## Status

Investigation 상태는 다음 두 가지만 사용한다.

| Status | 위치 | 의미 |
| --- | --- | --- |
| `active` | `active/` | 아직 원인이 확정되지 않았거나 추가 확인이 필요한 조사 문서. |
| `completed` | `completed/` | 원인 확인, 결론, 후속 조치 정리까지 끝난 조사 기록. |

별도의 `draft`, `blocked`, `confirmed`, `ruled-out`, `inconclusive` 상태는 만들지
않는다. 가설별 확인 결과와 남은 불확실성은 본문에 기록한다.

## Metadata

각 investigation은 front matter를 사용한다.

```yaml
status: "active"
created-at: "YYYY-MM-DD"
completed-at: null
owners: []
related: []
primary-area: null
observed-environments: []
conclusion-summary: null
follow-up: []
```

- `status`: 문서 위치와 일치해야 한다. `active/`는 `active`, `completed/`는
  `completed`를 사용한다.
- `created-at`: 조사를 문서화한 날짜다. 계속 갱신되는 timestamp로 사용하지
  않는다.
- `completed-at`: `completed/`로 이동할 때 완료일을 기록한다. 진행 중이면
  `null`이다.
- `owners`: 조사 확인 또는 후속 판단 책임자다. 개인, 팀, 역할 이름을 적는다.
- `related`: 관련 issue, PR, proposal, ADR, dependency 문서, 외부 문서 링크를
  적는다.
- `primary-area`: 조사의 주된 코드 영역, 기능, 플랫폼, 환경을 적는다.
- `observed-environments`: 문제가 관찰된 브라우저, WebView, OS, 기기, 배포
  환경, 계정 조건 등을 적는다.
- `conclusion-summary`: 완료 시 결론을 한 문장으로 요약한다. 진행 중이면
  `null`이다.
- `follow-up`: 필요한 후속 proposal, ADR, dependency 작업, issue/PR을 적는다.

## Included Documents

다음 성격의 문서를 이 폴더에서 관리한다.

- 재현 조건이 불명확한 버그 원인 분석
- 브라우저, WebView, OS, 기기, 네트워크처럼 런타임 환경 확인이 필요한 문제
- 코드로 확인 가능한 사실과 실제 환경에서 확인해야 하는 사실을 분리한 조사
- 여러 원인 후보를 비교하고 다음 확인 절차를 남기는 문서
- 조사 결과에 따라 proposal, ADR, dependency 작업으로 이어질 수 있는 사전 분석

## Excluded Documents

다음 문서는 이 폴더에 넣지 않는다.

- 이미 변경 방향이 정해진 실행 전 작업 제안서: `proposals/`
- npm 패키지 설치, 제거, 업그레이드, 교체 전용 문서: `dependencies/`
- 장기적으로 남겨야 하는 아키텍처 의사결정 문서: `ADR/`
- 현재 적용되는 repository convention 문서: `conventions/`
- 단순 회의록, 임시 작업 로그, 제품 요구사항 문서

## File Naming

파일명은 조사 대상을 드러내는 kebab-case를 사용한다.

권장 형식:

```txt
active/<area-or-symptom>-investigation.md
```

예시:

```txt
rn-webview-auth-refresh-investigation.md
checkout-timeout-investigation.md
image-upload-failure-investigation.md
```

완료 문서명은 완료일을 앞에 붙인다.

```txt
completed/YYYY-MM-DD-<area-or-symptom>-investigation.md
```

## Template

새 investigation은 [template.md](./template.md)를 복사해서 작성한다.

템플릿은 investigation 문서 구조의 기준이다. 작은 조사에서는 무관한 항목을
줄일 수 있지만, 아래 정보는 가능한 한 남긴다.

- front matter의 상태, 생성일, 책임자, 관련 문서
- 관찰된 증상과 재현 조건
- 코드로 확인 가능한 사실과 아직 확인되지 않은 사실
- 주요 가설, 가설별 근거, 확인 방법, 현재 판단
- 런타임 확인 계획과 결과
- 결론, 남은 불확실성, 후속 조치

작은 조사라도 최소한 아래 항목은 남긴다.

- 증상, 영향, 재현 조건 또는 재현 조건이 아직 불명확하다는 사실
- 코드, 로그, 설정, 요청/응답 등으로 이미 확인한 사실
- 아직 확인하지 못한 사실과 다음 확인 방법
- 최소 하나 이상의 원인 가설, 근거, 확인 기준
- 현재 결론 또는 아직 확정 전이라는 판단

가설별 판단값은 front matter의 `status`와 분리해 본문에서만 사용한다.

| 판단값 | 의미 |
| --- | --- |
| `unverified` | 근거 또는 확인 절차가 아직 충분하지 않음. |
| `likely` | 현재 근거상 유력하지만 결정적 런타임 확인은 남아 있음. |
| `confirmed` | 로그, 재현, 요청/응답, 코드 경로 등으로 원인임을 확인함. |
| `ruled-out` | 확인 결과 해당 가설이 원인이 아님을 배제함. |
| `inconclusive` | 확인했지만 결과가 모호하거나 추가 데이터 없이는 판단할 수 없음. |

## Document Standards

각 investigation은 가능한 한 다음 내용을 포함한다.

- 관찰된 증상과 재현 조건
- 코드로 확인 가능한 사실
- 아직 코드만으로 확정할 수 없는 사실
- 주요 원인 후보와 근거
- 확인해야 할 런타임 데이터, 로그, 요청, 응답, 환경 조건
- 원인별 후속 조치
- 결론 또는 현재 남은 불확실성

조사 문서는 단순 추측으로 끝내지 않는다. 확인된 사실, 강한 추론, 아직 검증되지
않은 가설을 구분해 작성한다.

## Move Criteria

문서를 `completed/`로 이동하려면 아래 기준을 모두 만족해야 한다.

- 주요 원인 후보가 확인되었거나 명확히 배제됨
- 런타임 확인 결과, 로그, 요청/응답, 재현 조건 같은 근거가 문서에 기록됨
- 후속 조치가 필요하면 proposal, ADR, dependency 문서 또는 issue/PR로 연결됨
- 남은 불확실성과 추가 확인 필요 항목이 정리됨
- front matter의 `status`, `completed-at`, `conclusion-summary`, `follow-up`이
  완료 상태와 일치함
- 문서가 더 이상 진행 중 조사 노트가 아니라 완료된 조사 기록으로 읽힘

## HReviewer 적용

런타임 원인 조사뿐 아니라, 결론과 권고가 정리된 정적 코드 리뷰·구조 분석 기록도 이 폴더에서 관리한다. 조사 문서의 completed는 권고한 코드 변경의 완료를 뜻하지 않는다. 이관한 과거 자료에는 [기존 문서 이관 규칙](../README.md)을 적용한다. 저장소 루트에서 `rg --files --no-ignore docs/investigations`와 `node scripts/check-docs.mjs`를 사용한다.
