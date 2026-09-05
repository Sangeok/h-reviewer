# P0 개인 리뷰 코치 release receipt

> 상태: **BLOCKED — network-free 구현·검증 완료, Approval-after gate 대기**
>
> 확인 시각: `2026-09-04T16:12:23.9277128Z` (`2026-09-05` KST)
>
> 이 문서는 비밀값, 원문 diff, source context, prompt/response, account balance를 포함하지 않는다.

## 판정 요약

| 항목 | 값 |
|---|---|
| sourceCommitSha | `9e0e09ccb390b0e74ae93d8ea8b653bb6f9524a4` — T09 source commit; T07/T08은 `2d94286c0252788a4d0bc2cdc85d19b9d2540a41` |
| lockfileSha256 | `400cded081c3950c2950aa1933f7d526209c02ac9556c50a7040b163357d78fb` |
| corpusSha256 | `61e2f9c8fbea5ab248e62ae603a95d1c0e51a1a2760be586a1fe0bb6aaf2b4bd` |
| localImplementation | `passed` |
| releaseGate | `blocked` |
| blocker | 유료 model probe·capture 미승인, adjudication `pending`, 외부 GitHub·production cutover 증거 없음 |

## 모델 binding과 공식 lifecycle

| 역할 | source binding | shutdown | replacement |
|---|---|---|---|
| generation | `gemini-3.1-flash-lite` | `2027-05-07` | `gemini-3.5-flash-lite` |
| verification | `gemini-3.1-flash-lite` | `2027-05-07` | `gemini-3.5-flash-lite` |
| embedding | `gemini-embedding-001` | `2028-05-14` | `gemini-embedding-2` |

- unique model ID는 `gemini-3.1-flash-lite`, `gemini-embedding-001` 두 개다.
- generation과 verification이 같은 exact model을 사용하므로 독립 검증이 아니다. 상관된 blind spot 위험은 남으며, 고정 corpus의 사람 adjudication과 verifier verdict를 함께 기록해야만 보완 증거가 된다.
- `gemini-3.1-flash-lite`는 text output과 structured output을 지원한다.
- 공식 [deprecation 문서](https://ai.google.dev/gemini-api/docs/deprecations)는 `2026-09-04 UTC` 갱신본, [모델 상세](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)는 `2026-07-21 UTC` 갱신본, [embedding 문서](https://ai.google.dev/gemini-api/docs/embeddings)는 `2026-06-22 UTC` 갱신본을 확인했다.
- 확인 시점부터 `2027-05-07T00:00:00Z`까지 남은 완전한 날은 `244일`이다. release 예정일과 운영·rollback 종료일이 아직 승인되지 않아 lifecycle window 충족 여부는 `blocked`다.

## 가격과 실행 비용

- 공식 [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)의 `2026-09-04 UTC` 갱신본에서 Standard paid tier는 text input `$0.25 / 1M tokens`, thinking 포함 output `$1.50 / 1M tokens`다.
- generation input/output/reasoning/total token: `not-run`
- verification input/output/reasoning/total token: `not-run`
- 계산 비용: `not-evaluable`
- 이유: paid capture를 승인 없이 실행하지 않았다.

## provider binding과 model availability

| 항목 | 값 |
|---|---|
| API key fingerprint | `recorded-out-of-band` |
| Google Cloud project ID | `recorded-out-of-band` |
| Plan | `not-confirmed` |
| billing state | `not-confirmed` |
| billing tier / plan | `not-confirmed` |
| strict wrapper exit code | `not-run` |
| exact OK lines | `0 / 3` |
| SKIP / WARN / soft-pass | 성공으로 번역하지 않음; gate 미실행 |
| model availability output SHA-256 | `not-run` |

이 저장소는 public이고 `.gitignore`의 `/docs/` 규칙 때문에 이 receipt만 예외적으로
추적된다. canonical procedure가 key fingerprint를 access-control 대상 audit
metadata로 규정하므로, fingerprint와 Google Cloud project ID는 추적되지 않는
로컬 기록 `docs/evaluations/p0-provider-binding.local.md`에 두고 여기서는
`recorded-out-of-band`로만 참조한다. 계산 절차는 archive 문서 12절의 canonical
procedure와 동일하며, capture 하니스와 같은 `dotenv` 파싱 순서를 사용한다.
나머지 plan·billing 항목은 아직 확인되지 않았고 `not-confirmed`를 유지한다.

## 고정 corpus identity

| case | merge commit | parent 1 / parent 2 | merge base | size | diff SHA-256 | context SHA-256 | manifest SHA-256 | canonical input SHA-256 |
|---|---|---|---|---|---|---|---|---|
| `p0-pr65-parallel-array-assert` | `c902f229a179b36399f8179382a45c08083c1f62` | `cf41f00676214b5b9f1fe8cbfd306217d0340db7` / `f08d93bd051a3a0673510cd9d26c171738b85a7b` | `90c25b2cbcc6501c9512629c4c93d0a9cdfa1c0c` | `normal` | `59046427d681ddfec7ed61e0a8642e511abda1c1dc1561692af7a47b3cde40f2` | `f963e0571865341b03d63f0532005cc874ef1faa063d9d6cdeccf60b019403d7` | `c4160093ae7cbe72d95c4e5e84f49d4c77183d73ac2d6fd97e2e2892115215d3` | `d84ef784f6c01713ab3c3b5649bb3afc86e11ddc95702643d24f707e115d6b84` |
| `p0-pr64-verification-rename` | `cf41f00676214b5b9f1fe8cbfd306217d0340db7` | `99e774a153c8147adfc065a941331742bf877533` / `90c25b2cbcc6501c9512629c4c93d0a9cdfa1c0c` | `6bf7c5ca25dfcb529ad48eb1f5d5751bfd7fdaa4` | `normal` | `774df263d177ec3be31d42850195f2fc4c8a3a2f87d1e39a9d87ead7feee21d8` | `6b9ba62dc62d651d248b31faf56cb85a1192aa9d9c1ec9265c1e0dfd6befc97e` | `140f02d011b94a8bac577c57715544a88ced2efda23dec1b574b6f081b91f1ca` | `0302d0340f6e7199fedfd1e5c627ac342bc4befddfea86ba1d78a3924eece2bb` |
| `p0-pr60-repeat-wedge` | `6dc7eda06154c0e05747d2320164939ab3c7b93a` | `a240c85319dbcf9eacf910ed990dae4ba19d57d7` / `11cde4a32cbbb27850b4801b17efed4c24e7cfde` | `4760e573130e7ce53ae47979c7702003d544dbd8` | `large` | `937138f122cfda23610d00850d4470db6e7d57ecc04541e933b6aedc00dbb24c` | `ea61ed9301eb016d9f5083053979543a490861e08473fb0a78fd973e9786be19` | `2d589728228ae053a9130e17281961a0250094bcf605633e6460ffcb6e835b18` | `679b7608a7649301fa2faf84ef9448b6b18945fd36a87c1cd527584b5a7088a9` |
| `p0-pr59-frontend-clean-code` | `a240c85319dbcf9eacf910ed990dae4ba19d57d7` | `7d90924cda764eafda7ab422c612db9b1b77474a` / `4760e573130e7ce53ae47979c7702003d544dbd8` | `ee1a5d7e7c587d043f111bc3c7399eff6f88a7c0` | `normal` | `0632cee6affbe05c32e2349599156e23d9b21aa7ad59c6fb910e7c5fcf2f1a1f` | `13b9ee237672b1957c68a5224d71f15361fd8e6d43ae71b27fdbb02d5f1eddd0` | `881b967d9b80424dde0b4751abc635776bd7054afd81e3dd2578190e4c61ab6d` | `ee610e3f308cd60eac62d934cc87914cf0b0212938c898b9ba6209360525bc22` |

case 수는 `4`, known expected finding은 `3`, historical finding은 `5`다. title과 description은 fixture에 고정되어 있고 실행 시 commit message에서 추론하지 않는다. 모든 Git 호출은 `execFile()` argument array를 사용했으며 checkout, worktree 변경, fetch를 하지 않았다.

## 품질 평가

| 항목 | 결과 |
|---|---|
| fixture/schema/commit/parent/merge-base/diff/tree/line validation | `passed` |
| deterministic context 2회 content·manifest·input identity 일치 | `passed` |
| adjudication | `pending` |
| capture output path / SHA-256 | `not-run` |
| actionable precision | `not-evaluable` |
| known-defect recall | `not-evaluable` |
| unsupported claim | `not-evaluable` |
| stale claim | `not-evaluable` |
| cross-file miss | `not-evaluable` |
| repeat false-positive rate | `not-evaluable` |

`capture`는 `CALIBRATION=1` 없이는 유료 호출 전에 실패하고, `score`는 pending adjudication을 거부하며, 알 수 없는 mode도 실패하는 것을 확인했다. capture 성공은 score 통과로 간주하지 않는다.

## reliability test authority

- `scripts/p0-review-quality-evaluation.test.ts` — `validates, captures, or scores the fixed local merge corpus`
- `features/ai/lib/build-deterministic-pr-context.test.ts` — `uses an injected repository reader without calling the GitHub default`
- `features/ai/lib/repeat-detection.test.ts` — `accepts a same-category candidate exactly at the production threshold`, `keeps category filtering and ignores malformed embeddings`, `returns the highest-similarity compatible candidate`
- `features/ai/lib/verify-review.test.ts` — `preserves provider input/output/reasoning/total token usage with aligned verdicts`
- `app/api/inngest/route.test.ts` — exact 네 function identity membership

## 로컬·PostgreSQL 검증

| 검증 | 결과 |
|---|---|
| network-free T09 gate | `passed` — 51 tests, calibration 1 intentional skip |
| full test | `passed` — 53 files, 380 tests; environment-dependent 17 skipped |
| lint | `passed` — error 0, 기존 `user-avatar.tsx` warning 1 |
| typecheck | `passed` |
| production build | `passed` |
| `git diff --check` | `passed` |
| forbidden source / registry | `passed`; lowercase status 검색 1건은 `PromiseSettledResult.status = "rejected"` test fixture로 Review write가 아님 |

PostgreSQL 전용 database identity SHA-256은 `313f68a65fdd2157b7fad2a763d430ebf6df65fae4e0cabde71c06451788b3d6`이며 secret URL은 기록하지 않았다. 공통 `public` schema, migration `17개`, 필수 table을 준비 script로 확인했다. migration SQL manifest SHA-256은 `34863e529c777306b9a8cf419864fcbd3c1b9c648a0f876e40f5e8ed496539a5`다. 첫 준비 시 일시적 `P1001`이 발생했으나 DNS/TCP 확인 후 재실행에서 migration 검증과 다음 5개 파일 `16 tests`가 모두 통과했다.

- `features/review/lib/review-execution-migration.integration.test.ts`
- `features/review/lib/review-request.integration.test.ts`
- `lib/github/github-webhook-delivery.integration.test.ts`
- `features/payment/lib/review-trial.integration.test.ts`
- `features/repository/lib/repository-disconnect.integration.test.ts`

## Approval-after 운영 증거

| 항목 | 상태 |
|---|---|
| 외부 GitHub fixture identity / cleanup | `not-run`; cleanup `not-applicable` |
| failed delivery manual/API redelivery와 최근 3일 eligibility | `not-run` |
| cutover 누락 delivery 수·oldest age·window 밖 복구 승인 | `not-run` |
| production Review status read-only preflight | `not-run` |
| migration create-only SQL digest·검토자·coupled cutover | T09 schema migration 없음; production cutover `not-run` |
| 기존 `generate-review` / `generate-summary` queued·running 0개 | `not-confirmed` |
| webhook 정상 fixture 최대 응답 시간·8초 budget·10초 source | `not-run` |
| 실제 GitHub write | `0` |
| 실제 Google AI 호출 | `0` |
| production DB / Inngest Cloud 요청 | `0` |

## 승인과 실행자

| 역할 | 값 |
|---|---|
| paid provider gate 승인자 / 시각 | `pending` |
| 외부 GitHub·cutover 승인자 / 시각 | `pending` |
| local 실행자 | `Codex` |
| local 실행 시각 | `2026-09-05 KST` |
| human adjudicator | `pending` |

## 최종 판정

`BLOCKED`. 재개 조건은 다음과 같다.

1. source-bearing Google AI 환경의 비밀 없는 fingerprint·project·Paid plan·active billing·non-Free tier·billing readiness를 승인된 방식으로 확인한다.
2. 별도 승인 후 strict model availability wrapper를 실행해 세 role binding의 exact `OK`, warning 0건, output SHA-256을 기록한다.
3. 별도 승인 후 고정 corpus capture를 한 번 실행하고 output path·SHA-256·role별 token과 비용을 기록한다.
4. 사람이 고정 output 전체를 판정해 adjudication을 `complete`로 만들고 별도 score gate를 통과시킨다.
5. 외부 GitHub fixture, redelivery, production status/cutover, old Inngest run drain, webhook 응답 budget 증거를 승인 후 수집한다.

위 조건 전에는 T09를 `COMPLETED`로 바꾸거나 T10을 열지 않는다.
