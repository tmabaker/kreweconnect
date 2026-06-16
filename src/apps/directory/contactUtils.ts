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

/** "MM/DD" for a Graph date, or null when unset/invalid. */
export function monthDay(iso: string | null | undefined): string | null {
  const d = parseGraphDate(iso);
  if (!d) return null;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

/** Whole years since the date (e.g. years of service), or null when unset. */
export function yearsSince(iso: string | null | undefined): number | null {
  const d = parseGraphDate(iso);
  if (!d) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 0 ? years : null;
}
