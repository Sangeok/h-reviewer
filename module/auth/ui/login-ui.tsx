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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0f]">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="absolute inset-0 animate-grid-slide"
          style={{
            backgroundImage: `
            linear-gradient(rgba(0, 255, 157, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 157, 0.1) 1px, transparent 1px)
          `,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Gradient Mesh Background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 blur-[120px] animate-float" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-purple-500/20 to-pink-500/20 blur-[100px] animate-float-delayed" />
      </div>

      {/* Floating Code Snippets */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[15%] left-[5%] text-cyan-400/10 font-mono text-sm animate-float-slow">
          {'{ "ai": "reviewing" }'}
        </div>
        <div className="absolute top-[60%] right-[8%] text-purple-400/10 font-mono text-xs animate-float-delayed">
          const analyze = () =&gt;
        </div>
        <div className="absolute bottom-[20%] left-[15%] text-blue-400/10 font-mono text-sm animate-float">
          // smart code review
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-[480px]">
          {/* Logo/Brand Section */}
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 blur-xl opacity-50" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/25">
                  <svg className="h-7 w-7 text-[#0a0a0f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="font-mono text-3xl font-black tracking-tighter text-white">HReviewer</h1>
            </div>
            <p className="text-sm text-gray-400 font-light tracking-wide">AI-Powered Code Review Assistant</p>
          </div>

          {/* Login Card */}
          <div className="relative group">
            {/* Glow Effect */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl opacity-0 group-hover:opacity-100 blur transition-opacity duration-500" />

            {/* Card */}
            <div className="relative rounded-2xl border border-gray-800 bg-[#12121a]/90 backdrop-blur-xl p-8 shadow-2xl">
              {/* Welcome Text */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Welcome Back</h2>
                <p className="text-gray-400 text-sm">Sign in to access intelligent code reviews</p>
              </div>

              {/* GitHub Login Button */}
              <button
                onClick={handleGithubLogin}
                disabled={isLoading}
                className="group/btn relative w-full overflow-hidden rounded-xl bg-white px-6 py-4 font-semibold text-[#0a0a0f] transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/20 to-cyan-400/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700" />

                <div className="relative flex items-center justify-center gap-3">
                  {isLoading ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0a0a0f] border-t-transparent" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                      <span>Continue with GitHub</span>
                    </>
                  )}
                </div>
              </button>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
                <span className="text-xs text-gray-500 font-mono">OR</span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
              </div>

              {/* Sign Up Link */}
              <div className="text-center">
                <p className="text-sm text-gray-400">
                  New to HReviewer?{" "}
                  <button className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors duration-200 hover:underline underline-offset-4">
                    Create an account
                  </button>
                </p>
              </div>

              {/* Features List */}
              <div className="mt-8 space-y-3 border-t border-gray-800 pt-6">
                {LOGIN_FEATURES.map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 text-sm text-gray-400 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span className="text-lg">{feature.icon}</span>
                    <span>{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-600">
              By signing in, you agree to our{" "}
              <a href="#" className="text-gray-500 hover:text-cyan-400 transition-colors duration-200">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="text-gray-500 hover:text-cyan-400 transition-colors duration-200">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
