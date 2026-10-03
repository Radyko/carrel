const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const fullFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function parseLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}

/** Today, Yesterday, 3 Oct, or 3 Oct 2025. */
export function friendlyDate(s: string | null, today = new Date()): string {
  if (!s) return '';
  const d = parseLocal(s);
  if (!d) return s;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days === -1) return 'Tomorrow';
  return d.getFullYear() === today.getFullYear() ? dayFormat.format(d) : fullFormat.format(d);
}

export function fullDate(s: string | null): string {
  if (!s) return '';
  const d = parseLocal(s);
  return d ? fullFormat.format(d) : s;
}

/** 0:42, 12:05, 1:02:09 */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 7 min, 1 h 20 min */
export function duration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return seconds > 0 ? 'under a minute' : '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function splitList(text: string): string[] {
  return text
    .split(/\s*[,;]\s*|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function stars(rating: number | null): string {
  return rating ? '★'.repeat(rating) : '';
}
