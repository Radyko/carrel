import { useEffect, useRef, useState } from 'react';
import type { AppState, Appearance, UpdateStatus } from '../shared/api';
import { ACCENTS, TONES, type Look } from '../shared/look';
import { Modal } from './common/Modal';
import { applyLook } from './look';

interface Props {
  state: AppState;
  update: UpdateStatus | null;
  onChooseLibrary: () => void;
  onRevealLibrary: () => void;
  onRevealGuide: () => void;
  onRestoreGuide: () => void;
  onAppearance: (appearance: Appearance) => void;
  onLook: (look: Partial<Look>) => void;
  /** Starts the update; resolves with a reason if it couldn't. */
  onUpdate: () => Promise<string | null>;
  onClose: () => void;
}

export function SettingsDialog({ state, ...on }: Props) {
  const mod = state.platform === 'darwin' ? '⌘' : 'Ctrl+';
  return (
    <Modal onClose={on.onClose} width={540}>
      <h2>Settings</h2>
      <p className="sub">Carrel {state.version}</p>

      <section className="settings-group">
        <h3>Look</h3>
        <div className="settings-line">
          <span className="label">Mode</span>
          <div className="segmented" role="radiogroup" aria-label="Mode">
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
        <LookPicker look={state.look} onLook={on.onLook} />
      </section>

      <section className="settings-group">
        <h3>Updates</h3>
        <Updates state={state} update={on.update} onUpdate={on.onUpdate} />
      </section>

      <section className="settings-group">
        <h3>Your files</h3>
        <span className="label">Library folder</span>
        <div className="path">{state.libraryPath}</div>
        <p className="help">Every paper is a folder here with its PDF and a notes.md file you can open in any editor.</p>
        <div className="row-buttons">
          <button className="btn" onClick={on.onChooseLibrary}>
            Choose another folder…
          </button>
          <button className="btn quiet" onClick={on.onRevealLibrary}>
            Open folder
          </button>
        </div>

        <span className="label spaced">Reading guide</span>
        <div className="path">{state.guidePath}</div>
        <p className="help">
          {state.guideProblem
            ? state.guideProblem
            : `The stages and questions Carrel asks. Edit this file to change them; Carrel picks up your changes when you come back to the window.`}
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
      </section>

      <details className="settings-group shortcuts-group">
        <summary>Keyboard shortcuts</summary>
        <dl className="shortcuts">
          <kbd>{mod}O</kbd>
          <span>Add a PDF</span>
          <kbd>{mod}N</kbd>
          <span>New entry without a PDF</span>
          <kbd>{mod}F</kbd>
          <span>Search the library</span>
          <kbd>Return</kbd>
          <span>Open the selected paper</span>
          <kbd>{state.platform === 'darwin' ? '⌃⌘S' : 'Ctrl+Alt+S'}</kbd>
          <span>Show or hide the sidebar</span>
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
      </details>

      <div className="buttons">
        <button className="btn primary" onClick={on.onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function LookPicker({ look, onLook }: { look: Look; onLook: (look: Partial<Look>) => void }) {
  // The colour wheel reports every movement; show each one at once and save when it settles.
  const [custom, setCustom] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const accent = custom ?? look.accent;
  const named = ACCENTS.find((a) => a.color === accent);

  const pickCustom = (color: string) => {
    setCustom(color);
    applyLook({ ...look, accent: color });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onLook({ accent: color });
      setCustom(null);
    }, 300);
  };

  return (
    <>
      <div className="settings-line">
        <span className="label">Background</span>
        <div className="swatches" role="radiogroup" aria-label="Background">
          {TONES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={look.tone === t.id}
              className={`tone-swatch${look.tone === t.id ? ' on' : ''}`}
              onClick={() => onLook({ tone: t.id })}
              title={t.name}
            >
              <span className="tone-chip" style={{ '--light': t.swatch[0], '--dark': t.swatch[1] } as React.CSSProperties} />
              <span className="tone-name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-line">
        <span className="label">
          Accent <span className="muted">· {named ? named.name : 'Your colour'}</span>
        </span>
        <div className="swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button
              key={a.color}
              role="radio"
              aria-checked={accent === a.color}
              aria-label={a.name}
              title={a.name}
              className={`accent-dot${accent === a.color ? ' on' : ''}`}
              style={{ '--dot': a.color } as React.CSSProperties}
              onClick={() => onLook({ accent: a.color })}
            />
          ))}
          <label
            className={`accent-dot custom${named ? '' : ' on'}`}
            title="Pick any colour"
            style={named ? undefined : ({ '--dot': accent } as React.CSSProperties)}
          >
            <input
              type="color"
              aria-label="Pick any colour"
              value={accent}
              onChange={(e) => pickCustom(e.target.value)}
            />
          </label>
        </div>
      </div>
    </>
  );
}

function Updates({
  state,
  update,
  onUpdate,
}: {
  state: AppState;
  update: UpdateStatus | null;
  onUpdate: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const command = (
    <div className="command">
      <code className="selectable">{state.updateCommand}</code>
      <button
        className="btn small quiet"
        onClick={() => {
          void navigator.clipboard.writeText(state.updateCommand);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );

  if (state.install === 'source') {
    return (
      <div className="help">
        <p>
          This copy runs straight from Carrel’s code, so it doesn’t update itself. In a git checkout, run{' '}
          <code>git pull</code>; otherwise run this in Terminal to install the latest version as an app:
        </p>
        {command}
      </div>
    );
  }

  if (problem) {
    return (
      <div className="help">
        <p>
          {problem === 'npx'
            ? 'Carrel couldn’t find Node.js, which it uses to update. Install it from nodejs.org, then open Terminal and run:'
            : 'Carrel couldn’t update itself here. Open Terminal and run:'}
        </p>
        {command}
      </div>
    );
  }

  if (!update || update.state === 'checking') return <p className="help">Checking for updates…</p>;

  if (update.state === 'available') {
    return (
      <div className="update-box">
        <p>
          <strong>Carrel {update.latest} is ready.</strong> You have {update.version}.
        </p>
        <p className="help">Carrel closes, updates, and opens again by itself. Your papers and notes aren’t touched.</p>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const reason = await onUpdate();
            if (reason) {
              setProblem(reason);
              setBusy(false);
            }
          }}
        >
          {busy ? 'Updating…' : `Update to ${update.latest}`}
        </button>
      </div>
    );
  }

  if (update.state === 'current') return <p className="help">✓ You have the latest version.</p>;

  return (
    <div className="help">
      <p>Couldn’t check for updates. Are you online? You can always update by running this in Terminal:</p>
      {command}
    </div>
  );
}
