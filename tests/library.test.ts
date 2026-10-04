import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Library, NOTES_FILE, PDF_FILE } from '../src/main/storage/library';
import type { Guide } from '../src/shared/guide';
import { defaultGuide, tempDir } from './helpers';

let guide: Guide;
let root: string;
let lib: Library;
const fixedNow = new Date(2026, 9, 3, 14, 30);

beforeEach(async () => {
  guide = await defaultGuide();
  root = await tempDir();
  lib = new Library(root, () => fixedNow);
});

const readNotes = (id: string) => fs.readFile(path.join(root, 'papers', id, NOTES_FILE), 'utf8');

describe('library', () => {
  it('creates a paper folder with a readable notes skeleton', async () => {
    const doc = await lib.create(
      { meta: { title: 'How to Read a Paper', authors: ['S. Keshav'], year: 2007, topics: ['method'] } },
      guide,
    );
    expect(doc.id).toBe('2007-keshav-how-to-read-a-paper');
    const text = await readNotes(doc.id);
    expect(text).toMatch(/^---\ntitle: How to Read a Paper\nauthors: \[S\. Keshav\]\nyear: 2007\n/);
    expect(text).toContain('added: 2026-10-03');
    expect(text).toContain('status: to-read');
    // One heading per stage and one sub-heading per question, in guide order.
    const headings = text.split('\n').filter((l) => l.startsWith('#'));
    expect(headings.slice(0, 4)).toEqual([
      '# Purpose',
      '## What do I want to get out of it?',
      '# Pass 1: Survey',
      '## Category',
    ]);
    expect(headings).toContain('# Pass 3: Reconstruct');
    expect(headings).toContain('## Background I need first');
    expect(headings[headings.length - 1]).toBe('# Notes');
    const again = await lib.create({ meta: { title: 'How to Read a Paper', authors: ['S. Keshav'], year: 2007 } }, guide);
    expect(again.id).toBe('2007-keshav-how-to-read-a-paper-2');
  });

  it('round-trips: what is written reads back the same', async () => {
    const { id } = await lib.create({ meta: { title: 'Round trip' } }, guide);
    const answers = {
      purpose: { questions: 'Why are GPUs fast?\nWhat limits them?' },
      pass1: { category: 'Measurement', summary: 'It measures things.\n\nTwo paragraphs.' },
      pass2: {
        references: '- [ ] Paper A\n- [x] Paper B',
        terms: '- **SIMT**: single instruction, multiple threads',
        background: 'Read about caches first.',
      },
      pass3: { connections: '# Section 3 is X\n```\ncode # here\n```' },
    };
    const meta = {
      authors: ['Ada Lovelace', 'Charles Babbage'],
      year: 1843,
      venue: 'Notes',
      link: 'https://example.org/paper?x=1&y=2',
      topics: ['engines', 'math: analysis'],
      collections: ['CS 101', 'Thesis'],
      status: 'in-progress' as const,
      furthestPass: 2,
      decisions: { pass1: 'continue', pass2: 'later' },
      rating: 4,
      timeSpent: { pass1: 420, pass2: 1800 },
      lastPage: 7,
      purpose: 'course',
      checklist: { pass1: ['abstract', 'figures'] },
      nextReview: '2026-10-10',
      reviewInterval: 7,
    };
    const written = await lib.update(id, { meta, answers, notes: 'Free notes.\n## not a heading', touch: true }, guide);
    const read = await lib.read(id, guide);
    expect(read).toEqual(written);
    expect(read.meta).toMatchObject({ ...meta, title: 'Round trip', lastWorked: '2026-10-03T14:30' });
    for (const [stage, fields] of Object.entries(answers)) {
      for (const [field, value] of Object.entries(fields)) {
        expect(read.answers[stage][field]).toBe(value);
      }
    }
    expect(read.notes).toBe('Free notes.\n## not a heading');
    expect(read.other).toEqual([]);
    // Writing the same thing again leaves the file byte for byte unchanged.
    const before = await readNotes(id);
    await lib.update(id, { meta, answers, notes: 'Free notes.\n## not a heading' }, guide);
    expect(await readNotes(id)).toBe(before);
  });

  it('preserves content it does not recognise when saving', async () => {
    const { id } = await lib.create({ meta: { title: 'Preserve' } }, guide);
    const file = path.join(root, 'papers', id, NOTES_FILE);
    let text = await readNotes(id);
    text = text
      .replace('title: Preserve\n', 'title: Preserve\nzotero_key: ABC123 # synced\nextra:\n  - one\n  - two\n')
      .replace('# Pass 1: Survey\n', '# Pass 1: Survey\n\nWritten under the stage heading.\n')
      .replace('## Category\n', '## Category\n\nA prototype.\n\n## Questions for the authors\n\nWhy no error bars?\n')
      .concat('\n# Concepts\n\n## Warp divergence\n\nThreads in a warp take different paths.\n');
    // Text between the front matter and the first heading.
    text = text.replace(/\n---\n/, '\n---\nPreamble line.\n');
    await fs.writeFile(file, text);

    const doc = await lib.read(id, guide);
    expect(doc.answers.pass1.category).toBe('A prototype.');
    expect(doc.other.map((o) => o.heading)).toEqual([
      'Before the first heading',
      'Pass 1: Survey',
      'Pass 1: Survey › Questions for the authors',
      'Concepts',
    ]);
    expect(doc.other[3].text).toContain('## Warp divergence');

    await lib.update(id, { answers: { pass1: { category: 'A measurement.' } }, meta: { rating: 5 }, touch: true }, guide);
    const out = await readNotes(id);
    for (const kept of [
      'zotero_key: ABC123 # synced',
      'extra:\n  - one\n  - two',
      'Preamble line.',
      'Written under the stage heading.',
      '## Questions for the authors\n\nWhy no error bars?',
      '# Concepts\n\n## Warp divergence\n\nThreads in a warp take different paths.\n',
    ]) {
      expect(out).toContain(kept);
    }
    expect(out).toContain('## Category\n\nA measurement.\n');
    expect(out).not.toContain('A prototype.');
    expect(out).toContain('rating: 5');
  });

  it('keeps answers under headings the guide no longer has, shown as other notes', async () => {
    const { id } = await lib.create({ meta: { title: 'Guide change' } }, guide);
    await lib.update(id, { answers: { pass1: { clarity: 'Very clear.' } } }, guide);
    const changed: Guide = structuredClone(guide);
    changed.passes[0].questions = changed.passes[0].questions.filter((q) => q.id !== 'clarity');
    const doc = await lib.update(id, { answers: { pass1: { category: 'Survey' } } }, changed);
    expect(doc.other).toEqual([{ heading: 'Pass 1: Survey › Clarity', text: 'Very clear.' }]);
    expect(await readNotes(id)).toContain('## Clarity\n\nVery clear.');
  });

  it('applies changes to the latest file on disk, keeping edits made elsewhere', async () => {
    const { id } = await lib.create({ meta: { title: 'External' } }, guide);
    await lib.update(id, { answers: { pass1: { category: 'From the app' } } }, guide);
    const file = path.join(root, 'papers', id, NOTES_FILE);
    await fs.writeFile(file, (await readNotes(id)).replace('## Context\n', '## Context\n\nEdited in another editor.\n'));
    await lib.update(id, { answers: { pass1: { correctness: 'Seems fine' } } }, guide);
    const doc = await lib.read(id, guide);
    expect(doc.answers.pass1).toMatchObject({
      category: 'From the app',
      context: 'Edited in another editor.',
      correctness: 'Seems fine',
    });
  });

  it('serialises concurrent saves without losing any', async () => {
    const { id } = await lib.create({ meta: { title: 'Concurrent' } }, guide);
    const ids = ['category', 'context', 'correctness', 'contributions', 'clarity'];
    await Promise.all(ids.map((q) => lib.update(id, { answers: { pass1: { [q]: `answer ${q}` } } }, guide)));
    const doc = await lib.read(id, guide);
    for (const q of ids) expect(doc.answers.pass1[q]).toBe(`answer ${q}`);
  });

  it('writes atomically and leaves no temporary files behind', async () => {
    const { id } = await lib.create({ meta: { title: 'Atomic' } }, guide);
    for (let i = 0; i < 5; i++) await lib.update(id, { notes: `version ${i}` }, guide);
    expect(await fs.readdir(path.join(root, 'papers', id))).toEqual([NOTES_FILE]);
  });

  it('refuses to save over invalid front matter and leaves the file alone', async () => {
    const { id } = await lib.create({ meta: { title: 'Broken' } }, guide);
    const file = path.join(root, 'papers', id, NOTES_FILE);
    const broken = '---\ntitle: [oops\n---\n# Notes\n\nMine.\n';
    await fs.writeFile(file, broken);
    const doc = await lib.read(id, guide);
    expect(doc.error).toMatch(/front matter/);
    expect(doc.notes).toBe('Mine.');
    await expect(lib.update(id, { notes: 'changed' }, guide)).rejects.toThrow(/invalid/);
    expect(await fs.readFile(file, 'utf8')).toBe(broken);
  });

  it('copies a PDF into the library and leaves the original in place', async () => {
    const src = path.join(await tempDir(), 'download.pdf');
    await fs.writeFile(src, '%PDF-1.4 fake');
    const doc = await lib.create({ meta: { title: 'With PDF', year: 2020 }, pdfPath: src }, guide);
    expect(doc.pdfFile).toBe(PDF_FILE);
    expect(await fs.readFile(path.join(doc.folder, PDF_FILE), 'utf8')).toBe('%PDF-1.4 fake');
    expect(await fs.readFile(src, 'utf8')).toBe('%PDF-1.4 fake');
  });

  it('scans the folder, including folders added by hand', async () => {
    await lib.create({ meta: { title: 'One', authors: ['A. Author'] } }, guide);
    await lib.create({ meta: { title: 'Two' } }, guide);
    await fs.mkdir(path.join(root, 'papers', 'dropped-in-by-hand'));
    await fs.writeFile(path.join(root, 'papers', 'dropped-in-by-hand', 'whatever.pdf'), '%PDF');
    await fs.mkdir(path.join(root, 'papers', 'empty-folder'));
    await fs.writeFile(path.join(root, 'papers', 'stray-file.txt'), 'x');
    const papers = await lib.scan(guide);
    expect(papers.map((p) => p.meta.title).sort()).toEqual(['One', 'Two', 'dropped in by hand']);
    const hand = papers.find((p) => p.id === 'dropped-in-by-hand')!;
    expect(hand.pdfFile).toBe('whatever.pdf');
    // Saving to it creates its notes file.
    await lib.update(hand.id, { meta: { rating: 3 } }, guide);
    expect(await readNotes(hand.id)).toContain('rating: 3');
  });

  it('rejects ids that would escape the library', async () => {
    await expect(lib.read('../outside', guide)).rejects.toThrow();
    await expect(lib.update('..', { notes: 'x' }, guide)).rejects.toThrow();
  });

  it('appends reviews with their date', async () => {
    const { id } = await lib.create({ meta: { title: 'Reviews' } }, guide);
    await lib.update(id, { appendReview: { heading: '2026-10-10 · Remembered', text: 'GPUs hide latency.' } }, guide);
    await lib.update(id, { appendReview: { heading: '2026-11-09 · Fuzzy', text: 'Something about warps.' } }, guide);
    const doc = await lib.read(id, guide);
    expect(doc.reviews).toEqual([
      { heading: '2026-10-10 · Remembered', text: 'GPUs hide latency.' },
      { heading: '2026-11-09 · Fuzzy', text: 'Something about warps.' },
    ]);
    expect(await readNotes(id)).toMatch(/# Notes\n\n# Reviews\n\n## 2026-10-10 · Remembered\n\nGPUs hide latency.\n\n## 2026-11-09/);
  });
});

describe('collections', () => {
  it('reads the old course field as a collection and replaces it on save', async () => {
    const { id } = await lib.create({ meta: { title: 'Legacy' } }, guide);
    const file = path.join(root, 'papers', id, NOTES_FILE);
    await fs.writeFile(file, (await readNotes(id)).replace('collections: []', 'course: CS 6290'));
    expect((await lib.read(id, guide)).meta.collections).toEqual(['CS 6290']);
    await lib.update(id, { meta: { collections: ['CS 6290', 'Thesis'] } }, guide);
    const text = await readNotes(id);
    expect(text).toContain('collections: [CS 6290, Thesis]');
    expect(text).not.toContain('course:');
  });

  it('keeps empty collections, in order, and adds ones found in papers', async () => {
    await lib.create({ meta: { title: 'A', collections: ['Zeta project'] } }, guide);
    await lib.createCollection('Thesis', guide);
    await lib.createCollection('CS 8803', guide);
    await lib.createCollection('thesis', guide); // same name, different case
    expect(await lib.collections(await lib.scan(guide))).toEqual(['Zeta project', 'Thesis', 'CS 8803']);
    expect(await fs.readFile(path.join(root, 'collections.yaml'), 'utf8')).toContain('- Thesis');
  });

  it('renames and deletes collections in every paper, keeping the papers', async () => {
    const a = await lib.create({ meta: { title: 'A', collections: ['Thesis', 'GPU'] } }, guide);
    const b = await lib.create({ meta: { title: 'B', collections: ['thesis'] } }, guide);
    await lib.renameCollection('Thesis', 'Dissertation', guide);
    expect((await lib.read(a.id, guide)).meta.collections).toEqual(['Dissertation', 'GPU']);
    expect((await lib.read(b.id, guide)).meta.collections).toEqual(['Dissertation']);
    await lib.deleteCollection('Dissertation', guide);
    expect((await lib.read(a.id, guide)).meta.collections).toEqual(['GPU']);
    expect((await lib.read(b.id, guide)).meta.collections).toEqual([]);
    expect(await lib.collections(await lib.scan(guide))).toEqual(['GPU']);
    expect((await lib.scan(guide)).length).toBe(2);
  });

  it('refuses to overwrite a collections file it cannot read', async () => {
    await fs.writeFile(path.join(root, 'collections.yaml'), 'collections: [broken\n');
    await expect(lib.createCollection('New', guide)).rejects.toThrow(/could not be read/);
    expect(await fs.readFile(path.join(root, 'collections.yaml'), 'utf8')).toBe('collections: [broken\n');
  });
});
