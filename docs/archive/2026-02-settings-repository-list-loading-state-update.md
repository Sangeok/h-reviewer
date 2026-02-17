# Settings Repository List Loading State Update

## Status
- Implemented
- Date: 2026-02-17

## Scope
- `module/settings/ui/parts/repository-list.tsx`
- `module/settings/actions/index.ts`

## Why
- Current UI handles only `isLoading` and does not show a dedicated error state.
- Fetch failures are converted to an empty array in server action, so UI cannot distinguish "no data" vs "request failed".
- We should align with current common React Query pattern:
  - `isPending` for initial loading
  - `isError` for failed fetch
  - `isFetching` for background refresh indicator

## Target Behavior
- Initial page load: show skeleton card.
- Fetch error: show error card with retry action.
- Successful load + empty list: show empty state.
- Successful load + data: show list.
- Background refetch: keep current data and show lightweight "Updating..." indicator.

## Change Plan

### 1) Keep fetch errors as errors (do not return `[]` in catch)
File: `module/settings/actions/index.ts`

Before:
```ts
export async function getConnectedRepositories() {
  try {
    // ...
    return repositories;
  } catch (error) {
    console.error("Error fetching connected repositories:", error);
    return [];
  }
}
```

After:
```ts
export async function getConnectedRepositories() {
  try {
    // ...
    return repositories;
  } catch (error) {
    console.error("Error fetching connected repositories:", error);
    throw error instanceof Error ? error : new Error("Failed to fetch connected repositories");
  }
}
```

### 2) Use explicit query state branches in UI
File: `module/settings/ui/parts/repository-list.tsx`

Before:
```ts
const { data: repositories, isLoading } = useQuery({
  queryKey: ["connected-repositories"],
  queryFn: getConnectedRepositories,
  staleTime: 1000 * 60 * 2,
  refetchOnWindowFocus: false,
});

if (isLoading) {
  return <LoadingCard />;
}
```

After:
```ts
const {
  data: repositories = [],
  isPending,
  isFetching,
  isError,
  error,
  refetch,
} = useQuery({
  queryKey: ["connected-repositories"],
  queryFn: getConnectedRepositories,
  staleTime: 1000 * 60 * 2,
  refetchOnWindowFocus: false,
});

if (isPending) {
  return <LoadingCard />;
}

if (isError) {
  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
      <CardHeader className="relative z-10">
        <CardTitle className="text-lg font-medium text-foreground">Connected Repository</CardTitle>
        <CardDescription className="font-light text-muted-foreground">
          Failed to load connected repositories
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 space-y-3">
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 3) Show background refresh indicator without blocking UI
File: `module/settings/ui/parts/repository-list.tsx`

Add to header area:
```ts
{isFetching && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
    <span>Updating...</span>
  </div>
)}
```

### 4) Simplify list checks with default data
File: `module/settings/ui/parts/repository-list.tsx`

Use:
```ts
{repositories.length > 0 && /* Disconnect All button */}
{repositories.length === 0 ? <EmptyState /> : <RepositoryItems />}
```

## Validation
- Type check: `npx tsc --noEmit`
- Lint: `npm run lint`
- Manual checks:
  - Open settings page with normal network: skeleton -> list/empty state.
  - Simulate fetch failure: error card appears and Retry works.
  - Trigger mutation (disconnect) and verify background "Updating..." appears during refetch.

## Implementation Result
- `module/settings/actions/index.ts`
  - `getConnectedRepositories` now throws on catch instead of returning `[]`.
- `module/settings/ui/parts/repository-list.tsx`
  - Query state migrated from `isLoading` to `isPending / isError / isFetching`.
  - Added dedicated error UI with `Retry` button (`refetch`).
  - Added lightweight `Updating...` indicator for background refetch.
  - Simplified repository checks with `data: repositories = []`.
- Verification completed:
  - `npx tsc --noEmit` passed.
  - `eslint module/settings/actions/index.ts module/settings/ui/parts/repository-list.tsx` passed.

## Notes
- This is an incremental update and does not require Suspense migration.
- Suspense + ErrorBoundary can be considered later if we want route-level loading/error consolidation.
