import { useEffect, useState } from 'react';
import { normalizeLook, type Look } from '../shared/look';

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
    applyLook(normalizeLook(saved ? JSON.parse(saved) : undefined));
  } catch {
    applyLook(normalizeLook(undefined));
  }
}

/**
 * Whether Carrel is in dark mode right now. The Mode setting decides what
 * prefers-color-scheme reports, so this follows it as well as the system.
 */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return dark;
}
