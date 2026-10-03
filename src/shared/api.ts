// The API the preload script exposes to the interface as window.carrel.

import type { Guide } from './guide';
import type { NewPaperInput, PaperDoc, PaperPatch, PaperSummary } from './paper';

export interface AppState {
  libraryPath: string;
  guide: Guide;
  guidePath: string;
  /** Plain-language description of a problem with the user's guide file. */
  guideProblem: string | null;
  guideMissing: boolean;
  platform: string;
  version: string;
}

export interface ChosenPdf {
  path: string;
  name: string;
  data: Uint8Array;
}

export type MenuAction =
  | 'add-pdf'
  | 'add-entry'
  | 'settings'
  | 'find'
  | 'library'
  | 'open'
  | 'reveal'
  | 'edit'
  | 'trash'
  | 'review'
  | 'tab-1'
  | 'tab-2'
  | 'tab-3'
  | 'tab-4'
  | 'toggle-timer'
  | 'toggle-pdf'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-width';

export type ContextAction = 'open' | 'reveal' | 'edit' | 'trash' | 'review';

export interface CarrelApi {
  platform: string;
  init(): Promise<AppState>;
  listPapers(): Promise<PaperSummary[]>;
  readPaper(id: string): Promise<PaperDoc>;
  updatePaper(id: string, patch: PaperPatch): Promise<PaperDoc>;
  createPaper(input: NewPaperInput): Promise<PaperDoc>;
  readPdf(id: string): Promise<Uint8Array | null>;
  revealPaper(id: string): Promise<void>;
  trashPaper(id: string): Promise<boolean>;
  paperContextMenu(id: string, options: { due: boolean }): Promise<ContextAction | null>;
  choosePdf(): Promise<ChosenPdf | null>;
  pathForFile(file: File): string;
  chooseLibrary(): Promise<AppState | null>;
  revealLibrary(): Promise<void>;
  revealGuide(): Promise<void>;
  restoreGuide(): Promise<AppState>;
  reloadGuide(): Promise<AppState>;
  openLink(url: string): Promise<void>;
  onMenu(handler: (action: MenuAction) => void): () => void;
  onFlush(handler: () => Promise<void>): () => void;
}
