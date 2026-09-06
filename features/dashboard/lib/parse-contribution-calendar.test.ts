import { describe, expect, it } from "vitest";

import { parseContributionCalendar } from "./parse-contribution-calendar";

function calendarWithDay(
  day: Record<string, unknown>,
  totalContributions?: unknown,
): Record<string, unknown> {
  return {
    weeks: [{ contributionDays: [day] }],
    ...(totalContributions === undefined ? {} : { totalContributions }),
  };
}

describe("parseContributionCalendar", () => {
  it("accepts empty and ordered week grids", () => {
    expect(parseContributionCalendar({ weeks: [] })).toStrictEqual({
      weeks: [],
      totalContributions: 0,
    });

    expect(
      parseContributionCalendar({
        weeks: [
          {
            contributionDays: [
              { date: "2026-09-01", contributionCount: 1, contributionLevel: "FIRST_QUARTILE" },
              { date: "2026-09-02", contributionCount: 2 },
            ],
          },
          { contributionDays: [] },
          {
            contributionDays: [
              { date: "2026-09-03", contributionCount: 3.5, contributionLevel: "UNKNOWN" },
            ],
          },
        ],
      }),
    ).toStrictEqual({
      weeks: [
        {
          contributionDays: [
            { date: "2026-09-01", contributionCount: 1, contributionLevel: "FIRST_QUARTILE" },
            { date: "2026-09-02", contributionCount: 2 },
          ],
        },
        { contributionDays: [] },
        {
          contributionDays: [
            { date: "2026-09-03", contributionCount: 3.5, contributionLevel: "UNKNOWN" },
          ],
        },
      ],
      totalContributions: 6.5,
    });
  });

  it.each([0, -4, 2.5])("preserves finite totalContributions %s", (totalContributions) => {
    expect(
      parseContributionCalendar(
        calendarWithDay(
          { date: "2026-09-01", contributionCount: 7 },
          totalContributions,
        ),
      ),
    ).toMatchObject({ totalContributions });
  });

  it.each([null, "7", Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to the day sum for invalid total %s",
    (totalContributions) => {
      expect(
        parseContributionCalendar(
          calendarWithDay(
            { date: "2026-09-01", contributionCount: -1.5 },
            totalContributions,
          ),
        ),
      ).toMatchObject({ totalContributions: -1.5 });
    },
  );

  it.each([
    [undefined, {}],
    [null, {}],
    [3, {}],
    ["", { contributionLevel: "" }],
    ["ARBITRARY", { contributionLevel: "ARBITRARY" }],
  ] as const)("normalizes contributionLevel %s", (contributionLevel, expectedLevel) => {
    const parsed = parseContributionCalendar(
      calendarWithDay({
        date: "2026-09-01",
        contributionCount: 1,
        ...(contributionLevel === undefined ? {} : { contributionLevel }),
      }),
    );

    expect(parsed?.weeks[0].contributionDays[0]).toStrictEqual({
      date: "2026-09-01",
      contributionCount: 1,
      ...expectedLevel,
    });
  });

  it("removes unknown fields while preserving negative and fractional counts", () => {
    expect(
      parseContributionCalendar({
        weeks: [{
          ignoredWeekField: true,
          contributionDays: [{
            date: "2026-09-01",
            contributionCount: -0.5,
            ignoredDayField: true,
          }],
        }],
        ignoredCalendarField: true,
      }),
    ).toStrictEqual({
      weeks: [{
        contributionDays: [{ date: "2026-09-01", contributionCount: -0.5 }],
      }],
      totalContributions: -0.5,
    });
  });

  it.each([
    null,
    undefined,
    [],
    {},
    { weeks: null },
    { weeks: [null] },
    { weeks: [{}] },
    { weeks: [{ contributionDays: null }] },
    { weeks: [{ contributionDays: [null] }] },
    calendarWithDay({ contributionCount: 1 }),
    calendarWithDay({ date: 123, contributionCount: 1 }),
    calendarWithDay({ date: "2026-09-01" }),
    calendarWithDay({ date: "2026-09-01", contributionCount: null }),
    calendarWithDay({ date: "2026-09-01", contributionCount: "1" }),
    calendarWithDay({ date: "2026-09-01", contributionCount: Number.NaN }),
    calendarWithDay({ date: "2026-09-01", contributionCount: Number.POSITIVE_INFINITY }),
    calendarWithDay({ date: "2026-09-01", contributionCount: Number.NEGATIVE_INFINITY }),
    {
      weeks: [{
        contributionDays: [
          { date: "2026-09-01", contributionCount: 1 },
          { date: "2026-09-02", contributionCount: "2" },
        ],
      }],
    },
  ])("rejects an invalid grid without partial recovery", (input) => {
    expect(parseContributionCalendar(input)).toBeNull();
  });
});
