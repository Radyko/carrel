import { useEffect, useRef } from 'react';
import { HIGHLIGHT_COLORS, type Highlight, type HighlightColor } from '../../shared/highlights';
import { AutoTextarea, useDraft } from './fields';

interface Props {
  highlight: Highlight;
  /** Put the cursor in the note straight away (for a highlight just made). */
  focusNote: boolean;
  onNote: (note: string) => void;
  onColor: (color: HighlightColor) => void;
  onShow: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** The note on a highlight, shown beside the paper above the pass tabs. */
export function HighlightCard({ highlight: h, focusNote, onNote, onColor, onShow, onRemove, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useDraft(h.note);
  useEffect(() => {
    if (focusNote) ref.current?.querySelector('textarea')?.focus();
  }, [h.id, focusNote]);

  return (
    <section className={`hl-card hl-edge-${h.color}`} ref={ref} aria-label="Highlight note">
      <div className="hl-card-head">
        <button className="hl-card-quote" onClick={onShow} title="Show in the PDF">
          {h.text}
        </button>
        <button className="btn quiet icon small" onClick={onClose} title="Close (Esc)" aria-label="Close">
          ×
        </button>
      </div>
      <AutoTextarea
        className="field hl-card-note"
        minRows={2}
        value={note}
        placeholder="Add a note…"
        aria-label="Note on this highlight"
        onChange={(e) => {
          setNote(e.target.value);
          onNote(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <div className="hl-card-foot">
        <span className="muted">p. {h.page}</span>
        <span className="hl-card-colors">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              className={`hl-dot small hl-${c}${h.color === c ? ' on' : ''}`}
              aria-label={c}
              title={c[0].toUpperCase() + c.slice(1)}
              onClick={() => onColor(c)}
            />
          ))}
        </span>
        <span className="spacer" />
        <button className="btn quiet small" onClick={() => void navigator.clipboard.writeText(h.text)}>
          Copy
        </button>
        <button className="btn quiet small" onClick={onRemove}>
          Remove
        </button>
      </div>
    </section>
  );
}
