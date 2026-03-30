# Component Props 설계 규칙

**적용 범위**: 모든 React 컴포넌트

---

## 핵심 규칙

**구현 세부사항을 Props로 노출하지 않는다.**

자식 컴포넌트는 부모가 어떤 라이브러리로 상태를 관리하는지 몰라야 한다.

---

## 예시: Mutation 전달

### ❌ 잘못됨 - 라이브러리 타입 직접 전달
```typescript
import type { UseMutationResult } from "@tanstack/react-query";

interface RepositoryItemProps {
  repository: Repository;
  disconnectMutation: UseMutationResult<{ success: true }, Error, string>;
}

// 자식이 React Query에 의존
function RepositoryItem({ repository, disconnectMutation }: RepositoryItemProps) {
  return (
    <Button
      onClick={() => disconnectMutation.mutate(repository.id)}
      disabled={disconnectMutation.isPending}
    />
  );
}
```

### ✅ 올바름 - 콜백 + 상태 분리
```typescript
interface RepositoryItemProps {
  repository: Repository;
  onDisconnect: (id: string) => void;
  isDisconnecting: boolean;
}

// 자식은 순수 프레젠테이션
function RepositoryItem({ repository, onDisconnect, isDisconnecting }: RepositoryItemProps) {
  return (
    <Button
      onClick={() => onDisconnect(repository.id)}
      disabled={isDisconnecting}
    />
  );
}
```

---

## 판단 기준

> "이 Props 타입을 보고 특정 라이브러리를 import해야 하는가?"
> - 예 → 콜백 + 원시 상태로 분리
> - 아니오 → 그대로 사용

**적용 대상**: `UseMutationResult`, `UseQueryResult`, `FormikProps`, store 인스턴스 등

---

**관련 문서**: [component-parts](./component-parts.md)
