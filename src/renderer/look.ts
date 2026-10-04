import { DEFAULT_ACCENT, DEFAULT_TONE, normalizeLook, type Look } from '../shared/look';

const KEY = 'carrel.look';

/** Puts the look on the page: the tone as data-tone, the accent as --accent-base. */
export function applyLook(look: Look): void {
  const root = document.documentElement;
  root.dataset.tone = look.tone;
  root.style.setProperty('--accent-base', look.accent);
}

/** Remembers the look in this window so the next start paints in it straight away. */
export function rememberLook(look: Look): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    /* only saves a flash of the default colours */
  }
}

export function applyRememberedLook(): void {
  try {
    const saved = localStorage.getItem(KEY);
    applyLook(saved ? normalizeLook(JSON.parse(saved)) : { tone: DEFAULT_TONE, accent: DEFAULT_ACCENT });
  } catch {
    applyLook({ tone: DEFAULT_TONE, accent: DEFAULT_ACCENT });
  }
}
