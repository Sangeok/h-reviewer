import { z } from "zod";

import type { ContributionCalendar } from "../types";

const contributionDaySchema = z
  .object({
    date: z.string(),
    contributionCount: z.number().finite(),
    contributionLevel: z.unknown(),
  })
  .transform(({ date, contributionCount, contributionLevel }) =>
    typeof contributionLevel === "string"
      ? { date, contributionCount, contributionLevel }
      : { date, contributionCount },
  );

const contributionCalendarSchema = z.object({
  weeks: z.array(
    z.object({
      contributionDays: z.array(contributionDaySchema),
    }),
  ),
  totalContributions: z.unknown(),
});

export function parseContributionCalendar(
  value: unknown,
): ContributionCalendar | null {
  const parsed = contributionCalendarSchema.safeParse(value);
  if (!parsed.success) return null;

  const { weeks, totalContributions } = parsed.data;
  return {
    weeks,
    totalContributions:
      typeof totalContributions === "number" &&
      Number.isFinite(totalContributions)
        ? totalContributions
        : weeks.reduce(
            (sum, week) =>
              sum +
              week.contributionDays.reduce(
                (weekSum, day) => weekSum + day.contributionCount,
                0,
              ),
            0,
          ),
  };
}
