"use client";

import { signIn } from "@/lib/auth-client";
import { useState } from "react";
import { LOGIN_FEATURES } from "@/module/auth";

export default function LoginUI() {
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleGithubLogin = async () => {
    setIsLoading(true);
    try {
      await signIn.social({
        provider: "github",
      });
    } catch (error) {
      console.error("Error logging in with GitHub:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Subtle Noise Texture Overlay */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Ultra Subtle Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(45, 62, 45, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(45, 62, 45, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      {/* Extremely Subtle Gradient Orbs */}
      <div className="absolute inset-0 opacity-[0.08]">
        <div
          className="absolute top-[10%] right-[15%] w-[500px] h-[500px] rounded-full blur-[150px] animate-pulse-slow"
          style={{
            background: "radial-gradient(circle, rgba(45, 62, 45, 0.4) 0%, transparent 70%)",
            animationDuration: "8s",
          }}
        />
        <div
          className="absolute bottom-[15%] left-[10%] w-[400px] h-[400px] rounded-full blur-[140px] animate-pulse-slow"
          style={{
            background: "radial-gradient(circle, rgba(30, 30, 40, 0.3) 0%, transparent 70%)",
            animationDuration: "10s",
            animationDelay: "2s",
          }}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-[420px]">
          {/* Logo/Brand Section */}
          <div className="mb-16 text-center">
            <div className="mb-4 inline-flex items-center gap-3">
              <div className="relative">
                {/* Subtle glow */}
                <div className="absolute inset-0 bg-[#2d3e2d] blur-xl opacity-20" />

                {/* Icon container */}
                <div className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-[#2d3e2d]/30 shadow-lg">
                  <svg
                    className="h-6 w-6 text-[#4a6a4a]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="font-mono text-2xl font-medium tracking-tight text-[#d0d0d0] -mb-0.5">
                HReviewer
              </h1>
            </div>
            <p className="text-sm text-[#606060] font-light tracking-wide">
              AI-Powered Code Review Assistant
            </p>
          </div>

          {/* Login Card */}
          <div className="relative group">
            {/* Subtle hover glow */}
            <div className="absolute -inset-[1px] bg-gradient-to-b from-[#2d3e2d]/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-700" />

            {/* Card */}
            <div className="relative rounded-xl border border-[#1a1a1a] bg-gradient-to-b from-[#0a0a0a] to-black backdrop-blur-xl p-10 shadow-2xl">
              {/* Welcome Text */}
              <div className="mb-10">
                <h2 className="text-xl font-medium text-[#e0e0e0] mb-2 tracking-tight">
                  Welcome Back
                </h2>
                <p className="text-[#606060] text-sm font-light">
                  Sign in to access intelligent code reviews
                </p>
              </div>

              {/* GitHub Login Button */}
              <button
                onClick={handleGithubLogin}
                disabled={isLoading}
                className="group/btn relative w-full overflow-hidden rounded-lg bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] border border-[#2d3e2d]/30 px-6 py-3.5 font-medium text-[#d0d0d0] transition-all duration-300 hover:border-[#3d523d]/50 hover:shadow-lg hover:shadow-[#2d3e2d]/10 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#2d3e2d]/30"
              >
                {/* Subtle shine effect on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#2d3e2d]/10 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000" />

                <div className="relative flex items-center justify-center gap-3">
                  {isLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4a6a4a] border-t-transparent" />
                      <span className="text-sm">Connecting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                      <span className="text-sm">Continue with GitHub</span>
                    </>
                  )}
                </div>
              </button>

              {/* Divider */}
              <div className="my-8 flex items-center gap-4">
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#1a1a1a] to-transparent" />
                <span className="text-xs text-[#404040] font-mono tracking-wider">OR</span>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#1a1a1a] to-transparent" />
              </div>

              {/* Sign Up Link */}
              <div className="text-center mb-8">
                <p className="text-sm text-[#606060] font-light">
                  New to HReviewer?{" "}
                  <button className="font-medium text-[#4a6a4a] hover:text-[#5a7a5a] transition-colors duration-300">
                    Create an account
                  </button>
                </p>
              </div>

              {/* Features List */}
              <div className="space-y-3.5 border-t border-[#1a1a1a] pt-8">
                {LOGIN_FEATURES.map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 text-sm text-[#707070] opacity-0 animate-fade-in-up font-light"
                    style={{
                      animationDelay: `${index * 150}ms`,
                      animationFillMode: "forwards"
                    }}
                  >
                    <span className="text-base opacity-60">{feature.icon}</span>
                    <span>{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 text-center">
            <p className="text-xs text-[#404040] font-light">
              By signing in, you agree to our{" "}
              <a
                href="#"
                className="text-[#505050] hover:text-[#4a6a4a] transition-colors duration-300 underline decoration-[#2a2a2a] underline-offset-2 hover:decoration-[#4a6a4a]"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="#"
                className="text-[#505050] hover:text-[#4a6a4a] transition-colors duration-300 underline decoration-[#2a2a2a] underline-offset-2 hover:decoration-[#4a6a4a]"
              >
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.08;
          }
          50% {
            opacity: 0.12;
          }
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }

        .animate-pulse-slow {
          animation: pulse-slow ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
