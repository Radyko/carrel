// Checking for and installing new versions of Carrel.
//
// Carrel is published on npm, and installing it again with npx is how it
// updates (see scripts/install-app.js). The check asks the npm registry which
// version is latest and sends nothing else. Updating runs the same
// npx command a person would type (finding Node the way findNode.ts explains),
// after Carrel has quit; the new version then opens by itself.
import { app, net } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { UpdateStart, UpdateStatus } from '../shared/api';
import { compareVersions } from '../shared/version';
import { cleanEnv, findNode } from './findNode';

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
    // Read the same package list npx installs from. npm's CDN caches it for a
    // few minutes after a release, while the /latest address is never cached;
    // reading /latest offered updates npx couldn't install yet.
    const url = `https://registry.npmjs.org/${packageName.replace('/', '%2f')}`;
    const res = await net.fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { state: 'offline' };
    const data = (await res.json()) as { 'dist-tags'?: { latest?: unknown } };
    const latest = data['dist-tags']?.latest;
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
export async function installUpdate(packageName: string): Promise<UpdateStart> {
  if (installKind() !== 'app') return { ok: false, reason: 'source' };
  if (process.platform !== 'darwin' && process.platform !== 'linux') return { ok: false, reason: 'platform' };
  const node = await findNode();
  if (!node) return { ok: false, reason: 'npx' };

  // Install the exact version the check found. Right after a release, npm can
  // still hand out the previous one as "latest" for a few minutes, which would
  // reinstall the same version; an exact version waits for npm instead.
  const status = await checkForUpdate(packageName);
  const target = status.state === 'available' ? status.latest : 'latest';

  const log = logPath();
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, `Updating Carrel ${app.getVersion()} to ${target}, ${new Date().toISOString()}, with ${node.npx}\n`);
  fs.writeFileSync(pendingPath(), JSON.stringify({ from: app.getVersion(), to: target, at: Date.now() }));
  const reopen =
    process.platform === 'darwin'
      ? `open ${quote(path.resolve(process.execPath, '..', '..', '..'))}`
      : `${quote(process.execPath)} >/dev/null 2>&1 &`;
  // Wait for this copy to quit, then update; npx opens the new version. If
  // npm doesn't have the new version yet, try again a little later.
  const npx = `${quote(node.npx)} --yes --prefer-online ${packageName}@${target} >>${quote(log)} 2>&1`;
  const script = [
    'sleep 2',
    `for wait in 20 40 0; do ${npx} && exit 0; [ $wait = 0 ] && break; echo "Trying again in $wait seconds" >>${quote(log)}; sleep $wait; done`,
    reopen,
  ].join('\n');
  const child = spawn('/bin/sh', ['-c', script], {
    detached: true,
    stdio: 'ignore',
    env: { ...cleanEnv(), PATH: node.path },
  });
  child.unref();
  setTimeout(() => app.quit(), 200);
  return { ok: true };
}

/**
 * After an update, whether it worked: null when it did (or none was started),
 * otherwise a sentence saying it didn't. Reading it clears it.
 */
export function updateOutcome(): string | null {
  try {
    const pending = JSON.parse(fs.readFileSync(pendingPath(), 'utf8')) as { from?: string; to?: string; at?: number };
    fs.rmSync(pendingPath(), { force: true });
    const recent = typeof pending.at === 'number' && Date.now() - pending.at < 24 * 60 * 60 * 1000;
    const changed = pending.from !== app.getVersion();
    const reached = typeof pending.to === 'string' && pending.to !== 'latest' && compareVersions(app.getVersion(), pending.to) >= 0;
    if (!recent || changed || reached) return null;
    return `The update to ${pending.to === 'latest' ? 'the newest version' : pending.to} didn’t finish. What happened is in ${logPath()}.`;
  } catch {
    return null;
  }
}
