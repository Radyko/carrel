import { useEffect, useRef, useState, type FormEvent } from 'react';
import { distinctNames, type PaperMeta } from '../../shared/paper';
import { Modal } from '../common/Modal';
import { splitList } from '../format';

export interface PaperFormProps {
  mode: 'new' | 'edit';
  initial: Partial<PaperMeta>;
  /** File name of the PDF being added, if any. */
  pdfName?: string;
  topics: string[];
  collections: string[];
  onSave: (meta: Partial<PaperMeta>) => Promise<void>;
  onCancel: () => void;
}

export function PaperForm({ mode, initial, pdfName, topics, collections, onSave, onCancel }: PaperFormProps) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [authors, setAuthors] = useState((initial.authors ?? []).join(', '));
  const [year, setYear] = useState(initial.year ? String(initial.year) : '');
  const [venue, setVenue] = useState(initial.venue ?? '');
  const [link, setLink] = useState(initial.link ?? '');
  const [topicText, setTopicText] = useState((initial.topics ?? []).join(', '));
  const [chosen, setChosen] = useState<string[]>(initial.collections ?? []);
  const [newCollection, setNewCollection] = useState('');
  const allCollections = distinctNames([...collections, ...chosen]);
  const toggle = (c: string) => setChosen((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const addNew = () => {
    const name = newCollection.trim();
    if (name) setChosen((cs) => distinctNames([...cs, name]));
    setNewCollection('');
  };
  const [saving, setSaving] = useState(false);
  // Venue, link and topics are rarely known when adding a paper; tuck them away unless filled in.
  const [more, setMore] = useState(Boolean(initial.venue || initial.link || initial.topics?.length));
  // Select the title so it can be typed over, but show its beginning.
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length, 'backward');
    el.scrollLeft = 0;
  }, []);

  const yearNum = year.trim() ? Number(year.trim()) : null;
  const yearValid = yearNum === null || (Number.isInteger(yearNum) && yearNum > 1000 && yearNum < 3000);
  const valid = title.trim().length > 0 && yearValid;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        authors: splitList(authors),
        year: yearNum,
        venue: venue.trim(),
        link: link.trim(),
        topics: splitList(topicText),
        collections: distinctNames([...chosen, newCollection]),
      });
    } finally {
      setSaving(false);
    }
  }

  const heading = mode === 'edit' ? 'Edit details' : pdfName ? 'Add paper' : 'New entry without a PDF';
  return (
    <Modal onClose={onCancel}>
      <form onSubmit={submit}>
        <h2>{heading}</h2>
        <p className="sub">
          {mode === 'edit'
            ? 'Changes are saved to the notes file.'
            : pdfName
              ? `“${pdfName}” is copied into your library; the original stays where it is.`
              : 'For a paper you read in print or elsewhere.'}
        </p>
        <div className="form-grid">
          <div className="wide">
            <label className="label" htmlFor="f-title">Title</label>
            <input id="f-title" ref={titleRef} className="field" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="f-authors">Authors</label>
            <input id="f-authors" className="field" type="text" value={authors} placeholder="Separate with commas" onChange={(e) => setAuthors(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="f-year">Year</label>
            <input id="f-year" className="field" type="text" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} aria-invalid={!yearValid} />
          </div>
          <div className="wide">
            <span className="label">Collections</span>
            <div className="pill-picker">
              {allCollections.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`choice small${chosen.includes(c) ? ' chosen' : ''}`}
                  aria-pressed={chosen.includes(c)}
                  onClick={() => toggle(c)}
                >
                  {c}
                </button>
              ))}
              <input
                className="field bare new-pill"
                type="text"
                value={newCollection}
                placeholder={allCollections.length ? 'New…' : 'A course or project, e.g. CS 8803'}
                aria-label="New collection"
                onChange={(e) => setNewCollection(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNew();
                  }
                }}
              />
            </div>
          </div>
          {more ? (
            <>
              <div className="wide">
                <label className="label" htmlFor="f-venue">Venue</label>
                <input id="f-venue" className="field" type="text" value={venue} placeholder="Conference or journal" onChange={(e) => setVenue(e.target.value)} />
              </div>
              <div className="wide">
                <label className="label" htmlFor="f-link">Link</label>
                <input id="f-link" className="field" type="url" value={link} placeholder="https://" onChange={(e) => setLink(e.target.value)} />
              </div>
              <div className="wide">
                <label className="label" htmlFor="f-topics">Topics</label>
                <input id="f-topics" className="field" type="text" value={topicText} list="topic-list" placeholder="Separate with commas" onChange={(e) => setTopicText(e.target.value)} />
                <datalist id="topic-list">
                  {topics.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </>
          ) : (
            <div className="wide">
              <button type="button" className="btn quiet small more-details" onClick={() => setMore(true)}>
                More details (venue, link, topics)
              </button>
            </div>
          )}
        </div>
        {!yearValid && <p className="help">The year should be a number like 2007.</p>}
        <div className="buttons">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid || saving}>
            {mode === 'edit' ? 'Save' : 'Add to library'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
