# hreviewer 기능 로드맵

> CodeRabbit, Gemini Code Assist 등 주요 AI 코드 리뷰 도구 분석을 기반으로 한 기능 로드맵
>
> **마지막 업데이트**: 2026-01-08

---

## 현재 구현된 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| GitHub OAuth | ✅ | Better-Auth 기반 인증 (`repo` scope) |
| PR 자동 리뷰 | ✅ | PR 열림/동기화 시 AI 리뷰 자동 생성 |
| RAG 코드 분석 | ✅ | Pinecone + Gemini 2.5 Flash 기반 컨텍스트 검색 |
| 리뷰 히스토리 | ✅ | 과거 리뷰 목록 조회 (최근 50개) |
| 대시보드 | ✅ | 통계 카드, GitHub 기여 그래프 |
| Repository 연결 | ✅ | GitHub 저장소 연동 + 자동 웹훅 생성 |
| PR 요약 | ✅ | `@hreviewer summary` 명령어로 요약 생성 |
| 리뷰 언어 설정 | ✅ | 한국어/영어 선택 가능 (설정에서 변경) |
| 사용자 설정 | ✅ | 프로필, 언어, 연결된 저장소 관리 |
| 테마 토글 | ✅ | 다크/라이트 모드 지원 |
| 코드베이스 인덱싱 | ✅ | 저장소 연결 시 자동 벡터 DB 저장 (Inngest) |

---

## Phase 0: 기술 부채 해결

**우선순위**: 🔴 최우선 (다른 기능 개발 전 해결 필요)

### 0.1 대시보드 통계 수정

**문제**: `totalRepos`와 `totalReviews`가 하드코딩됨

**현재 코드** (`module/dashboard/actions/get-dashboard-stats.ts:23-37`):
```typescript
// TODO: FETCH TOTAL CONNECTED REPO FROM DB
const totalRepos = 30; // 하드코딩!

// TODO: COUNT AI REVIEWS FROM DB
const totalReviews = 44; // 하드코딩!
```

**해결 방안**:
- `prisma.repository.count({ where: { userId } })`로 실제 저장소 수 조회
- `prisma.review.count({ where: { repository: { userId } } })`로 실제 리뷰 수 조회

---

### 0.2 `@hreviewer review` 명령어 핸들러

**문제**: 명령어 파싱은 되지만 실제 처리 로직 없음

**현재 상태**:
- `command-parser.ts`: `review` 타입 파싱 지원
- `webhooks/github/route.ts`: `summary`만 처리, `review`는 무시됨

**해결 방안**:
- 웹훅 핸들러에 `review` 명령어 케이스 추가
- 기존 `reviewPullRequest()` 액션 재사용

---

### 0.3 웹훅 HMAC 서명 검증

**우선순위**: 🚨 **보안 필수**

**문제**: GitHub 웹훅 서명 검증 없음 - 누구나 가짜 요청 가능

**구현 범위**:
```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// 웹훅 핸들러에서
const signature = headers.get('x-hub-signature-256');
if (!verifyWebhookSignature(body, signature, process.env.GITHUB_WEBHOOK_SECRET)) {
  return new Response('Invalid signature', { status: 401 });
}
```

**환경 변수 추가**: `GITHUB_WEBHOOK_SECRET`

---

### 0.4 월간 활동 데이터 실제화

**문제**: `get-monthly-activity.ts`에서 리뷰 데이터가 Mock 데이터

**현재 코드**:
```typescript
// 샘플 리뷰 데이터 생성 (TODO: 실제 DB 데이터 사용)
const reviews = months.map((_, i) => ({
  count: Math.floor(Math.random() * 20) + 5,
}));
```

**해결 방안**:
- Prisma로 월별 리뷰 수 집계 쿼리 작성
- `groupBy` 또는 raw SQL 사용

---

### 0.5 Rate Limiting

**문제**: 웹훅 엔드포인트에 요청 제한 없음 - DoS 공격에 취약

**구현 방안**:
- Upstash Redis + `@upstash/ratelimit` 사용
- 또는 Vercel Edge Config 기반 rate limiting

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10초에 10개 요청
});
```

---

## Phase 1: 핵심 기능 강화

### 1.1 인터랙티브 리뷰 명령어 시스템

**우선순위**: 🔴 높음
**참고**: [CodeRabbit](https://www.coderabbit.ai/), [Gemini Code Assist](https://github.com/marketplace/gemini-code-assist)

PR 코멘트에서 다양한 명령어로 AI와 상호작용:

```
@hreviewer summary      # PR 요약 생성 ✅ 구현됨
@hreviewer review       # 전체 리뷰 재생성 (Phase 0에서 구현)
@hreviewer explain      # 특정 코드 설명 요청 🆕
@hreviewer suggest      # 개선 제안 요청
@hreviewer security     # 보안 취약점 집중 분석
@hreviewer performance  # 성능 이슈 분석
```

**구현 범위**:
- `module/ai/utils/command-parser.ts` 확장
- 명령어별 프롬프트 템플릿
- `issue_comment` 웹훅 핸들러 확장

---

### 1.2 원클릭 코드 수정 제안 🆕

**우선순위**: 🔴 높음
**참고**: CodeRabbit의 "committable fixes"

AI가 제안한 수정사항을 GitHub에서 바로 커밋할 수 있는 형태로 제공:

```markdown
## 수정 제안

\`\`\`suggestion
- const data = await fetch(url)
+ const data = await fetch(url, { cache: 'no-store' })
\`\`\`
```

**구현 범위**:
- GitHub suggestion 형식으로 코멘트 포맷팅
- 파일별 라인 번호 매핑 (diff 파싱 필요)
- PR Review Comments API 사용 (issue comment 대신)
- 다중 파일 수정 제안 지원

---

### 1.3 리뷰 스타일 프리셋 🆕

**우선순위**: 🟡 중간

사용자가 리뷰 스타일을 선택할 수 있는 기능:

| 프리셋 | 설명 | 용도 |
|--------|------|------|
| **Strict** | 상세하고 엄격한 리뷰, 보안 중점 | 프로덕션 코드, 시니어 개발자 |
| **Mentor** | 교육적, 친절한 설명 포함 | 주니어 개발자, 학습 목적 |
| **Quick** | 간결, 주요 이슈만 | 빠른 피드백 필요 시 |

**구현 범위**:
- Repository 모델에 `reviewStyle` 필드 추가
- 프리셋별 프롬프트 템플릿
- 설정 UI에서 선택 가능

---

### 1.4 커스텀 리뷰 스타일 가이드

**우선순위**: 🟡 중간
**참고**: Gemini Code Assist의 `.gemini/styleguide.md`

저장소별 코딩 컨벤션 및 리뷰 지침 설정:

```
.hreviewer/
├── config.yaml        # 기본 설정
├── styleguide.md      # 코딩 스타일 가이드
└── ignore.md          # 리뷰 제외 패턴
```

**config.yaml 예시**:
```yaml
review:
  language: ko          # 리뷰 언어
  style: strict         # 리뷰 스타일 프리셋
  focus:
    - security
    - performance
    - accessibility
  ignore:
    - "*.test.ts"
    - "*.spec.ts"
    - "dist/**"
    - "*.lock"
  severity:
    security: critical
    style: info
```

**구현 범위**:
- Repository 연결 시 설정 파일 파싱
- 리뷰 생성 시 컨텍스트에 스타일 가이드 주입
- 설정 UI (대시보드에서 편집)

---

### 1.5 리뷰 심각도 분류

**우선순위**: 🟡 중간

리뷰 결과를 심각도별로 분류하여 표시:

| 레벨 | 아이콘 | 설명 |
|------|--------|------|
| Critical | 🚨 | 보안 취약점, 데이터 손실 위험 |
| Warning | ⚠️ | 버그 가능성, 성능 이슈 |
| Suggestion | 💡 | 개선 제안, 베스트 프랙티스 |
| Info | ℹ️ | 참고 사항, 문서화 제안 |

**구현 범위**:
- AI 프롬프트에 심각도 분류 지침 추가
- 리뷰 결과 파싱 및 구조화 (JSON 출력)
- UI에서 심각도별 필터링

---

### 1.6 PR 파일 필터 (무시 패턴) 🆕

**우선순위**: 🟡 중간

특정 파일 패턴을 리뷰에서 제외:

**기본 제외 패턴**:
```
*.lock
*.min.js
*.min.css
dist/**
build/**
node_modules/**
*.generated.*
```

**구현 범위**:
- Repository 모델에 `ignorePatterns` 필드 추가 (JSON Array)
- 리뷰 생성 시 diff에서 매칭 파일 제외
- 설정 UI에서 패턴 편집 가능

---

## Phase 2: 정적 분석 도구 통합

### 2.1 보안 취약점 스캐닝

**우선순위**: 🔴 높음

의존성 및 코드 보안 분석:

```
스캔 영역:
├── 의존성 취약점 (npm audit, Snyk)
├── 하드코딩된 시크릿 (API 키, 비밀번호)
├── SQL 인젝션 패턴
├── XSS 취약점
└── OWASP Top 10
```

**구현 범위**:
- 보안 전용 AI 프롬프트
- `npm audit` 결과 통합
- 시크릿 탐지 정규식

---

### 2.2 린터/포맷터 통합

**우선순위**: 🟡 중간
**참고**: CodeRabbit의 40+ 산업 표준 도구 통합

AI 리뷰와 함께 정적 분석 결과 제공:

```
지원 도구:
├── ESLint (JavaScript/TypeScript)
├── Prettier (코드 포맷팅)
├── TypeScript Compiler (타입 체크)
├── Biome (Rust 기반 린터)
└── Custom rules (저장소별)
```

**구현 범위**:
- Inngest 함수에서 린터 실행
- 결과를 AI 리뷰와 병합
- 도구별 설정 지원

---

### 2.3 테스트 커버리지 분석

**우선순위**: 🟢 낮음

변경된 코드의 테스트 커버리지 확인:

```
📊 테스트 커버리지 분석

변경된 파일:
├── src/utils/auth.ts - 커버리지: 45% ⚠️
├── src/api/users.ts - 커버리지: 82% ✅
└── src/hooks/useAuth.ts - 테스트 없음 ❌

💡 제안: useAuth.ts에 대한 테스트 추가 권장
```

**구현 범위**:
- Jest/Vitest 커버리지 리포트 파싱
- 변경 파일과 커버리지 매핑
- 테스트 생성 제안

---

## Phase 3: 에이전트 기능

### 3.1 자동 테스트 생성

**우선순위**: 🟡 중간
**참고**: CodeRabbit의 에이전트 워크플로우

PR 코멘트로 테스트 자동 생성 요청:

```
@hreviewer generate-tests src/utils/auth.ts
```

**출력 예시**:
```typescript
// 생성된 테스트
describe('validateToken', () => {
  it('should return true for valid token', () => {
    expect(validateToken('valid-token')).toBe(true);
  });

  it('should return false for expired token', () => {
    expect(validateToken('expired-token')).toBe(false);
  });
});
```

**구현 범위**:
- 테스트 프레임워크 감지 (Jest, Vitest, Mocha)
- 함수 시그니처 분석
- 테스트 파일 생성 및 PR 커밋

---

### 3.2 자동 문서 생성

**우선순위**: 🟢 낮음

코드 변경에 따른 문서 자동 업데이트:

```
@hreviewer docs          # 전체 문서 생성
@hreviewer docs api      # API 문서만 생성
@hreviewer docs readme   # README 업데이트
```

**구현 범위**:
- JSDoc/TSDoc 생성
- README.md 업데이트 제안
- API 문서 자동화

---

### 3.3 이슈 자동 생성

**우선순위**: 🟢 낮음
**참고**: CodeRabbit의 Jira/Linear/GitHub 이슈 생성

리뷰에서 발견된 문제를 이슈로 자동 생성:

```
@hreviewer create-issue "성능 최적화 필요"
```

**구현 범위**:
- GitHub Issues API 연동
- 이슈 템플릿 지원
- 라벨 자동 지정

---

## Phase 4: 사용자 경험 개선

### 4.1 리뷰 대기열 대시보드 🆕

**우선순위**: 🔴 높음

리뷰 처리 상태를 실시간으로 확인:

```
📋 리뷰 대기열

| PR | 상태 | 시작 시간 | 소요 시간 |
|----|------|----------|----------|
| #123 | 🔄 처리 중 | 2분 전 | - |
| #122 | ✅ 완료 | 10분 전 | 45초 |
| #121 | ❌ 실패 | 15분 전 | - | [재시도]
```

**구현 범위**:
- Review 모델에 `startedAt`, `completedAt` 필드 추가
- 대시보드에 실시간 상태 표시 (polling 또는 SSE)
- 실패한 리뷰 재시도 기능

---

### 4.2 에러 알림 시스템 🆕

**우선순위**: 🟡 중간

리뷰 실패 시 사용자에게 알림:

```
알림 채널:
├── 인앱 알림 (대시보드)
├── 이메일 (SendGrid/Resend)
└── GitHub PR 코멘트
```

**구현 범위**:
- Notification 모델 추가
- 인앱 알림 UI (헤더에 벨 아이콘)
- 이메일 발송 (선택적)

---

### 4.3 리뷰 히스토리 검색 및 필터링

**우선순위**: 🟡 중간

리뷰 목록에서 고급 검색 기능:

```
필터 옵션:
├── 상태 (Completed, Failed, Pending)
├── 저장소
├── 날짜 범위
├── 심각도 (Critical, Warning, Info)
├── 리뷰 타입 (Full Review, Summary)
└── 키워드 검색
```

**구현 범위**:
- 검색 API 엔드포인트
- 필터 UI 컴포넌트
- Prisma 쿼리 최적화

---

### 4.4 리뷰 피드백 (👍/👎) 🆕

**우선순위**: 🟡 중간

리뷰 품질 피드백 수집:

**구현 범위**:
- Review 모델에 `feedback` 필드 추가 (POSITIVE, NEGATIVE, null)
- GitHub PR 코멘트에 피드백 버튼 추가 (reaction 기반)
- 대시보드에서 피드백 통계 표시
- 향후 모델 개선에 활용

---

### 4.5 실시간 알림

**우선순위**: 🟢 낮음

리뷰 완료 시 알림 발송:

```
알림 채널:
├── 이메일 (SendGrid/Resend)
├── Slack 웹훅
├── Discord 웹훅
└── 브라우저 푸시 알림
```

**구현 범위**:
- 알림 설정 UI
- 웹훅 발송 로직
- 알림 히스토리

---

### 4.6 히스토리컬 컨텍스트 🆕

**우선순위**: 🟢 낮음

이전 리뷰를 참조하여 연속성 있는 피드백 제공:

```markdown
## 이전 리뷰 참고

이 파일은 3일 전 리뷰에서 다음 이슈가 발견되었습니다:
- 🔴 SQL 인젝션 취약점 (수정됨 ✅)
- ⚠️ 불필요한 의존성 (미해결)

[이전 리뷰 보기](#)
```

**구현 범위**:
- 동일 파일의 이전 리뷰 조회
- AI 프롬프트에 이전 이슈 컨텍스트 추가
- 이슈 해결 여부 추적

---

### 4.7 팀 대시보드

**우선순위**: 🟢 낮음

팀 단위 리뷰 현황 조회:

```
팀 통계:
├── 팀원별 리뷰 수
├── 저장소별 이슈 트렌드
├── 주간/월간 리포트
└── 코드 품질 점수 추이
```

**구현 범위**:
- 팀/조직 모델 추가
- 팀 초대 시스템
- 집계 대시보드

---

## Phase 5: 엔터프라이즈 기능

### 5.1 구독 티어 적용

**우선순위**: 🔴 높음

현재 DB에 있는 구독 필드 활성화:

| 티어 | 가격 | 리뷰/월 | 저장소 | 기능 |
|------|------|---------|--------|------|
| Free | $0 | 50 | 3 | 기본 리뷰 |
| Pro | $19 | 500 | 무제한 | + 보안 스캔, 커스텀 가이드 |
| Enterprise | 문의 | 무제한 | 무제한 | + SSO, 감사 로그, SLA |

**구현 범위**:
- Stripe 결제 연동
- 사용량 추적 강화
- 티어별 기능 게이팅

---

### 5.2 SSO 인증

**우선순위**: ⏸️ 보류 (Enterprise 고객 확보 후)

기업 고객을 위한 SSO 지원:

```
지원 프로토콜:
├── SAML 2.0
├── OIDC
└── Google Workspace
```

---

### 5.3 감사 로그

**우선순위**: ⏸️ 보류 (Enterprise 고객 확보 후)

모든 활동에 대한 감사 추적:

```
로그 항목:
├── 사용자 로그인/로그아웃
├── 저장소 연결/해제
├── 리뷰 요청/완료
├── 설정 변경
└── API 호출
```

---

### 5.4 웹훅 보안 강화

**우선순위**: 🚨 **CRITICAL** (Phase 0으로 이동)

→ Phase 0.3 참조

---

## Phase 6: CLI 및 IDE 통합

### 6.1 CLI 도구

**우선순위**: 🟢 낮음 (웹 경험 우선)
**참고**: CodeRabbit CLI, Gemini CLI Extension

로컬에서 코드 리뷰 실행:

```bash
# 설치
npm install -g @hreviewer/cli

# 사용
hreviewer review ./src          # 디렉토리 리뷰
hreviewer review --staged       # 스테이징된 변경 리뷰
hreviewer review --diff HEAD~1  # 최근 커밋 리뷰
```

**구현 범위**:
- npm 패키지 생성
- API 연동
- 터미널 UI (chalk, ora)

---

### 6.2 VS Code 확장

**우선순위**: ⏸️ 보류 (사용자 기반 확보 후)
**참고**: CodeRabbit VS Code Extension

에디터에서 실시간 코드 리뷰:

```
기능:
├── 저장 시 자동 리뷰
├── 인라인 피드백 표시
├── Quick Fix 제안
└── 설정 동기화
```

---

## Phase 7: AI 고도화

### 7.1 컨텍스트 메모리

**우선순위**: 🟡 중간
**참고**: Gemini Code Assist의 Persistent Memory

이전 리뷰 히스토리를 기반으로 맥락 유지:

```
학습 항목:
├── 자주 발생하는 이슈 패턴
├── 사용자/팀의 코딩 스타일
├── 이전 리뷰 피드백
└── 수정 이력
```

**구현 범위**:
- 리뷰 임베딩 저장 확장
- 사용자별 컨텍스트 벡터
- 리뷰 생성 시 히스토리 조회

---

### 7.2 멀티 모델 지원

**우선순위**: 🟡 중간

다양한 AI 모델 선택:

```
지원 모델:
├── Google Gemini (현재)
├── OpenAI GPT-4o
├── Anthropic Claude
├── DeepSeek
└── 로컬 모델 (Ollama)
```

**구현 범위**:
- AI SDK 추상화 레이어
- 모델별 프롬프트 최적화
- 폴백 메커니즘

---

### 7.3 코드베이스 건강 리포트

**우선순위**: 🟢 낮음

저장소 전체에 대한 종합 분석:

```
📊 코드베이스 건강 리포트

전체 점수: 78/100

영역별 점수:
├── 보안: 85/100 ✅
├── 성능: 72/100 ⚠️
├── 유지보수성: 68/100 ⚠️
├── 테스트 커버리지: 45/100 ❌
└── 문서화: 90/100 ✅

주요 개선 항목:
1. 테스트 커버리지 확대 필요
2. 복잡도 높은 함수 리팩토링 권장
3. 사용하지 않는 의존성 제거
```

---

## 구현 우선순위 요약

### 🚨 Phase 0: 기술 부채 (즉시)

1. **웹훅 HMAC 서명 검증** - 보안 필수
2. **대시보드 통계 수정** - 하드코딩 제거
3. **`@hreviewer review` 핸들러** - 기능 완성
4. **Rate Limiting** - DoS 방지
5. **월간 활동 실제 데이터** - Mock 제거

### 🔴 Phase 1: 핵심 기능 (1-2개월)

6. **원클릭 코드 수정 제안** - 경쟁 핵심
7. **리뷰 대기열 대시보드** - 사용자 경험
8. **보안 취약점 스캐닝** - 가치 제공
9. **구독 티어 적용** - 수익화

### 🟡 Phase 2: 기능 확장 (2-3개월)

10. 커스텀 리뷰 스타일 가이드
11. 리뷰 심각도 분류
12. PR 파일 필터 (무시 패턴)
13. 리뷰 피드백 (👍/👎)
14. 에러 알림 시스템
15. 리뷰 히스토리 검색

### 🟢 Phase 3: 고급 기능 (3-6개월)

16. 자동 테스트 생성
17. 자동 문서 생성
18. 컨텍스트 메모리
19. 멀티 모델 지원
20. 팀 대시보드

### ⏸️ 보류 (조건 충족 후)

- VS Code 확장 - 사용자 기반 확보 후
- SSO - Enterprise 고객 확보 후
- 감사 로그 - Enterprise 고객 확보 후
- CLI 도구 - 웹 경험 완성 후

---

## 참고 자료

- [CodeRabbit - AI Code Reviews](https://www.coderabbit.ai/)
- [CodeRabbit Documentation](https://docs.coderabbit.ai/)
- [Gemini Code Assist - GitHub Marketplace](https://github.com/marketplace/gemini-code-assist)
- [Gemini Code Assist Documentation](https://developers.google.com/gemini-code-assist/docs/review-github-code)
- [State of AI Code Review Tools in 2025](https://www.devtoolsacademy.com/blog/state-of-ai-code-review-tools-2025/)
- [CodeRabbit $60M Series B](https://siliconangle.com/2025/09/16/coderabbit-gets-60m-fix-ai-generated-code-quality/)
- [Gemini Code Assist Updates - Google I/O 2025](https://blog.google/technology/developers/gemini-code-assist-updates-google-io-2025/)
