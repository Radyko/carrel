import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('carrel', {
  platform: process.platform,
});
