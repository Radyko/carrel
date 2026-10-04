// Finding Node (and npx) from an app opened from the Dock or Finder.
//
// Apps opened that way don't get Terminal's PATH, only /usr/bin:/bin:/usr/sbin:/sbin,
// so `npx` is usually not on it. Look in the places Node installers and version
// managers put it, then ask the person's login shell as a last resort.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareVersions } from '../shared/version';

export interface NodeLocation {
  /** The npx to run. */
  npx: string;
  /** A PATH that has node (and npx) on it, for npx and what it runs. */
  path: string;
}

/** Folders that may hold npx, best first. `list` returns a folder's entries, or [] if it doesn't exist. */
export function candidateDirs(home: string, env: NodeJS.ProcessEnv, list: (dir: string) => string[]): string[] {
  // Version managers keep one folder per version; use the newest.
  const newest = (dir: string, sub: string) =>
    list(dir)
      .filter((v) => /^v?\d/.test(v))
      .sort((a, b) => compareVersions(b, a))
      .map((v) => path.join(dir, v, sub));

  const nvmDir = env.NVM_DIR || path.join(home, '.nvm');
  const fnmDirs = [env.FNM_DIR, path.join(home, '.local', 'share', 'fnm'), path.join(home, 'Library', 'Application Support', 'fnm'), path.join(home, '.fnm')]
    .filter((d): d is string => !!d)
    .map((d) => path.join(d, 'node-versions'));

  return [
    // Volta, asdf, mise, nodenv and n keep a stable folder of shims.
    path.join(home, '.volta', 'bin'),
    path.join(home, '.asdf', 'shims'),
    path.join(home, '.local', 'share', 'mise', 'shims'),
    path.join(home, '.nodenv', 'shims'),
    path.join(home, 'n', 'bin'),
    ...newest(path.join(nvmDir, 'versions', 'node'), 'bin'),
    ...fnmDirs.flatMap((d) => newest(d, path.join('installation', 'bin'))),
    // Homebrew on Apple silicon and Intel, the nodejs.org installer, MacPorts, Linux packages.
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/opt/local/bin',
    '/usr/bin',
    path.join(home, '.local', 'bin'),
  ];
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function userShell(): string {
  const shell = process.env.SHELL;
  if (shell && path.isAbsolute(shell) && fs.existsSync(shell)) return shell;
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';
}

/**
 * Asks the login shell for its PATH. A marker separates the answer from
 * anything the shell's startup files print, and stdin is closed so a startup
 * prompt (such as "update oh-my-zsh? [Y/n]") can't wait forever.
 */
function shellPath(flags: string, timeout: number): Promise<string | null> {
  const marker = '__CARREL_PATH__';
  return new Promise((resolve) => {
    const child = execFile(
      userShell(),
      [flags, `printf '\\n${marker}%s${marker}\\n' "$PATH"`],
      { timeout, env: cleanEnv() },
      (_err, stdout) => {
        const match = String(stdout ?? '').match(new RegExp(`${marker}(.*?)${marker}`));
        resolve(match ? match[1] : null);
      },
    );
    child.stdin?.end();
  });
}

const withNode = (dir: string, rest: string) => [dir, ...rest.split(path.delimiter).filter((d) => d && d !== dir)].join(path.delimiter);

/** Finds npx, or null if Node isn't installed anywhere Carrel can see. */
export async function findNode(): Promise<NodeLocation | null> {
  const base = process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin';
  const lookIn = (dirs: string[], rest: string): NodeLocation | null => {
    for (const dir of dirs) {
      if (isExecutable(path.join(dir, 'npx')) && isExecutable(path.join(dir, 'node'))) {
        return { npx: path.join(dir, 'npx'), path: withNode(dir, rest) };
      }
    }
    return null;
  };

  // The PATH Carrel already has (enough when it was started from Terminal).
  const direct = lookIn(base.split(path.delimiter), base);
  if (direct) return direct;

  const known = lookIn(candidateDirs(os.homedir(), process.env, listDir), base);
  if (known) return known;

  // Last resort: the login shell's PATH, without and then with the interactive startup files.
  for (const flags of ['-lc', '-ilc']) {
    const found = await shellPath(flags, 15_000);
    if (found) {
      const located = lookIn(found.split(path.delimiter), found);
      if (located) return located;
    }
  }
  return null;
}
