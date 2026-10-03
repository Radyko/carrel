// Spaced review. A paper finished at a pass that schedules review is due after
// the first interval. "Remembered" moves it to the next interval, "Fuzzy"
// repeats the current one, and after the last interval is remembered the paper
// leaves the schedule. Intervals are stored in days, so editing the intervals
// in the guide never strands a paper.

import { addDays } from './dates';
import type { PaperMeta } from './paper';

export type ReviewOutcome = 'remembered' | 'fuzzy';

type Schedule = Pick<PaperMeta, 'nextReview' | 'reviewInterval'>;

export function isDue(meta: Pick<PaperMeta, 'nextReview'>, today: string): boolean {
  return !!meta.nextReview && meta.nextReview <= today;
}

/** The schedule after finishing a paper. A paper already scheduled keeps its schedule. */
export function scheduleOnFinish(meta: Schedule, intervals: number[], today: string): Schedule {
  if (meta.nextReview || meta.reviewInterval || intervals.length === 0) {
    return { nextReview: meta.nextReview, reviewInterval: meta.reviewInterval };
  }
  return { nextReview: addDays(today, intervals[0]), reviewInterval: intervals[0] };
}

export function scheduleAfterReview(
  meta: Schedule,
  intervals: number[],
  outcome: ReviewOutcome,
  today: string,
): Schedule {
  const current = meta.reviewInterval ?? intervals[0] ?? null;
  if (current === null) return { nextReview: null, reviewInterval: null };
  if (outcome === 'fuzzy') return { nextReview: addDays(today, current), reviewInterval: current };
  const next = intervals.find((d) => d > current);
  if (next === undefined) return { nextReview: null, reviewInterval: current };
  return { nextReview: addDays(today, next), reviewInterval: next };
}

/** Skipping puts the review off until tomorrow without recording anything. */
export function scheduleAfterSkip(meta: Schedule, today: string): Schedule {
  return { nextReview: addDays(today, 1), reviewInterval: meta.reviewInterval };
}

export function removeFromSchedule(meta: Schedule): Schedule {
  return { nextReview: null, reviewInterval: meta.reviewInterval };
}

export function describeInterval(days: number | null): string {
  if (!days) return '';
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days % 30 === 0) return days === 30 ? '1 month' : `${days / 30} months`;
  if (days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}
