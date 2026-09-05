export const SUBSCRIPTION_QUERY_KEYS = {
  DATA: ["subscription-data"] as const,
} as const;

export const FREE_REVIEW_TRIAL_LIMIT = 5;

export const PLAN_PRICING = {
  FREE: { price: 0, label: "$0" },
  PRO: { price: 99.99, label: "$99.99" },
} as const;

export const PLAN_FEATURES = {
  free: [
    { name: "Up to 5 repositories", included: true },
    { name: "5 AI code reviews, one-time", included: true },
    { name: "Basic code review", included: false },
    { name: "Community support", included: true },
    { name: "Review history", included: false },
    { name: "Priority support", included: false },
  ],
  pro: [
    { name: "Unlimited repositories", included: true },
    { name: "Unlimited AI code reviews", included: true },
    { name: "Advanced code review", included: true },
    { name: "Email support", included: true },
    { name: "Review history", included: true },
    { name: "Priority support", included: true },
  ],
} as const;
