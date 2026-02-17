const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const PRO_UPGRADE_ENABLED = TRUE_VALUES.has((process.env.PRO_UPGRADE_ENABLED ?? "").trim().toLowerCase());
