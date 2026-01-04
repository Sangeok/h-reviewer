"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getUserProfile, updateUserProfile } from "@/module/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { DEFAULT_LANGUAGE, LanguageCode } from "../../constants";
import LanguageSelector from "./language-selector";

export default function ProfileForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const { refetch: refetchSession } = useSession();

  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);

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
      setPreferredLanguage((profile.preferredLanguage as LanguageCode) || DEFAULT_LANGUAGE);
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; email?: string; preferredLanguage?: string }) =>
      await updateUserProfile(data),
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
    updateMutation.mutate({ name, email, preferredLanguage });
  };

  if (isLoading) {
    return (
      <Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
        <CardHeader className="relative z-10">
          <CardTitle className="text-lg font-medium text-[#e0e0e0]">Profile Settings</CardTitle>
          <CardDescription className="text-[#707070] font-light">Update your profile information</CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="space-y-4">
            <div className="h-10 bg-[#1a1a1a] rounded-lg animate-pulse" />
            <div className="h-10 bg-[#1a1a1a] rounded-lg animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-black border-[#1a1a1a]">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d3e2d]/3 to-transparent pointer-events-none" />

      <CardHeader className="relative z-10">
        <CardTitle className="text-lg font-medium text-[#e0e0e0]">Profile Settings</CardTitle>
        <CardDescription className="text-[#707070] font-light">Update your profile information</CardDescription>
      </CardHeader>

      <CardContent className="relative z-10">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Full Name Field */}
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium text-[#d0d0d0]">
              Full Name
            </label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={updateMutation.isPending}
              className="bg-[#0a0a0a] border-[#1a1a1a] text-[#e0e0e0] placeholder:text-[#606060] hover:border-[#2d3e2d]/50 focus:border-[#2d3e2d] focus:ring-[#2d3e2d]/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Email Field */}
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-[#d0d0d0]">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={updateMutation.isPending}
              className="bg-[#0a0a0a] border-[#1a1a1a] text-[#e0e0e0] placeholder:text-[#606060] hover:border-[#2d3e2d]/50 focus:border-[#2d3e2d] focus:ring-[#2d3e2d]/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="language" className="text-sm font-medium text-[#d0d0d0]">
              Review Language
            </label>
            <LanguageSelector
              value={preferredLanguage}
              onChange={(value) => setPreferredLanguage(value)}
              disabled={updateMutation.isPending}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={updateMutation.isPending}
            className="bg-gradient-to-r from-[#4a6a4a] to-[#3d523d] hover:from-[#5a7a5a] hover:to-[#4d624d] text-black font-medium shadow-lg shadow-[#2d3e2d]/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
