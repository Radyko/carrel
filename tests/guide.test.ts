import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_FILE, loadGuide, parseGuideText } from '../src/main/storage/guideFile';
import { DEFAULT_GUIDE_PATH, defaultGuide, tempDir } from './helpers';

describe('guide', () => {
  it('parses the default guide', async () => {
    const g = await defaultGuide();
    expect(g.purpose.options.map((o) => [o.id, o.suggestedPass])).toEqual([
      ['course', 2],
      ['survey', 1],
      ['build', 3],
      ['review', 3],
      ['curiosity', 1],
    ]);
    expect(g.passes.map((p) => p.heading)).toEqual(['Pass 1: Survey', 'Pass 2: Comprehend', 'Pass 3: Reconstruct']);
    expect(g.passes[0].questions.map((q) => q.heading)).toEqual([
      'Category',
      'Context',
      'Correctness',
      'Contributions',
      'Clarity',
      'Summary after pass 1',
    ]);
    expect(g.passes[0].decisions.map((d) => [d.id, d.status, d.scheduleReview])).toEqual([
      ['continue', 'in-progress', false],
      ['later', 'in-progress', false],
      ['stop', 'read', false],
    ]);
    expect(g.passes[1].decisions.find((d) => d.id === 'done')?.scheduleReview).toBe(true);
    expect(g.review.intervals).toEqual([7, 30, 90]);
  });

  it('installs a copy on first run and loads it', async () => {
    const root = await tempDir();
    const loaded = await loadGuide(root, DEFAULT_GUIDE_PATH, { install: true });
    expect(loaded.problem).toBeNull();
    expect(await fs.readFile(path.join(root, GUIDE_FILE), 'utf8')).toBe(await fs.readFile(DEFAULT_GUIDE_PATH, 'utf8'));
  });

  it('uses an edited guide', async () => {
    const root = await tempDir();
    const text = (await fs.readFile(DEFAULT_GUIDE_PATH, 'utf8')).replace('heading: Category', 'heading: Kind of paper');
    await fs.writeFile(path.join(root, GUIDE_FILE), text);
    const loaded = await loadGuide(root, DEFAULT_GUIDE_PATH, { install: true });
    expect(loaded.problem).toBeNull();
    expect(loaded.guide.passes[0].questions[0].heading).toBe('Kind of paper');
  });

  it('falls back to the built-in guide when the file is missing, and says so', async () => {
    const loaded = await loadGuide(await tempDir(), DEFAULT_GUIDE_PATH, { install: false });
    expect(loaded.missing).toBe(true);
    expect(loaded.problem).toMatch(/missing/);
    expect(loaded.guide.passes).toHaveLength(3);
  });

  it('falls back to the built-in guide when the file is invalid, and says why', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, GUIDE_FILE), 'passes: [\n');
    let loaded = await loadGuide(root, DEFAULT_GUIDE_PATH, { install: true });
    expect(loaded.problem).toMatch(/could not be used.*Line/);
    await fs.writeFile(path.join(root, GUIDE_FILE), 'purpose: {}\npasses:\n  - id: p1\n    heading: P\n');
    loaded = await loadGuide(root, DEFAULT_GUIDE_PATH, { install: true });
    expect(loaded.problem).toMatch(/passes\[1\]\.title is missing/);
    expect(loaded.guide.passes).toHaveLength(3);
  });

  it('rejects duplicate headings, which would make the notes ambiguous', async () => {
    const text = (await fs.readFile(DEFAULT_GUIDE_PATH, 'utf8')).replace('heading: Context', 'heading: Category');
    expect(() => parseGuideText(text)).toThrow(/heading "Category" is used more than once/);
  });
});
