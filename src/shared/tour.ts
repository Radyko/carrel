import type { ChecklistItem } from './guide';
import type { LandmarkKind, Landmarks, Region } from './landmarks';

// The guided survey: the checklist's steps, in order, each broken into stops
// (one page at a time) that light up what to read and dim the rest.

/** A lit part of a page; `tag` names it on the page ("Abstract"). */
export interface LitRegion extends Region {
  tag?: string;
}

export interface Stop {
  stepId: string;
  stepText: string;
  /** Which step this is, among the steps found in the PDF. */
  step: number;
  /** Which stop within its step, and how many the step has. */
  part: number;
  parts: number;
  lit: LitRegion[];
  hint: string;
  /** For section headings: the paper's outline, to read in the card. */
  outline: Region[] | null;
}

const HINTS: Record<LandmarkKind, string> = {
  title: 'What is it about?',
  abstract: 'What is it about, and what does it claim?',
  introduction: 'What problem does it tackle, and why does it matter?',
  conclusion: 'What do the authors say they showed?',
  headings: 'Read the outline: how is the paper put together?',
  figures: 'What does each figure or table show at a glance?',
  references: 'Which of these works do you already know?',
};

const TAGS: Partial<Record<LandmarkKind, string>> = {
  title: 'Title',
  abstract: 'Abstract',
  introduction: 'Introduction',
  conclusion: 'Conclusion',
  references: 'References',
};

export function buildStops(checklist: ChecklistItem[], landmarks: Landmarks): Stop[] {
  const stops: Stop[] = [];
  let step = 0;
  for (const c of checklist) {
    const parts: { kinds: LandmarkKind[]; lit: LitRegion[]; outline: Region[] | null }[] = [];
    // Headings are read as one outline, not page by page.
    if (c.spotlight.includes('headings') && landmarks.headings.length) {
      // Already in reading order, columns included.
      const outline = landmarks.headings;
      parts.push({ kinds: ['headings'], lit: outline, outline });
    }
    const pages = new Map<number, { kinds: LandmarkKind[]; lit: LitRegion[] }>();
    for (const kind of c.spotlight) {
      if (kind === 'headings') continue;
      for (const r of landmarks[kind]) {
        const page = pages.get(r.page) ?? { kinds: [], lit: [] };
        const first = !page.kinds.includes(kind);
        if (first) page.kinds.push(kind);
        page.lit.push(first && TAGS[kind] ? { ...r, tag: TAGS[kind] } : r);
        pages.set(r.page, page);
      }
    }
    for (const [, page] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
      parts.push({ ...page, outline: null });
    }
    if (!parts.length) continue;
    parts.forEach((p, i) => {
      const hints = [...new Set((p.kinds.includes('abstract') ? p.kinds.filter((k) => k !== 'title') : p.kinds).map((k) => HINTS[k]))];
      stops.push({ stepId: c.id, stepText: c.text, step, part: i, parts: parts.length, lit: p.lit, hint: hints.join(' '), outline: p.outline });
    });
    step++;
  }
  return stops;
}
