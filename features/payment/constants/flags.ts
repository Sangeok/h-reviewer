import "server-only";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const PRO_UPGRADE_ENABLED = TRUE_VALUES.has((process.env.PRO_UPGRADE_ENABLED ?? "").trim().toLowerCase());

export const FREE_REVIEW_TRIAL_ENABLED = TRUE_VALUES.has(
  (process.env.FREE_REVIEW_TRIAL_ENABLED ?? "").trim().toLowerCase(),
);
