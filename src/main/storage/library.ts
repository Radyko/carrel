// The library is a folder of paper folders, each holding a PDF and notes.md.
// There is no database: the folder is scanned whenever the app needs the list.

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { allStages, normalizeHeading, stageFields, summaryFields, type Guide } from '../../shared/guide';
import { localDate, localDateTime } from '../../shared/dates';
import {
  META_KEYS,
  META_ORDER,
  distinctNames,
  emptyMeta,
  frontMatterValue,
  metaFromFrontMatter,
  type NewPaperInput,
  type OtherNote,
  type PaperDoc,
  type PaperMeta,
  type PaperPatch,
  type PaperSummary,
} from '../../shared/paper';
import { parseHighlights } from '../../shared/highlights';
import { exists, readTextIfExists, writeFileAtomic } from './files';
import {
  appendSub,
  deleteFront,
  getAnswer,
  getSectionText,
  parseNotes,
  readFront,
  serializeNotes,
  setAnswer,
  setFront,
  setSectionText,
  subsOf,
  type NotesFile,
  type NotesSchema,
} from './notesFile';
import { paperSlug } from './slug';

export const NOTES_FILE = 'notes.md';
export const COLLECTIONS_FILE = 'collections.yaml';

const COLLECTIONS_HEADER = `# Collections in Carrel's sidebar, in order. Which papers belong to a
# collection is stored in each paper's notes.md (the \`collections\` field);
# this file remembers the names and their order, including empty collections.
`;

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
export const PDF_FILE = 'paper.pdf';

export function notesSchema(guide: Guide): NotesSchema {
  return {
    sections: [
      ...allStages(guide).map((s) => ({ heading: s.heading, fields: stageFields(s).map((f) => f.heading) })),
      { heading: guide.highlightsHeading, fields: [] },
      { heading: guide.notesHeading, fields: [] },
      { heading: guide.reviewsHeading, fields: [] },
    ],
  };
}

function titleFromFolder(id: string): string {
  return id.replace(/[-_]+/g, ' ').trim();
}

function otherNotes(file: NotesFile, guide: Guide): OtherNote[] {
  const other: OtherNote[] = [];
  const preamble = file.preamble.trim();
  if (preamble) other.push({ heading: 'Before the first heading', text: preamble });
  const stages = new Map(allStages(guide).map((s) => [normalizeHeading(s.heading), s]));
  const notes = normalizeHeading(guide.notesHeading);
  const reviews = normalizeHeading(guide.reviewsHeading);
  const highlights = normalizeHeading(guide.highlightsHeading);
  for (const section of file.sections) {
    const key = normalizeHeading(section.heading);
    if (key === reviews || (key === highlights && !section.subs.length)) continue;
    const stage = stages.get(key);
    if (!stage && key !== notes) {
      const parts = [section.raw.trim(), ...section.subs.map((s) => `## ${s.heading}\n\n${s.raw.trim()}`.trim())];
      other.push({ heading: section.heading, text: parts.filter(Boolean).join('\n\n') });
      continue;
    }
    if (stage && section.raw.trim()) other.push({ heading: section.heading, text: section.raw.trim() });
    const known = new Set(stage ? stageFields(stage).map((f) => normalizeHeading(f.heading)) : []);
    for (const sub of section.subs) {
      if (!known.has(normalizeHeading(sub.heading)) && sub.raw.trim()) {
        other.push({ heading: `${section.heading} › ${sub.heading}`, text: sub.raw.trim() });
      }
    }
  }
  return other;
}

function readAnswers(file: NotesFile, guide: Guide): Record<string, Record<string, string>> {
  const answers: Record<string, Record<string, string>> = {};
  for (const stage of allStages(guide)) {
    answers[stage.id] = {};
    for (const f of stageFields(stage)) answers[stage.id][f.id] = getAnswer(file, stage.heading, f.heading) ?? '';
  }
  return answers;
}

export class Library {
  private queues = new Map<string, Promise<unknown>>();

  constructor(
    readonly root: string,
    private now: () => Date = () => new Date(),
  ) {}

  get papersDir(): string {
    return path.join(this.root, 'papers');
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.papersDir, { recursive: true });
  }

  folderOf(id: string): string {
    if (!id || id.startsWith('.') || /[/\\]/.test(id) || id.includes('\0')) {
      throw new Error(`Not a paper id: ${id}`);
    }
    return path.join(this.papersDir, id);
  }

  async findPdf(id: string): Promise<string | null> {
    const folder = this.folderOf(id);
    let names: string[];
    try {
      names = await fs.readdir(folder);
    } catch {
      return null;
    }
    if (names.includes(PDF_FILE)) return PDF_FILE;
    return names.filter((n) => n.toLowerCase().endsWith('.pdf') && !n.startsWith('.')).sort()[0] ?? null;
  }

  async scan(guide: Guide): Promise<PaperSummary[]> {
    await this.ensure();
    const entries = await fs.readdir(this.papersDir, { withFileTypes: true });
    const folders = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
    const results = await Promise.all(
      folders.map(async (id) => {
        try {
          const doc = await this.read(id, guide);
          if (!doc.pdfFile && !(await exists(path.join(doc.folder, NOTES_FILE)))) return null;
          return summarize(doc, guide);
        } catch {
          return null;
        }
      }),
    );
    return results.filter((r): r is PaperSummary => r !== null);
  }

  async read(id: string, guide: Guide): Promise<PaperDoc> {
    const folder = this.folderOf(id);
    const text = await readTextIfExists(path.join(folder, NOTES_FILE));
    const pdfFile = await this.findPdf(id);
    if (text === null && !(await exists(folder))) throw new Error(`There is no paper folder named ${id}.`);
    const file = parseNotes(text ?? '');
    return this.toDoc(id, folder, pdfFile, file, guide);
  }

  private toDoc(id: string, folder: string, pdfFile: string | null, file: NotesFile, guide: Guide): PaperDoc {
    const meta = metaFromFrontMatter(readFront(file));
    if (!meta.title) meta.title = titleFromFolder(id);
    return {
      id,
      folder,
      pdfFile,
      meta,
      answers: readAnswers(file, guide),
      notes: getSectionText(file, guide.notesHeading) ?? '',
      highlights: getSectionText(file, guide.highlightsHeading) ?? '',
      reviews: subsOf(file, guide.reviewsHeading),
      other: otherNotes(file, guide),
      error: file.frontError ? `The front matter of notes.md could not be read: ${file.frontError}` : null,
    };
  }

  /** Runs changes to one paper one at a time, so autosaves never interleave. */
  private serial<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(id) ?? Promise.resolve();
    const next = prev.then(task, task);
    const settled = next.catch(() => undefined);
    this.queues.set(id, settled);
    void settled.then(() => {
      if (this.queues.get(id) === settled) this.queues.delete(id);
    });
    return next;
  }

  /**
   * Applies a change to a paper. The file is read fresh from disk each time,
   * so edits made in another editor are kept unless this change touches them.
   */
  update(id: string, patch: PaperPatch, guide: Guide): Promise<PaperDoc> {
    return this.serial(id, async () => {
      const folder = this.folderOf(id);
      const notesPath = path.join(folder, NOTES_FILE);
      const original = await readTextIfExists(notesPath);
      if (original === null && !(await exists(folder))) throw new Error(`There is no paper folder named ${id}.`);
      const file = original === null ? this.skeleton({ title: titleFromFolder(id) }, guide) : parseNotes(original);
      if (file.frontError) {
        throw new Error(
          `Carrel did not save because the front matter of ${notesPath} is invalid (${file.frontError}). Fix it in a text editor and Carrel will pick it up.`,
        );
      }
      applyPatch(file, patch, guide, this.now());
      const text = serializeNotes(file);
      if (text !== original) await writeFileAtomic(notesPath, text);
      return this.toDoc(id, folder, await this.findPdf(id), file, guide);
    });
  }

  private skeleton(meta: Partial<PaperMeta>, guide: Guide): NotesFile {
    const file = parseNotes('');
    const full: PaperMeta = { ...emptyMeta(), ...meta };
    setFront(
      file,
      Object.fromEntries(META_ORDER.map((k) => [META_KEYS[k], frontMatterValue(k, full[k])])),
    );
    const schema = notesSchema(guide);
    for (const stage of allStages(guide)) {
      for (const f of stageFields(stage)) setAnswer(file, stage.heading, f.heading, '', schema);
    }
    setSectionText(file, guide.notesHeading, '', schema);
    return file;
  }

  // ----- Collections -----

  get collectionsFile(): string {
    return path.join(this.root, COLLECTIONS_FILE);
  }

  private async readCollectionsDoc(): Promise<YAML.Document | null> {
    const text = await readTextIfExists(this.collectionsFile);
    if (text === null) return null;
    const doc = YAML.parseDocument(text);
    if (doc.errors.length) {
      throw new Error(`${this.collectionsFile} could not be read (${doc.errors[0].message.split('\n')[0]}). Fix it in a text editor.`);
    }
    return doc;
  }

  private async savedCollections(): Promise<string[]> {
    let doc: YAML.Document | null;
    try {
      doc = await this.readCollectionsDoc();
    } catch {
      return [];
    }
    const list = doc?.toJS()?.collections;
    return Array.isArray(list) ? distinctNames(list.map((x) => String(x ?? ''))) : [];
  }

  private async saveCollections(names: string[]): Promise<void> {
    const doc = (await this.readCollectionsDoc()) ?? YAML.parseDocument(COLLECTIONS_HEADER);
    if (doc.contents === null) doc.contents = doc.createNode({});
    doc.set('collections', doc.createNode(distinctNames(names)));
    await writeFileAtomic(this.collectionsFile, doc.toString({ lineWidth: 0 }));
  }

  /** All collections: the saved order first, then any found only in papers. */
  async collections(papers: PaperSummary[]): Promise<string[]> {
    const saved = await this.savedCollections();
    const found = distinctNames(papers.flatMap((p) => p.meta.collections)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
    );
    return distinctNames([...saved, ...found]);
  }

  createCollection(name: string, guide: Guide): Promise<void> {
    return this.serial('.collections', async () => {
      const clean = name.trim();
      if (!clean) throw new Error('A collection needs a name.');
      await this.saveCollections([...(await this.collections(await this.scan(guide))), clean]);
    });
  }

  /** Renames a collection everywhere, including in every paper that belongs to it. */
  renameCollection(from: string, to: string, guide: Guide): Promise<void> {
    return this.serial('.collections', async () => {
      const clean = to.trim();
      if (!clean) throw new Error('A collection needs a name.');
      const papers = await this.scan(guide);
      const names = await this.collections(papers);
      await this.saveCollections(names.map((n) => (sameName(n, from) ? clean : n)));
      for (const p of papers.filter((p) => p.meta.collections.some((c) => sameName(c, from)))) {
        const collections = distinctNames(p.meta.collections.map((c) => (sameName(c, from) ? clean : c)));
        await this.update(p.id, { meta: { collections } }, guide);
      }
    });
  }

  /** Deletes a collection. Its papers stay in the library. */
  deleteCollection(name: string, guide: Guide): Promise<void> {
    return this.serial('.collections', async () => {
      const papers = await this.scan(guide);
      const names = await this.collections(papers);
      await this.saveCollections(names.filter((n) => !sameName(n, name)));
      for (const p of papers.filter((p) => p.meta.collections.some((c) => sameName(c, name)))) {
        await this.update(p.id, { meta: { collections: p.meta.collections.filter((c) => !sameName(c, name)) } }, guide);
      }
    });
  }

  async create(input: NewPaperInput, guide: Guide): Promise<PaperDoc> {
    await this.ensure();
    const meta: Partial<PaperMeta> = { ...input.meta, added: input.meta.added ?? localDate(this.now()) };
    meta.title = (meta.title ?? '').trim() || 'Untitled';
    if (input.pdfPath) {
      const stat = await fs.stat(input.pdfPath);
      if (!stat.isFile()) throw new Error(`${input.pdfPath} is not a file.`);
    }
    const base = paperSlug(meta);
    let id = base;
    for (let n = 2; ; n++) {
      try {
        await fs.mkdir(this.folderOf(id));
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        id = `${base}-${n}`;
      }
    }
    const folder = this.folderOf(id);
    try {
      if (input.pdfPath) await fs.copyFile(input.pdfPath, path.join(folder, PDF_FILE), fs.constants.COPYFILE_EXCL);
      const file = this.skeleton(meta, guide);
      await writeFileAtomic(path.join(folder, NOTES_FILE), serializeNotes(file));
      return this.toDoc(id, folder, input.pdfPath ? PDF_FILE : null, file, guide);
    } catch (err) {
      // The folder was created just now and holds nothing of the user's.
      await fs.rm(folder, { recursive: true, force: true });
      throw err;
    }
  }
}

export function applyPatch(file: NotesFile, patch: PaperPatch, guide: Guide, now: Date): void {
  const schema = notesSchema(guide);
  const front: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch.meta ?? {})) {
    const key = k as keyof PaperMeta;
    if (!(key in META_KEYS)) continue;
    front[META_KEYS[key]] = frontMatterValue(key, v as PaperMeta[typeof key]);
  }
  if (patch.touch) front[META_KEYS.lastWorked] = localDateTime(now);
  if (Object.keys(front).length) setFront(file, front);
  // Collections replace the old single `course` field, which was read into them.
  if (patch.meta && 'collections' in patch.meta) deleteFront(file, 'course');

  for (const [stageId, fields] of Object.entries(patch.answers ?? {})) {
    const stage = allStages(guide).find((s) => s.id === stageId);
    if (!stage) continue;
    const known = stageFields(stage);
    for (const [fieldId, value] of Object.entries(fields)) {
      const field = known.find((f) => f.id === fieldId);
      if (field) setAnswer(file, stage.heading, field.heading, value, schema);
    }
  }
  if (patch.notes !== undefined) setSectionText(file, guide.notesHeading, patch.notes, schema);
  if (patch.highlights !== undefined) setSectionText(file, guide.highlightsHeading, patch.highlights, schema);
  if (patch.appendReview) {
    appendSub(file, guide.reviewsHeading, patch.appendReview.heading, patch.appendReview.text, schema);
  }
}

export function summarize(doc: PaperDoc, guide: Guide): PaperSummary {
  const summaries: Record<string, Record<string, string>> = {};
  for (const { stage, question } of summaryFields(guide)) {
    (summaries[stage.id] ??= {})[question.id] = doc.answers[stage.id]?.[question.id] ?? '';
  }
  const searchText = [
    ...Object.values(doc.answers).flatMap((a) => Object.values(a)),
    doc.notes,
    ...parseHighlights(doc.highlights).items.map((h) => h.text),
    ...doc.other.map((o) => o.text),
  ]
    .filter(Boolean)
    .join('\n');
  return {
    id: doc.id,
    folder: doc.folder,
    pdfFile: doc.pdfFile,
    meta: doc.meta,
    summaries,
    searchText,
    error: doc.error,
  };
}
