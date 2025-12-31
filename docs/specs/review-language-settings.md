# PR 리뷰 언어 설정 기능 구현 명세서

## 개요

### 목적
사용자가 설정한 언어로 AI PR 리뷰를 생성하는 기능을 구현한다.

### 지원 언어
| 코드 | 언어 | 네이티브 표기 |
|------|------|--------------|
| `en` | English | English |
| `ko` | Korean | 한국어 |

### 기본값
- 기본 언어: `en` (영어)
- 번역 범위: 섹션 헤더 포함 리뷰 전체

---

## 1. 데이터베이스 스키마 변경

### 1.1 User 모델 수정

**파일**: `prisma/schema.prisma`

```prisma
model User {
  // ... 기존 필드
  preferredLanguage String @default("en")  // 추가
  // ...
}
```

### 1.2 마이그레이션 실행

```bash
npx prisma migrate dev --name add-user-preferred-language
npx prisma generate
```

---

## 2. 상수 정의

### 2.1 언어 상수 파일 생성

**파일**: `module/settings/constants/index.ts` (새 파일)

```typescript
export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
];

export const DEFAULT_LANGUAGE = "en";

export type LanguageCode = "en" | "ko";
```

---

## 3. Server Actions 수정

### 3.1 getUserProfile 수정

**파일**: `module/settings/actions/index.ts`

```typescript
export async function getUserProfile() {
  // ... 기존 인증 로직

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      preferredLanguage: true,  // 추가
    },
  });

  return user;
}
```

### 3.2 updateUserProfile 수정

```typescript
export async function updateUserProfile(data: {
  name?: string;
  email?: string;
  preferredLanguage?: string;  // 추가
}) {
  // ... 기존 인증 로직

  const updatedUser = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: data.name,
      email: data.email,
      preferredLanguage: data.preferredLanguage,  // 추가
    },
    select: {
      id: true,
      name: true,
      email: true,
      preferredLanguage: true,  // 추가
    },
  });

  return { success: true, user: updatedUser };
}
```

### 3.3 getUserLanguageByUserId 추가 (Inngest용)

```typescript
export async function getUserLanguageByUserId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredLanguage: true },
  });
  return user?.preferredLanguage ?? "en";
}
```

---

## 4. UI 컴포넌트

### 4.1 Select 컴포넌트 생성

**파일**: `components/ui/select.tsx` (새 파일)

Radix UI Select 컴포넌트를 사용한다. `@radix-ui/react-select` 패키지가 필요하다.

```bash
npm install @radix-ui/react-select
```

```typescript
"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2 text-sm text-[#e0e0e0] ring-offset-background placeholder:text-[#606060] focus:outline-none focus:ring-2 focus:ring-[#2d3e2d] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-[#1a1a1a] bg-[#0a0a0a] text-[#e0e0e0] shadow-md animate-in fade-in-80",
        position === "popper" && "translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-[#1a1a1a] focus:text-[#e0e0e0] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem };
```

### 4.2 LanguageSelector 컴포넌트 생성

**파일**: `module/settings/ui/parts/language-selector.tsx` (새 파일)

```typescript
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "../../constants";

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
  disabled?: boolean;
}

export default function LanguageSelector({
  value,
  onChange,
  disabled
}: LanguageSelectorProps) {
  return (
    <Select
      value={value}
      onValueChange={(val) => onChange(val as LanguageCode)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.nativeName} ({lang.name})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### 4.3 ProfileForm 수정

**파일**: `module/settings/ui/profile-form.tsx`

```typescript
// 상단 import 추가
import LanguageSelector from "./parts/language-selector";
import { DEFAULT_LANGUAGE, type LanguageCode } from "../constants";

// state 추가
const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);

// useEffect 수정
useEffect(() => {
  if (profile) {
    setName(profile.name || "");
    setEmail(profile.email || "");
    setPreferredLanguage((profile.preferredLanguage as LanguageCode) || DEFAULT_LANGUAGE);
  }
}, [profile]);

// handleSubmit 수정
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  updateMutation.mutate({ name, email, preferredLanguage });
};

// JSX에 언어 선택 UI 추가 (Email 필드 다음)
<div className="space-y-2">
  <label htmlFor="language" className="text-sm font-medium text-[#d0d0d0]">
    Review Language
  </label>
  <p className="text-xs text-[#606060]">
    AI-generated PR reviews will be written in this language
  </p>
  <LanguageSelector
    value={preferredLanguage}
    onChange={setPreferredLanguage}
    disabled={updateMutation.isPending}
  />
</div>
```

---

## 5. AI 리뷰 통합

### 5.1 Inngest 이벤트에 언어 전달

**파일**: `module/ai/actions/index.ts`

```typescript
import { getUserLanguageByUserId } from "@/module/settings/actions";

export async function reviewPullRequest(owner: string, repo: string, prNumber: number) {
  // ... 기존 repository 조회 로직

  // 사용자 언어 설정 조회
  const preferredLanguage = await getUserLanguageByUserId(repository.user.id);

  await inngest.send({
    name: "pr.review.requested",
    data: {
      owner,
      repo,
      prNumber,
      userId: repository.user.id,
      preferredLanguage,  // 추가
    },
  });

  // ...
}
```

### 5.2 AI 프롬프트에 언어 지시 추가

**파일**: `inngest/functions/review.ts`

```typescript
// 언어 이름 매핑 헬퍼 함수 추가
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: "English",
    ko: "Korean",
  };
  return languages[code] || "English";
}

export const generateReview = inngest.createFunction(
  { id: "generate-review" },
  { event: "pr.review.requested" },
  async ({ event, step }) => {
    // preferredLanguage 추출 (기본값: en)
    const { owner, repo, prNumber, userId, preferredLanguage = "en" } = event.data;

    // ... fetch-pr-data, generate-context steps

    const review = await step.run("generate-ai-review", async () => {
      // 언어 지시 생성 (영어가 아닌 경우에만)
      const languageInstruction = preferredLanguage !== "en"
        ? `\n\nIMPORTANT: Write the entire review in ${getLanguageName(preferredLanguage)}. All section headers (like "Walkthrough", "Summary", "Strengths", "Issues", "Suggestions", "Poem"), explanations, and comments must be in ${getLanguageName(preferredLanguage)}.`
        : "";

      const prompt = `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.${languageInstruction}
        PR Title: ${title}
        PR Description: ${description || "No description provided"}

        Context from Codebase:
        ${context.join("\n\n")}

        Code Changes:
        \`\`\`diff
        ${diff}
        \`\`\`

        Please provide:
        1. **Walkthrough**: A file-by-file explanation of the changes.
        2. **Sequence Diagram**: A Mermaid JS sequence diagram visualizing the flow of the changes (if applicable). Use \`\`\`mermaid ... \`\`\` block. **IMPORTANT**: Ensure the Mermaid syntax is valid. Do not use special characters (like quotes, braces, parentheses) inside Note text or labels as it breaks rendering. Keep the diagram simple.
        3. **Summary**: Brief overview.
        4. **Strengths**: What's done well.
        5. **Issues**: Bugs, security concerns, code smells.
        6. **Suggestions**: Specific code improvements.
        7. **Poem**: A short, creative poem summarizing the changes at the very end.

        Format your response in markdown.`;

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      return text;
    });

    // ... post-comment, save-review steps
  }
);
```

---

## 6. 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                        Settings Page                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ProfileForm                                               │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  LanguageSelector: [English ▼] → [한국어 ▼]         │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                 updateUserProfile({ preferredLanguage: "ko" })
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  User { id, name, email, preferredLanguage: "ko", ... }   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

        ─── 이후 PR 생성 시 ───

┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Webhook                              │
│                    (PR opened event)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    reviewPullRequest()
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼                                       ▼
  getUserLanguageByUserId()              getPullRequestDiff()
          │                                       │
          └───────────────────┬───────────────────┘
                              │
                              ▼
              inngest.send({ preferredLanguage: "ko", ... })
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Inngest Background Job                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  generateReview()                                          │  │
│  │  - Extract preferredLanguage from event.data               │  │
│  │  - Build prompt with language instruction                  │  │
│  │  - Call Gemini 2.5 Flash                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AI Response                                │
│  "## 코드 리뷰                                                  │
│   ### 변경 사항 요약                                            │
│   이 PR은 사용자 인증 로직을 개선합니다...                       │
│   ### 강점                                                      │
│   - 코드 가독성이 좋습니다                                       │
│   ..."                                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              postReviewComment() → GitHub PR Comment
```

---

## 7. 파일 변경 요약

### 새로 생성할 파일
| 파일 경로 | 설명 |
|----------|------|
| `module/settings/constants/index.ts` | 언어 상수 정의 |
| `components/ui/select.tsx` | Radix UI Select 컴포넌트 |
| `module/settings/ui/parts/language-selector.tsx` | 언어 선택 컴포넌트 |

### 수정할 파일
| 파일 경로 | 변경 내용 |
|----------|----------|
| `prisma/schema.prisma` | User 모델에 `preferredLanguage` 필드 추가 |
| `module/settings/actions/index.ts` | `getUserProfile`, `updateUserProfile` 수정, `getUserLanguageByUserId` 추가 |
| `module/settings/ui/profile-form.tsx` | 언어 선택 UI 추가 |
| `module/ai/actions/index.ts` | Inngest 이벤트에 `preferredLanguage` 전달 |
| `inngest/functions/review.ts` | AI 프롬프트에 언어 지시 추가 |

---

## 8. 의존성

### 패키지 설치 필요
```bash
npm install @radix-ui/react-select
```

---

## 9. 테스트 시나리오

1. **설정 페이지 접근**
   - Settings 페이지에서 Review Language 드롭다운이 표시되는지 확인
   - 기본값이 English로 선택되어 있는지 확인

2. **언어 변경**
   - 한국어를 선택하고 저장
   - 새로고침 후 한국어가 유지되는지 확인

3. **PR 리뷰 생성**
   - 한국어로 설정된 사용자의 Repository에 PR 생성
   - 생성된 리뷰가 한국어로 작성되었는지 확인
   - 섹션 헤더도 한국어로 표시되는지 확인

4. **기본값 동작**
   - 새 사용자는 영어로 리뷰가 생성되는지 확인
