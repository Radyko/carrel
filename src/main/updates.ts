// Checking for and installing new versions of Carrel.
//
// Each release on GitHub carries a ready-made Carrel for macOS and Linux, its
// installer (scripts/install.sh) and latest.json with its version number. The
// check reads latest.json and sends nothing else. Updating runs the installer
// after Carrel has quit, the same one people use to install Carrel, so it
// needs no Node or npm; the new version then opens by itself.
import { app, net } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { UpdateStart, UpdateStatus } from '../shared/api';
import { compareVersions } from '../shared/version';

// CARREL_RELEASES points at another copy of the releases, for testing.
const RELEASES = process.env.CARREL_RELEASES || 'https://github.com/Radyko/carrel/releases';

/** The command that installs or updates Carrel, as shown to people. */
export const UPDATE_COMMAND = 'curl -fsSL radyko.github.io/carrel/install | sh';

/** 'app' when this is the installed app, 'source' when it runs from a checkout or package folder. */
export function installKind(): 'app' | 'source' {
  const appPath = app.getAppPath();
  return path.basename(appPath) === 'app' && path.basename(path.dirname(appPath)).toLowerCase() === 'resources'
    ? 'app'
    : 'source';
}

export async function checkForUpdate(timeout = 10_000): Promise<UpdateStatus> {
  const version = app.getVersion();
  try {
    const res = await net.fetch(`${RELEASES}/latest/download/latest.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return { state: 'offline' };
    const latest = ((await res.json()) as { version?: unknown }).version;
    if (typeof latest !== 'string') return { state: 'offline' };
    return compareVersions(latest, version) > 0 ? { state: 'available', version, latest } : { state: 'current', version };
  } catch {
    return { state: 'offline' };
  }
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function pendingPath(): string {
  return path.join(app.getPath('userData'), 'update-pending.json');
}

function logPath(): string {
  return path.join(app.getPath('logs'), 'update.log');
}

/**
 * Starts the update and quits. The update runs after Carrel has gone and
 * opens the new version; if it fails, it opens this version again, and
 * updateOutcome() says so at the next start.
 */
export async function installUpdate(): Promise<UpdateStart> {
  if (installKind() !== 'app') return { ok: false, reason: 'source' };
  if (process.platform !== 'darwin' && process.platform !== 'linux') return { ok: false, reason: 'platform' };

  // Install the exact version the check found.
  const status = await checkForUpdate();
  if (status.state !== 'available') return { ok: false, reason: status.state === 'offline' ? 'offline' : 'current' };
  const target = status.latest;

  const log = logPath();
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, `Updating Carrel ${app.getVersion()} to ${target}, ${new Date().toISOString()}\n`);
  fs.writeFileSync(pendingPath(), JSON.stringify({ from: app.getVersion(), to: target, at: Date.now() }));
  // The app's path goes in through the environment, not the script's text, so
  // the installer's check for a running Carrel doesn't find this script.
  const reopen = process.platform === 'darwin' ? 'open "$CARREL_REOPEN"' : '"$CARREL_REOPEN" >/dev/null 2>&1 &';
  // Wait for this copy to quit, then run the release's installer, which opens
  // the new version. Try again a little later if the download fails.
  const script = [
    'sleep 2',
    'f=$(mktemp)',
    `for wait in 20 40 0; do curl -fsSL --retry 2 -o "$f" ${quote(`${RELEASES}/download/v${target}/install.sh`)} && CARREL_VERSION=${quote(target)} CARREL_QUIET=1 sh "$f" >>${quote(log)} 2>&1 && exit 0; [ $wait = 0 ] && break; echo "Trying again in $wait seconds" >>${quote(log)}; sleep $wait; done`,
    reopen,
  ].join('\n');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CARREL_REOPEN: process.platform === 'darwin' ? path.resolve(process.execPath, '..', '..', '..') : process.execPath,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env });
  child.unref();
  setTimeout(() => app.quit(), 200);
  return { ok: true };
}

/**
 * What happened to the last update: whether one just finished (this is its
 * first start), and if it didn't finish, a sentence saying so. Reading it
 * clears it.
 */
export function updateOutcome(): { justUpdated: boolean; problem: string | null } {
  const none = { justUpdated: false, problem: null };
  try {
    const pending = JSON.parse(fs.readFileSync(pendingPath(), 'utf8')) as { from?: string; to?: string; at?: number };
    fs.rmSync(pendingPath(), { force: true });
    const recent = typeof pending.at === 'number' && Date.now() - pending.at < 24 * 60 * 60 * 1000;
    if (!recent) return none;
    if (pending.from !== app.getVersion()) return { justUpdated: true, problem: null };
    const reached = typeof pending.to === 'string' && pending.to !== 'latest' && compareVersions(app.getVersion(), pending.to) >= 0;
    if (reached) return none;
    return {
      justUpdated: false,
      problem: `The update to ${pending.to === 'latest' ? 'the newest version' : pending.to} didn’t finish. What happened is in ${logPath()}.`,
    };
  } catch {
    return none;
  }
}

/**
 * Right after an update, carries on to a newer version if there is one, so a
 * single click always ends on the newest Carrel. That happens when a release
 * comes out during an update, or when an older Carrel updated through npm,
 * which can lag behind the GitHub releases. Each step writes its own pending
 * note, and a step that doesn't move the version on stops the chain, so this
 * can't loop. True when an update has started and Carrel is quitting.
 */
export async function continueUpdate(): Promise<boolean> {
  if (installKind() !== 'app') return false;
  if ((await checkForUpdate(5_000)).state !== 'available') return false;
  return (await installUpdate()).ok;
}
