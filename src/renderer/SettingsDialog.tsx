import type { AppState, Appearance } from '../shared/api';
import { Modal } from './common/Modal';

interface Props {
  state: AppState;
  onChooseLibrary: () => void;
  onRevealLibrary: () => void;
  onRevealGuide: () => void;
  onRestoreGuide: () => void;
  onAppearance: (appearance: Appearance) => void;
  onClose: () => void;
}

export function SettingsDialog({ state, ...on }: Props) {
  const mod = state.platform === 'darwin' ? '⌘' : 'Ctrl+';
  return (
    <Modal onClose={on.onClose} width={520}>
      <h2>Settings</h2>
      <p className="sub">Carrel {state.version}</p>

      <div className="settings-row">
        <span className="label">Appearance</span>
        <div className="segmented" role="radiogroup" aria-label="Appearance">
          {(
            [
              ['system', 'Match system'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={state.appearance === value}
              className={state.appearance === value ? 'on' : ''}
              onClick={() => on.onAppearance(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <span className="label">Library folder</span>
        <div className="path">{state.libraryPath}</div>
        <p className="help">
          Every paper is a folder here with its PDF and a notes.md file you can open in any editor.
        </p>
        <div className="row-buttons">
          <button className="btn" onClick={on.onChooseLibrary}>
            Choose another folder…
          </button>
          <button className="btn quiet" onClick={on.onRevealLibrary}>
            Open folder
          </button>
        </div>
      </div>

      <div className="settings-row">
        <span className="label">Reading guide</span>
        <div className="path">{state.guidePath}</div>
        <p className="help">
          {state.guideProblem
            ? state.guideProblem
            : `Using “${state.guide.name}”. Edit this file to change the stages, questions, and review intervals; Carrel reloads it when the window regains focus.`}
        </p>
        <div className="row-buttons">
          {!state.guideMissing && (
            <button className="btn" onClick={on.onRevealGuide}>
              {state.platform === 'darwin' ? 'Reveal in Finder' : 'Show in folder'}
            </button>
          )}
          {(state.guideMissing || state.guideProblem) && (
            <button className="btn" onClick={on.onRestoreGuide}>
              Restore default guide
            </button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <span className="label">Keyboard shortcuts</span>
        <dl className="shortcuts">
          <kbd>{mod}O</kbd>
          <span>Add a PDF</span>
          <kbd>{mod}N</kbd>
          <span>New entry without a PDF</span>
          <kbd>{mod}F</kbd>
          <span>Search the library</span>
          <kbd>Return</kbd>
          <span>Open the selected paper</span>
          <kbd>{mod}L</kbd>
          <span>Back to the library</span>
          <kbd>{mod}1 – {mod}4</kbd>
          <span>Purpose and pass tabs</span>
          <kbd>{mod}T</kbd>
          <span>Start or pause the timer</span>
          <kbd>{mod}⇧P</kbd>
          <span>Hide or show the PDF</span>
          <kbd>{mod}= / {mod}− / {mod}0</kbd>
          <span>Zoom in, zoom out, fit to width</span>
          <kbd>{mod}⇧H</kbd>
          <span>Highlight the selected text</span>
          <kbd>{mod}I</kbd>
          <span>Edit details</span>
          <kbd>{mod}⇧R</kbd>
          <span>{state.platform === 'darwin' ? 'Reveal in Finder' : 'Show in folder'}</span>
          <kbd>{mod}R</kbd>
          <span>Review due papers</span>
          <kbd>{mod}⌫</kbd>
          <span>Move the selected paper to the Trash (in the list)</span>
        </dl>
      </div>

      <div className="buttons">
        <button className="btn primary" onClick={on.onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
