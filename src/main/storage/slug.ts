import { surname } from '../../shared/paper';

function slugWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A readable folder name such as 2007-keshav-how-to-read-a-paper. */
export function paperSlug(meta: { title?: string; authors?: string[]; year?: number | null }): string {
  const parts: string[] = [];
  if (meta.year) parts.push(String(meta.year));
  const author = meta.authors?.[0];
  if (author) parts.push(...slugWords(surname(author)).slice(0, 2));
  const title: string[] = [];
  for (const w of slugWords(meta.title ?? '')) {
    if (title.length >= 8 || [...title, w].join('-').length > 50) break;
    title.push(w);
  }
  parts.push(...title);
  return parts.join('-') || 'untitled';
}
