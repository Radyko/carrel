// How working on a paper changes its status, furthest pass and review schedule.

import type { Guide } from './guide';
import type { PaperMeta } from './paper';
import { scheduleOnFinish } from './review';

function passNumber(guide: Guide, stageId: string): number {
  return guide.passes.find((p) => p.id === stageId)?.pass ?? 0;
}

/** Changes that follow from writing anything in a stage. */
export function progressFromEdit(meta: PaperMeta, guide: Guide, stageId: string): Partial<PaperMeta> {
  const change: Partial<PaperMeta> = {};
  if (meta.status === 'to-read') change.status = 'in-progress';
  const pass = passNumber(guide, stageId);
  if (pass > meta.furthestPass) change.furthestPass = pass;
  return change;
}

/** Changes that follow from choosing a decision at the end of a pass. */
export function progressFromDecision(
  meta: PaperMeta,
  guide: Guide,
  stageId: string,
  optionId: string,
  today: string,
): Partial<PaperMeta> {
  const stage = guide.passes.find((p) => p.id === stageId);
  const option = stage?.decisions.find((d) => d.id === optionId);
  if (!stage || !option) return {};
  const change: Partial<PaperMeta> = {
    decisions: { ...meta.decisions, [stageId]: optionId },
    status: option.status,
  };
  if (stage.pass > meta.furthestPass) change.furthestPass = stage.pass;
  if (option.scheduleReview) Object.assign(change, scheduleOnFinish(meta, guide.review.intervals, today));
  return change;
}

/** The tab to show when a paper is opened. */
export function initialStage(meta: PaperMeta, guide: Guide): string {
  if (meta.furthestPass === 0 && !meta.purpose && meta.status === 'to-read') return guide.purpose.id;
  const current = guide.passes.find((p) => p.pass === meta.furthestPass) ?? guide.passes[0];
  const decision = current.decisions.find((d) => d.id === meta.decisions[current.id]);
  if (decision?.next && guide.passes.some((p) => p.id === decision.next)) return decision.next;
  return current.id;
}

/** The depth suggested by the reading purpose, if any. */
export function suggestedPass(meta: PaperMeta, guide: Guide): { pass: number; purpose: string } | null {
  const option = guide.purpose.options.find((o) => o.id === meta.purpose);
  return option?.suggestedPass ? { pass: option.suggestedPass, purpose: option.label } : null;
}
