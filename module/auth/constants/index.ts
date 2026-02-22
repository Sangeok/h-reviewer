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
} as const;

export const LOGIN_ANIMATION = {
  featureDelayMs: 150,
  primaryOrbDurationSeconds: 8,
  secondaryOrbDurationSeconds: 10,
  secondaryOrbDelaySeconds: 2,
} as const;
