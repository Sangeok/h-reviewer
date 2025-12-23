type FormatDistanceToNowOptions = {
  addSuffix?: boolean;
};

export function formatDistanceToNow(date: Date, options: FormatDistanceToNowOptions = {}): string {
  const { addSuffix = false } = options;

  const targetMs = date.getTime();
  if (Number.isNaN(targetMs)) return "";

  const diffSec = Math.floor((targetMs - Date.now()) / 1000); // +면 미래, -면 과거
  const absSec = Math.abs(diffSec);

  if (absSec < 5) return addSuffix ? "just now" : "now";

  const MIN = 60;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  let value: number;
  let unit: "second" | "minute" | "hour" | "day" | "month" | "year";

  if (absSec < MIN) {
    value = absSec;
    unit = "second";
  } else if (absSec < HOUR) {
    value = Math.floor(absSec / MIN);
    unit = "minute";
  } else if (absSec < DAY) {
    value = Math.floor(absSec / HOUR);
    unit = "hour";
  } else if (absSec < MONTH) {
    value = Math.floor(absSec / DAY);
    unit = "day";
  } else if (absSec < YEAR) {
    value = Math.floor(absSec / MONTH);
    unit = "month";
  } else {
    value = Math.floor(absSec / YEAR);
    unit = "year";
  }

  value = Math.max(1, value);
  const label = value === 1 ? unit : `${unit}s`;
  const core = `${value} ${label}`;

  if (!addSuffix) return core;
  return diffSec < 0 ? `${core} ago` : `in ${core}`;
}
