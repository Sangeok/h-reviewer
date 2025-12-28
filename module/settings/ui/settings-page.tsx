"use client";

import ProfileForm from "./profile-form";
import RepositoryList from "./repository-list";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your settings</p>
      </div>
      <ProfileForm />
      <RepositoryList />
    </div>
  );
}
