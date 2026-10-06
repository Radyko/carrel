import type { Guide, GuideQuestion, PassStage, PurposeStage } from '../../shared/guide';
import type { Highlight } from '../../shared/highlights';
import type { OtherNote, PaperMeta, ReviewEntry } from '../../shared/paper';
import { suggestedPass } from '../../shared/progress';
import { AutoTextarea, ChecklistField, TermsField } from './fields';
import { Timer } from './Timer';

function Question({
  stageId,
  q,
  value,
  onChange,
  extra,
}: {
  stageId: string;
  q: GuideQuestion;
  value: string;
  onChange: (v: string) => void;
  extra?: React.ReactNode;
}) {
  const id = `q-${stageId}-${q.id}`;
  return (
    <div className={`question${q.recall ? ' recall' : ''}`}>
      <div className="q-head">
        <label className="q-label" htmlFor={id}>
          {q.label}
        </label>
        {extra}
      </div>
      {/* A text box shows its hint inside it; lists keep theirs above. */}
      {q.help && (q.type === 'checklist' || q.type === 'terms') && <p className="q-help">{q.help}</p>}
      {q.type === 'checklist' ? (
        <ChecklistField id={id} value={value} onChange={onChange} />
      ) : q.type === 'terms' ? (
        <TermsField id={id} value={value} onChange={onChange} />
      ) : (
        <AutoTextarea
          id={id}
          minRows={q.type === 'long' ? 4 : 2}
          value={value}
          placeholder={q.help}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function PurposeTab({
  stage,
  guide,
  meta,
  answers,
  onPurpose,
  onAnswer,
  onNext,
}: {
  stage: PurposeStage;
  guide: Guide;
  meta: PaperMeta;
  answers: Record<string, string>;
  onPurpose: (id: string) => void;
  onAnswer: (field: string, value: string) => void;
  onNext: () => void;
}) {
  const suggestion = suggestedPass(meta, guide);
  return (
    <section className="stage">
      <header className="stage-head">
        <h2>{stage.title}</h2>
        {stage.targetLabel && <span className="target-label">{stage.targetLabel}</span>}
      </header>
      {stage.goal && <p className="goal">{stage.goal}</p>}

      {stage.options.length > 0 && (
        <div className="question">
          <span className="q-label">{stage.choiceLabel}</span>
          <div className="choices" role="radiogroup" aria-label={stage.choiceLabel}>
            {stage.options.map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={meta.purpose === o.id}
                className={`choice${meta.purpose === o.id ? ' chosen' : ''}`}
                onClick={() => onPurpose(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {suggestion && (
            <p className="hint">
              Suggested depth: pass {suggestion.pass}. This is a hint; you decide after each pass.
            </p>
          )}
        </div>
      )}

      {stage.questions.map((q) => (
        <Question key={q.id} stageId={stage.id} q={q} value={answers[q.id] ?? ''} onChange={(v) => onAnswer(q.id, v)} />
      ))}

      <div className="decision">
        <button className="btn primary" onClick={onNext}>
          Start {guide.passes[0] ? `pass ${guide.passes[0].pass}: ${guide.passes[0].title}` : 'reading'}
        </button>
      </div>
    </section>
  );
}

function depthHint(stage: PassStage, meta: PaperMeta, guide: Guide): string | null {
  const s = suggestedPass(meta, guide);
  if (!s) return null;
  if (stage.pass < s.pass) return `For “${s.purpose}”, the suggested depth is pass ${s.pass}.`;
  if (stage.pass === s.pass) return `Pass ${s.pass} is the suggested depth for “${s.purpose}”. You can still go further.`;
  return `For “${s.purpose}”, pass ${s.pass} is usually enough. Going deeper is up to you.`;
}

export function PassTab(props: {
  stage: PassStage;
  guide: Guide;
  meta: PaperMeta;
  answers: Record<string, string>;
  purposeQuestions: string;
  hasPdf: boolean;
  pdfHidden: boolean;
  onTogglePdf: () => void;
  elapsed: number;
  timerRunning: boolean;
  onToggleTimer: () => void;
  onCheck: (ids: string[]) => void;
  onAnswer: (field: string, value: string) => void;
  onDecide: (option: string) => void;
}) {
  const { stage, guide, meta, answers } = props;
  const checked = meta.checklist[stage.id] ?? [];
  const decided = meta.decisions[stage.id];
  const hint = depthHint(stage, meta, guide);
  const chosen = stage.decisions.find((d) => d.id === decided);

  const recallButton = props.hasPdf ? (
    <button className={`btn small${props.pdfHidden ? ' primary' : ''}`} onClick={props.onTogglePdf}>
      {props.pdfHidden ? 'Show the PDF again' : 'Hide the PDF while I write'}
    </button>
  ) : null;

  return (
    <section className="stage">
      {props.purposeQuestions.trim() && (
        <aside className="my-questions">
          <span className="q-label">You are reading to find out</span>
          <p>{props.purposeQuestions}</p>
        </aside>
      )}

      <header className="stage-head">
        <h2>
          Pass {stage.pass}: {stage.title}
        </h2>
      </header>
      {stage.goal && <p className="goal">{stage.goal}</p>}
      {hint && <p className="hint">{hint}</p>}

      <Timer
        elapsed={props.elapsed}
        running={props.timerRunning}
        targetMinutes={stage.targetMinutes}
        targetLabel={stage.targetLabel}
        onToggle={props.onToggleTimer}
      />

      {stage.checklist.length > 0 && (
        <ul className="checklist">
          {stage.checklist.map((c) => {
            const on = checked.includes(c.id);
            return (
              <li key={c.id} className={on ? 'done' : ''}>
                <label>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      props.onCheck(
                        e.target.checked
                          ? stage.checklist.map((x) => x.id).filter((x) => x === c.id || checked.includes(x))
                          : checked.filter((x) => x !== c.id),
                      )
                    }
                  />
                  <span>{c.text}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {stage.questions.map((q) => (
        <div key={q.id}>
          {q.showPurposeQuestions && props.purposeQuestions.trim() && (
            <blockquote className="purpose-quote">{props.purposeQuestions}</blockquote>
          )}
          <Question
            stageId={stage.id}
            q={q}
            value={answers[q.id] ?? ''}
            onChange={(v) => props.onAnswer(q.id, v)}
            extra={q.recall ? recallButton : undefined}
          />
        </div>
      ))}

      {stage.decisions.length > 0 && (
        <div className="decision">
          <span className="q-label">{stage.decisionPrompt}</span>
          <div className="choices">
            {stage.decisions.map((d) => (
              <button
                key={d.id}
                className={`choice${decided === d.id ? ' chosen' : ''}`}
                aria-pressed={decided === d.id}
                onClick={() => props.onDecide(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
          {chosen?.help && <p className="hint">{chosen.help}</p>}
          {chosen?.status === 'read' && (
            <p className="hint">
              Marked as read at pass {stage.pass}.
              {meta.nextReview ? ' It will come back for a short recall check.' : ''}
            </p>
          )}
          {chosen?.note && (
            <div className="question">
              <label className="q-label" htmlFor={`q-${stage.id}-${chosen.note.id}`}>
                {chosen.note.label}
              </label>
              <AutoTextarea
                id={`q-${stage.id}-${chosen.note.id}`}
                value={answers[chosen.note.id] ?? ''}
                onChange={(e) => props.onAnswer(chosen.note!.id, e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function SharedNotes({
  guide,
  notes,
  other,
  reviews,
  onNotes,
  highlights,
  activeHighlightId,
  onOpenHighlight,
}: {
  guide: Guide;
  notes: string;
  other: OtherNote[];
  reviews: ReviewEntry[];
  onNotes: (v: string) => void;
  highlights: Highlight[];
  activeHighlightId: string | null;
  onOpenHighlight: (h: Highlight) => void;
}) {
  return (
    <section className="shared">
      {highlights.length > 0 && (
        <details className="other-notes highlights-list" open>
          <summary>
            {guide.highlightsHeading} ({highlights.length})
          </summary>
          {highlights.map((h) => (
            <button
              key={h.id}
              className={`hl-item hl-edge-${h.color}${h.id === activeHighlightId ? ' active' : ''}`}
              onClick={() => onOpenHighlight(h)}
              title="Open this highlight"
            >
              <span className="hl-quote">
                <span className="muted">p. {h.page} · </span>
                {h.text}
              </span>
              {h.note.trim() && <span className="hl-note">{h.note}</span>}
            </button>
          ))}
        </details>
      )}
      <div className="question">
        <div className="q-head">
          <label className="q-label" htmlFor="free-notes">
            {guide.notesHeading}
          </label>
        </div>
        <AutoTextarea
          id="free-notes"
          minRows={3}
          value={notes}
          placeholder="Anything that doesn’t fit the questions."
          onChange={(e) => onNotes(e.target.value)}
        />
      </div>

      {other.length > 0 && (
        <details className="other-notes" open>
          <summary>Other notes</summary>
          <p className="q-help">
            Text in the notes file under headings the guide doesn’t ask about. It is kept as it is; edit it in the
            notes file.
          </p>
          {other.map((o, i) => (
            <div key={i} className="other-note">
              <h4>{o.heading}</h4>
              <p className="selectable">{o.text}</p>
            </div>
          ))}
        </details>
      )}

      {reviews.length > 0 && (
        <details className="other-notes">
          <summary>
            {guide.reviewsHeading} ({reviews.length})
          </summary>
          {reviews.map((r, i) => (
            <div key={i} className="other-note">
              <h4>{r.heading}</h4>
              <p className="selectable">{r.text}</p>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
