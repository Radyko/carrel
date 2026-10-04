import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { CarrelApi, MenuAction } from '../shared/api';

const api: CarrelApi = {
  platform: process.platform,
  init: () => ipcRenderer.invoke('app:init'),
  listPapers: () => ipcRenderer.invoke('papers:list'),
  readPaper: (id) => ipcRenderer.invoke('paper:read', id),
  updatePaper: (id, patch) => ipcRenderer.invoke('paper:update', id, patch),
  createPaper: (input) => ipcRenderer.invoke('paper:create', input),
  readPdf: (id) => ipcRenderer.invoke('paper:pdf', id),
  revealPaper: (id) => ipcRenderer.invoke('paper:reveal', id),
  trashPaper: (id) => ipcRenderer.invoke('paper:trash', id),
  paperContextMenu: (id, options) => ipcRenderer.invoke('paper:context-menu', id, options),
  paperCollectionsMenu: (options) => ipcRenderer.invoke('paper:collections-menu', options),
  collectionContextMenu: (name) => ipcRenderer.invoke('collection:context-menu', name),
  listCollections: () => ipcRenderer.invoke('collections:list'),
  createCollection: (name) => ipcRenderer.invoke('collections:create', name),
  renameCollection: (from, to) => ipcRenderer.invoke('collections:rename', from, to),
  deleteCollection: (name) => ipcRenderer.invoke('collections:delete', name),
  choosePdf: () => ipcRenderer.invoke('dialog:choose-pdf'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  revealLibrary: () => ipcRenderer.invoke('library:reveal'),
  revealGuide: () => ipcRenderer.invoke('guide:reveal'),
  restoreGuide: () => ipcRenderer.invoke('guide:restore'),
  reloadGuide: () => ipcRenderer.invoke('guide:reload'),
  openLink: (url) => ipcRenderer.invoke('shell:open-link', url),
  setAppearance: (appearance) => ipcRenderer.invoke('settings:appearance', appearance),
  setLook: (look) => ipcRenderer.invoke('settings:look', look),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onFullScreen: (handler) => {
    const listener = (_: unknown, fullScreen: boolean) => handler(fullScreen);
    ipcRenderer.on('window:full-screen', listener);
    return () => ipcRenderer.removeListener('window:full-screen', listener);
  },
  onMenu: (handler) => {
    const listener = (_: unknown, action: MenuAction) => handler(action);
    ipcRenderer.on('menu', listener);
    return () => ipcRenderer.removeListener('menu', listener);
  },
  onFlush: (handler) => {
    const listener = () => {
      handler().finally(() => ipcRenderer.send('app:flushed'));
    };
    ipcRenderer.on('app:flush', listener);
    return () => ipcRenderer.removeListener('app:flush', listener);
  },
};

contextBridge.exposeInMainWorld('carrel', api);
