import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import { RepositoryList, RepositoryListSkeleton } from "@/module/repository";

export default function RepositoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-sidebar-foreground">Repositories</h1>
        <p className="text-muted-foreground font-light mt-1">Manage and view your github repositories</p>
      </div>
      <QueryBoundary fallback={<RepositoryListSkeleton />}>
        <RepositoryList />
      </QueryBoundary>
    </div>
  );
}
