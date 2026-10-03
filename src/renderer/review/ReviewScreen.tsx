import type { Guide } from '../../shared/guide';

interface Props {
  ids: string[];
  guide: Guide;
  today: string;
  onDone: () => void;
  onError: (err: unknown) => void;
}

export function ReviewScreen({ onDone }: Props) {
  return (
    <div className="loading">
      Review <button className="btn" onClick={onDone}>Back</button>
    </div>
  );
}
