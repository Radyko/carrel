// The structured details of a paper, as stored in the front matter of its
// notes.md file. Keys in the file are snake_case; in code they are camelCase.

import { STATUSES, type Status } from './guide';

export interface PaperMeta {
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  link: string;
  topics: string[];
  course: string;
  status: Status;
  /** Furthest pass reached: 0 (not started) to the number of the last pass. */
  furthestPass: number;
  /** Decision made after each pass, by stage id. */
  decisions: Record<string, string>;
  rating: number | null;
  /** Date added, YYYY-MM-DD. */
  added: string | null;
  /** Local date and time last worked on, YYYY-MM-DDTHH:MM. */
  lastWorked: string | null;
  /** Seconds spent on each pass, by stage id. */
  timeSpent: Record<string, number>;
  lastPage: number | null;
  /** Reading purpose (a purpose option id). */
  purpose: string | null;
  /** Ticked checklist steps, by stage id. */
  checklist: Record<string, string[]>;
  /** Date the next review is due, YYYY-MM-DD, or null when not scheduled. */
  nextReview: string | null;
  /** Review interval reached, in days. */
  reviewInterval: number | null;
}

export const META_KEYS: Record<keyof PaperMeta, string> = {
  title: 'title',
  authors: 'authors',
  year: 'year',
  venue: 'venue',
  link: 'link',
  topics: 'topics',
  course: 'course',
  status: 'status',
  furthestPass: 'furthest_pass',
  decisions: 'decisions',
  rating: 'rating',
  added: 'added',
  lastWorked: 'last_worked',
  timeSpent: 'time_spent_seconds',
  lastPage: 'last_page',
  purpose: 'purpose',
  checklist: 'checklist',
  nextReview: 'next_review',
  reviewInterval: 'review_interval',
};

export const META_ORDER = Object.keys(META_KEYS) as (keyof PaperMeta)[];

export function emptyMeta(): PaperMeta {
  return {
    title: '',
    authors: [],
    year: null,
    venue: '',
    link: '',
    topics: [],
    course: '',
    status: 'to-read',
    furthestPass: 0,
    decisions: {},
    rating: null,
    added: null,
    lastWorked: null,
    timeSpent: {},
    lastPage: null,
    purpose: null,
    checklist: {},
    nextReview: null,
    reviewInterval: null,
  };
}

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function textList(v: unknown, split: RegExp): string[] {
  if (v === null || v === undefined) return [];
  const items = Array.isArray(v) ? v.map(text) : text(v).split(split);
  return items.map((s) => s.trim()).filter(Boolean);
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.round(n) : null;
}

function dateOrNull(v: unknown): string | null {
  const s = text(v);
  return s ? s : null;
}

function record<T>(v: unknown, convert: (x: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) {
      const c = convert(x);
      if (c !== null) out[k] = c;
    }
  }
  return out;
}

/** Reads front matter leniently: hand-edited files should still load. */
export function metaFromFrontMatter(data: Record<string, unknown>): PaperMeta {
  const m = emptyMeta();
  const get = (k: keyof PaperMeta) => data[META_KEYS[k]];
  m.title = text(get('title'));
  m.authors = textList(get('authors'), /\s*;\s*|\s+and\s+/);
  m.year = intOrNull(get('year'));
  m.venue = text(get('venue'));
  m.link = text(get('link'));
  m.topics = textList(get('topics'), /\s*,\s*/);
  m.course = text(get('course'));
  const status = text(get('status'));
  m.status = (STATUSES as readonly string[]).includes(status) ? (status as Status) : 'to-read';
  m.furthestPass = Math.max(0, intOrNull(get('furthestPass')) ?? 0);
  m.decisions = record(get('decisions'), (x) => text(x) || null);
  const rating = intOrNull(get('rating'));
  m.rating = rating !== null && rating >= 1 && rating <= 5 ? rating : null;
  m.added = dateOrNull(get('added'));
  m.lastWorked = dateOrNull(get('lastWorked'));
  m.timeSpent = record(get('timeSpent'), (x) => {
    const n = intOrNull(x);
    return n !== null && n >= 0 ? n : null;
  });
  m.lastPage = intOrNull(get('lastPage'));
  m.purpose = text(get('purpose')) || null;
  m.checklist = record(get('checklist'), (x) => textList(x, /\s*,\s*/));
  m.nextReview = dateOrNull(get('nextReview'));
  m.reviewInterval = intOrNull(get('reviewInterval'));
  return m;
}

/** The value written to the file for a field, or null to write an empty value. */
export function frontMatterValue<K extends keyof PaperMeta>(key: K, value: PaperMeta[K]): unknown {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length ? Object.fromEntries(entries) : {};
  }
  if (value === '' || value === undefined) return null;
  return value;
}

export function firstAuthor(meta: PaperMeta): string {
  return meta.authors[0] ?? '';
}

/** The last word of a name, ignoring initials-only names. */
export function surname(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, '').trim();
  if (cleaned.includes(',')) return cleaned.split(',')[0].trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export interface OtherNote {
  heading: string;
  text: string;
}

export interface ReviewEntry {
  heading: string;
  text: string;
}

/** A paper's full notes, as the reader sees them. */
export interface PaperDoc {
  id: string;
  folder: string;
  pdfFile: string | null;
  meta: PaperMeta;
  /** Answers by stage id, then field id. Markdown text. */
  answers: Record<string, Record<string, string>>;
  notes: string;
  reviews: ReviewEntry[];
  other: OtherNote[];
  /** Set when the file could not be understood; the paper is then read-only. */
  error: string | null;
}

/** What the library needs to list, filter, search, and preview a paper. */
export interface PaperSummary {
  id: string;
  folder: string;
  pdfFile: string | null;
  meta: PaperMeta;
  /** Summary answers by stage id, then field id. */
  summaries: Record<string, Record<string, string>>;
  /** All answers and notes, for search. */
  searchText: string;
  error: string | null;
}

export interface PaperPatch {
  meta?: Partial<PaperMeta>;
  answers?: Record<string, Record<string, string>>;
  notes?: string;
  appendReview?: ReviewEntry;
  /** Update last_worked. */
  touch?: boolean;
}

export interface NewPaperInput {
  meta: Partial<PaperMeta>;
  /** A PDF to copy into the library. */
  pdfPath?: string | null;
}
