import { describe, expect, it } from 'vitest';
import { formatHighlights, mergeLineRects, parseHighlights, type Highlight } from '../src/shared/highlights';

const h = (over: Partial<Highlight>): Highlight => ({
  id: 'a1',
  page: 1,
  color: 'yellow',
  text: 'text',
  rects: [[0.1, 0.2, 0.3, 0.02]],
  note: '',
  ...over,
});

describe('highlights', () => {
  it('round-trips through readable markdown lines', () => {
    const items = [
      h({ id: 'b2', page: 4, color: 'green', text: 'Blocks of the KV cache', rects: [[0.1, 0.5, 0.4, 0.012], [0.1, 0.52, 0.2, 0.012]] }),
      h({ id: 'a1', page: 2, text: 'It says “hello” --> there' }),
    ];
    const text = formatHighlights({ items, extra: '' });
    expect(text.split('\n')[0]).toBe('- p. 2: “It says “hello” –> there” <!-- carrel id=a1 color=yellow rects=0.1,0.2,0.3,0.02 -->');
    const back = parseHighlights(text);
    expect(back.extra).toBe('');
    expect(back.items.map((i) => [i.id, i.page, i.color, i.text, i.rects])).toEqual([
      ['a1', 2, 'yellow', 'It says “hello” –> there', [[0.1, 0.2, 0.3, 0.02]]],
      ['b2', 4, 'green', 'Blocks of the KV cache', [[0.1, 0.5, 0.4, 0.012], [0.1, 0.52, 0.2, 0.012]]],
    ]);
    expect(formatHighlights(back)).toBe(text);
  });

  it('keeps lines that are not highlights, and survives hand edits', () => {
    const text = [
      'My own remark about these.',
      '- p. 3: “edited by hand” <!-- carrel id=x color=purple rects=bad -->',
    ].join('\n');
    const p = parseHighlights(text);
    expect(p.items).toEqual([{ id: 'x', page: 3, color: 'yellow', text: 'edited by hand', rects: [], note: '' }]);
    expect(p.extra).toBe('My own remark about these.');
    expect(formatHighlights(p)).toContain('My own remark about these.');
  });

  it('merges fragments on the same line into one stroke', () => {
    const merged = mergeLineRects([
      [0.1, 0.2, 0.1, 0.02],
      [0.205, 0.201, 0.1, 0.02],
      [0.1, 0.23, 0.3, 0.02],
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0][0]).toBeCloseTo(0.1);
    expect(merged[0][2]).toBeCloseTo(0.205);
    expect(merged[1]).toEqual([0.1, 0.23, 0.3, 0.02]);
  });
});

describe('highlight notes', () => {
  it('are written indented under their quote and read back exactly', () => {
    const note = 'Like virtual memory paging.\n\nCompare with section 4:\n- point one\n  - nested';
    const items = [h({ id: 'a1', page: 1, note }), h({ id: 'b2', page: 2 })];
    const text = formatHighlights({ items, extra: '' });
    expect(text).toBe(
      [
        '- p. 1: “text” <!-- carrel id=a1 color=yellow rects=0.1,0.2,0.3,0.02 -->',
        '  Like virtual memory paging.',
        '',
        '  Compare with section 4:',
        '  - point one',
        '    - nested',
        '- p. 2: “text” <!-- carrel id=b2 color=yellow rects=0.1,0.2,0.3,0.02 -->',
      ].join('\n'),
    );
    const back = parseHighlights(text);
    expect(back.items.map((i) => i.note)).toEqual([note, '']);
    expect(back.extra).toBe('');
  });

  it('do not swallow unindented text that follows', () => {
    const p = parseHighlights('- p. 1: “q” <!-- carrel id=a -->\n  my note\n\nA paragraph of my own.');
    expect(p.items[0].note).toBe('my note');
    expect(p.extra).toBe('A paragraph of my own.');
  });
});
