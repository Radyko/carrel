import { clock } from '../format';

interface Props {
  elapsed: number;
  running: boolean;
  targetMinutes: number | null;
  targetLabel: string;
  onToggle: () => void;
}

/** Elapsed time against the target. It never alarms; it only shows. */
export function Timer({ elapsed, running, targetMinutes, targetLabel, onToggle }: Props) {
  const target = targetMinutes ? targetMinutes * 60 : null;
  const fraction = target ? Math.min(1, elapsed / target) : 0;
  return (
    <div className={`timer${running ? ' running' : ''}`}>
      <button className="btn small" onClick={onToggle} title="Start or pause the timer">
        {running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start timer'}
      </button>
      <span className="time">
        {clock(elapsed)}
        {targetLabel && <span className="target"> · target {targetLabel.toLowerCase()}</span>}
      </span>
      {target && (
        <span className="bar" aria-hidden>
          <span style={{ width: `${fraction * 100}%` }} />
        </span>
      )}
    </div>
  );
}
