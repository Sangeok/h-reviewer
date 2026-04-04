"use client";

import { signIn } from "@/lib/auth-client";
import { useState } from "react";
import { toast } from "sonner";
import { LOGIN_ANIMATION, LOGIN_BACKGROUND, LOGIN_STRINGS } from "../constants";
import LoginCard from "./parts/login-card";
import LoginFooter from "./parts/login-footer";
import LoginHeader from "./parts/login-header";

export default function LoginUI() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGithubLogin = async () => {
    setIsLoading(true);
    try {
      await signIn.social({
        provider: "github",
      });
    } catch (error) {
      console.error("Error logging in with GitHub:", error);
      toast.error(LOGIN_STRINGS.loginError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{ backgroundImage: LOGIN_BACKGROUND.noiseSvg }}
      />

      <div className="absolute inset-0 opacity-[0.02]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(var(--ring) 1px, transparent 1px),
              linear-gradient(90deg, var(--ring) 1px, transparent 1px)
            `,
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      <div className="absolute inset-0 opacity-[0.08]">
        <div
          className="absolute top-[10%] right-[15%] h-[500px] w-[500px] animate-pulse-slow rounded-full bg-ring/40 blur-[150px]"
          style={{
            animationDuration: `${LOGIN_ANIMATION.primaryOrbDurationSeconds}s`,
          }}
        />
        <div
          className="absolute bottom-[15%] left-[10%] h-[400px] w-[400px] animate-pulse-slow rounded-full bg-chart-3/30 blur-[140px]"
          style={{
            animationDuration: `${LOGIN_ANIMATION.secondaryOrbDurationSeconds}s`,
            animationDelay: `${LOGIN_ANIMATION.secondaryOrbDelaySeconds}s`,
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-[420px]">
          <LoginHeader />
          <LoginCard isLoading={isLoading} onGithubLogin={handleGithubLogin} />
          <LoginFooter />
        </div>
      </div>
    </div>
  );
}
