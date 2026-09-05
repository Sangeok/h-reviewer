# Codebase RAG 제거 및 결정적 PR 컨텍스트 평가 영수증

> 상태: **Core 로컬 구현 완료 / Release gate 차단**
>
> 갱신 시각: `2026-08-03T23:11:51.959Z`
>
> 이 문서는 비밀값, 저장소 좌표, 원문 diff, source context, prompt/response를 포함하지 않는다.
>
> 역사 문서: 이 영수증의 모델·품질 판정은 당시 snapshot이며 현재 release 근거로 재사용하지 않는다. T09 이후의 대체 영수증은 [P0 개인 리뷰 코치 release receipt](./p0-personal-review-coach-release-receipt.md)다.

## 판정 요약

| 항목 | 값 |
|---|---|
| preCutoverSourceCommitSha | `c902f229a179b36399f8179382a45c08083c1f62` |
| preCutoverLockfileSha256 | `2fcfa2510eb8ea71a15dd4d84db03d74999d8cf66d4df58593a3a4a49d41e17b` |
| coreSourceCommitSha | `unknown` — 구현 변경이 아직 commit되지 않음 |
| workingLockfileSha256 | `400cded081c3950c2950aa1933f7d526209c02ac9556c50a7040b163357d78fb` |
| localCoreStatus | `implemented-validation-passed` |
| releaseGateStatus | `blocked` |
| operationalRetirementStatus | `pending` |
| t0Status | `not-established` |
| 외부 작업 | 실행하지 않음 — 승인, credential, fixture, deployment identity가 없음 |

## 로컬 검증

| 검증 | 결과 |
|---|---|
| legacy reference/source contract 검사 | `passed` |
| `npm.cmd ci --ignore-scripts` | `passed` |
| `npx.cmd prisma validate` | `passed` |
| `npx.cmd prisma generate` | `passed` |
| `npm.cmd run test` | `passed` — 7 files, 86 tests |
| `npm.cmd run lint` | `passed` — error 0, 기존 `user-avatar.tsx` warning 1 |
| `npx.cmd tsc --noEmit` | `passed` |
| `npm.cmd run build` | `passed` |

Release gate는 다음 이유로 차단되어 있다.

1. A/C/F용 fresh fixture, 외부 write 승인, 배포/Inngest identity, Google AI binding 확인이 없다.
2. production T0가 확정되지 않아 168시간 관찰 기간과 Pinecone/Inngest retirement eligibility가 시작되지 않았다.
3. 공개 lifecycle 문서상 현재 generation/verification model의 예정 종료일은 `2026-10-16`이다. 예상 `T0 + 168시간`보다 먼저 종료될 수 있으므로 model migration 제안과 전체 A/C/F 재검증 없이는 release할 수 없다.

## 품질 metric

| variant | caseCount | actionablePrecision | knownDefectRecall | suggestionOpportunityYield | unsupportedClaims | staleClaims | crossFileMisses | status |
|---|---:|---|---|---|---|---|---|---|
| A | 12 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `blocked-not-run` |
| C | 12 | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `unknown` | `blocked-not-run` |
| F | required completion fixtures | `not-applicable` | `not-applicable` | `not-applicable` | `unknown` | `unknown` | `unknown` | `blocked-not-run` |

## deployment provenance

| field | value |
|---|---|
| variant | `A/C/F: unknown` |
| sourceCommitSha | `unknown` |
| lockfileSha256 | `unknown` |
| deploymentTarget | `unknown` |
| deploymentId | `unknown` |
| deploymentCommitSha | `unknown` |
| deploymentUrlOrAlias | `redacted-or-unknown` |
| deterministicContextEnabled | `unknown` |
| inngestEnvironment | `unknown` |
| inngestAppId | `unknown` |
| inngestSyncId | `unknown` |
| inngestSyncEndpoint | `redacted-or-unknown` |
| syncedAtUtc | `unknown` |
| verifiedAtUtc | `unknown` |
| verifiedBy | `unknown` |
| identityMatch | `unknown` |

## A/C/F per-run evidence

| field | value |
|---|---|
| variant | `A/C/F: unknown` |
| caseId | `unknown` |
| runId | `unknown` |
| terminalStatus | `blocked-not-run` |
| terminalAtUtc | `unknown` |
| headSha | `unknown` |
| inputSha256 | `unknown` |
| scoringNormalizationVersion | `unknown` |
| scoringArtifactSha256 | `unknown` |
| repeatDecorationsExcluded | `unknown` |
| ragContextCount | `unknown` |
| ragContextSha256 | `unknown` |
| expectedManifestIdentitySha256 | `unknown` |
| observedManifestIdentitySha256 | `unknown` |
| manifestIdentityMatch | `unknown` |
| contextCharacters | `unknown` |
| contextFileCount | `unknown` |
| contextSourceCounts | `unknown` |
| treeStatus | `unknown` |
| failedFileCount | `unknown` |
| combinedStepDurationMs | `unknown` |
| functionInvocationTimeout | `unknown` |

## A RAG baseline

| field | value |
|---|---|
| evaluationScope | `unknown` |
| externalWriteApprovedBy | `unknown` |
| externalWriteApprovedAtUtc | `unknown` |
| artifactCleanupPolicy | `unknown` |
| fixtureRepositoryId | `redacted-or-unknown` |
| fixtureCreatedAtUtc | `unknown` |
| freshCoordinateVerified | `unknown` |
| defaultBranchShaBefore | `unknown` |
| defaultBranchShaAfter | `unknown` |
| pineconeProjectId | `redacted-or-unknown` |
| indexName | `unknown` |
| indexDimension | `unknown` |
| indexMetric | `unknown` |
| indexReady | `unknown` |
| credentialFingerprintSha256 | `unknown` |
| indexRunId | `unknown` |
| fetchedFileCount | `unknown` |
| expectedVectorIdCount | `unknown` |
| visibleVectorIdCount | `unknown` |
| expectedVectorIdSetSha256 | `unknown` |
| vectorIdCollisionFree | `unknown` |
| indexLogComplete | `unknown` |
| perFileEmbeddingErrorCount | `unknown` |
| freshnessMethod | `unknown` |
| freshnessAttemptCount | `unknown` |
| queryProbeMatched | `unknown` |
| writeLsn | `unknown` |
| queryLsn | `unknown` |
| freshnessVerifiedAtUtc | `unknown` |
| indexCompletedAtUtc | `unknown` |
| reindexedDuringEvaluation | `unknown` |
| embeddingModelId | `gemini-embedding-001` |
| embeddingDimensions | `768` |
| twelveRunsComparable | `unknown` |

## repeat fixture seed

| field | value |
|---|---|
| scope | `unknown` |
| seedVersion | `unknown` |
| candidateSetSha256 | `unknown` |
| candidateCount | `unknown` |
| embeddingModelId | `gemini-embedding-001` |
| embeddingDimensions | `768` |
| category | `unknown` |
| candidateCreatedAtUtc | `unknown` |
| candidatePrIdentity | `redacted-or-unknown` |
| seededAtUtc | `unknown` |
| seededBy | `unknown` |
| testRunId | `unknown` |
| resultEmbeddingLength | `unknown` |
| repeatMatched | `unknown` |
| repeatSimilarity | `unknown` |
| cleanupApprovedBy | `unknown` |
| cleanupCompletedAtUtc | `unknown` |

## model lifecycle

| scope | modelRole | modelId | lifecycleState | scheduledShutdownAtUtc | providerSmokePassed | checkedAtUtc | officialSourceUrl | checkedBy |
|---|---|---|---|---|---|---|---|---|
| all-source-bearing-scopes | generation | `gemini-2.5-flash` | `active` | `2026-10-16; exact UTC unknown` | `unknown` | `2026-08-03T15:26:12.563Z` | `https://ai.google.dev/gemini-api/docs/deprecations` | `Codex-public-doc-read` |
| all-source-bearing-scopes | verification | `gemini-2.5-pro` | `active` | `2026-10-16; exact UTC unknown` | `unknown` | `2026-08-03T15:26:12.563Z` | `https://ai.google.dev/gemini-api/docs/deprecations` | `Codex-public-doc-read` |
| all-source-bearing-scopes | repeat-embedding | `gemini-embedding-001` | `active` | `2028-05-14; exact UTC unknown` | `unknown` | `2026-08-03T15:26:12.563Z` | `https://ai.google.dev/gemini-api/docs/deprecations` | `Codex-public-doc-read` |

`providerSmokePassed`와 실제 scope binding은 credential이 없어 확인하지 않았으며 blocking `unknown`이다.

## Google AI provider binding

| field | value |
|---|---|
| scope | `unknown` |
| googleCloudProjectId | `redacted-or-unknown` |
| credentialResourceId | `redacted-or-unknown` |
| keyFingerprintSha256 | `unknown` |
| apiKeyPlan | `unknown` |
| activeBillingAssociated | `unknown` |
| billingTier | `unknown` |
| billingPlan | `unknown` |
| billingReadiness | `unknown` |
| zdrRequired | `unknown` |
| zdrApprovalStatus | `unknown` |
| checkedAtUtc | `unknown` |
| checkedBy | `unknown` |

## R0 active-run contract

| field | value |
|---|---|
| runId | `unknown` |
| completedFetchPresent | `unknown` |
| fetchContractCompatible | `unknown` |
| completedAiPresent | `unknown` |
| aiResultShape | `not-completed` |
| aiContractCompatible | `unknown` |
| currentStepFinishedAfterPause | `unknown` |
| checkedAtUtc | `unknown` |
| checkedBy | `unknown` |

## skipped-event replay

| field | value |
|---|---|
| originalEventId | `unknown` |
| receivedAtUtc | `unknown` |
| replayOperationId | `unknown` |
| replayRunId | `unknown` |
| terminalStatus | `blocked-not-run` |
| terminalSuccess | `unknown` |
| terminalAtUtc | `unknown` |
| runCountForOriginalEvent | `unknown` |

## cutover clock

| field | value |
|---|---|
| P0 | `unknown` |
| R0 | `unknown` |
| resumeUtc | `unknown` |
| cutoverActivatedAtUtc | `unknown` |
| T0 | `unknown` |
| t0Status | `not-established` |
| L0 | `unknown` |
| actualEventLookback | `unknown` |
| pauseWindowSeconds | `unknown` |
| observationWindowEndsAtUtc | `unknown` |

## Inngest capability inventory

| field | value |
|---|---|
| inngestEnvironment | `unknown` |
| inngestAppId | `unknown` |
| plan | `unknown` |
| runTraceStateRetention | `unknown` |
| eventHistoryRetention | `unknown` |
| actualEventLookback | `unknown` |
| targetedPurgeSupported | `unknown` |
| targetedPurgeAuthority | `unknown` |
| replaySupported | `unknown` |
| replayAuthority | `unknown` |
| sourceOfTruth | `unknown` |
| checkedAtUtc | `unknown` |
| checkedBy | `unknown` |
| capabilityStatus | `blocked-unknown` |

## legacy Inngest state retirement

| field | value |
|---|---|
| legacyStepKind | `generate-review/generate-context/index-repository/fetch-files` |
| lastRunId | `unknown` |
| lastStepId | `unknown` |
| L0 | `unknown` |
| actualRetention | `unknown` |
| retirementEligibleAtUtc | `unknown` |
| retirementMethod | `pending` |
| purgeOperationId | `unknown` |
| providerReceiptId | `unknown` |
| absenceSource | `unknown` |
| absenceCheckedAtUtc | `unknown` |
| absenceConfirmed | `unknown` |
| terminalStatus | `pending` |
| checkedBy | `unknown` |

## Pinecone scope mapping

| field | value |
|---|---|
| deploymentScope | `unknown` |
| pineconeProjectId | `redacted-or-unknown` |
| indexName | `unknown` |
| indexDimension | `unknown` |
| indexMetric | `unknown` |
| indexCloud | `unknown` |
| indexRegion | `unknown` |
| deletionProtection | `unknown` |
| credentialResourceId | `redacted-or-unknown` |
| credentialFingerprintSha256 | `unknown` |
| credentialOwnership | `unknown` |
| consumerOwnerOrApprovalRef | `unknown` |
| uniqueIndexTargetId | `unknown` |
| uniqueCredentialTargetId | `unknown` |
| checkedAtUtc | `unknown` |
| checkedBy | `unknown` |
| identityStatus | `blocked-unknown` |

## Pinecone index retirement

| field | value |
|---|---|
| uniqueIndexTargetId | `unknown` |
| associatedScopes | `unknown` |
| pineconeProjectId | `redacted-or-unknown` |
| indexName | `unknown` |
| inventoryMatch | `unknown` |
| destructiveApprovedBy | `unknown` |
| destructiveApprovedAtUtc | `unknown` |
| T0 | `unknown` |
| t0Status | `not-established` |
| eligibleAtUtc | `unknown` |
| deletionProtectionBefore | `unknown` |
| deletionProtectionDisableStatus | `pending` |
| deleteRequestedAtUtc | `unknown` |
| deleteRequestOrOperationId | `unknown` |
| listAbsence | `unknown` |
| describeNotFound | `unknown` |
| absenceAttemptCount | `unknown` |
| absenceCheckedAtUtc | `unknown` |
| controlPlaneTerminalStatus | `pending` |
| providerDeletionPolicySource | `https://docs.pinecone.io/guides/production/data-deletion` |
| providerDeletionPolicyCheckedAtUtc | `2026-08-03T15:26:12.563Z` |
| providerMaximumRetention | `90 days as of checkedAtUtc; recheck at delete request` |
| providerPermanentDeletionEligibleAtUtc | `unknown` |
| providerDeletionClosureMethod | `pending` |
| providerPermanentDeletionEvidenceRef | `unknown` |
| providerDeletionClosedAtUtc | `unknown` |
| providerDeletionTerminalStatus | `pending` |
| failureReason | `identity, approval, T0, and eligibility are unknown` |

## Pinecone credential retirement

| field | value |
|---|---|
| uniqueCredentialTargetId | `unknown` |
| associatedScopes | `unknown` |
| pineconeProjectId | `redacted-or-unknown` |
| credentialResourceId | `redacted-or-unknown` |
| credentialFingerprintSha256 | `unknown` |
| credentialOwnership | `unknown` |
| rotationApprovalRef | `unknown` |
| consumerRotationEvidenceRef | `unknown` |
| revokeRequestedAtUtc | `unknown` |
| revokeStatus | `pending` |
| terminalStatus | `pending` |
| failureReason | `index retirement has not reached control-plane terminal success` |
| checkedBy | `unknown` |

## Pinecone binding retirement

| field | value |
|---|---|
| deploymentScope | `unknown` |
| uniqueCredentialTargetId | `unknown` |
| bindingName | `PINECONE_DB_API_KEY` |
| bindingPresentBefore | `unknown` |
| credentialRetirementTerminal | `pending` |
| removedAtUtc | `unknown` |
| bindingAbsentAfter | `unknown` |
| verifiedAtUtc | `unknown` |
| verifiedBy | `unknown` |
| terminalStatus | `pending` |
| failureReason | `credential retirement has not reached terminal success` |

## 다음 승인 지점

1. Core 변경을 commit하고 `coreSourceCommitSha`와 해당 lock digest를 고정한다.
2. generation/verification model migration을 별도 제안으로 결정하고, migration 후 전체 A/C/F corpus를 다시 수행한다.
3. 외부 write 승인 뒤 fresh fixture와 A baseline을 만들고 C/F Preview를 실행한다.
4. 배포/Inngest/Google AI provenance와 capability를 확인한 뒤에만 production cutover를 진행한다.
5. valid T0 + 168시간과 각 provider의 eligibility를 확인한 뒤 별도 승인으로 retirement를 실행한다.
