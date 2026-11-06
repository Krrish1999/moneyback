/** Dates are stored as ISO strings in UTC and shown in Asia/Kolkata (CLAUDE.md). */
export const DISPLAY_TIME_ZONE = "Asia/Kolkata";

/** Today's calendar date in India as YYYY-MM-DD (en-CA formats dates that way). */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(now);
}

/** A calendar date (YYYY-MM-DD, already an India date per the deadline engine). Formatted as-is, no zone shift. */
export function formatCalendarDate(isoDate: string, language: string): string {
  return new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatDisplayDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "long",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(iso));
}
