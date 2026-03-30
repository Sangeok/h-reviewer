# 프론트엔드 결합도 가이드

결합도란 하나의 코드를 수정했을 때 함께 영향을 받는 코드의 범위를 말해요.

프론트엔드에서는 여러 페이지가 공통 Hook이나 컴포넌트를 공유하는 경우가 많아요. 이때 결합도가 높으면 하나의 Hook을 수정할 때 의존하는 모든 페이지를 확인하고 테스트해야 하므로, 변경이 어렵고 예상치 못한 버그가 생기기 쉬워요.

이 가이드에서는 프론트엔드에서 결합도가 높아지는 흔한 패턴들과 개선 방향을 다뤄요.

---

## 1. 불필요한 공통화 피하기

여러 페이지에 걸친 중복 코드를 하나의 Hook으로 공통화하면, 함께 수정되어야 할 코드들을 한꺼번에 수정할 수 있어요. 그렇지만 페이지마다 동작이 달라질 여지가 있다면, 오히려 불필요한 결합도가 생겨서 수정이 더 어려워질 수 있어요.

### 📝 코드 예시

여러 페이지에서 반복되는 점검 바텀시트 로직을 공통 Hook으로 분리한 경우예요.

```typescript
export const useOpenMaintenanceBottomSheet = () => {
  const maintenanceBottomSheet = useMaintenanceBottomSheet();
  const logger = useLogger();

  return async (maintainingInfo: TelecomMaintenanceInfo) => {
    logger.log("점검 바텀시트 열림");
    const result = await maintenanceBottomSheet.open(maintainingInfo);
    if (result) {
      logger.log("점검 바텀시트 알림받기 클릭");
    }
    closeView();
  };
};
```

### 👃 코드 냄새 맡아보기

이 Hook은 여러 페이지에서 반복적으로 보이는 로직이기에 공통화되었어요. 그렇지만 앞으로 생길 수 있는 다양한 변경 가능성을 생각해볼 수 있어요.

- 만약에 페이지마다 로깅하는 값이 달라진다면?
- 만약에 어떤 페이지에서는 점검 바텀시트를 닫더라도 화면을 닫을 필요가 없다면?
- 바텀시트에서 보여지는 텍스트나 이미지를 다르게 해야 한다면?

이런 변경사항에 대응하려면 Hook이 복잡한 인자를 받아야 하고, 수정할 때마다 이 Hook을 쓰는 모든 페이지가 잘 작동하는지 테스트해야 해요.

### ✏️ 개선해보기

페이지마다 동작이 달라질 여지가 있다면, 공통 Hook을 만들지 않고 **중복 코드를 허용**하는 것이 더 나은 선택이에요. 각 페이지가 독립적으로 자신의 로직을 가지면, 한 페이지의 요구사항이 바뀌어도 다른 페이지에 영향을 주지 않아요.

이 접근은 **AHA(Avoid Hasty Abstractions)** 원칙과도 맞닿아 있어요. 성급하게 추상화하기보다는, **대체로 3곳 이상에서 동일한 패턴이 반복되고 앞으로도 변경 방향이 같다고 판단될 때** 공통화하는 것이 안전해요.

::: tip 판단 기준
페이지에서 로깅하는 값이 같고, 바텀시트의 동작이 동일하고, 바텀시트의 모양이 동일하며 **앞으로도 그럴 예정이라면** 공통화를 통해 중복 코드를 줄이고 재사용성을 높일 수 있어요. 그렇지 않다면 중복을 허용하세요.
:::

---

## 2. 책임을 하나씩 분리하기

쿼리 파라미터, 상태, API 호출과 같은 로직을 하나의 함수나 Hook에 한꺼번에 담지 마세요. 한 번에 다루는 맥락의 종류가 많아져서 이해하기 힘들고 수정하기 어려운 코드가 돼요.

### 📝 코드 예시

페이지 전체의 URL 쿼리 파라미터를 하나의 Hook에서 관리하는 경우예요.

```typescript
import { subMonths } from "date-fns";
import { useMemo } from "react";
import {
  ArrayParam,
  DateParam,
  NumberParam,
  useQueryParams
} from "use-query-params";

const defaultDateFrom = subMonths(new Date(), 3);
const defaultDateTo = new Date();

export function usePageState() {
  const [query, setQuery] = useQueryParams({
    cardId: NumberParam,
    statementId: NumberParam,
    dateFrom: DateParam,
    dateTo: DateParam,
    statusList: ArrayParam
  });

  return useMemo(
    () => ({
      values: {
        cardId: query.cardId ?? undefined,
        statementId: query.statementId ?? undefined,
        dateFrom: query.dateFrom ?? defaultDateFrom,
        dateTo: query.dateTo ?? defaultDateTo,
        statusList: query.statusList as StatementStatusType[] | undefined
      },
      controls: {
        setCardId: (cardId: number) => setQuery({ cardId }, "replaceIn"),
        setStatementId: (statementId: number) =>
          setQuery({ statementId }, "replaceIn"),
        setDateFrom: (date?: Date) =>
          setQuery({ dateFrom: date }, "replaceIn"),
        setDateTo: (date?: Date) =>
          setQuery({ dateTo: date }, "replaceIn"),
        setStatusList: (statusList?: StatementStatusType[]) =>
          setQuery({ statusList }, "replaceIn")
      }
    }),
    [query, setQuery]
  );
}
```

### 👃 코드 냄새 맡아보기

이 Hook은 "이 페이지에 필요한 모든 쿼리 매개변수를 관리하는 것"이라는 광범위한 책임을 가지게 돼요. 이 방식은 필요한 값보다 넓은 상태 묶음에 함께 의존하게 만들어, **불필요한 결합도**를 높이는 전형적인 원인이에요.

이로 인해 페이지 내의 컴포넌트나 다른 Hook들이 이 공통 Hook을 사용할 때, 자신과 무관한 상태(예: `cardId`만 필요한데 `statementId` 변경에도 영향을 받음)에 불필요하게 의존하게 되어 **원치 않는 리렌더링**이 발생할 수 있어요. 또한 하나의 파라미터를 수정할 때에도 관련 없는 코드까지 영향 범위가 급격히 확장돼요.

시간이 지나며 이 Hook은 유지 관리가 점점 어려워지고, 수정하기 힘든 코드로 발전할 수 있어요.

### ✏️ 개선해보기

각각의 쿼리 파라미터별로 별도의 Hook을 작성하면, 수정에 따른 영향 범위를 좁힐 수 있어요.

```typescript
import { useCallback } from "react";
import { NumberParam, useQueryParam } from "use-query-params";

export function useCardIdQueryParam() {
  const [cardId, _setCardId] = useQueryParam("cardId", NumberParam);

  const setCardId = useCallback((nextCardId: number | undefined) => {
    _setCardId(nextCardId, "replaceIn");
  }, [_setCardId]);

  return [cardId ?? undefined, setCardId] as const;
}
```

각 Hook이 하나의 파라미터만 담당하므로, 수정했을 때 예상하지 못한 영향이 생기는 것을 막을 수 있어요.

---

## 3. Props와 Context의 결합도 관리하기

Props Drilling과 Context 남용은 프론트엔드에서 가장 흔한 결합도 문제예요. 두 경우 모두 중간 컴포넌트들이 불필요하게 결합되거나, 하나의 상태 변경이 넓은 범위에 영향을 줘요.

### 📝 코드 예시

사용자 정보를 깊은 컴포넌트에 전달하기 위해 중간 컴포넌트들이 Props를 전달만 하는 경우예요.

```tsx
function Page({ user }: { user: User }) {
  return <Layout user={user} />;
}

function Layout({ user }: { user: User }) {
  return (
    <div>
      <Header user={user} />
      <Content />
    </div>
  );
}

function Header({ user }: { user: User }) {
  return <UserProfile user={user} />;
}

function UserProfile({ user }: { user: User }) {
  return <span>{user.name}</span>;
}
```

### 👃 코드 냄새 맡아보기

`Layout`과 `Header`는 `user`를 직접 사용하지 않고 아래로 전달하기만 해요. `user`의 타입이 바뀌면 중간 컴포넌트들까지 모두 수정해야 하고, `UserProfile`의 위치를 옮기면 Props 전달 경로 전체를 수정해야 해요.

이런 경우 Context로 해결하고 싶을 수 있지만, 하나의 큰 Context에 여러 상태를 넣으면 상태 하나가 바뀔 때 Context를 구독하는 모든 컴포넌트가 리렌더돼요.

### ✏️ 개선해보기

**컴포넌트 합성(Composition)** 패턴을 활용하면, 중간 컴포넌트가 데이터를 알 필요 없이 렌더링 구조를 조합할 수 있어요.

```tsx
function Page({ user }: { user: User }) {
  return (
    <Layout header={<Header profile={<UserProfile user={user} />} />}>
      <Content />
    </Layout>
  );
}

function Layout({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div>
      {header}
      {children}
    </div>
  );
}

function Header({ profile }: { profile: ReactNode }) {
  return <nav>{profile}</nav>;
}

function UserProfile({ user }: { user: User }) {
  return <span>{user.name}</span>;
}
```

`Layout`과 `Header`는 더 이상 `user`를 알지 못해요. `user`와 관련된 변경은 `Page`와 `UserProfile`만 영향을 받아요.

::: tip 판단 기준
Props가 2단계 이상 "통과"만 되고 있다면 합성 패턴을 고려하세요. Context는 테마나 인증 상태처럼 넓은 범위에서 필요한 값에 유용해요. 다만 자주 바뀌는 값은 Context를 분리하거나 selector 패턴을 함께 고려하세요.
:::

---

## 핵심 정리

- **공통화 전에 질문하기**: 모든 사용처의 동작이 동일하며, 앞으로도 그럴 것이 확실한가? 아니라면 중복을 허용하세요.
- **책임 범위 좁히기**: 하나의 Hook이 여러 관심사를 다루고 있다면, 불필요한 의존 결합을 줄이기 위해 관심사별로 분리하세요.
- **Props Drilling보다 컴포넌트 합성**: 데이터를 전달만 하는 중간 컴포넌트가 있다면, 합성 패턴으로 결합도를 줄이세요.
- **영향 범위 확인하기**: 이 코드를 수정하면 어디까지 테스트해야 하는지 생각해보세요. 범위가 넓다면 결합도가 높다는 신호예요.
