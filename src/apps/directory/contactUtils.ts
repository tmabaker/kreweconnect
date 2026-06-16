/**
 * Helpers for directory contact actions and date display.
 */

/** Deep link that opens a 1:1 Teams chat with the given user. */
export function teamsChatLink(email: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`;
}

/** tel: link, stripping spaces/formatting but keeping a leading +. */
export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * Parse a Graph date, treating unset sentinels (year <= 1604) and invalid
 * values as "no date". Graph returns 0001-01-01 / 1604-01-01 for unset fields.
 */
function parseGraphDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() <= 1604) return null;
  return d;
}

/** Sentinel an employee can set to opt out of sharing their birthday MM/DD. */
export const MONTH_DAY_OPT_OUT = "12/31";

/**
 * Normalize a birthday/anniversary value to "MM/DD".
 * Accepts either a bare "M/D" | "MM-DD" string (custom extension attribute,
 * year omitted for privacy) or a full ISO date (standard Graph property).
 * Returns null when unset/invalid.
 */
export function monthDay(value: string | null | undefined): string | null {
  if (!value) return null;

  // Bare month/day string, e.g. "7/23", "07-23", "07.23"
  const md = value.trim().match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (md) {
    const m = Number(md[1]);
    const d = Number(md[2]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
  }

  // Otherwise treat as a full date.
  const date = parseGraphDate(value);
  if (!date) return null;
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

/** Display value for a birthday: MM/DD, or null when unset or opted out (12/31). */
export function birthdayDisplay(value: string | null | undefined): string | null {
  const md = monthDay(value);
  return md && md !== MONTH_DAY_OPT_OUT ? md : null;
}

/** Whole years since the date (e.g. years of service), or null when unset. */
export function yearsSince(iso: string | null | undefined): number | null {
  const d = parseGraphDate(iso);
  if (!d) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 0 ? years : null;
}
