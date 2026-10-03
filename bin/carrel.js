#!/usr/bin/env node
// Launches the Carrel desktop app. Used by `npx carrel` and by the global
// `carrel` command after `npm install -g carrel` or `npm link`.
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: carrel [--foreground]

Opens the Carrel window. Your papers and notes live in ~/Carrel by default
(change this in Carrel > Settings).

  --foreground   keep the terminal attached and show the app's log output
  --version      print the version`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(require(path.join(appDir, 'package.json')).version);
  process.exit(0);
}

if (!fs.existsSync(path.join(appDir, 'dist', 'node', 'main', 'main.js'))) {
  console.error('Carrel has not been built yet. Run `npm run build` in ' + appDir + ' first.');
  process.exit(1);
}

let electronPath;
try {
  // Requiring the electron package from Node returns the path to the binary
  // (and downloads it on first use).
  electronPath = require('electron');
} catch (err) {
  console.error('Could not find Electron: ' + err.message);
  process.exit(1);
}

const foreground = args.includes('--foreground');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const passThrough = args.filter((a) => a !== '--foreground');
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
