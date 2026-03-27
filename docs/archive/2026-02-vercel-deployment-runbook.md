# HReviewer Vercel 배포 실행 Runbook (2026-02)

> 작성일: 2026-02-16  
> 대상 프로젝트: `C:\Users\hamso\OneDrive\Desktop\git\hreviewer`  
> 목적: 현재 코드 기준으로 Vercel에 안전하게 배포하고, 인증/웹훅/Inngest/DB까지 운영 가능한 상태로 만들기

---

## 0. 진행 현황 (2026-02-16 업데이트)

### 0.1 완료

- [x] 3.1 GitHub webhook 시그니처 검증 추가
  - `app/api/webhooks/github/route.ts`에 `request.text()` 기반 raw body 처리, `x-hub-signature-256` 검증, `crypto.timingSafeEqual` 비교, 검증 실패 시 `401` 반환 반영
- [x] 3.2 webhook 생성 시 `config.secret` 설정 추가
  - `module/github/lib/github.ts`의 `octokit.rest.repos.createWebhook()`에 `secret: process.env.GITHUB_WEBHOOK_SECRET` 반영
- [x] 3.3 webhook route 비동기 실행 `await` 처리
  - `app/api/webhooks/github/route.ts`에서 fire-and-forget(`.then/.catch`) 호출을 제거하고 `await`로 큐잉 완료까지 대기하도록 반영
- [x] 3.4 Better Auth trusted origins 동적화
  - `lib/auth.ts`에서 하드코딩된 ngrok origin을 제거하고 `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_BASE_URL`, `http://localhost:3000` 기반 동적 구성으로 반영
- [x] 3.5 Prisma `postinstall`/`next-build` 반영
  - `package.json`에 `postinstall: prisma generate`, `next-build: prisma generate && prisma migrate deploy && next build` 추가 반영
- [x] 배포 빌드 스크립트 `next-build` 추가 (Vercel Build Command용)
  - `package.json`에 `next-build: prisma generate && prisma migrate deploy && next build` 추가 반영
- [x] `GITHUB_WEBHOOK_SECRET` 환경변수 추가
  - Vercel 환경변수 추가 완료(사용자 수행)

### 0.2 미완료

- [ ] 배포 후 Smoke test(7장) 수행

### 0.3 메모

- 기존에 이미 생성된 GitHub webhook이 있으면 secret이 비어 있을 수 있음
- 현재 `createWebhook`은 기존 hook URL이 있으면 재사용하므로, secret 반영이 필요하면 기존 hook 삭제 후 재생성 필요

---

## 1. 현재 상태 진단 (코드 기준)

### 1.1 프레임워크/런타임

- Next.js App Router 프로젝트
  - `app/`, `app/api/*`
  - `next.config.ts`
- Inngest serve endpoint 존재
  - `app/api/inngest/route.ts`
- Prisma + Postgres 어댑터 사용
  - `lib/db.ts`
  - `prisma/schema.prisma`

### 1.2 배포 전 바로 보이는 리스크

- [완료] GitHub webhook 서명 검증 없음 이슈 해소 (2026-02-16)
  - `app/api/webhooks/github/route.ts`
- [완료] GitHub webhook 생성 시 `secret` 미설정 이슈 해소 (2026-02-16)
  - `module/github/lib/github.ts`
- [완료] webhook route에서 비동기 작업을 `await` 없이 실행 이슈 해소 (2026-02-16)
  - `app/api/webhooks/github/route.ts`
- [완료] Better Auth trusted origins가 로컬/ngrok 하드코딩 이슈 해소 (2026-02-16)
  - `lib/auth.ts`
- [완료] Prisma 클라이언트 생성 자동화(`postinstall`) 없음 이슈 해소 (2026-02-16)
  - `package.json`
  - `/lib/generated/prisma`는 `.gitignore` 대상

---

## 2. 필수 작업 요약 (먼저 이것부터)

1. webhook 보안 강화
2. webhook 핸들러 안정화 (`await`/응답 흐름)
3. auth 도메인/origin 설정 개선
4. Prisma generate + migrate deploy를 CI 빌드에 반영
5. Vercel env(Production/Preview) 분리 설정
6. Inngest 키/동기화 설정 (Integration 또는 수동)
7. GitHub OAuth, callback URL를 프로덕션 도메인 기준으로 재설정
8. Smoke test로 end-to-end 검증

---

## 3. 코드 수정 상세 (복붙 가능 수준)

## 3.1 GitHub webhook 시그니처 검증 추가 (필수)

### 대상 파일

- `app/api/webhooks/github/route.ts`

### 해야 하는 일

- `request.json()` 대신 `request.text()`로 raw body를 먼저 읽기
- `x-hub-signature-256` 헤더 검증
- `crypto.timingSafeEqual` 사용
- 검증 실패 시 `401` 반환

### 예시 코드

```ts
import crypto from "node:crypto";

function verifyGithubSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

```ts
const rawBody = await request.text();
const signature = request.headers.get("x-hub-signature-256");
const secret = process.env.GITHUB_WEBHOOK_SECRET;

if (!secret || !verifyGithubSignature(rawBody, signature, secret)) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}

const body: unknown = JSON.parse(rawBody);
```

### 필요한 env 추가

- `GITHUB_WEBHOOK_SECRET`

### 참고 링크

- https://docs.github.com/enterprise-cloud@latest/webhooks/using-webhooks/validating-webhook-deliveries
- https://docs.github.com/webhooks/using-webhooks/best-practices-for-using-webhooks

---

## 3.2 webhook 생성 시 secret 설정 (필수)

### 대상 파일

- `module/github/lib/github.ts`

### 해야 하는 일

- `octokit.rest.repos.createWebhook()`의 `config.secret`에 `process.env.GITHUB_WEBHOOK_SECRET` 추가

### 예시

```ts
const { data } = await octokit.rest.repos.createWebhook({
  owner,
  repo,
  config: {
    url: webhookUrl,
    content_type: "json",
    secret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  events: ["pull_request", "issue_comment"],
});
```

### 참고 링크

- https://docs.github.com/en/rest/webhooks/repo-config

---

## 3.3 webhook route의 비동기 실행 방식 수정 (필수)

### 대상 파일

- `app/api/webhooks/github/route.ts`

### 현재 문제

- `reviewPullRequest(...)`와 `generatePRSummary(...)`를 `await` 없이 fire-and-forget으로 호출
- Serverless 환경에서 응답 후 실행이 중단될 수 있음

### 수정 방향

- webhook route에서는 큐잉 함수 완료까지 `await`
- 실제 무거운 AI 작업은 이미 Inngest 함수에서 처리되므로, 큐잉 단계만 보장하면 됨

### 참고 링크

- https://docs.github.com/webhooks/using-webhooks/best-practices-for-using-webhooks
- https://www.inngest.com/docs/deploy/vercel

---

## 3.4 Better Auth origin 설정 하드코딩 제거 (필수)

### 대상 파일

- `lib/auth.ts`

### 현재 문제

- `trustedOrigins`에 `localhost`와 특정 `ngrok`이 하드코딩됨

### 수정 방향

- `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_BASE_URL` 기반으로 동적 구성
- 로컬 개발용 `http://localhost:3000`은 유지 가능

### 예시

```ts
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_BASE_URL,
  "http://localhost:3000",
].filter((v): v is string => Boolean(v));
```

### 참고 링크

- https://www.better-auth.com/docs/reference/options
- https://www.better-auth.com/docs/installation

---

## 3.5 Prisma 생성/마이그레이션 빌드 반영 (필수)

### 대상 파일

- `package.json`

### 권장 스크립트

```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "next-build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

### 이유

- 현재 Prisma 클라이언트 경로가 커스텀(`lib/generated/prisma`)이고 gitignore 대상이라, 배포 빌드 중 생성 보장이 필요함
- 운영 DB 스키마는 `migrate deploy`로 적용해야 함

### 참고 링크

- https://www.prisma.io/docs/guides/deployment/deploying-to-vercel
- https://www.prisma.io/docs/concepts/components/prisma-migrate/migrate-development-production

---

## 3.6 (선택) Next Turbopack root 경고 정리

로컬에서 상위 디렉터리 lockfile 감지 경고가 보이면 `turbopack.root` 지정 검토.

### 참고 링크

- https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack

---

## 4. 환경변수 매트릭스 (Production/Preview/Development)

## 4.1 코드 기준 키 목록

코드에서 직접 확인되는 env:

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_BASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `PINECONE_DB_API_KEY`
- `POLAR_ACCESS_TOKEN`
- `POLAR_SUCCESS_URL`
- `POLAR_WEBHOOK_SECRET`

추가로 라이브러리/동작상 필요한 env:

- `BETTER_AUTH_SECRET` (O)
- `GOOGLE_GENERATIVE_AI_API_KEY` (O)
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `INNGEST_SIGNING_KEY_FALLBACK` (선택, 키 롤링)
- `GITHUB_WEBHOOK_SECRET` (이번 수정으로 추가)

## 4.2 권장 스코프

| Key                            | Prod | Preview         | Dev                      | 필수도      | 비고                        |
| ------------------------------ | ---- | --------------- | ------------------------ | ----------- | --------------------------- |
| `DATABASE_URL`                 | O    | O(별도 DB 권장) | O                        | 필수        | Preview와 Prod DB 분리 권장 |
| `BETTER_AUTH_SECRET`           | O    | O               | O                        | 필수        | 32자+ 고엔트로피            |
| `BETTER_AUTH_URL`              | O    | O               | O                        | 필수        | 환경별 base URL             |
| `GITHUB_CLIENT_ID`             | O    | O               | O                        | 필수        | OAuth app 연동              |
| `GITHUB_CLIENT_SECRET`         | O    | O               | O                        | 필수        | OAuth app 연동              |
| `GITHUB_WEBHOOK_SECRET`        | O    | O               | O                        | 필수        | webhook 서명 검증           |
| `NEXT_PUBLIC_APP_BASE_URL`     | O    | O               | O                        | 필수        | webhook URL 구성에 사용     |
| `NEXT_PUBLIC_APP_URL`          | O    | O               | O                        | 필수        | portal return URL에 사용    |
| `GOOGLE_GENERATIVE_AI_API_KEY` | O    | O               | O                        | 필수        | AI 리뷰/요약                |
| `PINECONE_DB_API_KEY`          | O    | O               | O                        | 필수        | RAG 검색                    |
| `POLAR_ACCESS_TOKEN`           | O    | O(선택)         | O(선택)                  | 선택~필수   | 결제 기능 사용 시           |
| `POLAR_WEBHOOK_SECRET`         | O    | O(선택)         | O(선택)                  | 선택~필수   | 결제 웹훅                   |
| `POLAR_SUCCESS_URL`            | O    | O               | O                        | 선택        | 없으면 코드 fallback 사용   |
| `INNGEST_EVENT_KEY`            | O    | O               | 로컬 Dev Server면 불필요 | 필수(Cloud) | 이벤트 발행                 |
| `INNGEST_SIGNING_KEY`          | O    | O               | 로컬 Dev Server면 불필요 | 필수(Cloud) | serve 인증                  |
| `INNGEST_SIGNING_KEY_FALLBACK` | 선택 | 선택            | 선택                     | 선택        | 키 회전 무중단              |

---

## 5. Vercel 배포 절차 (실행 순서)

## 5.1 1회성 준비

```powershell
npm i -g vercel
vercel login
```

```powershell
cd C:\Users\hamso\OneDrive\Desktop\git\hreviewer
vercel link
```

참고:

- https://vercel.com/docs/deployments
- https://vercel.com/docs/cli/deploying-from-cli

## 5.2 환경변수 등록

### Dashboard 방식 (권장)

- Vercel Project > Settings > Environment Variables
- Production / Preview / Development 각각 필요한 값 입력

### CLI 방식

```powershell
vercel env add DATABASE_URL production
vercel env add DATABASE_URL preview
vercel env add BETTER_AUTH_SECRET production
vercel env add BETTER_AUTH_SECRET preview
vercel env add GITHUB_CLIENT_ID production
vercel env add GITHUB_CLIENT_SECRET production
vercel env add GITHUB_WEBHOOK_SECRET production
```

참고:

- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/cli/env

## 5.3 Build 설정

- Build Command를 `npm run next-build`로 지정 (권장)
- Node.js 버전은 팀 표준에 맞춰 고정 권장 (예: 20.x)

참고:

- https://vercel.com/docs/project-configuration/project-settings
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

## 5.4 배포 실행

```powershell
vercel
vercel --prod
```

---

## 6. 외부 서비스 연동 절차

## 6.1 GitHub OAuth 앱

### 설정 값

- Homepage URL: `https://<your-production-domain>`
- Authorization callback URL: `https://<your-production-domain>/api/auth/callback/github`

### 주의

- OAuth App은 callback URL 다중 관리가 제한적이라 Preview 인증 전략을 별도 설계해야 함

참고:

- https://docs.github.com/en/developers/apps/creating-an-oauth-app
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

## 6.2 GitHub Webhook

### 이벤트

- `pull_request`
- `issue_comment`

### 보안

- webhook 생성 시 secret 설정
- 서버에서 `x-hub-signature-256` 검증

참고:

- https://docs.github.com/webhooks/using-webhooks/best-practices-for-using-webhooks
- https://docs.github.com/enterprise-cloud@latest/webhooks/using-webhooks/validating-webhook-deliveries
- https://docs.github.com/en/rest/webhooks/repo-config

## 6.3 Inngest

### 이미 코드상 준비된 것

- serve endpoint: `app/api/inngest/route.ts`

### 해야 하는 것

- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` 세팅
- Vercel Integration 사용 시 자동 세팅/자동 sync 가능

### Deployment Protection 사용 중이면

- Inngest에서 endpoint 접근 가능하도록 Protection Bypass 설정

참고:

- https://www.inngest.com/docs/deploy/vercel
- https://www.inngest.com/docs/reference/serve
- https://www.inngest.com/docs/events/creating-an-event-key
- https://www.inngest.com/docs/platform/signing-keys
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation

## 6.4 Prisma / DB

### 운영 환경

- `prisma migrate deploy`를 배포 파이프라인에 포함

### Preview 환경

- Preview DB 분리 권장 (Prod DB 공유 금지)

참고:

- https://www.prisma.io/docs/guides/deployment/deploying-to-vercel
- https://www.prisma.io/docs/concepts/components/prisma-migrate/migrate-development-production

---

## 7. 배포 후 검증 체크리스트 (Smoke Test)

## 7.1 기본

- [ ] `/` 접속 성공
- [ ] `/api/auth/*` 동작 확인
- [ ] GitHub 로그인 성공

## 7.2 저장소 연결/웹훅

- [ ] 대시보드에서 리포 연결 성공
- [ ] GitHub 저장소 Webhook에 production URL 등록 확인
- [ ] Webhook secret 설정 확인

## 7.3 Inngest

- [ ] `/api/inngest` 호출 가능
- [ ] Inngest 대시보드에서 함수 sync 확인
- [ ] `repository.connected` 이벤트 처리 확인

## 7.4 리뷰 플로우

- [ ] PR open/synchronize 시 리뷰 큐잉
- [ ] `issue_comment` summary 명령 시 요약 큐잉
- [ ] GitHub 코멘트 생성 확인
- [ ] DB `review` 레코드 저장 확인

---

## 8. 트러블슈팅 빠른 매핑

| 증상                    | 점검 포인트                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| GitHub 로그인 실패      | OAuth callback URL, `GITHUB_CLIENT_ID/SECRET`, `BETTER_AUTH_URL`       |
| Webhook 401/무반응      | `GITHUB_WEBHOOK_SECRET`, signature 검증 로직, GitHub webhook 설정      |
| Inngest 함수 미실행     | `/api/inngest` 공개 여부, `INNGEST_SIGNING_KEY`, Integration sync 상태 |
| 리뷰가 중간에 끊김      | webhook route의 `await` 처리 여부, 함수 timeout/로그                   |
| Prisma 관련 런타임 에러 | `postinstall`/`prisma generate`, build command, `DATABASE_URL`         |
| Preview에서 DB 꼬임     | Preview용 `DATABASE_URL` 분리 여부                                     |

---

## 9. 비용 체크 (2026-02-16 기준)

- Inngest: Hobby 무료 플랜 존재, 월 실행량 포함
- Vercel: Hobby 무료 플랜 존재, Functions 사용량/호출량 한도 존재
- 실제 과금은 트래픽, 함수 실행시간, 메모리, 호출량에 따라 증가

참고:

- https://www.inngest.com/pricing
- https://vercel.com/pricing
- https://vercel.com/docs/functions/usage-and-pricing
- https://vercel.com/docs/limits

---

## 10. 권장 작업 순서 (실전용)

1. 코드 수정
   - webhook signature 검증
   - webhook secret 설정
   - webhook `await` 처리
   - trusted origins 동적화
   - `postinstall`/`next-build` 추가
2. 로컬 검증
   - `npm.cmd run build`
   - 주요 API route 기본 동작 확인
3. Vercel 환경변수 입력
4. Preview 배포 검증
5. Production 배포
6. GitHub OAuth/Webhook + Inngest 최종 점검
7. Smoke test 완료 후 운영 전환

---

## 11. 링크 모음 (공식 문서)

### Vercel

- https://vercel.com/docs/frameworks/full-stack/nextjs
- https://vercel.com/docs/deployments
- https://vercel.com/docs/cli/deploying-from-cli
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/cli/env
- https://vercel.com/docs/project-configuration/project-settings
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation

### Next.js

- https://nextjs.org/docs/pages/guides/environment-variables
- https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack

### Inngest

- https://www.inngest.com/docs/deploy/vercel
- https://www.inngest.com/docs/reference/serve
- https://www.inngest.com/docs/events/creating-an-event-key
- https://www.inngest.com/docs/platform/signing-keys
- https://www.inngest.com/docs/sdk/environment-variables
- https://www.inngest.com/pricing

### Prisma

- https://www.prisma.io/docs/guides/deployment/deploying-to-vercel
- https://www.prisma.io/docs/concepts/components/prisma-migrate/migrate-development-production

### GitHub

- https://docs.github.com/en/developers/apps/creating-an-oauth-app
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://docs.github.com/enterprise-cloud@latest/webhooks/using-webhooks/validating-webhook-deliveries
- https://docs.github.com/webhooks/using-webhooks/best-practices-for-using-webhooks
- https://docs.github.com/en/rest/webhooks/repo-config

### Better Auth / Polar

- https://www.better-auth.com/docs/installation
- https://www.better-auth.com/docs/reference/options
- https://www.better-auth.com/docs/plugins/polar
