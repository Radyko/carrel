import { describe, expect, it } from 'vitest';
import { formatChecklist, formatTerms, parseChecklist, parseTerms } from '../src/shared/fieldFormat';

describe('structured answers', () => {
  it('round-trips a checklist', () => {
    const text = '- [ ] Volta whitepaper\n- [x] Roofline (Williams 2009)';
    const p = parseChecklist(text);
    expect(p.items).toEqual([
      { done: false, text: 'Volta whitepaper' },
      { done: true, text: 'Roofline (Williams 2009)' },
    ]);
    expect(formatChecklist(p)).toBe(text);
  });

  it('keeps lines that are not list items', () => {
    const p = parseChecklist('Some intro\n- plain bullet\n- [X] done');
    expect(p.items).toEqual([
      { done: false, text: 'plain bullet' },
      { done: true, text: 'done' },
    ]);
    expect(formatChecklist(p)).toBe('- [ ] plain bullet\n- [x] done\n\nSome intro');
  });

  it('round-trips terms', () => {
    const text = '- **SIMT**: single instruction, multiple threads\n- **Occupancy**: active warps / max warps\n- **Warp**';
    const p = parseTerms(text);
    expect(p.items).toEqual([
      { term: 'SIMT', meaning: 'single instruction, multiple threads' },
      { term: 'Occupancy', meaning: 'active warps / max warps' },
      { term: 'Warp', meaning: '' },
    ]);
    expect(formatTerms(p)).toBe(text);
    expect(parseTerms('- TLB: translation cache').items).toEqual([{ term: 'TLB', meaning: 'translation cache' }]);
  });
});
