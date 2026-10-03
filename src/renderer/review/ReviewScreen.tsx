import { useEffect, useRef, useState } from 'react';
import { summaryFields, type Guide } from '../../shared/guide';
import type { PaperDoc, PaperMeta } from '../../shared/paper';
import {
  describeInterval,
  removeFromSchedule,
  scheduleAfterReview,
  scheduleAfterSkip,
  type ReviewOutcome,
} from '../../shared/review';
import { api } from '../api';
import { AutoTextarea } from '../reader/fields';

interface Props {
  ids: string[];
  guide: Guide;
  today: string;
  isMac: boolean;
  onDone: () => void;
  onError: (err: unknown) => void;
}

/** A short recall check: write what you remember, then compare with your saved summaries. */
export function ReviewScreen({ ids, guide, today, isMac, onDone, onError }: Props) {
  const [index, setIndex] = useState(0);
  const [doc, setDoc] = useState<PaperDoc | null>(null);
  const [recall, setRecall] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ReviewOutcome[]>([]);
  const textRef = useRef<HTMLDivElement>(null);
  const finished = index >= ids.length;

  useEffect(() => {
    if (finished) return;
    let cancelled = false;
    setDoc(null);
    setRecall('');
    setRevealed(false);
    api.readPaper(ids[index]).then(
      (d) => !cancelled && setDoc(d),
      (err) => {
        onError(err);
        setIndex((i) => i + 1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ids, index, finished, onError]);

  useEffect(() => {
    if (doc && !revealed) textRef.current?.querySelector('textarea')?.focus();
  }, [doc, revealed]);

  async function save(meta: Partial<PaperMeta>, outcome?: ReviewOutcome) {
    if (!doc) return;
    setBusy(true);
    try {
      const label = outcome === 'remembered' ? guide.review.remembered : guide.review.fuzzy;
      await api.updatePaper(doc.id, {
        meta,
        touch: !!outcome,
        appendReview: outcome
          ? { heading: `${today} · ${label}`, text: recall.trim() || '(Nothing written.)' }
          : undefined,
      });
      if (outcome) setResults((r) => [...r, outcome]);
      setIndex((i) => i + 1);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  const mark = (outcome: ReviewOutcome) =>
    doc && save(scheduleAfterReview(doc.meta, guide.review.intervals, outcome, today), outcome);

  if (finished) {
    const remembered = results.filter((r) => r === 'remembered').length;
    return (
      <div className="review">
        <div className={`toolbar${isMac ? ' inset' : ''}`}>
          <button className="btn quiet" onClick={onDone}>
            ‹ Library
          </button>
        </div>
        <div className="review-body center">
          <h2>All caught up</h2>
          <p className="muted">
            {results.length === 0
              ? 'No reviews recorded.'
              : `You reviewed ${results.length} ${results.length === 1 ? 'paper' : 'papers'}; ${remembered} remembered, ${results.length - remembered} fuzzy. Each review was added to the paper’s notes.`}
          </p>
          <button className="btn primary" onClick={onDone} autoFocus>
            Back to the library
          </button>
        </div>
      </div>
    );
  }

  const fields = summaryFields(guide);
  const nextIfRemembered = doc ? scheduleAfterReview(doc.meta, guide.review.intervals, 'remembered', today) : null;
  const current = doc?.meta.reviewInterval ?? guide.review.intervals[0] ?? null;

  return (
    <div className="review">
      <div className={`toolbar${isMac ? ' inset' : ''}`}>
        <button className="btn quiet" onClick={onDone}>
          ‹ Library
        </button>
        <span className="title">
          Review {ids.length > 1 ? `${index + 1} of ${ids.length}` : ''}
        </span>
        <span className="spacer" />
        {guide.review.targetLabel && <span className="muted">{guide.review.targetLabel}</span>}
      </div>
      {!doc ? (
        <div className="loading">Opening…</div>
      ) : (
        <div className="review-body">
          <header className="review-paper">
            <h2>{doc.meta.title}</h2>
            <p className="muted">{doc.meta.authors.join(', ')}</p>
          </header>

          {!revealed ? (
            <div className="review-recall" ref={textRef}>
              <label className="q-label" htmlFor="recall">
                {guide.review.prompt}
              </label>
              {guide.review.help && <p className="q-help">{guide.review.help}</p>}
              <AutoTextarea id="recall" minRows={7} value={recall} onChange={(e) => setRecall(e.target.value)} />
              <div className="review-actions">
                <button className="btn primary" onClick={() => setRevealed(true)}>
                  Compare with my summaries
                </button>
                <span className="spacer" />
                <button className="btn quiet" disabled={busy} onClick={() => save(scheduleAfterSkip(doc.meta, today))} title="Ask again tomorrow">
                  Skip for now
                </button>
                <button className="btn quiet" disabled={busy} onClick={() => save(removeFromSchedule(doc.meta))} title="Stop reviewing this paper">
                  Remove from schedule
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="compare">
                <section>
                  <h3>What you remembered</h3>
                  <p className={`selectable${recall.trim() ? '' : ' none'}`}>{recall.trim() || 'Nothing written.'}</p>
                </section>
                <section>
                  <h3>What you wrote when you read it</h3>
                  {fields.map(({ stage, question }) => {
                    const text = doc.answers[stage.id]?.[question.id] ?? '';
                    return (
                      <div key={`${stage.id}.${question.id}`} className="summary-block">
                        <h4>{question.label}</h4>
                        <p className={text ? 'selectable' : 'none'}>{text || 'Not written.'}</p>
                      </div>
                    );
                  })}
                </section>
              </div>
              <div className="review-actions">
                <button className="btn primary" disabled={busy} onClick={() => mark('remembered')}>
                  {guide.review.remembered}
                </button>
                <button className="btn" disabled={busy} onClick={() => mark('fuzzy')}>
                  {guide.review.fuzzy}
                </button>
                <span className="hint">
                  {nextIfRemembered?.nextReview
                    ? `${guide.review.remembered}: next review in ${describeInterval(nextIfRemembered.reviewInterval)}. ${guide.review.fuzzy}: again in ${describeInterval(current)}.`
                    : `${guide.review.remembered}: this was the last review. ${guide.review.fuzzy}: again in ${describeInterval(current)}.`}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
