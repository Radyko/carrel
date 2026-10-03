import { describe, expect, it } from 'vitest';
import { addDays } from '../src/shared/dates';
import {
  describeInterval,
  isDue,
  removeFromSchedule,
  scheduleAfterReview,
  scheduleAfterSkip,
  scheduleOnFinish,
} from '../src/shared/review';

const intervals = [7, 30, 90];
const none = { nextReview: null, reviewInterval: null };

describe('review intervals', () => {
  it('schedules the first review a week after finishing', () => {
    expect(scheduleOnFinish(none, intervals, '2026-10-03')).toEqual({ nextReview: '2026-10-10', reviewInterval: 7 });
  });

  it('does not reschedule a paper that is already on the schedule', () => {
    const s = { nextReview: '2026-11-01', reviewInterval: 30 };
    expect(scheduleOnFinish(s, intervals, '2026-10-20')).toEqual(s);
    // Nor one that finished or was removed from the schedule.
    expect(scheduleOnFinish({ nextReview: null, reviewInterval: 90 }, intervals, '2026-10-20')).toEqual({
      nextReview: null,
      reviewInterval: 90,
    });
  });

  it('moves through 1 week, 1 month, 3 months when remembered, then stops', () => {
    let s = scheduleOnFinish(none, intervals, '2026-01-01');
    expect(s).toEqual({ nextReview: '2026-01-08', reviewInterval: 7 });
    s = scheduleAfterReview(s, intervals, 'remembered', '2026-01-08');
    expect(s).toEqual({ nextReview: '2026-02-07', reviewInterval: 30 });
    s = scheduleAfterReview(s, intervals, 'remembered', '2026-02-07');
    expect(s).toEqual({ nextReview: '2026-05-08', reviewInterval: 90 });
    s = scheduleAfterReview(s, intervals, 'remembered', '2026-05-08');
    expect(s).toEqual({ nextReview: null, reviewInterval: 90 });
  });

  it('repeats the current interval when fuzzy', () => {
    const s = { nextReview: '2026-02-07', reviewInterval: 30 };
    expect(scheduleAfterReview(s, intervals, 'fuzzy', '2026-02-09')).toEqual({ nextReview: '2026-03-11', reviewInterval: 30 });
    const first = { nextReview: '2026-01-08', reviewInterval: 7 };
    expect(scheduleAfterReview(first, intervals, 'fuzzy', '2026-01-08')).toEqual({ nextReview: '2026-01-15', reviewInterval: 7 });
  });

  it('counts the next interval from the day of the review, not the due date', () => {
    const late = { nextReview: '2026-01-08', reviewInterval: 7 };
    expect(scheduleAfterReview(late, intervals, 'remembered', '2026-01-20').nextReview).toBe('2026-02-19');
  });

  it('copes with intervals changed in the guide', () => {
    // A paper at 30 days when the guide now says [14, 60].
    expect(scheduleAfterReview({ nextReview: 'x', reviewInterval: 30 }, [14, 60], 'remembered', '2026-01-01')).toEqual({
      nextReview: '2026-03-02',
      reviewInterval: 60,
    });
    expect(scheduleAfterReview({ nextReview: 'x', reviewInterval: 30 }, [14, 60], 'fuzzy', '2026-01-01').reviewInterval).toBe(30);
  });

  it('skips to tomorrow and removes from the schedule', () => {
    const s = { nextReview: '2026-01-08', reviewInterval: 7 };
    expect(scheduleAfterSkip(s, '2026-01-10')).toEqual({ nextReview: '2026-01-11', reviewInterval: 7 });
    expect(removeFromSchedule(s)).toEqual({ nextReview: null, reviewInterval: 7 });
  });

  it('is due on and after the review date', () => {
    expect(isDue({ nextReview: '2026-01-08' }, '2026-01-07')).toBe(false);
    expect(isDue({ nextReview: '2026-01-08' }, '2026-01-08')).toBe(true);
    expect(isDue({ nextReview: '2026-01-08' }, '2026-03-01')).toBe(true);
    expect(isDue({ nextReview: null }, '2026-03-01')).toBe(false);
  });

  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2028-02-27', 2)).toBe('2028-02-29');
    expect(addDays('2026-03-07', 30)).toBe('2026-04-06');
  });

  it('describes intervals in words', () => {
    expect([7, 30, 90, 14, 3, 365].map(describeInterval)).toEqual(['1 week', '1 month', '3 months', '2 weeks', '3 days', '1 year']);
  });
});
