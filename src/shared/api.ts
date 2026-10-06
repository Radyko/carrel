// The API the preload script exposes to the interface as window.carrel.

import type { Guide } from './guide';
import type { Look } from './look';
import type { NewPaperInput, PaperDoc, PaperPatch, PaperSummary } from './paper';

export type Appearance = 'system' | 'light' | 'dark';

export interface AppState {
  libraryPath: string;
  appearance: Appearance;
  look: Look;
  guide: Guide;
  guidePath: string;
  /** Plain-language description of a problem with the user's guide file. */
  guideProblem: string | null;
  guideMissing: boolean;
  platform: string;
  version: string;
  /** How this copy of Carrel was installed, which decides how it updates. */
  install: 'app' | 'source';
  /** The command that installs the latest version, for people to type. */
  updateCommand: string;
  /** Set when the last update didn't finish. */
  updateProblem: string | null;
}

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'current'; version: string }
  | { state: 'available'; version: string; latest: string }
  | { state: 'offline' };

/** The result of asking Carrel to update itself. */
export type UpdateStart = { ok: true } | { ok: false; reason: string };

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
  | 'find-next'
  | 'find-previous'
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
  | 'fit-width'
  | 'highlight'
  | 'toggle-contents'
  | 'focus'
  | 'toggle-sidebar';

export type ContextAction = 'open' | 'reveal' | 'edit' | 'trash' | 'review' | 'new-collection' | `toggle:${string}`;

export interface PaperMenuOptions {
  due: boolean;
  /** Every collection, in sidebar order. */
  collections: string[];
  /** The collections this paper is in. */
  member: string[];
}

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
  paperContextMenu(id: string, options: PaperMenuOptions): Promise<ContextAction | null>;
  paperCollectionsMenu(options: PaperMenuOptions): Promise<ContextAction | null>;
  collectionContextMenu(name: string): Promise<'rename' | 'delete' | null>;
  listCollections(): Promise<string[]>;
  createCollection(name: string): Promise<void>;
  renameCollection(from: string, to: string): Promise<void>;
  /** Asks first; resolves true if the collection was deleted. */
  deleteCollection(name: string): Promise<boolean>;
  choosePdf(): Promise<ChosenPdf | null>;
  pathForFile(file: File): string;
  chooseLibrary(): Promise<AppState | null>;
  revealLibrary(): Promise<void>;
  revealGuide(): Promise<void>;
  restoreGuide(): Promise<AppState>;
  reloadGuide(): Promise<AppState>;
  openLink(url: string): Promise<void>;
  setAppearance(appearance: Appearance): Promise<AppState>;
  setLook(look: Partial<Look>): Promise<AppState>;
  checkForUpdate(): Promise<UpdateStatus>;
  /** Quits, updates, and opens the new version. Resolves only if that couldn't start. */
  installUpdate(): Promise<UpdateStart>;
  /** Called when the window enters or leaves full screen. */
  onFullScreen(handler: (fullScreen: boolean) => void): () => void;
  onMenu(handler: (action: MenuAction) => void): () => void;
  onFlush(handler: () => Promise<void>): () => void;
}
