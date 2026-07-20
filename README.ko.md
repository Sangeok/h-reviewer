# hreviewer

_다른 언어로 읽기: [English](README.md), [한국어](README.ko.md)_

AI 기반 GitHub 코드 리뷰 플랫폼으로, 지능형 자동화된 코드 분석 및 리뷰 추천 기능을 제공합니다.

## 🚀 주요 기능

- **AI 기반 코드 리뷰** - Google AI와 RAG (검색 증강 생성)를 활용한 자동화된 코드 분석
- **GitHub 통합** - 원활한 OAuth 인증 및 저장소 동기화
- **벡터 검색** - Pinecone을 활용한 지능형 코드베이스 인덱싱으로 컨텍스트 기반 리뷰 제공
- **백그라운드 처리** - Inngest를 통한 비동기 리뷰 생성으로 최적의 성능 보장
- **실시간 웹훅** - Push 이벤트 및 Pull Request 시 자동 리뷰 트리거
- **사용량 추적** - 내장된 할당량 관리 및 구독 티어 지원
- **모던 UI** - Tailwind CSS v4 및 Radix UI 컴포넌트를 활용한 반응형 디자인

## 🛠️ 기술 스택

### 코어 프레임워크

- **Next.js 16** (App Router) - React 기반 풀스택 프레임워크
- **React 19** - 서버 컴포넌트를 지원하는 최신 React
- **TypeScript** - 타입 안정성을 위한 엄격 모드 활성화

### 데이터베이스 & ORM

- **PostgreSQL** - 주 데이터베이스
- **Prisma** - 커스텀 클라이언트 위치(`lib/generated/prisma/`)를 사용하는 타입 안전 ORM
- **@prisma/adapter-pg** - 네이티브 PostgreSQL 어댑터

### 인증

- **Better-Auth** - Prisma 어댑터를 사용하는 모던 인증 시스템
- **GitHub OAuth** - 저장소 접근 권한을 가진 소셜 로그인

### AI & 벡터 검색

- **Google AI SDK** - 임베딩 생성 및 AI 분석
- **Pinecone** - 시맨틱 코드 검색을 위한 벡터 데이터베이스
- **RAG 파이프라인** - 컨텍스트 기반 리뷰를 위한 검색 증강 생성

### 백그라운드 작업

- **Inngest** - 코드 리뷰 생성을 위한 비동기 작업 처리

### GitHub 통합

- **Octokit** - 공식 GitHub API 클라이언트
- **Webhooks** - 실시간 저장소 이벤트 처리

### 스타일링 & UI

- **Tailwind CSS v4** - 유틸리티 우선 CSS 프레임워크
- **Radix UI** - 접근성 있는 컴포넌트 프리미티브
- **next-themes** - 다크 모드 지원
- **Lucide Icons** - 모던 아이콘 라이브러리

### 상태 관리

- **TanStack Query v5** - 서버 상태 동기화 및 캐싱

## 📋 사전 요구사항

시작하기 전에 다음 항목이 설치되어 있는지 확인하세요:

- **Node.js** 20.x 이상
- **npm** 또는 **yarn** 또는 **pnpm**
- **PostgreSQL** 14.x 이상
- **Git**

다음 서비스 계정도 필요합니다:

- **GitHub** (OAuth 및 API 접근용)
- **Pinecone** (벡터 데이터베이스)
- **Google AI** (Generative AI API)

## 🔧 설치 및 설정

### 1. 저장소 클론

```bash
git clone https://github.com/yourusername/hreviewer.git
cd hreviewer
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

루트 디렉토리에 `.env` 파일을 생성하세요:

```env
# 데이터베이스
DATABASE_URL="postgresql://user:password@localhost:5432/hreviewer"

# Better-Auth
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="your-secret-key-min-32-chars"

# GitHub OAuth
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"

# AI 서비스
GOOGLE_GENERATIVE_AI_API_KEY="your_google_ai_api_key"
PINECONE_DB_API_KEY="your_pinecone_api_key"

# 선택사항: Inngest (백그라운드 작업용)
INNGEST_EVENT_KEY="your_inngest_event_key"
INNGEST_SIGNING_KEY="your_inngest_signing_key"
```

### 4. 데이터베이스 설정

#### Prisma 클라이언트 생성

```bash
npx prisma generate
```

#### 데이터베이스 마이그레이션 실행

```bash
npx prisma migrate dev
```

#### (선택사항) 데이터베이스 시드

```bash
npx prisma db seed
```

#### Prisma Studio 열기 (데이터베이스 GUI)

```bash
npx prisma studio
```

### 5. GitHub OAuth 설정

1. [GitHub Developer Settings](https://github.com/settings/developers)로 이동
2. 새 OAuth 앱 생성
3. **Homepage URL** 설정: `http://localhost:3000`
4. **Authorization callback URL** 설정: `http://localhost:3000/api/auth/callback/github`
5. **Client ID**와 **Client Secret**을 `.env` 파일에 복사
6. **중요**: 저장소 접근을 위해 `repo` 스코프 요청

### 6. Pinecone 설정

1. [Pinecone](https://www.pinecone.io/)에서 계정 생성
2. `hreviewer`라는 이름의 새 인덱스 생성
3. 차원(dimension) 설정: `768` (Google AI 임베딩 차원)
4. API 키를 `.env`의 `PINECONE_DB_API_KEY`로 복사

### 7. Google AI 설정

1. [Google AI Studio](https://makersuite.google.com/app/apikey)에서 API 키 발급
2. `.env`의 `GOOGLE_GENERATIVE_AI_API_KEY`로 복사

## 🚀 개발

### 개발 서버 시작

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어주세요.

### Inngest 개발 서버 시작 (백그라운드 작업용)

별도의 터미널에서:

```bash
npm run inngest-dev
```

이 명령어는 [http://localhost:8288](http://localhost:8288)에서 Inngest 개발 UI를 시작합니다.

### 린터 실행

```bash
npm run lint
```

## 🔗 GitHub Webhook 설정 (선택사항)

로컬 개발 환경에서 웹훅을 사용하려면:

### 1. ngrok으로 로컬 서버 노출

```bash
npm run ngrok
```

공개 URL을 받게 됩니다 (예: `https://abc123.ngrok.io`).

### 2. GitHub Webhook 설정

1. GitHub 저장소로 이동 → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL**: `https://abc123.ngrok.io/api/webhooks/github`
3. **Content type**: `application/json`
4. **Events**: "Just the push event" 선택 또는 필요에 따라 커스터마이징
5. **Add webhook** 클릭

## 📁 프로젝트 구조

```
hreviewer/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 인증 라우트 그룹 (로그인, 회원가입)
│   ├── dashboard/                # 보호된 대시보드 라우트
│   ├── api/                      # API 라우트
│   │   ├── auth/                 # Better-Auth 엔드포인트
│   │   ├── inngest/              # Inngest 웹훅
│   │   └── webhooks/             # GitHub 웹훅
│   └── layout.tsx                # 루트 레이아웃
├── components/                   # 공유 컴포넌트
│   ├── ui/                       # 기본 UI 컴포넌트 (Radix 기반)
│   └── provider/                 # 컨텍스트 프로바이더
├── lib/                          # 공유 유틸리티
│   ├── auth.ts                   # Better-Auth 서버 설정
│   ├── auth-client.ts            # Better-Auth 클라이언트 SDK
│   ├── db.ts                     # Prisma 클라이언트 싱글톤
│   ├── generated/prisma/         # 생성된 Prisma 클라이언트 (커스텀 위치)
│   └── utils.ts                  # 유틸리티 함수
├── features/                       # 도메인 주도 기능 모듈
│   ├── auth/                     # 인증 모듈
│   ├── repository/               # GitHub 저장소 관리
│   ├── review/                   # 코드 리뷰 기능
│   ├── settings/                 # 사용자 설정
│   ├── dashboard/                # 대시보드 기능
│   ├── ai/lib/                   # AI/RAG 기능
│   └── github/lib/               # GitHub API 래퍼
├── prisma/                       # 데이터베이스 스키마 & 마이그레이션
│   ├── schema.prisma             # Prisma 스키마
│   └── migrations/               # 데이터베이스 마이그레이션
├── public/                       # 정적 자산
└── .env                          # 환경 변수 (직접 생성)
```

### 모듈 구조 패턴

각 기능 모듈은 다음 구조를 따릅니다:

```
features/[feature]/
├── actions/          # 서버 액션
├── components/       # 기능별 컴포넌트
├── hooks/            # 커스텀 React 훅
├── constants/        # 기능 상수
├── types/            # TypeScript 타입
└── utils/            # 유틸리티 함수
```

## 🗄️ 데이터베이스 스키마

### 주요 모델

- **User** - 구독 추적 기능이 있는 핵심 사용자 모델
- **Session** - 활성 사용자 세션 (Better-Auth)
- **Account** - OAuth 제공자 계정 (GitHub)
- **Repository** - 동기화된 GitHub 저장소
- **Review** - AI 생성 코드 리뷰 결과
- **UserUsage** - 사용자별 할당량 추적

### 중요 사항

- **커스텀 Prisma 위치**: 클라이언트가 `lib/generated/prisma/`에 생성됨 (기본 위치 아님)
- **임포트 경로**: 항상 `@/lib/generated/prisma/client`를 사용하고, `@prisma/client`는 절대 사용하지 마세요
- **마이그레이션**: 스키마 변경 시 항상 마이그레이션 생성 (`npx prisma migrate dev`)

## 🔄 개발 워크플로우

### 데이터베이스 변경하기

1. `prisma/schema.prisma` 수정
2. 마이그레이션 생성:
   ```bash
   npx prisma migrate dev --name description_of_change
   ```
3. 클라이언트 재생성:
   ```bash
   npx prisma generate
   ```

### 새 기능 추가하기

1. `features/[feature-name]/`에 기능 모듈 생성
2. 도메인 주도 설계 패턴 따르기
3. `actions/` 디렉토리에 서버 액션 추가
4. `components/` 디렉토리에 컴포넌트 생성
5. `constants/` 디렉토리에 상수 정의
6. `types/` 디렉토리에 타입 추가

### 보호된 라우트

레이아웃 또는 서버 컴포넌트에서 `requireAuth()` 유틸리티 사용:

```typescript
import { requireAuth } from "@/features/auth/utils/auth-utils";

export default async function ProtectedLayout() {
  await requireAuth(); // 인증되지 않은 경우 /login으로 리다이렉트
  // ... 레이아웃 나머지 부분
}
```

## 🚢 프로덕션 빌드

### 프로덕션 빌드

```bash
npm run build
```

### 프로덕션 서버 시작

```bash
npm start
```

### 프로덕션 환경에서 마이그레이션 적용

```bash
npx prisma migrate deploy
```

## 🌐 배포

### 환경 변수 (프로덕션)

프로덕션 환경에서 다음 항목을 업데이트하세요:

- `BETTER_AUTH_URL` - 프로덕션 도메인 (예: `https://yourdomain.com`)
- `DATABASE_URL` - 프로덕션 PostgreSQL 연결 문자열
- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET` - 프로덕션 OAuth 앱 자격증명
- GitHub OAuth 콜백 URL을 프로덕션 도메인으로 업데이트

### 추천 플랫폼

- **Vercel** - Next.js에 최적화 (자동 배포)
- **Railway** - 간편한 PostgreSQL + 앱 호스팅
- **Render** - 데이터베이스를 포함한 풀스택 배포
- **AWS** / **GCP** / **Azure** - 엔터프라이즈 솔루션

## 🧪 테스트

```bash
# 린터 실행
npm run lint

# 타입 체킹
npx tsc --noEmit
```

## 📚 추가 리소스

- [Next.js 문서](https://nextjs.org/docs)
- [Prisma 문서](https://www.prisma.io/docs)
- [Better-Auth 문서](https://better-auth.com)
- [Pinecone 문서](https://docs.pinecone.io)
- [Google AI 문서](https://ai.google.dev)
- [Inngest 문서](https://www.inngest.com/docs)

## 🤝 기여하기

기여를 환영합니다! 다음 단계를 따라주세요:

1. 저장소 포크
2. 기능 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 열기

## 📝 라이선스

이 프로젝트는 MIT 라이선스로 배포됩니다 - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## ⚠️ 중요 사항

1. **Windows 사용자**: Edit 도구 사용 시 항상 백슬래시(`\`)를 파일 경로에 사용
2. **Prisma 클라이언트**: 항상 `@/lib/generated/prisma/client`에서 임포트
3. **인증 라우트**: Better-Auth는 자동으로 `/api/auth/*`에 엔드포인트 생성
4. **백그라운드 작업**: 작업 처리를 위해 Next.js 개발 서버와 함께 Inngest 개발 서버 시작
5. **엄격한 TypeScript**: 프로젝트는 엄격 모드 사용 - null 체크 필수

## 🐛 문제 해결

### 데이터베이스 연결 문제

```bash
# 데이터베이스 연결 테스트
npx prisma db pull

# 데이터베이스 리셋 (개발 환경만)
npx prisma migrate reset
```

### Prisma 클라이언트를 찾을 수 없음

```bash
# 클라이언트 재생성
npx prisma generate
```

### 인증 콜백 오류

- `BETTER_AUTH_URL`이 현재 환경과 일치하는지 확인
- GitHub OAuth 콜백 URL 설정 확인
- `GITHUB_CLIENT_ID`와 `GITHUB_CLIENT_SECRET`이 올바른지 확인

### Webhook이 이벤트를 수신하지 않음

- 로컬 개발용 ngrok 사용: `npm run ngrok`
- GitHub 저장소 설정에서 webhook URL 확인
- GitHub에서 webhook 전달 로그 확인

---
