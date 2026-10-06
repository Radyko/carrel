import { describe, expect, it } from 'vitest';
import { sectionsFromText, type PageText } from '../src/shared/pdfSections';
import type { TextPiece } from '../src/shared/pdfTitle';

const piece = (text: string, y: number, size = 10, x = 72, extra: Partial<TextPiece> = {}): TextPiece => ({
  text,
  x,
  y,
  width: text.length * size * 0.5,
  size,
  upright: true,
  ...extra,
});
const para = (top: number, n = 8, x = 72) =>
  Array.from({ length: n }, (_, i) => piece('the body of the paper carries on with more words in this line.', top - i * 12, 10, x));

describe('sectionsFromText', () => {
  it('finds numbered and named headings, and skips the title and running headers', () => {
    const pages: PageText[] = [
      {
        page: 1,
        pieces: [
          piece('Attention Is All You Need', 720, 17),
          piece('Abstract', 660, 12),
          ...para(640),
          // The number and the name are separate pieces on one line.
          piece('1', 520, 12),
          piece('Introduction', 520, 12, 86),
          ...para(500),
        ],
      },
      { page: 2, pieces: [piece('Short title of the paper', 760, 9), ...para(700), piece('2.1 Scaled Dot-Product Attention', 560, 11), ...para(540)] },
      { page: 3, pieces: [piece('Short title of the paper', 760, 9), ...para(700), piece('References', 400, 12), ...para(380)] },
      { page: 4, pieces: [piece('Short title of the paper', 760, 9), ...para(700)] },
    ];
    expect(sectionsFromText(pages)).toEqual([
      { title: 'Abstract', level: 1, page: 1, y: 672 },
      { title: '1 Introduction', level: 1, page: 1, y: 532 },
      { title: '2.1 Scaled Dot-Product Attention', level: 2, page: 2, y: 571 },
      { title: 'References', level: 1, page: 3, y: 412 },
    ]);
  });

  it('keeps a heading in one column apart from text in the other', () => {
    const pages: PageText[] = [
      { page: 1, pieces: [...para(700), piece('3 Model Architecture', 600, 10), piece('words in the right column go on and on.', 600, 10, 320)] },
      { page: 2, pieces: [...para(700), piece('4 Why Self-Attention', 500, 10)] },
    ];
    expect(sectionsFromText(pages).map((s) => s.title)).toEqual(['3 Model Architecture', '4 Why Self-Attention']);
  });

  it('lists the left column before the right one', () => {
    const col = (top: number, x: number) => Array.from({ length: 3 }, (_, i) => piece('words that fill one narrow column.', top - i * 12, 10, x));
    const left = (top: number) => col(top, 72);
    const right = (top: number) => col(top, 320);
    const pages: PageText[] = [
      {
        page: 1,
        pieces: [
          piece('1 Introduction', 700, 12),
          ...left(680),
          piece('3 Model', 700, 12, 320),
          ...right(680),
          piece('2 Background', 500, 12),
          ...left(480),
          piece('4 Training', 450, 12, 320),
          ...right(430),
        ],
      },
    ];
    expect(sectionsFromText(pages).map((s) => s.title)).toEqual(['1 Introduction', '2 Background', '3 Model', '4 Training']);
  });

  it('ignores numbered sentences, footnotes and table rows of figures', () => {
    const pages: PageText[] = [
      {
        page: 1,
        pieces: [
          ...para(700),
          piece('1 We train the model on eight GPUs for twelve hours.', 500),
          piece('2 https://github.com/example/code', 80, 8),
          piece('3 28.4 41.8 2.3 · 10', 400),
          piece('rest of the results.', 300),
        ],
      },
    ];
    expect(sectionsFromText(pages)).toEqual([]);
  });

  it('needs at least two headings to be worth a list', () => {
    expect(sectionsFromText([{ page: 1, pieces: [...para(700), piece('Introduction', 500, 12)] }])).toEqual([]);
  });
});
