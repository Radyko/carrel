import { beforeAll, describe, expect, it } from 'vitest';
import type { Guide } from '../src/shared/guide';
import { emptyMeta } from '../src/shared/paper';
import { initialStage, progressFromDecision, progressFromEdit } from '../src/shared/progress';
import { defaultGuide } from './helpers';

let guide: Guide;
beforeAll(async () => {
  guide = await defaultGuide();
});

describe('progress', () => {
  it('starts a paper when anything is written', () => {
    expect(progressFromEdit(emptyMeta(), guide, 'purpose')).toEqual({ status: 'in-progress' });
    expect(progressFromEdit(emptyMeta(), guide, 'pass2')).toEqual({ status: 'in-progress', furthestPass: 2 });
    expect(progressFromEdit({ ...emptyMeta(), status: 'read', furthestPass: 3 }, guide, 'pass1')).toEqual({});
  });

  it('marks a paper read at pass 1 when stopping, without scheduling review', () => {
    const c = progressFromDecision(emptyMeta(), guide, 'pass1', 'stop', '2026-10-03');
    expect(c).toEqual({ decisions: { pass1: 'stop' }, status: 'read', furthestPass: 1 });
  });

  it('schedules review when done at pass 2', () => {
    const c = progressFromDecision({ ...emptyMeta(), furthestPass: 2 }, guide, 'pass2', 'done', '2026-10-03');
    expect(c).toMatchObject({ status: 'read', nextReview: '2026-10-10', reviewInterval: 7 });
  });

  it('keeps an existing schedule when finishing a later pass', () => {
    const meta = { ...emptyMeta(), furthestPass: 2, nextReview: '2026-11-01', reviewInterval: 30 };
    const c = progressFromDecision(meta, guide, 'pass3', 'done', '2026-10-20');
    expect(c).toMatchObject({ furthestPass: 3, nextReview: '2026-11-01', reviewInterval: 30 });
  });

  it('sets aside', () => {
    expect(progressFromDecision(emptyMeta(), guide, 'pass2', 'set-aside', '2026-10-03').status).toBe('set-aside');
  });

  it('opens on purpose for a new paper, otherwise where the reader left off', () => {
    expect(initialStage(emptyMeta(), guide)).toBe('purpose');
    expect(initialStage({ ...emptyMeta(), purpose: 'course', status: 'in-progress' }, guide)).toBe('pass1');
    expect(initialStage({ ...emptyMeta(), furthestPass: 1, decisions: { pass1: 'continue' } }, guide)).toBe('pass2');
    expect(initialStage({ ...emptyMeta(), furthestPass: 1, decisions: { pass1: 'stop' } }, guide)).toBe('pass1');
  });
});
