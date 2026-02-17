"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getUserProfile, updateUserProfile } from "@/module/settings/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_LANGUAGE, LanguageCode } from "../../constants";
import LanguageSelector from "./language-selector";

export default function ProfileForm() {
  const queryClient = useQueryClient();
  const { refetch: refetchSession } = useSession();

  const [formState, setFormState] = useState<{
    name: string;
    email: string;
    preferredLanguage: LanguageCode;
  } | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: getUserProfile,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const getInitialFormState = () => ({
    name: profile?.name || "",
    email: profile?.email || "",
    preferredLanguage: profile?.preferredLanguage ?? DEFAULT_LANGUAGE,
  });

  const currentFormState = formState ?? getInitialFormState();

  const updateMutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: async (result) => {
      if (result?.success) {
        setFormState(null);
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        await refetchSession();
        toast.success("Profile updated successfully");
      } else {
        toast.error(result?.message || "Failed to update profile");
      }
    },
    onError: (error) => {
      toast.error("Failed to update profile");
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateMutation.mutate({
      name: currentFormState.name,
      email: currentFormState.email,
      preferredLanguage: currentFormState.preferredLanguage,
    });
  };

  if (isLoading) {
    return (
      <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
        <CardHeader className="relative z-10">
          <CardTitle className="text-lg font-medium text-foreground">Profile Settings</CardTitle>
          <CardDescription className="font-light text-muted-foreground">Update your profile information</CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded-lg bg-secondary" />
            <div className="h-10 animate-pulse rounded-lg bg-secondary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
      {/* Subtle background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ring/3 to-transparent" />

      <CardHeader className="relative z-10">
        <CardTitle className="text-lg font-medium text-foreground">Profile Settings</CardTitle>
        <CardDescription className="font-light text-muted-foreground">Update your profile information</CardDescription>
      </CardHeader>

      <CardContent className="relative z-10">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Full Name Field */}
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium text-secondary-foreground">
              Full Name
            </label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={currentFormState.name}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...(prev ?? getInitialFormState()),
                  name: e.target.value,
                }))
              }
              disabled={updateMutation.isPending}
              className="border-border bg-card text-foreground placeholder:text-chart-4 transition-all duration-300 hover:border-ring/50 focus:border-ring focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Email Field */}
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-secondary-foreground">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={currentFormState.email}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...(prev ?? getInitialFormState()),
                  email: e.target.value,
                }))
              }
              disabled={updateMutation.isPending}
              className="border-border bg-card text-foreground placeholder:text-chart-4 transition-all duration-300 hover:border-ring/50 focus:border-ring focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="language" className="text-sm font-medium text-secondary-foreground">
              Review Language
            </label>
            <LanguageSelector
              value={currentFormState.preferredLanguage}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...(prev ?? getInitialFormState()),
                  preferredLanguage: value,
                }))
              }
              disabled={updateMutation.isPending}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={updateMutation.isPending}
            className="bg-gradient-to-r from-primary to-chart-2 font-medium text-primary-foreground shadow-lg shadow-ring/10 transition-all duration-300 hover:from-primary-hover hover:to-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
