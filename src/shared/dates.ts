// Dates are stored as local calendar dates (YYYY-MM-DD) so they read
// naturally in the notes file and do not shift with time zones.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localDateTime(d: Date = new Date()): string {
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function isDate(s: string | null | undefined): s is string {
  return !!s && DATE_RE.test(s);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const pa = DATE_RE.exec(a);
  const pb = DATE_RE.exec(b);
  if (!pa || !pb) return 0;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / 86_400_000);
}
