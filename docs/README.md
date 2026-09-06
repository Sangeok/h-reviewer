# HReviewer 문서

`sangeok-docs-folder`의 분류를 HReviewer 저장소의 `docs/`에 적용한다. 문서 종류와 생명주기를 나누고, 목록은 실제 파일을 기준으로 확인한다.

## 폴더 선택

| 폴더 | 용도 | 시작점 |
| --- | --- | --- |
| `ADR/` | 아키텍처 결정과 대안 | [안내](./ADR/README.md) · [템플릿](./ADR/template.md) |
| `architecture/` | 시스템 구성과 운영 절차 | [안내](./architecture/README.md) |
| `conventions/` | 필수 코딩·문서 규칙 | [규약 안내](./conventions/README.md) |
| `dependencies/` | 패키지 설치·제거·교체·업그레이드 | [안내](./dependencies/README.md) |
| `investigations/` | 원인 분석, 정적 코드 조사, 검토 결과 | [안내](./investigations/README.md) · [템플릿](./investigations/template.md) |
| `proposals/` | 기능 명세, 리팩터링 계획, 구현 task queue | [안내](./proposals/README.md) · [템플릿](./proposals/template.md) |
| `test-reports/` | 실행한 검증과 release gate 판정 | [안내](./test-reports/README.md) · [템플릿](./test-reports/template.md) |

`dependencies/`, `investigations/`, `proposals/`, `test-reports/`는 각각 `active/`와 `completed/`를 사용한다. `ADR` 대문자는 기준 폴더와 호환하기 위한 명명 예외다. 별도 `specs/`, `archive/`, `evaluations/`는 사용하지 않는다.

## 생명주기

- Proposal: `active/`는 `status: "pending"`, `stage: "draft" | "awaiting-approval" | "approved" | "blocked"`. 완료하면 `completed/`에서 `status: "completed"`, 실행하지 않기로 닫으면 `status: "closed"`. 두 경우 모두 `stage: null`이다.
- Investigation: `status: "active" | "completed"`가 폴더와 일치해야 한다. 조사 완료가 권고한 구현 작업의 완료를 뜻하지 않는다.
- Test report: `status: "active" | "completed"`와 테스트 `result: "pass" | "fail" | "blocked"`를 분리한다. 미실행 필수 항목이 남은 채 보고서를 종결했으면 `completed`와 `blocked`를 함께 쓴다.
- Dependency 작업은 변경과 검증이 끝나면 `completed/`로 옮긴다.

새 문서는 해당 템플릿의 front matter를 사용한다. 문서 승인 기록과 현재 대화에서 이미 부여된 작업 권한을 함께 적용한다. 문서 재분류가 제품 구현·배포·유료 호출의 추가 승인을 만들지는 않는다.

## 기존 문서 이관 규칙

`2026-09-06` 이관 자료에는 `legacy-record`, `migrated-at`, `migrated-from`, `migration-note`를 기록했다. 이전 `archive/`에 있었다는 이유만으로 완료를 추정하지 않는다. TODO·초안 또는 완료 근거가 없는 변경안은 `proposals/active/`에서 실행 전 재대조한다.

원문에서 알 수 없는 승인자·작성일·완료일은 `null`로 보존한다. 완료일을 알면 `YYYY-MM-DD-<topic>.md`를 사용하고, 알 수 없는 기존 완료 기록은 종전 파일명과 `completed-at: null`을 허용한다. 이 예외는 `legacy-record: true`인 이관 문서에만 적용한다. 원문에서 이미 SUPERSEDED로 닫힌 기록의 미상 `closed-*` 정보에도 같은 원칙을 적용한다.

기존 본문 구조와 판단 근거는 유지했다. 본문의 과거 상태·소스 경로·hash·검토 영수증은 당시 기록이며, 경로 변경 후의 검증 결과로 재사용하지 않는다. 활성 구현 계획을 실제 실행할 때는 현재 코드와 다시 대조한다. 이관 문서의 보존 섹션은 새 템플릿의 모든 제목을 기계적으로 채우지 않아도 된다.

과거 문서 안의 원본 이동·생성 명령보다 현재 폴더 구조와 front matter를 우선한다. Core 구현이 이미 끝난 문서의 과거 구현·이동 명령은 다시 실행하지 않는다. 완료 보고서를 재검증할 때는 기존 기록을 덮어쓰지 말고 `test-reports/active/`에 새 보고서를 만든다.

P0 계획은 앞선 사용자 지시대로 [완료 위치](./proposals/completed/2026-09-06-hreviewer-personal-review-coach-p0-implementation-plan.md)에 있다. T10 이후가 남은 [전체 로드맵](./proposals/active/hreviewer-personal-review-coach-roadmap.md)은 `active/`에 있다. [P0 보고서](./test-reports/completed/2026-09-06-p0-personal-review-coach-release-receipt.md)의 테스트 판정은 미확인 외부 gate를 반영한다.

## 조회와 검증

저장소 루트에서 실행한다. 기존 `docs/` ignore 정책 때문에 `rg`에는 `--no-ignore`가 필요하다.

```powershell
rg --files --no-ignore docs/proposals/active docs/investigations/active docs/test-reports/active docs/dependencies/active
node scripts/check-docs.mjs
```

검사기는 폴더·상태·완료일, 지원하는 평면 front matter, 보고서 필수 필드, 문서의 인라인 로컬 링크와 `related`·`follow-up` 대상 존재를 확인한다. 템플릿 예시, 코드 블록의 가상 경로, 원격 URL 접근성, 제목 anchor, 제품 테스트 결과의 진위는 검사하지 않는다.

`docs/test-reports/p0-provider-binding.local.md`는 로컬 전용 감사 부속 자료다. 기존 `/docs/` ignore 정책과 비공개 취급을 유지하며 force-add하지 않는다. 이관 후 사용자의 커밋·푸시·PR 요청에 따라 공개 가능한 문서·안내·템플릿과 빈 분류의 `.gitkeep`을 정확한 경로 목록으로 추적한다. 새 체크아웃에서도 이 문서 구조와 검사 명령을 사용할 수 있어야 한다. 앞으로 추가하는 문서도 내용을 확인한 뒤 해당 경로만 `git add -f -- <path>`로 등록한다.

이전 경로별 이동 내역과 검증 결과는 [이관 보고서](./test-reports/completed/2026-09-06-docs-structure-migration.md)에 있다.
