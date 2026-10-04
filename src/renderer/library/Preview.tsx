import type { Guide } from '../../shared/guide';
import type { PaperSummary } from '../../shared/paper';
import { summaryFields } from '../../shared/guide';
import { describeInterval, isDue } from '../../shared/review';
import { api } from '../api';
import { duration, friendlyDate, fullDate, stars } from '../format';

const STATUS_LABEL: Record<string, string> = {
  'to-read': 'To read',
  'in-progress': 'In progress',
  read: 'Read',
  'set-aside': 'Set aside',
};

interface Props {
  paper: PaperSummary | null;
  guide: Guide;
  today: string;
  isMac: boolean;
  topics: string[];
  collections: string[];
  onCollection: (name: string) => void;
  onCollectionsMenu: (id: string) => void;
  onOpen: (id: string) => void;
  onReview: (id: string) => void;
  onEdit: (id: string) => void;
  onReveal: (id: string) => void;
  onTrash: (id: string) => void;
  onTopic: (topic: string) => void;
}

export function Preview({ paper, guide, today, isMac, ...on }: Props) {
  if (!paper) return <aside className="preview empty">Select a paper to see your notes on it.</aside>;
  const m = paper.meta;
  const purpose = guide.purpose.options.find((o) => o.id === m.purpose);
  const spent = Object.values(m.timeSpent).reduce((a, b) => a + b, 0);
  const due = isDue(m, today);
  const readAt = m.status === 'read' && m.furthestPass ? ` at pass ${m.furthestPass}` : '';

  return (
    <aside className="preview" aria-label="Paper preview">
      <h2>{m.title}</h2>
      <p className="byline">
        {m.authors.join(', ')}
        {(m.year || m.venue) && (
          <>
            {m.authors.length ? <br /> : null}
            {[m.venue, m.year].filter(Boolean).join(', ')}
          </>
        )}
      </p>

      <div className="actions">
        <button className="btn primary" onClick={() => on.onOpen(paper.id)}>
          Open
        </button>
        {due && (
          <button className="btn" onClick={() => on.onReview(paper.id)}>
            Review now
          </button>
        )}
        <button className="btn" onClick={() => on.onEdit(paper.id)}>
          Edit details…
        </button>
        <button className="btn" onClick={() => on.onReveal(paper.id)}>
          {isMac ? 'Reveal in Finder' : 'Show in folder'}
        </button>
      </div>

      <dl className="facts">
        <dt>Status</dt>
        <dd>
          {STATUS_LABEL[m.status]}
          {readAt}
        </dd>
        {purpose && (
          <>
            <dt>Purpose</dt>
            <dd>{purpose.label}</dd>
          </>
        )}
        {m.rating && (
          <>
            <dt>Rating</dt>
            <dd className="stars">{stars(m.rating)}</dd>
          </>
        )}
        {m.topics.length > 0 && (
          <>
            <dt>Topics</dt>
            <dd className="chips">
              {m.topics.map((t) => (
                <button key={t} className="chip" onClick={() => on.onTopic(t)}>
                  {t}
                </button>
              ))}
            </dd>
          </>
        )}
        <dt>Collections</dt>
        <dd className="chips">
          {m.collections.map((c) => (
            <button key={c} className="chip" onClick={() => on.onCollection(c)}>
              {c}
            </button>
          ))}
          <button
            className="chip add"
            onClick={() => on.onCollectionsMenu(paper.id)}
            title="Add to or remove from collections"
          >
            {m.collections.length ? 'Edit…' : 'Add to collection…'}
          </button>
        </dd>
        {m.link && (
          <>
            <dt>Link</dt>
            <dd>
              <a className="link" onClick={() => api.openLink(m.link)} title={m.link}>
                {m.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
              </a>
            </dd>
          </>
        )}
        {spent > 0 && (
          <>
            <dt>Time spent</dt>
            <dd>{duration(spent)}</dd>
          </>
        )}
        {m.lastWorked && (
          <>
            <dt>Last worked</dt>
            <dd>{friendlyDate(m.lastWorked)}</dd>
          </>
        )}
        {m.added && (
          <>
            <dt>Added</dt>
            <dd>{fullDate(m.added)}</dd>
          </>
        )}
        {m.nextReview && (
          <>
            <dt>Review</dt>
            <dd>
              {due ? 'Due now' : `Due ${friendlyDate(m.nextReview)}`}
              {m.reviewInterval ? ` (${describeInterval(m.reviewInterval)} interval)` : ''}
            </dd>
          </>
        )}
        {!paper.pdfFile && (
          <>
            <dt>PDF</dt>
            <dd className="muted">None, read elsewhere</dd>
          </>
        )}
      </dl>

      {paper.error && <p className="error-note">{paper.error}</p>}

      {summaryFields(guide).map(({ stage, question }) => {
        const text = paper.summaries[stage.id]?.[question.id] ?? '';
        return (
          <div className="summary-block" key={`${stage.id}.${question.id}`}>
            <h4>{question.label}</h4>
            {text ? <p>{text}</p> : <p className="none">Not written yet</p>}
          </div>
        );
      })}
    </aside>
  );
}
