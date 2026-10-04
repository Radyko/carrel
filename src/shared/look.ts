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
  { id: 'linen', name: 'Linen', swatch: ['#faf6ee', '#211f1b'] },
  { id: 'paper', name: 'Paper', swatch: ['#ffffff', '#1e1e1f'] },
  { id: 'sepia', name: 'Sepia', swatch: ['#f3ead7', '#26211a'] },
  { id: 'mist', name: 'Mist', swatch: ['#f5f7fa', '#1b1e23'] },
  { id: 'sage', name: 'Sage', swatch: ['#f3f5ef', '#1c201c'] },
];

export interface Accent {
  name: string;
  color: string;
}

// Deep, muted colours, the kind found on college crests, cloth bindings and
// old maps. The colour wheel in Settings is there for anything brighter.
export const ACCENTS: Accent[] = [
  { name: 'Yale blue', color: '#00356b' },
  { name: 'Slate', color: '#3d5a80' },
  { name: 'Deep teal', color: '#1f5c63' },
  { name: 'Forest', color: '#2f5a43' },
  { name: 'Old gold', color: '#8a6a1f' },
  { name: 'Rust', color: '#9a4a26' },
  { name: 'Cardinal', color: '#8c1d2b' },
  { name: 'Oxblood', color: '#5e1f2a' },
  { name: 'Plum', color: '#57385f' },
  { name: 'Walnut', color: '#5f4632' },
  { name: 'Graphite', color: '#454a52' },
];

export const DEFAULT_TONE = 'linen';
/** The default before 0.5. People who never picked a background move to the new default. */
export const OLD_DEFAULT_TONE = 'paper';
export const DEFAULT_ACCENT = '#00356b';
/** The default before 0.5. People who never picked an accent move to the new default. */
export const OLD_DEFAULT_ACCENT = '#2e7d5b';

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


/**
 * The saved look. Before 0.5 the look was always saved, so a value other than
 * that version's default means someone chose it; people who never chose follow
 * the current defaults.
 */
export function savedLook(
  data: Partial<Look> | undefined,
  chosen: { tone?: unknown; accent?: unknown } = {},
): { look: Look; toneChosen: boolean; accentChosen: boolean } {
  const look = normalizeLook(data);
  const toneChosen = chosen.tone === true || (isTone(data?.tone) && look.tone !== OLD_DEFAULT_TONE);
  const accentChosen = chosen.accent === true || (isColor(data?.accent) && look.accent !== OLD_DEFAULT_ACCENT);
  return {
    look: { tone: toneChosen ? look.tone : DEFAULT_TONE, accent: accentChosen ? look.accent : DEFAULT_ACCENT },
    toneChosen,
    accentChosen,
  };
}
