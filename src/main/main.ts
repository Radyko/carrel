import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, screen, shell } from 'electron';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppState, ChosenPdf, ContextAction, PaperMenuOptions } from '../shared/api';
import type { NewPaperInput, PaperPatch } from '../shared/paper';
import { buildMenu } from './menu';
import { normalizeLook } from '../shared/look';
import { loadSettings, saveSettings, type Settings } from './settings';
import { loadGuide, restoreDefaultGuide, type LoadedGuide } from './storage/guideFile';
import { Library } from './storage/library';
import { checkForUpdate, installKind, installUpdate, UPDATE_COMMAND } from './updates';

const APP_SCHEME = 'carrel';
const appRoot = path.join(__dirname, '..', '..', '..');
const rendererDir = path.join(appRoot, 'dist', 'renderer');
const defaultGuidePath = path.join(appRoot, 'guide', 'default-guide.yaml');
const iconPath = path.join(appRoot, 'assets', 'icon.png');
const packageName = (JSON.parse(fsSync.readFileSync(path.join(appRoot, 'package.json'), 'utf8')) as { name: string }).name;

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setName('Carrel');

let mainWindow: BrowserWindow | null = null;
let settings: Settings;
let library: Library;
let loadedGuide: LoadedGuide;
let quitting = false;
app.on('before-quit', () => (quitting = true));

async function openLibrary(libraryPath: string): Promise<void> {
  library = new Library(libraryPath);
  await library.ensure();
  const install = !settings.guideInstalled.includes(libraryPath);
  loadedGuide = await loadGuide(libraryPath, defaultGuidePath, { install });
  if (install) {
    settings.guideInstalled.push(libraryPath);
    await saveSettings(settings);
  }
}

function state(): AppState {
  return {
    libraryPath: library.root,
    appearance: settings.appearance,
    look: settings.look,
    guide: loadedGuide.guide,
    guidePath: loadedGuide.path,
    guideProblem: loadedGuide.problem,
    guideMissing: loadedGuide.missing,
    platform: process.platform,
    version: app.getVersion(),
    install: installKind(),
    updateCommand: UPDATE_COMMAND,
  };
}

type MenuTemplate = Electron.MenuItemConstructorOptions[];

/** Shows a native menu and resolves with the item chosen, or null. */
function popupMenu<T>(sender: Electron.WebContents, build: (pick: (choice: T) => () => void) => MenuTemplate): Promise<T | null> {
  return new Promise((resolve) => {
    let chosen: T | null = null;
    const menu = Menu.buildFromTemplate(build((choice) => () => (chosen = choice)));
    menu.popup({
      window: BrowserWindow.fromWebContents(sender) ?? undefined,
      callback: () => setImmediate(() => resolve(chosen)),
    });
  });
}

/** Ticked collection items for a paper, plus one to make a new collection. */
function collectionItems(options: PaperMenuOptions, pick: (choice: ContextAction) => () => void): MenuTemplate {
  return [
    ...options.collections.map((name) => ({
      label: name,
      type: 'checkbox' as const,
      checked: options.member.includes(name),
      click: pick(`toggle:${name}`),
    })),
    ...(options.collections.length ? [{ type: 'separator' as const }] : []),
    { label: 'New Collection…', click: pick('new-collection') },
  ];
}

function isPdfPath(p: unknown): p is string {
  return typeof p === 'string' && path.isAbsolute(p) && p.toLowerCase().endsWith('.pdf');
}

function registerIpc(): void {
  ipcMain.handle('app:init', () => state());
  ipcMain.handle('papers:list', () => library.scan(loadedGuide.guide));
  ipcMain.handle('paper:read', (_e, id: string) => library.read(id, loadedGuide.guide));
  ipcMain.handle('paper:update', (_e, id: string, patch: PaperPatch) =>
    library.update(id, patch, loadedGuide.guide),
  );
  ipcMain.handle('paper:create', (_e, input: NewPaperInput) => {
    if (input.pdfPath && !isPdfPath(input.pdfPath)) throw new Error('Only PDF files can be added.');
    return library.create(input, loadedGuide.guide);
  });
  ipcMain.handle('paper:pdf', async (_e, id: string) => {
    const name = await library.findPdf(id);
    if (!name) return null;
    return new Uint8Array(await fs.readFile(path.join(library.folderOf(id), name)));
  });
  ipcMain.handle('paper:reveal', async (_e, id: string) => {
    const folder = library.folderOf(id);
    const pdf = await library.findPdf(id);
    shell.showItemInFolder(path.join(folder, pdf ?? 'notes.md'));
  });
  ipcMain.handle('paper:trash', async (_e, id: string) => {
    const folder = library.folderOf(id);
    const doc = await library.read(id, loadedGuide.guide);
    const where = process.platform === 'darwin' ? 'the Trash' : 'the trash';
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['Move to Trash', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Move “${doc.meta.title}” to ${where}?`,
      detail: `Its folder, with the PDF and your notes, goes to ${where}. You can put it back from there.`,
    });
    if (response !== 0) return false;
    await shell.trashItem(folder);
    return true;
  });
  ipcMain.handle('paper:context-menu', (e, _id: string, options: PaperMenuOptions) =>
    popupMenu<ContextAction>(e.sender, (pick) => [
      { label: 'Open', click: pick('open') },
      ...(options.due ? [{ label: 'Review Now', click: pick('review') }] : []),
      { label: 'Edit Details…', click: pick('edit') },
      { label: 'Collections', submenu: collectionItems(options, pick) },
      { label: process.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Folder', click: pick('reveal') },
      { type: 'separator' },
      { label: 'Move to Trash…', click: pick('trash') },
    ]),
  );
  ipcMain.handle('paper:collections-menu', (e, options: PaperMenuOptions) =>
    popupMenu<ContextAction>(e.sender, (pick) => collectionItems(options, pick)),
  );
  ipcMain.handle('collection:context-menu', (e) =>
    popupMenu<'rename' | 'delete'>(e.sender, (pick) => [
      { label: 'Rename…', click: pick('rename') },
      { label: 'Delete Collection…', click: pick('delete') },
    ]),
  );
  ipcMain.handle('collections:list', async () => library.collections(await library.scan(loadedGuide.guide)));
  ipcMain.handle('collections:create', (_e, name: string) => library.createCollection(name, loadedGuide.guide));
  ipcMain.handle('collections:rename', (_e, from: string, to: string) =>
    library.renameCollection(from, to, loadedGuide.guide),
  );
  ipcMain.handle('collections:delete', async (_e, name: string) => {
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['Delete Collection', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Delete the collection “${name}”?`,
      detail: 'The papers in it stay in your library; only the grouping is removed.',
    });
    if (response !== 0) return false;
    await library.deleteCollection(name, loadedGuide.guide);
    return true;
  });
  ipcMain.handle('dialog:choose-pdf', async (): Promise<ChosenPdf | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add a PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    return { path: file, name: path.basename(file), data: new Uint8Array(await fs.readFile(file)) };
  });
  ipcMain.handle('library:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose a folder for your library',
      defaultPath: library.root,
      properties: ['openDirectory', 'createDirectory'],
    });
    const folder = result.filePaths[0];
    if (result.canceled || !folder) return null;
    settings.libraryPath = folder;
    await saveSettings(settings);
    await openLibrary(folder);
    return state();
  });
  ipcMain.handle('library:reveal', () => shell.openPath(library.root).then(() => undefined));
  ipcMain.handle('guide:reveal', () => shell.showItemInFolder(loadedGuide.path));
  ipcMain.handle('guide:restore', async () => {
    await restoreDefaultGuide(library.root, defaultGuidePath);
    await openLibrary(library.root);
    return state();
  });
  ipcMain.handle('guide:reload', async () => {
    loadedGuide = await loadGuide(library.root, defaultGuidePath, { install: false });
    return state();
  });
  ipcMain.handle('settings:appearance', async (_e, appearance: Settings['appearance']) => {
    settings.appearance = appearance === 'light' || appearance === 'dark' ? appearance : 'system';
    // The interface follows prefers-color-scheme, which follows this.
    nativeTheme.themeSource = settings.appearance;
    await saveSettings(settings);
    return state();
  });
  ipcMain.handle('settings:look', async (_e, look: Partial<Settings['look']>) => {
    settings.look = normalizeLook({ ...settings.look, ...look });
    if (look.tone !== undefined) settings.toneChosen = true;
    if (look.accent !== undefined) settings.accentChosen = true;
    await saveSettings(settings);
    return state();
  });
  ipcMain.handle('update:check', () => checkForUpdate(packageName));
  ipcMain.handle('update:install', () => installUpdate(packageName));
  ipcMain.handle('shell:open-link', async (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
}

/** True when a newer Carrel has been installed over this one while it runs. */
function replacedOnDisk(): boolean {
  try {
    const onDisk = JSON.parse(fsSync.readFileSync(path.join(appRoot, 'package.json'), 'utf8')) as { version?: string };
    return onDisk.version !== app.getVersion();
  } catch {
    return false;
  }
}

function serveRenderer(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    // The new version's screens need the new version's main process: restart into it.
    if (relative === 'index.html' && replacedOnDisk()) {
      app.relaunch();
      app.exit(0);
      return new Response('Restarting', { status: 503 });
    }
    const filePath = path.normalize(path.join(rendererDir, relative));
    if (!filePath.startsWith(rendererDir + path.sep)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function windowBounds(): Electron.Rectangle | { width: number; height: number } {
  const saved = settings.windowBounds;
  if (saved && saved.x !== undefined && saved.y !== undefined) {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return saved.x! < a.x + a.width - 50 && saved.x! + saved.width > a.x + 50 && saved.y! >= a.y - 10 && saved.y! < a.y + a.height - 50;
    });
    if (visible) return { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  }
  return { width: saved?.width ?? 1240, height: saved?.height ?? 820 };
}

function createWindow(): void {
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    ...windowBounds(),
    minWidth: 760,
    minHeight: 480,
    title: 'Carrel',
    icon: process.platform === 'darwin' ? undefined : iconPath,
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  mainWindow = win;
  if (settings.windowBounds?.maximized) win.maximize();
  // In full screen the window buttons are hidden, so the toolbar needs no room for them.
  win.on('enter-full-screen', () => win.webContents.send('window:full-screen', true));
  win.on('leave-full-screen', () => win.webContents.send('window:full-screen', false));
  win.once('ready-to-show', () => win.show());

  // Links never navigate the app window; http(s) links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`)) event.preventDefault();
  });

  // Before closing, let the interface finish saving whatever is pending.
  let flushed = false;
  win.on('close', (event) => {
    const b = win.getNormalBounds();
    settings.windowBounds = { ...b, maximized: win.isMaximized() };
    void saveSettings(settings);
    if (flushed || win.webContents.isCrashed()) return;
    event.preventDefault();
    const done = () => {
      if (flushed) return;
      flushed = true;
      ipcMain.removeListener('app:flushed', onFlushed);
      win.close();
      // Holding the window open to save cancels a quit, so quit again.
      if (quitting) app.quit();
    };
    const onFlushed = (e: Electron.IpcMainEvent) => {
      if (e.sender === win.webContents) done();
    };
    ipcMain.on('app:flushed', onFlushed);
    win.webContents.send('app:flush');
    setTimeout(done, 3000);
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  void win.loadURL(`${APP_SCHEME}://app/index.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (app.isReady()) {
      createWindow();
    }
  });
  app.whenReady().then(async () => {
    settings = await loadSettings();
    nativeTheme.themeSource = settings.appearance;
    // CARREL_LIBRARY opens another library for this run only (useful for trying things out).
    const libraryPath = process.env.CARREL_LIBRARY ? path.resolve(process.env.CARREL_LIBRARY) : settings.libraryPath;
    try {
      await openLibrary(libraryPath);
    } catch (err) {
      dialog.showErrorBox('Carrel could not open your library', `${libraryPath}\n\n${String(err)}`);
      app.quit();
      return;
    }
    // Show Carrel's icon in the Dock, also when it runs through npm or npx.
    if (process.platform === 'darwin') {
      try {
        app.dock?.setIcon(iconPath);
      } catch {
        /* cosmetic */
      }
    }
    registerIpc();
    serveRenderer();
    buildMenu(() => mainWindow);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
