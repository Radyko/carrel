import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '../shared/api';

export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin';
  const send = (action: MenuAction) => () => getWindow()?.webContents.send('menu', action);
  const item = (label: string, action: MenuAction, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: send(action),
  });
  const reveal = isMac ? 'Reveal in Finder' : 'Show in Folder';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              item('Settings…', 'settings', 'CmdOrCtrl+,'),
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        item('Add PDF…', 'add-pdf', 'CmdOrCtrl+O'),
        item('New Entry Without PDF…', 'add-entry', 'CmdOrCtrl+N'),
        { type: 'separator' },
        ...(isMac ? [] : [item('Settings…', 'settings', 'CmdOrCtrl+,'), { type: 'separator' } as const]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find', 'find', 'CmdOrCtrl+F'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Library', 'library', 'CmdOrCtrl+L'),
        { type: 'separator' },
        item('Purpose', 'tab-1', 'CmdOrCtrl+1'),
        item('Pass 1', 'tab-2', 'CmdOrCtrl+2'),
        item('Pass 2', 'tab-3', 'CmdOrCtrl+3'),
        item('Pass 3', 'tab-4', 'CmdOrCtrl+4'),
        { type: 'separator' },
        item('Hide or Show PDF', 'toggle-pdf', 'CmdOrCtrl+Shift+P'),
        item('Zoom In', 'zoom-in', 'CmdOrCtrl+='),
        item('Zoom Out', 'zoom-out', 'CmdOrCtrl+-'),
        item('Fit to Width', 'fit-width', 'CmdOrCtrl+0'),
        item('Highlight Selection', 'highlight', 'CmdOrCtrl+Shift+H'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Paper',
      submenu: [
        // Return and Cmd+Down open the selected paper from the list.
        item('Open', 'open'),
        item('Edit Details…', 'edit', 'CmdOrCtrl+I'),
        item(reveal, 'reveal', 'CmdOrCtrl+Shift+R'),
        { type: 'separator' },
        item('Start or Pause Timer', 'toggle-timer', 'CmdOrCtrl+T'),
        item('Review Due Papers', 'review', 'CmdOrCtrl+R'),
        { type: 'separator' },
        // No shortcut here: Cmd+Backspace edits text. The library list handles it.
        item('Move to Trash…', 'trash'),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
