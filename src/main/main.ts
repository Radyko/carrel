import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppState, ChosenPdf, ContextAction } from '../shared/api';
import type { NewPaperInput, PaperPatch } from '../shared/paper';
import { buildMenu } from './menu';
import { loadSettings, saveSettings, type Settings } from './settings';
import { loadGuide, restoreDefaultGuide, type LoadedGuide } from './storage/guideFile';
import { Library } from './storage/library';

const APP_SCHEME = 'carrel';
const appRoot = path.join(__dirname, '..', '..', '..');
const rendererDir = path.join(appRoot, 'dist', 'renderer');
const defaultGuidePath = path.join(appRoot, 'guide', 'default-guide.yaml');

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setName('Carrel');

let mainWindow: BrowserWindow | null = null;
let settings: Settings;
let library: Library;
let loadedGuide: LoadedGuide;

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
    guide: loadedGuide.guide,
    guidePath: loadedGuide.path,
    guideProblem: loadedGuide.problem,
    guideMissing: loadedGuide.missing,
    platform: process.platform,
    version: app.getVersion(),
  };
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
  ipcMain.handle('paper:context-menu', (e, id: string, options: { due: boolean }) => {
    return new Promise<ContextAction | null>((resolve) => {
      let chosen: ContextAction | null = null;
      const pick = (a: ContextAction) => () => {
        chosen = a;
      };
      const menu = Menu.buildFromTemplate([
        { label: 'Open', click: pick('open') },
        ...(options.due ? [{ label: 'Review Now', click: pick('review') }] : []),
        { label: 'Edit Details…', click: pick('edit') },
        { label: process.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Folder', click: pick('reveal') },
        { type: 'separator' },
        { label: 'Move to Trash…', click: pick('trash') },
      ]);
      menu.popup({
        window: BrowserWindow.fromWebContents(e.sender) ?? undefined,
        callback: () => setImmediate(() => resolve(chosen)),
      });
      void id;
    });
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
  ipcMain.handle('shell:open-link', async (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
}

function serveRenderer(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
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
    // CARREL_LIBRARY opens another library for this run only (useful for trying things out).
    const libraryPath = process.env.CARREL_LIBRARY ? path.resolve(process.env.CARREL_LIBRARY) : settings.libraryPath;
    try {
      await openLibrary(libraryPath);
    } catch (err) {
      dialog.showErrorBox('Carrel could not open your library', `${libraryPath}\n\n${String(err)}`);
      app.quit();
      return;
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
