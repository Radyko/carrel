import { forwardRef, useImperativeHandle } from 'react';
import type { MenuAction } from '../../shared/api';
import type { Guide } from '../../shared/guide';

export interface ReaderHandle {
  flush(): Promise<void>;
  reload(): Promise<void>;
  menu(action: MenuAction): void;
}

interface Props {
  id: string;
  guide: Guide;
  isMac: boolean;
  today: string;
  onBack: () => void;
  onEdit: () => void;
  onReveal: () => void;
  onError: (err: unknown) => void;
  onChanged: () => void;
}

export const Reader = forwardRef<ReaderHandle, Props>(function Reader({ id, onBack }, ref) {
  useImperativeHandle(ref, () => ({ flush: async () => {}, reload: async () => {}, menu: () => {} }));
  return (
    <div className="loading">
      Reader for {id} <button className="btn" onClick={onBack}>Back</button>
    </div>
  );
});
