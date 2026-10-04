// Reads and writes notes.md: YAML front matter followed by a markdown body in
// which level-1 headings are stages and level-2 headings are questions.
//
// The parser keeps every byte of the original text. Parts the app changes are
// replaced; everything else (unknown headings, unknown front matter fields,
// comments, text before the first heading) is written back exactly as it was.

import YAML from 'yaml';
import { normalizeHeading } from '../../shared/guide';

export interface SubSection {
  heading: string;
  /** The heading line including its line break. */
  headingLine: string;
  /** Everything after the heading line up to the next heading. */
  raw: string;
}

export interface Section extends SubSection {
  subs: SubSection[];
}

export interface NotesFile {
  /** Text of the front matter between the --- lines, or null if there is none. */
  frontRaw: string | null;
  frontDoc: YAML.Document;
  frontError: string | null;
  frontDirty: boolean;
  /** Text before the first level-1 heading. */
  preamble: string;
  sections: Section[];
}

/** The headings the app knows, in the order the guide defines them. */
export interface NotesSchema {
  sections: { heading: string; fields: string[] }[];
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const H1 = /^ {0,3}# +(.*?)(?:\s+#+)?\s*$/;
const H2 = /^ {0,3}## +(.*?)(?:\s+#+)?\s*$/;

interface Fence {
  char: string;
  len: number;
}

function openFence(line: string): Fence | null {
  const m = FENCE_OPEN.exec(line);
  if (!m) return null;
  if (m[1][0] === '`' && m[2].includes('`')) return null;
  return { char: m[1][0], len: m[1].length };
}

function closesFence(line: string, fence: Fence): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return !!m && m[1][0] === fence.char && m[1].length >= fence.len;
}

function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function stripEol(line: string): string {
  return line.replace(/\r?\n$/, '');
}

export function parseNotes(input: string): NotesFile {
  let text = input.replace(/^﻿/, '');
  let frontRaw: string | null = null;

  const lines = splitLines(text);
  if (lines.length && stripEol(lines[0]) === '---') {
    for (let i = 1; i < lines.length; i++) {
      const l = stripEol(lines[i]).trimEnd();
      if (l === '---' || l === '...') {
        frontRaw = lines.slice(1, i).join('');
        text = lines.slice(i + 1).join('');
        break;
      }
    }
  }

  const frontDoc = YAML.parseDocument(frontRaw ?? '');
  let frontError: string | null = null;
  if (frontDoc.errors.length) {
    frontError = frontDoc.errors[0].message.split('\n')[0];
  } else if (frontDoc.contents !== null && !YAML.isMap(frontDoc.contents)) {
    frontError = 'The front matter is not a list of "key: value" fields.';
  }

  const file: NotesFile = { frontRaw, frontDoc, frontError, frontDirty: false, preamble: '', sections: [] };

  let fence: Fence | null = null;
  let current: SubSection | null = null;
  let section: Section | null = null;
  for (const line of splitLines(text)) {
    const bare = stripEol(line);
    if (fence) {
      if (closesFence(bare, fence)) fence = null;
    } else {
      const f = openFence(bare);
      if (f) {
        fence = f;
      } else {
        const h1 = H1.exec(bare);
        if (h1 && h1[1]) {
          section = { heading: h1[1], headingLine: line, raw: '', subs: [] };
          file.sections.push(section);
          current = section;
          continue;
        }
        const h2 = H2.exec(bare);
        if (h2 && h2[1] && section) {
          current = { heading: h2[1], headingLine: line, raw: '' };
          section.subs.push(current);
          continue;
        }
      }
    }
    if (current) current.raw += line;
    else file.preamble += line;
  }
  return file;
}

export function serializeNotes(file: NotesFile): string {
  let out = '';
  if (file.frontRaw !== null || file.frontDirty) {
    let front = file.frontDirty ? stringifyFront(file.frontDoc) : (file.frontRaw ?? '');
    if (front && !front.endsWith('\n')) front += '\n';
    out += `---\n${front}---\n`;
  }
  const add = (piece: string, isHeading: boolean) => {
    if (isHeading && out && !out.endsWith('\n')) out += '\n';
    out += piece;
  };
  add(file.preamble, false);
  for (const s of file.sections) {
    add(s.headingLine, true);
    add(s.raw, false);
    for (const sub of s.subs) {
      add(sub.headingLine, true);
      add(sub.raw, false);
    }
  }
  return out;
}

function stringifyFront(doc: YAML.Document): string {
  if (doc.contents === null) return '';
  return doc.toString({ lineWidth: 0, nullStr: '', flowCollectionPadding: false });
}

// ---------------------------------------------------------------------------
// Answer text. Lines that would read as a level-1 or level-2 heading, or open
// a code fence that never closes, are escaped with a backslash so an answer
// can never change the structure of the file. Escaping is reversed on read.

const ESCAPABLE = /^( {0,3})(\\*)(#{1,2}(?:[ \t]|$)|`{3,}|~{3,})/;

function unclosedFenceLine(lines: string[]): number {
  let fence: Fence | null = null;
  let openedAt = -1;
  lines.forEach((line, i) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
    } else {
      const f = openFence(line);
      if (f) {
        fence = f;
        openedAt = i;
      }
    }
  });
  return fence ? openedAt : -1;
}

export function escapeAnswer(text: string): string {
  const lines = text.split('\n');
  const unclosed = unclosedFenceLine(lines);
  let fence: Fence | null = null;
  return lines
    .map((line, i) => {
      if (fence) {
        if (closesFence(line, fence)) fence = null;
        return line;
      }
      const m = ESCAPABLE.exec(line);
      if (!m) return line;
      const isFence = !m[2] && /^[`~]/.test(m[3]);
      if (isFence && i !== unclosed) {
        fence = openFence(line);
        return line;
      }
      return `${m[1]}\\${line.slice(m[1].length)}`;
    })
    .join('\n');
}

export function unescapeAnswer(text: string): string {
  let fence: Fence | null = null;
  return text
    .split('\n')
    .map((line) => {
      if (fence) {
        if (closesFence(line, fence)) fence = null;
        return line;
      }
      const f = openFence(line);
      if (f) {
        fence = f;
        return line;
      }
      const m = ESCAPABLE.exec(line);
      if (m && m[2]) return `${m[1]}${line.slice(m[1].length + 1)}`;
      return line;
    })
    .join('\n');
}

/** Answers are compared and stored without surrounding blank lines. */
export function normalizeValue(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/^\s*\n/, '').trimEnd();
}

function rawToValue(raw: string): string {
  return unescapeAnswer(normalizeValue(raw));
}

function valueToRaw(value: string): string {
  const v = normalizeValue(value);
  return v ? `\n${escapeAnswer(v)}\n\n` : '\n';
}

// ---------------------------------------------------------------------------
// Finding and placing headings.

function same(a: string, b: string): boolean {
  return normalizeHeading(a) === normalizeHeading(b);
}

export function findSection(file: NotesFile, heading: string): Section | undefined {
  return file.sections.find((s) => same(s.heading, heading));
}

function findSub(section: Section, heading: string): SubSection | undefined {
  return section.subs.find((s) => same(s.heading, heading));
}

/** Index at which to insert an item so known items stay in schema order. */
function insertIndex(existing: string[], order: string[], heading: string): number {
  const rank = (h: string) => order.findIndex((o) => same(o, h));
  const k = rank(heading);
  if (k < 0) return existing.length;
  let after = -1;
  existing.forEach((h, i) => {
    const r = rank(h);
    if (r >= 0 && r < k) after = i;
  });
  if (after >= 0) return after + 1;
  const before = existing.findIndex((h) => rank(h) > k);
  return before >= 0 ? before : existing.length;
}

/** Makes sure text before a new heading ends with a blank line, for readability. */
function padBefore(node: { raw: string } | undefined): void {
  if (node && node.raw.trim() && !node.raw.endsWith('\n\n')) node.raw += node.raw.endsWith('\n') ? '\n' : '\n\n';
}

function lastNodeOf(section: Section): SubSection {
  return section.subs.length ? section.subs[section.subs.length - 1] : section;
}

function ensureSection(file: NotesFile, heading: string, schema: NotesSchema): Section {
  const found = findSection(file, heading);
  if (found) return found;
  const section: Section = { heading, headingLine: `# ${heading}\n`, raw: '\n', subs: [] };
  const order = schema.sections.map((s) => s.heading);
  const at = insertIndex(file.sections.map((s) => s.heading), order, heading);
  if (at > 0) padBefore(lastNodeOf(file.sections[at - 1]));
  else if (file.preamble.trim()) {
    const p = { raw: file.preamble };
    padBefore(p);
    file.preamble = p.raw;
  }
  file.sections.splice(at, 0, section);
  return section;
}

function ensureSub(file: NotesFile, sectionHeading: string, heading: string, schema: NotesSchema): SubSection {
  const section = ensureSection(file, sectionHeading, schema);
  const found = findSub(section, heading);
  if (found) return found;
  const sub: SubSection = { heading, headingLine: `## ${heading}\n`, raw: '\n' };
  const order = schema.sections.find((s) => same(s.heading, sectionHeading))?.fields ?? [];
  const at = insertIndex(section.subs.map((s) => s.heading), order, heading);
  padBefore(at > 0 ? section.subs[at - 1] : section);
  section.subs.splice(at, 0, sub);
  return sub;
}

export function getAnswer(file: NotesFile, sectionHeading: string, heading: string): string | undefined {
  const section = findSection(file, sectionHeading);
  const sub = section && findSub(section, heading);
  return sub ? rawToValue(sub.raw) : undefined;
}

export function setAnswer(
  file: NotesFile,
  sectionHeading: string,
  heading: string,
  value: string,
  schema: NotesSchema,
): void {
  const sub = ensureSub(file, sectionHeading, heading, schema);
  if (rawToValue(sub.raw) !== normalizeValue(value)) sub.raw = valueToRaw(value);
}

/** Text directly under a level-1 heading, before any level-2 heading. */
export function getSectionText(file: NotesFile, heading: string): string | undefined {
  const s = findSection(file, heading);
  return s ? rawToValue(s.raw) : undefined;
}

export function setSectionText(file: NotesFile, heading: string, value: string, schema: NotesSchema): void {
  const s = ensureSection(file, heading, schema);
  if (rawToValue(s.raw) !== normalizeValue(value)) s.raw = valueToRaw(value);
}

/** Appends a new level-2 heading with text at the end of a section. */
export function appendSub(
  file: NotesFile,
  sectionHeading: string,
  heading: string,
  value: string,
  schema: NotesSchema,
): void {
  const section = ensureSection(file, sectionHeading, schema);
  padBefore(lastNodeOf(section));
  section.subs.push({ heading, headingLine: `## ${heading.replace(/\n/g, ' ')}\n`, raw: valueToRaw(value) });
}

export function subsOf(file: NotesFile, sectionHeading: string): { heading: string; text: string }[] {
  const s = findSection(file, sectionHeading);
  return s ? s.subs.map((sub) => ({ heading: sub.heading, text: rawToValue(sub.raw) })) : [];
}

// ---------------------------------------------------------------------------
// Front matter.

export function readFront(file: NotesFile): Record<string, unknown> {
  if (file.frontError) return {};
  const js = file.frontDoc.toJS();
  return js && typeof js === 'object' && !Array.isArray(js) ? (js as Record<string, unknown>) : {};
}

const FLOW_KEYS = new Set(['authors', 'topics']);

/** Sets front matter fields. Unknown fields and comments are left untouched. */
export function setFront(file: NotesFile, values: Record<string, unknown>): void {
  if (file.frontError) throw new Error(`The front matter of this notes file is invalid: ${file.frontError}`);
  const doc = file.frontDoc;
  if (doc.contents === null) doc.contents = doc.createNode({});
  for (const [key, value] of Object.entries(values)) {
    const current = doc.get(key, true);
    const currentJs = YAML.isNode(current) ? current.toJS(doc) : current;
    if (doc.has(key) && JSON.stringify(currentJs ?? null) === JSON.stringify(value ?? null)) continue;
    const node: YAML.Node = doc.createNode(value ?? null, { flow: FLOW_KEYS.has(key) });
    if (YAML.isMap(node) && !FLOW_KEYS.has(key)) {
      // Lists inside maps read best inline: pass1: [abstract, figures].
      for (const item of node.items) if (YAML.isSeq(item.value)) item.value.flow = true;
      if (node.items.length === 0) node.flow = true;
    }
    if (YAML.isScalar(current) || YAML.isCollection(current)) {
      // Keep any comment attached to the old value.
      node.comment = current.comment;
      node.commentBefore = current.commentBefore;
    }
    doc.set(key, node);
    file.frontDirty = true;
  }
}
