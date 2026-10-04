// Structured answers are stored as plain markdown lists so they stay readable
// in any editor. Lines that are not list items are kept as extra text.

export interface CheckItem {
  done: boolean;
  text: string;
}

export interface Term {
  term: string;
  meaning: string;
}

export interface Parsed<T> {
  items: T[];
  /** Lines that were not list items, kept so nothing is lost. */
  extra: string;
}

const CHECK = /^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;

export function parseChecklist(text: string): Parsed<CheckItem> {
  const items: CheckItem[] = [];
  const extra: string[] = [];
  for (const line of text.split('\n')) {
    const c = CHECK.exec(line);
    const b = BULLET.exec(line);
    if (c) items.push({ done: c[1] !== ' ', text: c[2].trim() });
    else if (b) items.push({ done: false, text: b[1].trim() });
    else if (line.trim()) extra.push(line);
  }
  return { items, extra: extra.join('\n') };
}

export function formatChecklist(p: Parsed<CheckItem>): string {
  const lines = p.items
    .filter((i) => i.text.trim())
    .map((i) => `- [${i.done ? 'x' : ' '}] ${i.text.replace(/\s*\n\s*/g, ' ').trim()}`);
  return [lines.join('\n'), p.extra.trim()].filter(Boolean).join('\n\n');
}

const TERM = /^\s*[-*+]\s+\*\*(.+?)\*\*\s*[:—–-]?\s*(.*)$/;

export function parseTerms(text: string): Parsed<Term> {
  const items: Term[] = [];
  const extra: string[] = [];
  for (const line of text.split('\n')) {
    const t = TERM.exec(line);
    const b = BULLET.exec(line);
    if (t) items.push({ term: t[1].trim(), meaning: t[2].trim() });
    else if (b) {
      const i = b[1].indexOf(':');
      items.push(i > 0 ? { term: b[1].slice(0, i).trim(), meaning: b[1].slice(i + 1).trim() } : { term: b[1].trim(), meaning: '' });
    } else if (line.trim()) extra.push(line);
  }
  return { items, extra: extra.join('\n') };
}

export function formatTerms(p: Parsed<Term>): string {
  const clean = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
  const lines = p.items
    .filter((i) => i.term.trim() || i.meaning.trim())
    .map((i) => {
      const term = clean(i.term).replace(/\*\*/g, '') || '?';
      return i.meaning.trim() ? `- **${term}**: ${clean(i.meaning)}` : `- **${term}**`;
    });
  return [lines.join('\n'), p.extra.trim()].filter(Boolean).join('\n\n');
}
