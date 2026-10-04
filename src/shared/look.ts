// The colours people can choose in Settings: a background tone and an accent.
// The CSS does the work (see styles.css): each tone is a set of light and dark
// colours, and every accent shade is derived from the one accent colour, with
// its lightness kept in a range that stays readable in light and dark mode.

export interface Tone {
  id: string;
  name: string;
  /** Swatch colours for Settings: [light, dark]. */
  swatch: [string, string];
}

export const TONES: Tone[] = [
  { id: 'paper', name: 'Paper', swatch: ['#ffffff', '#1e1e1f'] },
  { id: 'linen', name: 'Linen', swatch: ['#faf6ee', '#211f1b'] },
  { id: 'sepia', name: 'Sepia', swatch: ['#f3ead7', '#26211a'] },
  { id: 'mist', name: 'Mist', swatch: ['#f5f7fa', '#1b1e23'] },
  { id: 'sage', name: 'Sage', swatch: ['#f3f5ef', '#1c201c'] },
];

export interface Accent {
  name: string;
  color: string;
}

export const ACCENTS: Accent[] = [
  { name: 'Blue', color: '#2f6fdf' },
  { name: 'Indigo', color: '#5b5bd6' },
  { name: 'Violet', color: '#8e4ec6' },
  { name: 'Rose', color: '#d23f7c' },
  { name: 'Red', color: '#d93f3f' },
  { name: 'Orange', color: '#dd6a1f' },
  { name: 'Amber', color: '#c08a14' },
  { name: 'Green', color: '#2e7d5b' },
  { name: 'Teal', color: '#11847d' },
  { name: 'Graphite', color: '#5f6368' },
];

export const DEFAULT_TONE = 'paper';
export const DEFAULT_ACCENT = '#2e7d5b';

export interface Look {
  tone: string;
  accent: string;
}

export function isTone(id: unknown): id is string {
  return typeof id === 'string' && TONES.some((t) => t.id === id);
}

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeLook(data: Partial<Look> | undefined): Look {
  return {
    tone: isTone(data?.tone) ? data.tone : DEFAULT_TONE,
    accent: isColor(data?.accent) ? data.accent.toLowerCase() : DEFAULT_ACCENT,
  };
}

