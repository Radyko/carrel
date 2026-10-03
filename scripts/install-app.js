#!/usr/bin/env node
// Installs Carrel as a standalone app from a built checkout:
//   macOS: Carrel.app in /Applications (or ~/Applications)
//   Linux: ~/.local/share/carrel, with a menu entry and a `carrel` launcher
//
// The app is a copy of Electron with Carrel inside it, so it no longer needs
// this folder, Node or npm once installed. Your papers and notes in ~/Carrel
// are never touched. Run it again to update.
//
// Usage: node scripts/install-app.js [--open]
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const NAME = 'Carrel';
const openAfter = process.argv.includes('--open');

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`  ${message}`);
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options }).toString();
}

if (!fs.existsSync(path.join(root, 'dist', 'node', 'main', 'main.js'))) {
  fail('Carrel has not been built yet. Run `npm run build` first.');
}

/** The folder holding the Electron binary, downloading it if needed. */
function electronDist() {
  try {
    // Requiring electron from Node returns the binary's path and downloads it on first use.
    require(path.join(root, 'node_modules', 'electron'));
  } catch (err) {
    fail(`Could not get Electron: ${err.message}`);
  }
  return path.join(root, 'node_modules', 'electron', 'dist');
}

/** Copies the built app and its runtime dependencies into an Electron resources/app folder. */
function copyApp(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of ['dist/node', 'dist/renderer', 'guide', 'assets']) {
    fs.cpSync(path.join(root, item), path.join(dest, item), {
      recursive: true,
      filter: (src) => !src.endsWith('.map'),
    });
  }
  const runtimeDeps = Object.keys(pkg.dependencies ?? {}).filter((d) => d !== 'electron');
  const copied = new Set();
  const copyDep = (name) => {
    if (copied.has(name)) return;
    copied.add(name);
    const src = path.join(root, 'node_modules', name);
    if (!fs.existsSync(src)) fail(`Missing dependency ${name}. Run \`npm install\` first.`);
    fs.cpSync(src, path.join(dest, 'node_modules', name), { recursive: true });
    const depPkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    Object.keys(depPkg.dependencies ?? {}).forEach(copyDep);
  };
  runtimeDeps.forEach(copyDep);
  const appPkg = {
    name: pkg.name,
    productName: pkg.productName ?? NAME,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    main: pkg.main,
    dependencies: Object.fromEntries(runtimeDeps.map((d) => [d, pkg.dependencies[d]])),
  };
  fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify(appPkg, null, 2) + '\n');
}

function isWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function installMac() {
  const dist = electronDist();
  const applications = isWritable('/Applications') ? '/Applications' : path.join(os.homedir(), 'Applications');
  fs.mkdirSync(applications, { recursive: true });
  const target = path.join(applications, `${NAME}.app`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'carrel-app-'));
  const staging = path.join(work, `${NAME}.app`);

  try {
    step('Assembling Carrel.app');
    run('ditto', [path.join(dist, 'Electron.app'), staging]);
    const resources = path.join(staging, 'Contents', 'Resources');
    fs.rmSync(path.join(resources, 'default_app.asar'), { force: true });
    copyApp(path.join(resources, 'app'));

    // Name the app Carrel. The executable and helper apps keep Electron's names,
    // which Electron relies on to find its helpers.
    const plist = path.join(staging, 'Contents', 'Info.plist');
    for (const [key, value] of [
      ['CFBundleName', NAME],
      ['CFBundleDisplayName', NAME],
      ['CFBundleShortVersionString', pkg.version],
      ['CFBundleVersion', pkg.version],
    ]) {
      run('plutil', ['-replace', key, '-string', value, plist]);
    }

    step('Making the icon');
    const iconset = path.join(work, 'carrel.iconset');
    fs.mkdirSync(iconset);
    const png = path.join(root, 'assets', 'icon.png');
    for (const size of [16, 32, 128, 256, 512]) {
      run('sips', ['-z', String(size), String(size), png, '--out', path.join(iconset, `icon_${size}x${size}.png`)]);
      run('sips', ['-z', String(size * 2), String(size * 2), png, '--out', path.join(iconset, `icon_${size}x${size}@2x.png`)]);
    }
    run('iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'electron.icns')]);

    // Changing the bundle invalidates Electron's signature; sign it again for
    // this computer only (an ad-hoc signature), which macOS accepts for apps
    // built locally.
    step('Signing it for this Mac');
    run('codesign', ['--force', '--deep', '--sign', '-', staging]);

    // Quit a running copy before replacing it. "is running" never launches the app.
    try {
      run('osascript', ['-e', `if application "${NAME}" is running then tell application "${NAME}" to quit`]);
    } catch {
      /* not running, or no permission to ask: replacing still works */
    }

    step(`Installing to ${target}`);
    fs.rmSync(target, { recursive: true, force: true });
    run('ditto', [staging, target]);
    try {
      run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', target]);
    } catch {
      /* Spotlight and the Dock pick it up on their own, just a little later */
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  console.log(`\n✓ Carrel is installed in ${applications}.`);
  console.log('  Open it from Launchpad or Spotlight, or keep it in the Dock.\n');
  if (openAfter) run('open', [target]);
}

function installLinux() {
  const dist = electronDist();
  const share = path.join(os.homedir(), '.local', 'share');
  const target = path.join(share, 'carrel');
  const staging = `${target}.new`;

  step('Assembling Carrel');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(dist, staging, { recursive: true, verbatimSymlinks: true });
  fs.rmSync(path.join(staging, 'resources', 'default_app.asar'), { force: true });
  copyApp(path.join(staging, 'resources', 'app'));
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);

  const exe = path.join(target, 'electron');
  const bin = path.join(os.homedir(), '.local', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'carrel'), `#!/bin/sh\nexec "${exe}" "$@"\n`, { mode: 0o755 });

  const apps = path.join(share, 'applications');
  fs.mkdirSync(apps, { recursive: true });
  fs.writeFileSync(
    path.join(apps, 'carrel.desktop'),
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${NAME}`,
      'Comment=Read research papers with a purpose',
      `Exec="${exe}" %U`,
      `Icon=${path.join(target, 'resources', 'app', 'assets', 'icon.png')}`,
      'Categories=Education;Office;',
      'Terminal=false',
      '',
    ].join('\n'),
  );

  console.log(`\n✓ Carrel is installed in ${target}.`);
  console.log('  Open it from your applications menu, or run `carrel`.\n');
  if (openAfter) {
    const child = require('node:child_process').spawn(exe, [], { detached: true, stdio: 'ignore' });
    child.unref();
  }
}

console.log(`\nInstalling Carrel ${pkg.version}`);
if (process.platform === 'darwin') installMac();
else if (process.platform === 'linux') installLinux();
else fail('Installing Carrel as an app works on macOS and Linux for now. On Windows, run it with `npm start`.');
