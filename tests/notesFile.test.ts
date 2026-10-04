import { describe, expect, it } from 'vitest';
import {
  escapeAnswer,
  getAnswer,
  parseNotes,
  readFront,
  serializeNotes,
  setAnswer,
  setFront,
  unescapeAnswer,
  type NotesSchema,
} from '../src/main/storage/notesFile';

const schema: NotesSchema = {
  sections: [
    { heading: 'Purpose', fields: ['What do I want to get out of it?'] },
    { heading: 'Pass 1: Survey', fields: ['Category', 'Context', 'Summary after pass 1'] },
    { heading: 'Notes', fields: [] },
  ],
};

const handEdited = `---
# a comment the user wrote
title: "How to Read a Paper"
authors: [S. Keshav]
year: 2007
my_custom_field: keep me
nested:
  deep: [1, 2, 3]
---
Some text before any heading.

# Purpose

## What do I want to get out of it?

How should I read?

# Pass 1: Survey

Text right under the stage heading.

## Category

A position paper.

## My own question

Something the guide does not ask.

\`\`\`python
# not a heading, this is code
x = 1
\`\`\`

## Context

Related to Ng and Eisner.

# Ideas

## A sub-idea

Unrelated to any stage.
`;

describe('notes file', () => {
  it('serializes an unchanged file byte for byte', () => {
    expect(serializeNotes(parseNotes(handEdited))).toBe(handEdited);
    const odd = 'no front matter\n# H\ntext without newline at end';
    expect(serializeNotes(parseNotes(odd))).toBe(odd);
    expect(serializeNotes(parseNotes(''))).toBe('');
  });

  it('reads answers under their headings', () => {
    const f = parseNotes(handEdited);
    expect(getAnswer(f, 'Pass 1: Survey', 'Category')).toBe('A position paper.');
    expect(getAnswer(f, 'pass 1:  survey', 'category')).toBe('A position paper.');
    expect(getAnswer(f, 'Pass 1: Survey', 'Summary after pass 1')).toBeUndefined();
    // A "#" line inside a code block is not a heading.
    expect(getAnswer(f, 'Pass 1: Survey', 'My own question')).toContain('# not a heading');
  });

  it('changes only the answer that was set and keeps everything else', () => {
    const f = parseNotes(handEdited);
    setAnswer(f, 'Pass 1: Survey', 'Category', 'A survey of methods.', schema);
    setAnswer(f, 'Pass 1: Survey', 'Summary after pass 1', 'Read in three passes.', schema);
    setFront(f, { status: 'in-progress', rating: 4 });
    const out = serializeNotes(f);
    expect(out).toContain('# a comment the user wrote');
    expect(out).toContain('my_custom_field: keep me');
    expect(out).toContain('nested:\n  deep: [1, 2, 3]');
    expect(out).toContain('Some text before any heading.');
    expect(out).toContain('Text right under the stage heading.');
    expect(out).toContain('## My own question\n\nSomething the guide does not ask.');
    expect(out).toContain('# not a heading, this is code');
    expect(out).toContain('# Ideas\n\n## A sub-idea\n\nUnrelated to any stage.\n');
    expect(out).toContain('## Category\n\nA survey of methods.\n\n## My own question');
    expect(out).not.toContain('A position paper.');
    // The new answer goes after Context, in guide order.
    expect(out.indexOf('## Summary after pass 1')).toBeGreaterThan(out.indexOf('## Context'));
    expect(out.indexOf('## Summary after pass 1')).toBeLessThan(out.indexOf('# Ideas'));
    const again = parseNotes(out);
    expect(readFront(again)).toMatchObject({
      title: 'How to Read a Paper',
      my_custom_field: 'keep me',
      nested: { deep: [1, 2, 3] },
      status: 'in-progress',
      rating: 4,
    });
    expect(getAnswer(again, 'Pass 1: Survey', 'Summary after pass 1')).toBe('Read in three passes.');
  });

  it('does not rewrite front matter when nothing in it changed', () => {
    const f = parseNotes(handEdited);
    setFront(f, { title: 'How to Read a Paper', year: 2007 });
    expect(f.frontDirty).toBe(false);
    expect(serializeNotes(f)).toBe(handEdited);
  });

  it('keeps answers containing heading-like lines and code fences from breaking the file', () => {
    const tricky = [
      '# Not a stage',
      '## Not a question',
      '\\# already escaped-looking',
      '```',
      'an unclosed fence',
    ].join('\n');
    const closed = '```sh\n# a shell comment\n```\nafter';
    const f = parseNotes('');
    setAnswer(f, 'Pass 1: Survey', 'Category', tricky, schema);
    setAnswer(f, 'Pass 1: Survey', 'Context', closed, schema);
    setAnswer(f, 'Pass 1: Survey', 'Summary after pass 1', 'still here', schema);
    const again = parseNotes(serializeNotes(f));
    expect(again.sections.map((s) => s.heading)).toEqual(['Pass 1: Survey']);
    expect(again.sections[0].subs.map((s) => s.heading)).toEqual(['Category', 'Context', 'Summary after pass 1']);
    expect(getAnswer(again, 'Pass 1: Survey', 'Category')).toBe(tricky);
    expect(getAnswer(again, 'Pass 1: Survey', 'Context')).toBe(closed);
    expect(getAnswer(again, 'Pass 1: Survey', 'Summary after pass 1')).toBe('still here');
  });

  it('escapes reversibly', () => {
    for (const s of ['# a', '## b', '### c is fine', '\\# d', '\\\\## e', '```', '~~~\nx\n~~~', 'plain']) {
      expect(unescapeAnswer(escapeAnswer(s))).toBe(s);
    }
    expect(escapeAnswer('### c')).toBe('### c');
  });

  it('reports invalid front matter and refuses to write it', () => {
    const f = parseNotes('---\ntitle: [unclosed\n---\n# Purpose\n');
    expect(f.frontError).toBeTruthy();
    expect(() => setFront(f, { rating: 3 })).toThrow();
  });
});

describe('new headings', () => {
  it('get a blank line before them when added after text', () => {
    const f = parseNotes('---\ntitle: x\n---\n# Pass 1: Survey\n\n## Category\n\nLast line without blank');
    setAnswer(f, 'Notes', 'Anything', 'n', { sections: [...schema.sections] });
    setAnswer(f, 'Pass 1: Survey', 'Context', 'c', schema);
    expect(serializeNotes(f)).toBe(
      '---\ntitle: x\n---\n# Pass 1: Survey\n\n## Category\n\nLast line without blank\n\n## Context\n\nc\n\n# Notes\n\n## Anything\n\nn\n\n',
    );
  });
});
