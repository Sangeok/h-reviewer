"use client";

import ProfileForm from "./profile-form";
import RepositoryList from "./repository-list";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-[#e0e0e0]">Settings</h1>
        <p className="text-[#707070] font-light mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile Form */}
      <ProfileForm />

      {/* Repository List */}
      <RepositoryList />
    </div>
  );
}
