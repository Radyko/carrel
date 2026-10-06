import type { Region } from '../../shared/landmarks';
import type { Stop } from '../../shared/tour';

// The card that leads the survey guide over the PDF.

interface CardProps {
  stops: Stop[];
  /** The stop being shown, or null before starting (or after Escape). */
  index: number | null;
  /** Where Start picks up. */
  resumeAt: number;
  done: boolean;
  onGo: (index: number) => void;
  onNext: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onClose: () => void;
  onReveal: (r: Region) => void;
}

/** The card floating over the PDF that leads the survey. */
export function TourCard(props: CardProps) {
  const { stops, index } = props;
  const steps = stops.filter((s) => s.part === 0);

  if (props.done) {
    return (
      <div className="tour-card" role="dialog" aria-label="Survey guide">
        <div className="tour-head">
          <span className="tour-kicker">Survey done</span>
          <button className="btn quiet icon small" onClick={props.onClose} title="Close the guide" aria-label="Close the guide">
            ×
          </button>
        </div>
        <p className="tour-title">Now answer the questions on the right, from memory.</p>
        <div className="tour-actions">
          <button className="btn small" onClick={props.onRestart}>
            Start over
          </button>
          <span className="spacer" />
          <button className="btn small primary" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (index === null) {
    const resuming = props.resumeAt > 0;
    return (
      <div className="tour-card" role="dialog" aria-label="Survey guide">
        <div className="tour-head">
          <span className="tour-kicker">Survey guide</span>
          <button className="btn quiet icon small" onClick={props.onClose} title="Close the guide" aria-label="Close the guide">
            ×
          </button>
        </div>
        <p className="tour-title">Skim this paper in {steps.length} steps</p>
        <ol className="tour-steps">
          {steps.map((s) => (
            <li key={s.stepId} className={stops[props.resumeAt].step > s.step ? 'done' : ''}>
              {s.stepText}
            </li>
          ))}
        </ol>
        <div className="tour-actions">
          <span className="tour-note">Carrel lights up each part and dims the rest.</span>
          <span className="spacer" />
          <button className="btn small primary" onClick={() => props.onGo(props.resumeAt)}>
            {resuming ? 'Resume' : 'Start'}
          </button>
        </div>
      </div>
    );
  }

  const stop = stops[index];
  const lastOfStep = stop.part === stop.parts - 1;
  const last = index === stops.length - 1;
  return (
    <div className="tour-card" role="dialog" aria-label="Survey guide" aria-live="polite">
      <div className="tour-head">
        <span className="tour-kicker">
          Step {stop.step + 1} of {steps.length}
        </span>
        <span className="tour-progress" aria-hidden="true">
          {steps.map((s) => (
            <span key={s.stepId} className={`tour-dot${s.step < stop.step ? ' done' : s.step === stop.step ? ' now' : ''}`} />
          ))}
        </span>
        <button className="btn quiet icon small" onClick={props.onClose} title="Close the guide (Escape pauses it)" aria-label="Close the guide">
          ×
        </button>
      </div>
      <p className="tour-title">{stop.stepText}</p>
      <p className="tour-hint">{stop.hint}</p>
      {stop.outline && (
        <ol className="tour-outline">
          {stop.outline.map((h, i) => (
            <li key={i}>
              <button type="button" onClick={() => props.onReveal(h)}>
                <span>{h.label}</span>
                <span className="tour-page">p. {h.page}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="tour-actions">
        <button className="btn small" onClick={() => props.onGo(index - 1)} disabled={index === 0}>
          ‹ Back
        </button>
        {stop.parts > 1 && (
          <span className="tour-part">
            Page {stop.lit[0].page} · {stop.part + 1} of {stop.parts}
          </span>
        )}
        <span className="spacer" />
        {!last && !lastOfStep && (
          <button className="btn quiet small" onClick={props.onSkip} title="Go to the next step without ticking this one">
            Skip step
          </button>
        )}
        <button className="btn small primary" onClick={props.onNext} autoFocus>
          {last ? 'Finish ✓' : lastOfStep ? 'Done, next step ›' : 'Next ›'}
        </button>
      </div>
    </div>
  );
}
