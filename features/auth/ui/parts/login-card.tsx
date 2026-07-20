"use client";

import { Github, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { LOGIN_STRINGS } from "../../constants";
import LoginFeatures from "./login-features";

export default function LoginCard() {
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
    <div className="group relative">
      <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-ring/20 to-transparent opacity-0 blur-sm transition-opacity duration-700 group-hover:opacity-100" />

      <div className="relative rounded-xl border border-border bg-gradient-to-b from-card to-background p-10 shadow-2xl backdrop-blur-xl">
        <div className="mb-10">
          <h2 className="mb-2 text-xl font-medium tracking-tight text-foreground">{LOGIN_STRINGS.welcomeTitle}</h2>
          <p className="text-sm font-light text-chart-4">{LOGIN_STRINGS.welcomeSubtitle}</p>
        </div>

        <button
          onClick={handleGithubLogin}
          disabled={isLoading}
          className="group/btn relative w-full overflow-hidden rounded-lg border border-ring/30 bg-gradient-to-b from-secondary to-card px-6 py-3.5 font-medium text-secondary-foreground transition-all duration-300 hover:border-chart-2/50 hover:shadow-lg hover:shadow-ring/10 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ring/30"
        >
          <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-ring/10 to-transparent transition-transform duration-1000 group-hover/btn:translate-x-[100%]" />

          <div className="relative flex items-center justify-center gap-3">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">{LOGIN_STRINGS.connecting}</span>
              </>
            ) : (
              <>
                <Github className="h-[18px] w-[18px]" />
                <span className="text-sm">{LOGIN_STRINGS.githubLoginButton}</span>
              </>
            )}
          </div>
        </button>

        <div className="mt-8">
          <LoginFeatures />
        </div>
      </div>
    </div>
  );
}
