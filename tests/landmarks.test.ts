import { describe, expect, it } from 'vitest';
import { findLandmarks, headingWords, namedSection, type Line, type OutlineEntry, type PageText } from '../src/shared/landmarks';

const W = 612;
const H = 792;
const BODY = 'Body text of the paper goes on here, line after line, as running text does.';

const line = (text: string, x: number, top: number, extra: Partial<Line> = {}): Line => ({
  text,
  x,
  top,
  width: extra.width ?? Math.min(text.length * 5, 460),
  size: 10,
  font: 'body',
  ...extra,
});
const heading = (text: string, x: number, top: number) => line(text, x, top, { size: 12, font: 'bold', width: text.length * 6 });
/** Lines of running text in a column, from top to bottom. */
const prose = (x: number, from: number, to: number, width = 460) => {
  const out: Line[] = [];
  for (let top = from; top < to; top += 12) out.push(line(BODY, x, top, { width }));
  return out;
};
const page = (lines: Line[]): PageText => ({ width: W, height: H, lines });

/** Bottom edge of a region, in PDF units. */
const bottom = (r: { rect: number[] }) => (r.rect[1] + r.rect[3]) * H;
const top = (r: { rect: number[] }) => r.rect[1] * H;

describe('headings', () => {
  it('reads names without numbering', () => {
    expect(headingWords('1 Introduction')).toBe('introduction');
    expect(headingWords('IV. Conclusions')).toBe('conclusions');
    expect(namedSection('6. Concluding Remarks')).toBe('conclusion');
    expect(namedSection('References')).toBe('references');
    expect(namedSection('Related Work')).toBeNull();
  });
});

describe('findLandmarks, one column', () => {
  const pages = [
    page([
      line('A Study of Reading Papers Quickly', 150, 80, { size: 20, font: 'bold', width: 320 }),
      line('Ada Lovelace', 260, 120),
      heading('Abstract', 280, 170),
      ...prose(100, 190, 290, 410),
      heading('1 Introduction', 76, 320),
      ...prose(76, 340, 720),
    ]),
    page([...prose(76, 72, 300), heading('2 Method', 76, 320), ...prose(76, 340, 720)]),
    page([
      ...prose(76, 72, 200),
      heading('3 Conclusion', 76, 220),
      ...prose(76, 240, 400),
      heading('References', 76, 420),
      ...prose(76, 440, 720).map((l) => ({ ...l, size: 8 })),
    ]),
  ];

  const found = findLandmarks(pages, []);

  it('finds the title', () => {
    expect(found.title).toHaveLength(1);
    expect(top(found.title[0])).toBeLessThan(80);
  });

  it('runs a section from its heading to the next one', () => {
    expect(found.abstract).toHaveLength(1);
    expect(top(found.abstract[0])).toBeLessThan(170);
    expect(bottom(found.abstract[0])).toBeLessThan(323);
    expect(found.introduction.map((r) => r.page)).toEqual([1, 2]);
    expect(bottom(found.introduction[1])).toBeLessThan(323);
    expect(found.conclusion).toHaveLength(1);
    expect(bottom(found.conclusion[0])).toBeLessThan(423);
  });

  it('lights a reference list set in small type', () => {
    expect(found.references).toHaveLength(1);
    expect(bottom(found.references[0])).toBeGreaterThan(700);
  });

  it('lists every heading, and not a title that starts with "A"', () => {
    expect(found.headings).toHaveLength(5);
  });
});

describe('findLandmarks, two columns', () => {
  const L = 54;
  const R = 318;
  const colW = 240;
  const pages = [
    page([
      line('Two Columns of Careful Thought', 140, 70, { size: 18, font: 'bold', width: 330 }),
      heading('Abstract', L, 140),
      ...prose(L, 160, 300, colW),
      heading('1 Introduction', L, 320),
      ...prose(L, 340, 720, colW),
      ...prose(R, 140, 500, colW),
      heading('2 Related Work', R, 520),
      ...prose(R, 540, 720, colW),
    ]),
  ];
  const found = findLandmarks(pages, []);

  it('follows the text into the next column', () => {
    expect(found.introduction).toHaveLength(2);
    const [left, right] = found.introduction;
    expect(left.rect[0] * W).toBeLessThan(L);
    expect(right.rect[0] * W).toBeGreaterThan(R - 10);
    expect(bottom(right)).toBeLessThan(523);
  });
});

describe('findLandmarks, bookmarks and contents', () => {
  it('uses bookmarks, which find headings that look like body text', () => {
    const pages = [page([...prose(76, 72, 300), line('Background', 76, 320), ...prose(76, 340, 720)])];
    const outline: OutlineEntry[] = [{ title: 'Background', level: 1, page: 1, x: 76, top: 318 }];
    expect(findLandmarks(pages, []).headings).toHaveLength(0);
    expect(findLandmarks(pages, outline).headings).toHaveLength(1);
  });

  it('skips a table of contents', () => {
    const pages = [
      page([
        heading('Contents', 76, 72),
        line('1 Introduction 3', 76, 100, { font: 'bold', size: 11 }),
        line('2 Conclusion 9', 76, 115, { font: 'bold', size: 11 }),
        ...prose(76, 140, 720),
      ]),
    ];
    const found = findLandmarks(pages, []);
    expect(found.introduction).toHaveLength(0);
    expect(found.conclusion).toHaveLength(0);
  });

  it('skips a table of contents whose page numbers stand apart', () => {
    const pages = [
      page([
        heading('Contents', 76, 72),
        line('1 Introduction', 76, 100, { font: 'bold', size: 11, width: 70 }),
        line('3', 530, 100, { font: 'bold', size: 11, width: 5 }),
        ...prose(76, 140, 720),
      ]),
    ];
    expect(findLandmarks(pages, []).introduction).toHaveLength(0);
  });

  it('prefers a bookmarked heading to the same name in the text', () => {
    const pages = [
      page([heading('Introduction', 76, 72), ...prose(76, 100, 720)]),
      page([heading('1 Introduction', 76, 72), ...prose(76, 100, 720)]),
    ];
    const outline: OutlineEntry[] = [{ title: '1 Introduction', level: 1, page: 2, x: 76, top: 70 }];
    expect(findLandmarks(pages, outline).introduction[0].page).toBe(2);
  });

  it('finds nothing in a PDF without text', () => {
    const found = findLandmarks([page([]), page([])], []);
    expect(Object.values(found).every((r) => r.length === 0)).toBe(true);
  });
});

describe('findLandmarks, figures and tables', () => {
  const pages = [
    page([
      ...prose(76, 72, 200),
      // A picture (no text) between y=210 and y=400, with its caption below.
      line('Figure 1: How the parts fit together.', 76, 410, { width: 200 }),
      ...prose(76, 440, 520),
      // A table with its caption above and short cells below.
      line('Table 1: Results.', 76, 540, { width: 90 }),
      line('Model  Score', 120, 560, { width: 80 }),
      line('Ours  91.2', 120, 572, { width: 70 }),
      line('Theirs  88.0', 120, 584, { width: 70 }),
      ...prose(76, 610, 720),
    ]),
  ];
  const [figure, table] = findLandmarks(pages, []).figures;

  it('lights a figure above its caption', () => {
    expect(top(figure)).toBeLessThan(215);
    expect(top(figure)).toBeGreaterThan(195);
    expect(bottom(figure)).toBeGreaterThan(415);
    expect(bottom(figure)).toBeLessThan(440);
  });

  it('lights a table below its caption', () => {
    expect(top(table)).toBeLessThan(540);
    expect(bottom(table)).toBeGreaterThan(590);
    expect(bottom(table)).toBeLessThan(615);
  });

  it('ignores mentions of figures in running text', () => {
    const found = findLandmarks([page([line('Figure 3 shows the results of the experiment we ran.', 76, 100), ...prose(76, 120, 700)])], []);
    expect(found.figures).toHaveLength(0);
  });
});
