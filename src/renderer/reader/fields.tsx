import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import {
  formatChecklist,
  formatTerms,
  parseChecklist,
  parseTerms,
  type CheckItem,
  type Parsed,
  type Term,
} from '../../shared/fieldFormat';

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Keeps exactly what was typed while the saved value is a tidied copy of it
 * (trimmed, single-spaced). Without this, a value that is saved and read back
 * on every keystroke would lose the space just typed at the end.
 */
export function useDraft(value: string): [string, (v: string) => void] {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft((d) => (tidy(d) === tidy(value) ? d : value));
  }, [value]);
  return [draft, setDraft];
}

/** A single-line input for a value that is tidied when saved. */
export function DraftInput({
  value,
  onValue,
  ...rest
}: { value: string; onValue: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value'>) {
  const [draft, setDraft] = useDraft(value);
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onValue(e.target.value);
      }}
      {...rest}
    />
  );
}

/** A textarea that grows with its content. */
export function AutoTextarea({
  minRows = 2,
  value,
  ...rest
}: { minRows?: number; value: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} className="field" rows={minRows} value={value} spellCheck {...rest} />;
}

export function ChecklistField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const parsed = parseChecklist(value);
  const [draft, setDraft] = useState('');
  const update = (p: Parsed<CheckItem>) => onChange(formatChecklist(p));
  const setItem = (i: number, change: Partial<CheckItem>) =>
    update({ ...parsed, items: parsed.items.map((it, j) => (j === i ? { ...it, ...change } : it)) });
  const add = () => {
    const lines = draft.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    update({ ...parsed, items: [...parsed.items, ...lines.map((text) => ({ done: false, text }))] });
    setDraft('');
  };
  return (
    <div className="list-field">
      {parsed.items.map((item, i) => (
        <div className={`list-row${item.done ? ' done' : ''}`} key={i}>
          <input type="checkbox" checked={item.done} onChange={(e) => setItem(i, { done: e.target.checked })} aria-label="Done" />
          <DraftInput className="field bare" value={item.text} onValue={(text) => setItem(i, { text })} />
          <button
            className="btn quiet icon small"
            title="Remove"
            onClick={() => update({ ...parsed, items: parsed.items.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <div className="list-row add">
        <span className="plus">+</span>
        <input
          id={id}
          className="field bare"
          type="text"
          placeholder="Add a reference and press Return"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text.includes('\n')) {
              e.preventDefault();
              setDraft(text);
              setTimeout(() => (e.target as HTMLInputElement).blur(), 0);
            }
          }}
        />
      </div>
      {parsed.extra && <ExtraText text={parsed.extra} onChange={(extra) => update({ ...parsed, extra })} />}
    </div>
  );
}

export function TermsField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const parsed = parseTerms(value);
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const update = (p: Parsed<Term>) => onChange(formatTerms(p));
  const setItem = (i: number, change: Partial<Term>) =>
    update({ ...parsed, items: parsed.items.map((it, j) => (j === i ? { ...it, ...change } : it)) });
  const add = () => {
    if (!term.trim() && !meaning.trim()) return;
    update({ ...parsed, items: [...parsed.items, { term: term.trim(), meaning: meaning.trim() }] });
    setTerm('');
    setMeaning('');
    document.getElementById(id)?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };
  return (
    <div className="list-field">
      {parsed.items.map((item, i) => (
        <div className="term-row" key={i}>
          <DraftInput className="field bare term" value={item.term} onValue={(term) => setItem(i, { term })} aria-label="Term" />
          <DraftInput className="field bare" value={item.meaning} onValue={(meaning) => setItem(i, { meaning })} aria-label="Meaning" />
          <button
            className="btn quiet icon small"
            title="Remove"
            onClick={() => update({ ...parsed, items: parsed.items.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <div className="term-row add">
        <input id={id} className="field bare term" type="text" placeholder="Term" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={onKey} />
        <input className="field bare" type="text" placeholder="What it means, then Return" value={meaning} onChange={(e) => setMeaning(e.target.value)} onKeyDown={onKey} />
        <button className="btn quiet small" onClick={add} disabled={!term.trim() && !meaning.trim()}>
          Add
        </button>
      </div>
      {parsed.extra && <ExtraText text={parsed.extra} onChange={(extra) => update({ ...parsed, extra })} />}
    </div>
  );
}

function ExtraText({ text, onChange }: { text: string; onChange: (v: string) => void }) {
  return (
    <div className="extra-text">
      <span className="help">Other text under this heading</span>
      <AutoTextarea value={text} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
