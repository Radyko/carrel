import { describe, expect, it } from 'vitest';
import type { ChecklistItem } from '../src/shared/guide';
import { emptyLandmarks, type Region } from '../src/shared/landmarks';
import { buildStops } from '../src/shared/tour';

const at = (page: number, y: number, label?: string): Region => ({ page, rect: [0.1, y, 0.8, 0.1], ...(label ? { label } : {}) });
const step = (id: string, spotlight: ChecklistItem['spotlight']): ChecklistItem => ({ id, text: id, spotlight });

describe('buildStops', () => {
  const landmarks = {
    ...emptyLandmarks(),
    title: [at(1, 0.1)],
    abstract: [at(1, 0.3)],
    introduction: [at(1, 0.6), at(2, 0.1)],
    conclusion: [at(9, 0.4)],
    headings: [at(1, 0.3, 'Abstract'), at(1, 0.6, '1 Introduction'), at(2, 0.5, '2 Method')],
    figures: [],
  };
  const stops = buildStops(
    [step('abstract', ['title', 'abstract']), step('conclusion', ['introduction', 'conclusion']), step('headings', ['headings']), step('figures', ['figures']), step('plain', [])],
    landmarks,
  );

  it('goes through the steps in order, one page at a time', () => {
    expect(stops.map((s) => [s.stepId, s.lit[0].page, s.part, s.parts])).toEqual([
      ['abstract', 1, 0, 1],
      ['conclusion', 1, 0, 3],
      ['conclusion', 2, 1, 3],
      ['conclusion', 9, 2, 3],
      ['headings', 1, 0, 1],
    ]);
  });

  it('numbers only the steps found, and skips the rest', () => {
    expect(stops.map((s) => s.step)).toEqual([0, 1, 1, 1, 2]);
  });

  it('names the parts once per page, and reads headings as an outline', () => {
    expect(stops[0].lit.map((r) => r.tag)).toEqual(['Title', 'Abstract']);
    expect(stops[2].lit.map((r) => r.tag)).toEqual(['Introduction']);
    expect(stops[4].outline?.map((r) => r.label)).toEqual(['Abstract', '1 Introduction', '2 Method']);
  });

  it('asks what to look for', () => {
    expect(stops[0].hint).toBe('What is it about, and what does it claim?');
    expect(stops[3].hint).toBe('What do the authors say they showed?');
  });
});
