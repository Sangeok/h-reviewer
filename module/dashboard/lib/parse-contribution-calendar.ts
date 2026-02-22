import type { ContributionCalendar, ContributionDay, ContributionWeek } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseContributionDay(value: unknown): ContributionDay | null {
  if (!isRecord(value)) {
    return null;
  }

  const date = value["date"];
  const contributionCount = value["contributionCount"];
  const contributionLevel = value["contributionLevel"];

  if (typeof date !== "string" || typeof contributionCount !== "number" || !Number.isFinite(contributionCount)) {
    return null;
  }

  if (typeof contributionLevel === "string") {
    return { date, contributionCount, contributionLevel };
  }

  return { date, contributionCount };
}

function parseContributionWeek(value: unknown): ContributionWeek | null {
  if (!isRecord(value)) {
    return null;
  }

  const contributionDays = value["contributionDays"];
  if (!Array.isArray(contributionDays)) {
    return null;
  }

  const parsedDays: ContributionDay[] = [];
  for (const day of contributionDays) {
    const parsedDay = parseContributionDay(day);
    if (!parsedDay) {
      return null;
    }

    parsedDays.push(parsedDay);
  }

  return { contributionDays: parsedDays };
}

export function parseContributionCalendar(value: unknown): ContributionCalendar | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawWeeks = value["weeks"];
  if (!Array.isArray(rawWeeks)) {
    return null;
  }

  const weeks: ContributionWeek[] = [];
  for (const week of rawWeeks) {
    const parsedWeek = parseContributionWeek(week);
    if (!parsedWeek) {
      return null;
    }

    weeks.push(parsedWeek);
  }

  const totalContributionsValue = value["totalContributions"];
  const totalContributions =
    typeof totalContributionsValue === "number" && Number.isFinite(totalContributionsValue)
      ? totalContributionsValue
      : weeks.reduce(
          (sum, week) => sum + week.contributionDays.reduce((weekSum, day) => weekSum + day.contributionCount, 0),
          0,
        );

  return {
    weeks,
    totalContributions,
  };
}
