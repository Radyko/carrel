// Checking for and installing new versions of Carrel.
//
// Carrel is published on npm, and installing it again with npx is how it
// updates (see scripts/install-app.js). The check asks the npm registry for
// the latest version number and sends nothing else. Updating runs the same
// npx command a person would type, from their own shell so it finds Node,
// after Carrel has quit; the new version then opens by itself.
import { app, net } from 'electron';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { UpdateStart, UpdateStatus } from '../shared/api';
import { compareVersions } from '../shared/version';

/**
 * The command that installs or updates Carrel, as shown to people. It is npm's
 * shorthand for the GitHub repository; the command then fetches the newest
 * release from npm if it is newer (see bin/carrel.js).
 */
export const UPDATE_COMMAND = 'npx radyko/carrel';

/** 'app' when this is the installed app, 'source' when it runs from a checkout or package folder. */
export function installKind(): 'app' | 'source' {
  const appPath = app.getAppPath();
  return path.basename(appPath) === 'app' && path.basename(path.dirname(appPath)).toLowerCase() === 'resources'
    ? 'app'
    : 'source';
}

export async function checkForUpdate(packageName: string): Promise<UpdateStatus> {
  const version = app.getVersion();
  try {
    const url = `https://registry.npmjs.org/${packageName.replace('/', '%2f')}/latest`;
    const res = await net.fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { state: 'offline' };
    const latest = (await res.json()) as { version?: unknown };
    if (typeof latest.version !== 'string') return { state: 'offline' };
    return compareVersions(latest.version, version) > 0
      ? { state: 'available', version, latest: latest.version }
      : { state: 'current', version };
  } catch {
    return { state: 'offline' };
  }
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function userShell(): string {
  const shell = process.env.SHELL;
  if (shell && path.isAbsolute(shell) && fs.existsSync(shell)) return shell;
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';
}

/** Runs a command in the person's login shell, where Node is on the PATH. */
function inShell(command: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(userShell(), ['-ilc', command], { timeout, env: cleanEnv() }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/**
 * Starts the update and quits. The update runs after Carrel has gone and
 * opens the new version; if it fails, it opens this version again.
 */
export async function installUpdate(packageName: string): Promise<UpdateStart> {
  if (installKind() !== 'app') return { ok: false, reason: 'source' };
  if (process.platform !== 'darwin' && process.platform !== 'linux') return { ok: false, reason: 'platform' };
  try {
    const found = await inShell('command -v npx', 20_000);
    if (!found.trim()) return { ok: false, reason: 'npx' };
  } catch {
    return { ok: false, reason: 'npx' };
  }

  const log = path.join(app.getPath('logs'), 'update.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, `Updating Carrel ${app.getVersion()}, ${new Date().toISOString()}\n`);
  const reopen =
    process.platform === 'darwin'
      ? `open ${quote(path.resolve(process.execPath, '..', '..', '..'))}`
      : `${quote(process.execPath)} >/dev/null 2>&1 &`;
  // Wait for this copy to quit, then update; npx opens the new version.
  const script = `sleep 2; npx --yes --prefer-online ${packageName}@latest >>${quote(log)} 2>&1 || ${reopen}`;
  const child = spawn(userShell(), ['-ilc', script], { detached: true, stdio: 'ignore', env: cleanEnv() });
  child.unref();
  setTimeout(() => app.quit(), 200);
  return { ok: true };
}
