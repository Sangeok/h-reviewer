"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getUserProfile, updateUserProfile } from "@/module/settings/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

export default function ProfileForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const { refetch: refetchSession } = useSession();

  const router = useRouter();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => await getUserProfile(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setEmail(profile.email || "");
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; email?: string }) => await updateUserProfile(data),
    onSuccess: async (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        await refetchSession();
        alert("Profile updated successfully");
      }
    },
    onError: (error) => {
      alert("Failed to update profile");
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateMutation.mutate({ name, email });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded-md"></div>
            <div className="h-10 bg-muted rounded-md"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>Update your profile information</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <div>Full Name</div>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <div>Email</div>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
