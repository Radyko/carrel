#!/usr/bin/env node
// The `carrel` command, used by `npx carrel` and after `npm install -g carrel`.
//
// On macOS and Linux the first run installs Carrel as an app (Carrel.app in
// Applications, or a menu entry on Linux) and opens it. Later runs just open
// the app, and update it first when this package is newer.
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const version = require(path.join(appDir, 'package.json')).version;

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

if (!runHere && installer.canInstall()) {
  try {
    const installed = installer.installedApp();
    if (!installed || installed.version !== version || has('--reinstall')) {
      const what = installed ? `Updating Carrel to ${version}` : 'Setting up Carrel as an app on this computer';
      process.stdout.write(`${what}… `);
      const where = installer.install();
      console.log(`done.\nCarrel is in ${process.platform === 'darwin' ? path.dirname(where) : where}. Open it from there any time.`);
    }
    installer.openInstalled(passThrough);
    process.exit(0);
  } catch (err) {
    console.error(`\nCould not install Carrel as an app (${err.message}).\nOpening it directly instead.\n`);
  }
}

// Run straight from this package.
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
