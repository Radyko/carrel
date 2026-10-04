import { useState, type FormEvent } from 'react';
import type { PaperMeta } from '../../shared/paper';
import { Modal } from '../common/Modal';
import { splitList } from '../format';

export interface PaperFormProps {
  mode: 'new' | 'edit';
  initial: Partial<PaperMeta>;
  /** File name of the PDF being added, if any. */
  pdfName?: string;
  topics: string[];
  courses: string[];
  onSave: (meta: Partial<PaperMeta>) => Promise<void>;
  onCancel: () => void;
}

export function PaperForm({ mode, initial, pdfName, topics, courses, onSave, onCancel }: PaperFormProps) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [authors, setAuthors] = useState((initial.authors ?? []).join(', '));
  const [year, setYear] = useState(initial.year ? String(initial.year) : '');
  const [venue, setVenue] = useState(initial.venue ?? '');
  const [link, setLink] = useState(initial.link ?? '');
  const [topicText, setTopicText] = useState((initial.topics ?? []).join(', '));
  const [course, setCourse] = useState(initial.course ?? '');
  const [saving, setSaving] = useState(false);

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
        course: course.trim(),
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
              ? `The PDF “${pdfName}” will be copied into your library. The original stays where it is.`
              : 'For a paper you read in print or elsewhere.'}
        </p>
        <div className="form-grid">
          <div className="wide">
            <label className="label" htmlFor="f-title">Title</label>
            <input id="f-title" className="field" type="text" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
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
          <div className="wide">
            <label className="label" htmlFor="f-course">Course</label>
            <input id="f-course" className="field" type="text" value={course} list="course-list" onChange={(e) => setCourse(e.target.value)} />
            <datalist id="course-list">
              {courses.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
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
