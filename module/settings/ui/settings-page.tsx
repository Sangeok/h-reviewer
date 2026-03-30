import { QueryBoundary } from "@/components/error-boundary/query-error-boundary";
import ProfileForm from "./parts/profile/profile-form";
import RepositoryList from "./parts/repository/repository-list";
import { ProfileSkeleton } from "./parts/profile/profile-skeleton";
import { RepositorySkeleton } from "./parts/repository/repository-skeleton";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 font-light text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile Form */}
      <QueryBoundary
        fallback={<ProfileSkeleton />}
        title="Profile Settings"
        description="Failed to load profile"
      >
        <ProfileForm />
      </QueryBoundary>

      {/* Repository List */}
      <QueryBoundary
        fallback={<RepositorySkeleton />}
        title="Connected Repository"
        description="Failed to load connected GitHub repositories"
      >
        <RepositoryList />
      </QueryBoundary>
    </div>
  );
}
