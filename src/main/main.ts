import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_SCHEME = 'carrel';
const rendererDir = path.join(__dirname, '..', '..', 'renderer');

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setName('Carrel');

let mainWindow: BrowserWindow | null = null;

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 480,
    title: 'Carrel',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(`${APP_SCHEME}://app/index.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    serveRenderer();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
