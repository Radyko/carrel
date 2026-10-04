import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { readTextIfExists, writeFileAtomic } from './storage/files';

export interface Settings {
  libraryPath: string;
  /** Library folders the default guide has already been copied into. */
  guideInstalled: string[];
  windowBounds?: { x?: number; y?: number; width: number; height: number; maximized?: boolean };
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function defaultLibraryPath(): string {
  return path.join(os.homedir(), 'Carrel');
}

export async function loadSettings(): Promise<Settings> {
  const defaults: Settings = { libraryPath: defaultLibraryPath(), guideInstalled: [] };
  try {
    const text = await readTextIfExists(settingsPath());
    if (!text) return defaults;
    const data = JSON.parse(text) as Partial<Settings>;
    return {
      libraryPath: typeof data.libraryPath === 'string' && data.libraryPath ? data.libraryPath : defaults.libraryPath,
      guideInstalled: Array.isArray(data.guideInstalled) ? data.guideInstalled.filter((p) => typeof p === 'string') : [],
      windowBounds: data.windowBounds,
    };
  } catch {
    return defaults;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFileAtomic(settingsPath(), JSON.stringify(settings, null, 2) + '\n');
}
