#!/usr/bin/env node
// The `carrel` command, used by `npx carrel` and after `npm install -g carrel`.
//
// On macOS and Linux the first run installs Carrel as an app (Carrel.app in
// Applications, or a menu entry on Linux) and opens it. Later runs just open
// the app, and update it first when this package is newer.
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const { name: packageName, version } = require(path.join(appDir, 'package.json'));

/** Compares version numbers like 1.2.3 (pre-releases sort before their release). */
function compareVersions(a, b) {
  const parse = (v) => {
    const [main, pre] = String(v).replace(/^v/, '').split('-', 2);
    return { parts: main.split('.').map((n) => parseInt(n, 10) || 0), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  return x.pre === null ? 1 : y.pre === null ? -1 : x.pre < y.pre ? -1 : 1;
}

/** The newest published version, or null when offline. */
async function latestVersion() {
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName.replace('/', '%2f')}/latest`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? (await res.json()).version ?? null : null;
  } catch {
    return null;
  }
}

if (has('--help') || has('-h')) {
  console.log(`Usage: carrel [options]

Opens Carrel. The first time, it installs Carrel as an app on this computer
(Applications on macOS, the applications menu on Linux) so you can open it
like any other app from then on. Your papers and notes live in ~/Carrel.

  --reinstall    install the app again, even if it is up to date
  --here         run straight from this package without installing an app
  --foreground   like --here, keeping the terminal attached for log output
  --version      print the version`);
  process.exit(0);
}

if (has('--version') || has('-v')) {
  console.log(version);
  process.exit(0);
}

if (!fs.existsSync(path.join(appDir, 'dist', 'node', 'main', 'main.js'))) {
  console.error('Carrel has not been built yet. Run `npm run build` in ' + appDir + ' first.');
  process.exit(1);
}

const passThrough = args.filter((a) => !['--here', '--foreground', '--reinstall'].includes(a));
// A source checkout (npm link) runs itself, so changes show up without reinstalling.
const isCheckout = fs.existsSync(path.join(appDir, 'src'));
const runHere = has('--here') || has('--foreground') || isCheckout;

const installer = require(path.join(appDir, 'scripts', 'install-app.js'));

async function installAndOpen() {
  // npx can reuse an old copy it downloaded before. If a newer Carrel is out,
  // hand over to it so whatever command someone remembers gets the latest.
  if (!process.env.CARREL_NO_UPDATE_CHECK && !has('--reinstall')) {
    const latest = await latestVersion();
    if (latest && compareVersions(latest, version) > 0) {
      console.log(`Getting Carrel ${latest}…`);
      const r = spawnSync('npx', ['--yes', '--prefer-online', `${packageName}@latest`, ...args], {
        stdio: 'inherit',
        env: { ...process.env, CARREL_NO_UPDATE_CHECK: '1' },
      });
      if (r.status === 0) return true;
      console.log(`Could not get ${latest}; continuing with ${version}.`);
    }
  }
  const installed = installer.installedApp();
  // Install when missing or older; never replace a newer app with this one.
  if (!installed || compareVersions(installed.version, version) < 0 || has('--reinstall')) {
    const what = installed ? `Updating Carrel to ${version}` : 'Setting up Carrel as an app on this computer';
    process.stdout.write(`${what}… `);
    const where = installer.install();
    console.log(`done.\nCarrel is in ${process.platform === 'darwin' ? path.dirname(where) : where}. Open it from there any time.`);
  } else if (compareVersions(installed.version, version) > 0) {
    console.log(`Carrel ${installed.version} is installed, which is newer than this ${version}. Opening it.`);
  }
  installer.openInstalled(passThrough);
  return true;
}

if (!runHere && installer.canInstall()) {
  installAndOpen().then(
    () => process.exit(0),
    (err) => {
      if (err.code === 'STILL_OPEN') {
        console.error(`\n${err.message}\n`);
        process.exit(1);
      }
      console.error(`\nCould not install Carrel as an app (${err.message}).\nOpening it directly instead.\n`);
      runFromPackage();
    },
  );
} else {
  runFromPackage();
}

// Run straight from this package.
function runFromPackage() {
  let electronPath;
  try {
    // Requiring the electron package from Node returns the path to the binary
    // (and downloads it on first use).
    electronPath = require('electron');
  } catch (err) {
    console.error('Could not find Electron: ' + err.message);
    process.exit(1);
  }

  const foreground = has('--foreground');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, [appDir, ...passThrough], {
    env,
    stdio: foreground ? 'inherit' : 'ignore',
    detached: !foreground,
    windowsHide: false,
  });

  if (foreground) {
    child.on('close', (code) => process.exit(code ?? 0));
  } else {
    child.unref();
  }
}
