import { describe, expect, it } from 'vitest';
import { pickTitle, tidyTitle, titleFromFirstPage, type TextPiece } from '../src/shared/pdfTitle';

const H = 792;
const piece = (text: string, y: number, size: number, x = 72, extra: Partial<TextPiece> = {}): TextPiece => ({
  text,
  x,
  y,
  width: text.length * size * 0.5,
  size,
  upright: true,
  ...extra,
});
const body = Array.from({ length: 30 }, (_, i) => piece('Body text of the paper goes on here.', 600 - i * 12, 10));

describe('titleFromFirstPage', () => {
  it('takes the largest text near the top, across lines', () => {
    const pieces = [piece('Efficient Memory Management for Large', 700, 17), piece('Language Model Serving', 680, 17), piece('Woosuk Kwon', 650, 11), ...body];
    expect(titleFromFirstPage(pieces, H)).toBe('Efficient Memory Management for Large Language Model Serving');
  });

  it('ignores rotated stamps and big journal banners', () => {
    const pieces = [
      piece('arXiv:2309.06180v1 [cs.LG] 12 Sep 2023', 400, 20, 20, { upright: false }),
      piece('Journal of Computer Communication Review', 740, 22),
      piece('How to Read a Paper', 690, 18),
      ...body,
    ];
    expect(titleFromFirstPage(pieces, H)).toBe('How to Read a Paper');
  });

  it('joins pieces of one word and drops footnote marks', () => {
    const pieces = [piece('LoRA: Low-Rank Adap', 700, 17), piece('tation of Large Language Models', 72 + 19 * 8.5, 17), piece('∗', 500, 17), ...body];
    pieces[1] = { ...pieces[1], x: 72 + 'LoRA: Low-Rank Adap'.length * 17 * 0.5, y: 700 };
    pieces[2] = { ...pieces[2], x: pieces[1].x + pieces[1].width, y: 700 };
    expect(titleFromFirstPage(pieces, H)).toBe('LoRA: Low-Rank Adaptation of Large Language Models');
  });

  it('finds nothing when there is no larger text', () => {
    expect(titleFromFirstPage(body, H)).toBe('');
  });
});

describe('tidyTitle', () => {
  it('rejoins a hyphenated word broken across lines', () => {
    expect(tidyTitle('Demystifying GPU Micro- architecture through Microbenchmarking')).toBe(
      'Demystifying GPU Micro-architecture through Microbenchmarking',
    );
  });
});

describe('pickTitle', () => {
  it('prefers the page, unless the metadata continues it', () => {
    expect(pickTitle('Attention Is All You Need', 'Microsoft Word - final')).toBe('Attention Is All You Need');
    expect(pickTitle('Demystifying GPU Microbenc', 'Demystifying GPU Microbenchmarking')).toBe('Demystifying GPU Microbenchmarking');
    expect(pickTitle('', 'From Metadata Only')).toBe('From Metadata Only');
  });
});
