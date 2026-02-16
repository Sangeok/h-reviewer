import ProfileForm from "./parts/profile-form";
import RepositoryList from "./parts/repository-list";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 font-light text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile Form */}
      <ProfileForm />

      {/* Repository List */}
      <RepositoryList />
    </div>
  );
}
