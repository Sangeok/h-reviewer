/**
 * Authentication module constants
 */

import type { LoginFeature } from "../types";

/**
 * Login page feature highlights
 */
export const LOGIN_FEATURES: LoginFeature[] = [
  { icon: "⚡", text: "Instant AI-powered reviews" },
  { icon: "🔍", text: "Deep code analysis" },
  { icon: "🛡️", text: "Security vulnerability detection" },
];

export const LOGIN_STRINGS = {
  brandName: "HReviewer",
  brandTagline: "AI-Powered Code Review Assistant",
  welcomeTitle: "Welcome Back",
  welcomeSubtitle: "Sign in to access intelligent code reviews",
  githubLoginButton: "Continue with GitHub",
  connecting: "Connecting...",
  termsOfService: "Terms of Service",
  privacyPolicy: "Privacy Policy",
  noAccountMessage: "By signing in, you agree to our",
  loginError: "GitHub 로그인에 실패했습니다. 다시 시도해주세요.",
} as const;

export const LOGIN_BACKGROUND = {
  noiseSvg: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
} as const;

export const LOGIN_ANIMATION = {
  featureDelayMs: 150,
  primaryOrbDurationSeconds: 8,
  secondaryOrbDurationSeconds: 10,
  secondaryOrbDelaySeconds: 2,
} as const;
