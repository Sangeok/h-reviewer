---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-07-21"
completed-at: "2026-07-21"
owners: []
related: []
approved-by: null
approved-at: null
approval-scope: null
verification-summary: "원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다."
closed-at: null
closed-by: null
closed-reason: null
legacy-record: true
migrated-at: "2026-09-06"
migrated-from: "docs/archive/2026-07-verification-index-alignment-soft-assert.md"
migration-note: "원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다."
---

> 이관 메모 (2026-09-06): 원문에 명시된 구현 완료를 이관한다. 이번 문서 이관에서 제품 동작이나 과거 검증을 다시 실행하지 않았다. 경로·메타데이터 변경 전의 hash와 검토 영수증은 당시 기록이며 새 검증 결과가 아니다.

# 검증 파이프라인 index 정렬 soft assert 기능 개발 문서

> 보관 상태: **역사 기록 / 구현 완료** (`f08d93b`, PR #65 → `develop` 머지 2026-07-22) · 작성일 2026-07-21 · 구현일 2026-07-21
>
> 본문의 라인 번호 참조(`review.ts:361-394` 등)는 모두 **구현 전** 좌표다. 현재 파일에서는 helper 추가분(약 36줄)만큼 밀려 있으므로, 위치는 심볼명(`checkLengthAlignment`, `verdictsAligned` 등)으로 찾을 것.

## 1. 배경/동기

**기술적 맥락 (코드베이스 확인):** `inngest/functions/review.ts`의 리뷰 파이프라인은 배열 3개가 **같은 index = 같은 이슈**라는 암묵적 약속 위에 서 있다:

| 배열 | 생산 지점 | 소비 지점 |
|------|----------|----------|
| `finalOutput.issues` | `applyVerification` 적용 후 (review.ts:325) | Step 6 게시, Step 6.5 카드, Step 7 저장 |
| `verified.keptIssueVerdicts` | `applyVerification` (verify-review.ts:152-193) | Step 6 배지 (review.ts:368), Step 6.5 판정 목록 (review.ts:408), Step 7 `verification` 블록 (review.ts:459) |
| `repeatAnnotations` | Step 5.5 `detectRepeatIssues` (review.ts:339-359) | Step 6 반복 배지 (review.ts:367), Step 7 `reviewIssue` row의 embedding/isRepeat (review.ts:499-512) |

이 약속은 타입으로 표현되지 않고 주석에만 존재하며, 어디서도 실행 중 검사되지 않는다. `applyVerification`은 구성상 정렬을 보장하고 테스트도 있으나(`features/ai/lib/verify-review.test.ts`), **생산과 소비 사이**(Step 5.3 적용 ↔ Step 6/7)에 미래의 수정이 `issues`를 필터링하는 한 줄만 끼워 넣으면 index가 밀린다. 그 결과는 에러가 아니라 **조용한 오염**이다: CONFIRMED 배지가 엉뚱한 이슈에 붙고, 최악의 경우 `reviewIssue` row에 엉뚱한 embedding이 저장되어 반복 감지(wedge)의 비교 데이터가 90일간 오염된다 (`features/ai/lib/repeat-detection.ts:55-69`의 후보 조회가 저장된 embedding을 신뢰함).

**비즈니스 맥락 (사용자 제공):** 반복 감지는 이 제품의 유일한 차별점(wedge)이므로, 그 데이터 품질을 조용히 망가뜨릴 수 있는 실패 모드는 크래시보다 우선 방어 대상이다. 단, 파이프라인 전체가 fail-open 철학(검증·반복 감지가 실패해도 리뷰는 게시)이므로 방어도 같은 철학을 따라야 한다.

## 2. 목표 상태

### 목표

- Step 6(게시)·Step 6.5(검수자 카드)·Step 7(저장) 직전에 병렬 배열 길이를 검사한다.
- 어긋나면 `console.warn` 1회 + **해당 장식만 생략**한다: 반복/CONFIRMED 배지 미부착, 검수자 카드 미게시, `verification` 블록의 판정 배열 비우기, `reviewIssue` row의 반복 필드 기본값 저장. 리뷰 게시·저장 자체는 진행한다 (soft assert, fail-open).
- 정렬이 정상인 경로(현재 코드가 항상 만족)에서는 **산출물이 변경 전과 동일**하다.

### 비목표

- hard assert(throw) 도입 — fail-open 철학과 충돌하므로 하지 않는다.
- 병렬 배열 구조 자체의 제거(판정·주석을 이슈 객체에 병합) — 구조적 해결이지만 이번 범위가 아니다 (대안 분석 Option C).
- `applyVerification` 내부 파티션 불변식의 재검증 — 이미 단위 테스트가 있다.

### 성공 기준

- `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors, `npm test`(vitest) 기존 5/5 통과 — 세 명령 모두 2026-07-21 실행으로 실패 감지 게이트로 동작함을 확인했다.
- 정렬 정상 경로에서 Before/After 산출물 동일 (구현 diff 리뷰로 확인 — 새 분기가 전부 mismatch 경로에만 존재하는지).
- 정상 PR 리뷰 1회 실행 시 `[index-alignment]` warn 로그가 없다.

## 3. 대안 분석

### Option A: `review.ts` 모듈 프라이빗 helper + 소비 지점 3곳 게이트 (선택)

- 장점: 최소 diff(본문 수정은 파일 1개 + 주석 1줄), 기존 선례와 일치(`resolveToDiffPath`/`resolveEntryFile`도 review.ts 모듈 스코프 비공개 helper, review.ts:28-66), step 내부에서 호출하므로 Inngest replay 시 warn 중복 없음(각 step은 1회 실행).
- 단점: helper가 export되지 않아 단위 테스트 불가.

### Option B: `features/ai/lib`에 export + 단위 테스트 추가

- 장점: 테스트 가능.
- 단점: 3줄짜리 길이 비교기의 테스트는 동어반복에 가깝고, 배럴 export 2곳 수정이 추가된다. 검사 대상 중 `repeatAnnotations`는 검증(verification) 도메인이 아니라 위치도 어색하다.

### Option C: 병렬 배열 제거 — 판정·반복 주석을 이슈 객체 필드로 병합

- 장점: 불변식 자체가 소멸하는 구조적 해결.
- 단점: `applyVerification` 반환 타입, 저장 스키마(`storedReviewDataSchema`), 대시보드 패널까지 연쇄 변경. assert의 30분 범위를 훨씬 초과.

### 선택: Option A

- 근거: 목적이 "미래 수정에 대한 보험"이므로 보험료(diff 크기)가 최소여야 하고, 기존 모듈 프라이빗 helper 선례와 일치한다. Option C는 이 파일을 다음에 크게 손볼 때의 리팩토링 후보로 기록해둔다.

## 4. 구현 계획

### 신규 코드

없음 (신규 파일 없음 — 수정은 기존 파일 2개: `inngest/functions/review.ts` 본문 + `features/ai/lib/verify-review.ts` 주석 1줄).

### 기존 코드 수정

**`inngest/functions/review.ts`** — 변경 4곳: (1) 모듈 helper 추가, (2) Step 6, (3) Step 6.5, (4) Step 7. 추가로 (5) `features/ai/lib/verify-review.ts` 주석 1줄(동작 무변경).

> 보존해야 할 행동 불변식: **정렬이 정상일 때(현재 코드가 항상 만족) After의 게시 본문·저장 row는 Before와 동일하다.** 아래 After 블록의 새 분기(`verdictsAligned`/`repeatsAligned`가 false인 경로)는 전부 mismatch 시에만 진입하며, 현재 코드베이스에는 그 경로로 진입하는 입력이 존재하지 않는다.

#### (1) 모듈 helper — `resolveEntryFile`(review.ts:57-66) 바로 아래 추가

```typescript
/**
 * 게시·저장 직전 병렬 배열 길이 동등성 soft assert.
 * finalOutput.issues와 병렬 배열(검증 판정·반복 감지 주석)은 같은 index가 같은
 * 이슈를 가리킨다는 암묵적 약속 위에 있다 — 어긋나면 배지·embedding이 엉뚱한
 * 이슈에 붙는다. 이 함수는 그 약속의 필요조건인 "길이 동등성"만 검증한다
 * (같은 길이로 재정렬된 배열은 통과 — 요소 대응까지 보장하지 않는다).
 * 어긋나면 warn을 남기고 false를 반환하며, 호출부는 해당 장식 부착만 생략하고
 * 게시·저장 자체는 진행한다 (fail-open, Step 5.3/5.5와 동일 철학).
 */
function checkLengthAlignment(
  scope: "post-review" | "post-verification-review" | "save-review",
  name: string,
  expected: number,
  actual: number,
  options?: { allowEmpty?: boolean },
): boolean {
  if (actual === expected) return true;
  if (options?.allowEmpty && actual === 0) return true;
  // "[index-alignment]"는 검증 절차가 grep하는 고정 로그 토큰 — 변경 시 이 토큰을 확인하는 절차도 함께 수정
  console.warn(`[index-alignment] ${name} length mismatch — related decorations skipped`, {
    scope,
    expected,
    actual,
  });
  return false;
}

/** repeatAnnotations 전용 wrapper — 빈 배열 허용(allowEmpty) 정책을 배열에 바인딩한다.
 *  Step 5.5는 실패·이슈 0개 시 []를 반환하므로 빈 배열은 정상 상태다. */
function checkRepeatsAligned(
  scope: "post-review" | "save-review",
  expected: number,
  actual: number,
): boolean {
  return checkLengthAlignment(scope, "repeatAnnotations", expected, actual, { allowEmpty: true });
}
```

#### (2) Step 6: 게시 — 배지 부착을 정렬 검사로 게이트

Before (review.ts:361-394):

```typescript
    // ── Step 6: GitHub에 리뷰 게시 ──
    // IMPORTANT: postedAsReview는 반드시 step.run()의 반환값으로 캡처해야 한다.
    const postedAsReview = await step.run("post-review", async () => {
      const suggestions = finalOutput?.suggestions ?? [];
      const issues = finalOutput?.issues ?? [];
      const issuesWithRepeat = issues.map((issue, index) => {
        const annotation = repeatAnnotations[index];
        const confirmed = verified?.keptIssueVerdicts[index]?.verdict === "CONFIRMED";
        return {
          ...issue,
          ...(annotation?.repeat ? { repeat: annotation.repeat } : {}),
          ...(confirmed ? { verifierConfirmed: true } : {}),
        };
      });
      const inlineIssues = issuesWithRepeat.filter(i => i.file !== null && i.line !== null);
      const hasInlineContent = suggestions.length > 0 || inlineIssues.length > 0;

      if (hasInlineContent) {
        try {
          await postPRReviewWithSuggestions({
            token, owner, repo, prNumber, reviewBody: finalReview,
            suggestions, issues: issuesWithRepeat, headSha, langCode,
          });
          return true;
        } catch (error) {
          console.warn("PR Review API failed, falling back to comment:", error);
          await postReviewComment(token, owner, repo, prNumber, finalReview);
          return false;
        }
      } else {
        await postReviewComment(token, owner, repo, prNumber, finalReview);
        return false;
      }
    });
```

After:

```typescript
    // ── Step 6: GitHub에 리뷰 게시 ──
    // IMPORTANT: postedAsReview는 반드시 step.run()의 반환값으로 캡처해야 한다.
    const postedAsReview = await step.run("post-review", async () => {
      const suggestions = finalOutput?.suggestions ?? [];
      const issues = finalOutput?.issues ?? [];
      const issueCount = issues.length;
      const verdictsAligned =
        !verified ||
        checkLengthAlignment("post-review", "keptIssueVerdicts", issueCount, verified.keptIssueVerdicts.length);
      const repeatsAligned = checkRepeatsAligned("post-review", issueCount, repeatAnnotations.length);
      const issuesWithRepeat = issues.map((issue, index) => {
        const annotation = repeatsAligned ? repeatAnnotations[index] : undefined;
        const confirmed = verdictsAligned && verified?.keptIssueVerdicts[index]?.verdict === "CONFIRMED";
        return {
          ...issue,
          ...(annotation?.repeat ? { repeat: annotation.repeat } : {}),
          ...(confirmed ? { verifierConfirmed: true } : {}),
        };
      });
      const inlineIssues = issuesWithRepeat.filter(i => i.file !== null && i.line !== null);
      const hasInlineContent = suggestions.length > 0 || inlineIssues.length > 0;

      if (hasInlineContent) {
        try {
          await postPRReviewWithSuggestions({
            token, owner, repo, prNumber, reviewBody: finalReview,
            suggestions, issues: issuesWithRepeat, headSha, langCode,
          });
          return true;
        } catch (error) {
          console.warn("PR Review API failed, falling back to comment:", error);
          await postReviewComment(token, owner, repo, prNumber, finalReview);
          return false;
        }
      } else {
        await postReviewComment(token, owner, repo, prNumber, finalReview);
        return false;
      }
    });
```

#### (3) Step 6.5: 검수자 카드 — mismatch 시 카드 전체 생략

잘못된 판정 목록을 게시하는 것보다 카드를 생략하는 쪽이 안전하다 (`buildVerificationReviewBody`는 `keptIssueVerdicts[index]`를 이슈 제목과 짝지어 렌더링 — verify-review.ts:227-234).

Before (review.ts:396-422):

```typescript
    // ── Step 6.5: 검수자 별도 리뷰 엔트리 게시 (검증 수행 시에만) ──
    // 1차 리뷰(Step 6)와 독립 — 실패해도 리뷰 흐름을 막지 않는다.
    // 검증 비활성이거나 검증 생략(skipped)·검토 대상 0개면 no-op.
    await step.run("post-verification-review", async () => {
      if (!verified || !verification) return false;

      const reviewedCount =
        verification.issueVerdicts.length + verification.suggestionVerdicts.length;
      if (reviewedCount === 0) return false;

      const body = buildVerificationReviewBody({
        keptIssues: finalOutput?.issues ?? [],
        keptIssueVerdicts: verified.keptIssueVerdicts,
        rejectedIssues: verified.rejectedIssues,
        rejectedSuggestions: verified.rejectedSuggestions,
        reviewedCount,
        langCode,
      });

      try {
        await postVerificationReview({ token, owner, repo, prNumber, headSha, body });
        return true;
      } catch (error) {
        console.warn("Verification review entry failed (main review was already posted):", error);
        return false;
      }
    });
```

After:

```typescript
    // ── Step 6.5: 검수자 별도 리뷰 엔트리 게시 (검증 수행 시에만) ──
    // 1차 리뷰(Step 6)와 독립 — 실패해도 리뷰 흐름을 막지 않는다.
    // 검증 비활성이거나 검증 생략(skipped)·검토 대상 0개면 no-op.
    await step.run("post-verification-review", async () => {
      if (!verified || !verification) return false;

      const keptIssues = finalOutput?.issues ?? [];
      const issueCount = keptIssues.length;
      // 판정 배열이 게시할 이슈와 어긋나면 잘못된 판정 목록 게시 방지를 위해 카드 전체 생략
      const verdictsAligned = checkLengthAlignment(
        "post-verification-review", "keptIssueVerdicts", issueCount, verified.keptIssueVerdicts.length,
      );
      if (!verdictsAligned) return false;

      const reviewedCount =
        verification.issueVerdicts.length + verification.suggestionVerdicts.length;
      if (reviewedCount === 0) return false;

      const body = buildVerificationReviewBody({
        keptIssues,
        keptIssueVerdicts: verified.keptIssueVerdicts,
        rejectedIssues: verified.rejectedIssues,
        rejectedSuggestions: verified.rejectedSuggestions,
        reviewedCount,
        langCode,
      });

      try {
        await postVerificationReview({ token, owner, repo, prNumber, headSha, body });
        return true;
      } catch (error) {
        console.warn("Verification review entry failed (main review was already posted):", error);
        return false;
      }
    });
```

#### (4) Step 7: 저장 — `verification` 블록 판정 배열과 `reviewIssue` 반복 필드 게이트

wedge 데이터 보호의 핵심 지점. mismatch 시 embedding/isRepeat은 기본값(`DbNull`/`false`)으로 저장되어 반복 감지 후보에서 자연히 제외된다 (`repeat-detection.ts:89`의 `Array.isArray(candidate.embedding)` 가드).

Before (review.ts:424-517):

```typescript
    // ── Step 7: DB에 리뷰 저장 ──
    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      await prisma.$transaction(async (tx) => {
        const createdReview = await tx.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review: finalReview,
            reviewData: finalOutput
              ? (() => {
                  // shape guard: 배포 경쟁 상태에서 구 shape(description-only)이
                  // memoize되어 resume될 때 schemaVersion이 실제 shape과 불일치하는 것을 방지.
                  // issues가 빈 배열이면 .every()는 true → 정상적으로 v2 저장.
                  const hasNewIssueShape = (finalOutput.issues ?? []).every(
                    (i) => typeof (i as { title?: unknown }).title === "string",
                  );
                  const storedSchemaVersion = hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1;
                  // verification 블록은 optional 추가 필드 — 버전 범프 불필요 (storedReviewDataSchema 참조)
                  const verificationBlock = verification
                    ? {
                        status: verification.status,
                        model: VERIFIER_MODEL_ID,
                        issueVerdicts: verified?.keptIssueVerdicts ?? [],
                        suggestionVerdicts: verified?.keptSuggestionVerdicts ?? [],
                        rejectedIssues: verified?.rejectedIssues ?? [],
                        rejectedSuggestions: verified?.rejectedSuggestions ?? [],
                      }
                    : null;
                  // 인터페이스 타입 배열(VerdictEntry[] 등)은 인덱스 시그니처가 없어
                  // Prisma InputJsonValue에 구조적으로 미할당 — 값은 순수 JSON이므로 캐스트.
                  return {
                    ...finalOutput,
                    ...(verificationBlock ? { verification: verificationBlock } : {}),
                    schemaVersion: storedSchemaVersion,
                  } as unknown as Prisma.InputJsonValue;
                })()
              : Prisma.DbNull,
            langCode,
            reviewType: "FULL_REVIEW",
            status: "completed",
            headSha,
          },
        });

        if (finalOutput?.suggestions?.length) {
          await tx.suggestion.createMany({
            // ... (unchanged — suggestion row 매핑, review.ts:483-492)
          });
        }

        if (finalOutput?.issues?.length) {
          await tx.reviewIssue.createMany({
            data: finalOutput.issues.map((issue, index) => {
              const annotation = repeatAnnotations[index];
              return {
                reviewId: createdReview.id,
                userId,
                filePath: issue.file,
                lineNumber: issue.line,
                title: issue.title,
                body: issue.body,
                severity: issue.severity,
                category: issue.category,
                embedding: annotation?.embedding ?? Prisma.DbNull,
                isRepeat: annotation?.isRepeat ?? false,
                repeatOfIssueId: annotation?.repeatOfIssueId ?? null,
                repeatSimilarity: annotation?.repeatSimilarity ?? null,
              };
            }),
          });
        }
      });
```

After:

```typescript
    // ── Step 7: DB에 리뷰 저장 ──
    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      const issueCount = finalOutput?.issues?.length ?? 0;
      const suggestionCount = finalOutput?.suggestions?.length ?? 0;
      const verdictsAligned =
        !verified ||
        checkLengthAlignment("save-review", "keptIssueVerdicts", issueCount, verified.keptIssueVerdicts.length);
      const suggestionVerdictsAligned =
        !verified ||
        checkLengthAlignment("save-review", "keptSuggestionVerdicts", suggestionCount, verified.keptSuggestionVerdicts.length);
      const repeatsAligned = checkRepeatsAligned("save-review", issueCount, repeatAnnotations.length);

      await prisma.$transaction(async (tx) => {
        const createdReview = await tx.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review: finalReview,
            reviewData: finalOutput
              ? (() => {
                  // shape guard: 배포 경쟁 상태에서 구 shape(description-only)이
                  // memoize되어 resume될 때 schemaVersion이 실제 shape과 불일치하는 것을 방지.
                  // issues가 빈 배열이면 .every()는 true → 정상적으로 v2 저장.
                  const hasNewIssueShape = (finalOutput.issues ?? []).every(
                    (i) => typeof (i as { title?: unknown }).title === "string",
                  );
                  const storedSchemaVersion = hasNewIssueShape ? REVIEW_SCHEMA_VERSION : 1;
                  // verification 블록은 optional 추가 필드 — 버전 범프 불필요 (storedReviewDataSchema 참조)
                  // 판정 배열은 저장된 issues/suggestions와 index 정렬이 전제 —
                  // 어긋나면 빈 배열로 저장한다 (대시보드 패널은 entry 없는 row를 건너뜀).
                  const verificationBlock = verification
                    ? {
                        status: verification.status,
                        model: VERIFIER_MODEL_ID,
                        issueVerdicts: verdictsAligned ? verified?.keptIssueVerdicts ?? [] : [],
                        suggestionVerdicts: suggestionVerdictsAligned ? verified?.keptSuggestionVerdicts ?? [] : [],
                        rejectedIssues: verified?.rejectedIssues ?? [],
                        rejectedSuggestions: verified?.rejectedSuggestions ?? [],
                      }
                    : null;
                  // 인터페이스 타입 배열(VerdictEntry[] 등)은 인덱스 시그니처가 없어
                  // Prisma InputJsonValue에 구조적으로 미할당 — 값은 순수 JSON이므로 캐스트.
                  return {
                    ...finalOutput,
                    ...(verificationBlock ? { verification: verificationBlock } : {}),
                    schemaVersion: storedSchemaVersion,
                  } as unknown as Prisma.InputJsonValue;
                })()
              : Prisma.DbNull,
            langCode,
            reviewType: "FULL_REVIEW",
            status: "completed",
            headSha,
          },
        });

        if (finalOutput?.suggestions?.length) {
          await tx.suggestion.createMany({
            // ... (unchanged — suggestion row 매핑, review.ts:483-492)
          });
        }

        if (finalOutput?.issues?.length) {
          await tx.reviewIssue.createMany({
            data: finalOutput.issues.map((issue, index) => {
              const annotation = repeatsAligned ? repeatAnnotations[index] : undefined;
              return {
                reviewId: createdReview.id,
                userId,
                filePath: issue.file,
                lineNumber: issue.line,
                title: issue.title,
                body: issue.body,
                severity: issue.severity,
                category: issue.category,
                embedding: annotation?.embedding ?? Prisma.DbNull,
                isRepeat: annotation?.isRepeat ?? false,
                repeatOfIssueId: annotation?.repeatOfIssueId ?? null,
                repeatSimilarity: annotation?.repeatSimilarity ?? null,
              };
            }),
          });
        }
      });
```

#### (5) `features/ai/lib/verify-review.ts` — 생산자 측 역참조 주석 1줄 (동작 무변경)

길이 동등성 불변식의 생산자(`applyVerification`)와 소비자(review.ts의 soft assert)가 다른 모듈에 있다. 생산자를 수정하는 미래 편집자가 소비자의 존재를 알 수 있도록 역참조를 남긴다.

Before (verify-review.ts:26):

```typescript
  /** keptOutput.issues와 index 정렬 (CONFIRMED | UNCERTAIN만 포함) */
```

After:

```typescript
  /** keptOutput.issues와 index 정렬 (CONFIRMED | UNCERTAIN만 포함).
   *  review.ts의 checkLengthAlignment가 게시·저장 직전 이 길이 동등성을 soft-assert한다. */
```

설계 노트:

- **`allowEmpty` 정책을 wrapper(`checkRepeatsAligned`)에 바인딩한 이유:** Step 5.5는 실패 시 `[]`를 반환하고(review.ts:355-358), `detectRepeatIssues`도 이슈 0개면 `[]`를 반환한다(repeat-detection.ts:51). 빈 배열은 "반복 감지 미수행"이라는 정상 상태이므로 mismatch로 취급하면 안 된다. 반대로 `keptIssueVerdicts`는 `verified`가 존재하는 한 항상 `keptOutput.issues`와 같은 길이여야 한다(verify-review.ts:162-170의 push 쌍). 이 비대칭 정책을 호출부마다 손으로 재지정하면 잘못 지정할 위험이 있으므로, wrapper가 정책을 배열에 1회 바인딩해 호출부에서는 정책 선택 자체가 불가능하게 한다.
- **helper를 step 내부에서 호출하는 이유:** Inngest는 완료된 step을 memoize하고 함수 본문을 재실행(replay)한다. 모듈 스코프에서 warn을 호출하면 replay마다 중복 로그가 남지만, `step.run` 내부는 1회만 실행된다.
- **suggestion row는 게이트하지 않는 이유:** `tx.suggestion.createMany`(review.ts:481-493)는 `finalOutput.suggestions` 단일 배열만 순회하며 병렬 배열을 조회하지 않는다 — 정렬 불변식과 무관하다.

## 5. 실행 순서

### Phase 1: helper + Step 6 + Step 6.5

- 작업 내용: `checkLengthAlignment`·`checkRepeatsAligned` 모듈 helper 추가, Step 6 배지 게이트, Step 6.5 카드 생략 게이트, verify-review.ts 생산자 역참조 주석 1줄.
- 검증: `npx tsc --noEmit` 0 errors. diff 리뷰로 정상 경로 산출물 무변경 확인 (`verdictsAligned`/`repeatsAligned`가 true면 기존 표현식과 동일하게 평가되는지).

### Phase 2: Step 7

- 작업 내용: 저장 직전 3개 플래그 계산, `verification` 블록 판정 배열 게이트, `reviewIssue` 반복 필드 게이트.
- 검증: `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors, `npm test` 5/5. 정상 PR 리뷰 1회 실행 후 `[index-alignment]` warn 부재 확인.

## 6. 영향 범위

- 직접 수정 대상: `inngest/functions/review.ts` 1개 파일 + `features/ai/lib/verify-review.ts` 주석 1줄(동작 무변경).
- import 변경 필요: 없음 (helper는 같은 파일 모듈 스코프).
- 외부 의존성: 없음. DB 스키마·마이그레이션 변경 없음.
- 소비자/사용처 영향: 저장 shape 소비자는 `storedReviewDataSchema`(features/ai/lib/review-schema.ts)와 `VerificationPanel`(features/review/ui/parts/verification-panel.tsx) — grep으로 확인. mismatch 시 판정 배열이 `[]`로 저장될 수 있는데, 패널은 `verification.issueVerdicts[index]`가 없으면 해당 row를 건너뛰므로(verification-panel.tsx:50-51 `if (!entry) return null`) 스키마 위반·렌더 오류 없이 성능 저하 없이 동작한다. 동적/문자열 키 참조는 별도 열거하지 않았다(reviewData JSON을 직접 파싱하는 소비자는 위 2곳 외에 grep에서 발견되지 않음).

## 7. 리스크 + 롤백 전략

### 리스크

- **조용한 기능 저하:** mismatch 시 배지·카드가 사라지는 것을 사용자는 인지하지 못한다. 다만 warn 로그가 남으므로 "완전히 조용한 오염"(현재 상태)보다 관찰 가능성이 높다. 발생 가능성은 현재 0(정렬을 깨는 코드가 없음), 이 변경은 미래 수정에 대한 보험이다.
- **오탐 가드:** `allowEmpty` 대상을 잘못 지정하면 진짜 mismatch를 놓친다 — `checkRepeatsAligned` wrapper가 정책을 배열에 바인딩해 호출부 오지정 여지를 제거했다. 새 병렬 배열을 추가할 때만 정책 판단이 다시 필요하다.
- **잔여 한계 (의도된 범위):** 길이 동등성은 index 정렬의 필요조건일 뿐이다 — 같은 길이로 재정렬된 배열은 이 검사를 통과한다. 재정렬형 misalignment까지 잡으려면 요소 대응 검증(예: 이슈 식별자 동반)이 필요한데, 이는 Option C(병렬 배열 제거)의 영역이므로 이번 범위에서 제외한다.

### 롤백 전략

- 단일 커밋 revert로 완전 복구. DB·스키마·이벤트 payload 변경이 없어 데이터 마이그레이션 불필요. 저장된 `verification` 블록 shape도 변경 없음(빈 판정 배열은 기존에도 저장되는 값 — 검증 skipped 시 Step 7의 `verificationBlock`이 이미 `verified?.keptIssueVerdicts ?? []`로 빈 배열을 저장한다, review.ts:459-460).

## 8. 검증 전략

- 기존 테스트: `npm test` — `features/ai/lib/verify-review.test.ts`(3건) + `lib/github/diff-parser.test.ts`(2건) 5/5 유지.
- 추가 테스트: 없음. helper가 모듈 프라이빗 trivial comparator이고(기존 `resolveToDiffPath` 선례와 동일하게 비공개·비테스트), 의미 있는 불변식(`applyVerification` 파티션)은 이미 테스트되어 있다. Option B 채택 시에만 테스트 추가가 의미를 갖는다.
- 타입/빌드 검증: `npx tsc --noEmit`, `npm run lint` — 두 명령 모두 2026-07-21 실행으로 게이트 동작 확인.
- 수동 확인: 검증 활성(`verificationEnabled=true`) 상태로 실제 PR 리뷰 1회 실행 → GitHub 배지·검수자 카드가 기존과 동일하게 게시되고, Inngest 로그에 `[index-alignment]` warn이 없는지 확인.
