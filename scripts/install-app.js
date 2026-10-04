// Installs Carrel as a standalone app:
//   macOS: Carrel.app in /Applications (or ~/Applications)
//   Linux: ~/.local/share/carrel, with a menu entry and a `carrel` launcher
//
// The app is a copy of Electron with Carrel inside it, so once installed it
// needs neither this folder nor Node. Your papers and notes in ~/Carrel are
// never touched. Installing again replaces the app (that is how updates work).
//
// The `carrel` command uses this on first run. To run it by hand from a
// checkout: npm run install-app
'use strict';

const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const NAME = 'Carrel';

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function readVersion(appDir) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    return p.name === pkg.name ? p.version : null;
  } catch {
    return null;
  }
}

/** The installed app, if there is one: where it is, its version, and how to open it. */
function installedApp() {
  if (process.platform === 'darwin') {
    for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      const app = path.join(dir, `${NAME}.app`);
      const version = readVersion(path.join(app, 'Contents', 'Resources', 'app'));
      if (version) return { path: app, version };
    }
  } else if (process.platform === 'linux') {
    const dir = path.join(os.homedir(), '.local', 'share', 'carrel');
    const version = readVersion(path.join(dir, 'resources', 'app'));
    if (version) return { path: dir, version, exe: path.join(dir, 'electron') };
  }
  return null;
}

function canInstall() {
  return process.platform === 'darwin' || process.platform === 'linux';
}

/** Opens the installed app without waiting for it. */
function openInstalled(extraArgs = []) {
  const app = installedApp();
  if (!app) throw new Error('Carrel is not installed as an app.');
  const child =
    process.platform === 'darwin'
      ? spawn('open', [app.path, ...(extraArgs.length ? ['--args', ...extraArgs] : [])], { detached: true, stdio: 'ignore' })
      : spawn(app.exe, extraArgs, { detached: true, stdio: 'ignore' });
  child.unref();
}

/** The folder holding the Electron binary, downloading it if needed. */
function electronDist() {
  // Installed by npm or npx, electron may sit beside Carrel rather than inside it.
  const dir = path.dirname(require.resolve('electron/package.json', { paths: [root] }));
  // Requiring electron from Node returns the binary's path and downloads it on first use.
  require(dir);
  return path.join(dir, 'dist');
}

/** Copies the built app and its runtime dependencies into an Electron resources/app folder. */
function copyApp(dest) {
  if (!fs.existsSync(path.join(root, 'dist', 'node', 'main', 'main.js'))) {
    throw new Error('Carrel has not been built yet. Run `npm run build` first.');
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const item of ['dist/node', 'dist/renderer', 'guide', 'assets']) {
    fs.cpSync(path.join(root, item), path.join(dest, item), {
      recursive: true,
      filter: (src) => !src.endsWith('.map'),
    });
  }
  const runtimeDeps = Object.keys(pkg.dependencies ?? {}).filter((d) => d !== 'electron');
  const copied = new Set();
  const copyDep = (name, from) => {
    if (copied.has(name)) return;
    copied.add(name);
    const src = path.dirname(require.resolve(`${name}/package.json`, { paths: [from] }));
    fs.cpSync(src, path.join(dest, 'node_modules', name), { recursive: true });
    const depPkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    for (const d of Object.keys(depPkg.dependencies ?? {})) copyDep(d, src);
  };
  for (const d of runtimeDeps) copyDep(d, root);
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

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Makes sure no copy of the installed app is running before its files are
 * replaced. A copy left running would go on with its old code while loading
 * the new version's screens, which don't work with it.
 */
function stopRunning(target, log) {
  const exe = process.platform === 'darwin' ? path.join(target, 'Contents', 'MacOS') + '/' : path.join(target, 'electron');
  const running = () => {
    try {
      return run('pgrep', ['-f', exe]).trim() !== '';
    } catch {
      return false; // pgrep exits 1 when nothing matches
    }
  };
  if (!running()) return;
  log('Closing the open copy of Carrel');
  if (process.platform === 'darwin') {
    // Ask politely, so it saves first. Versions before 0.4 close their window
    // on the first request but keep running, so ask again.
    for (let i = 0; i < 24 && running(); i++) {
      if (i % 4 === 0) {
        try {
          run('osascript', ['-e', `if application "${NAME}" is running then tell application "${NAME}" to quit`]);
        } catch {
          /* no permission to ask; fall through to stopping it below */
        }
      }
      sleep(500);
    }
  }
  if (running()) {
    try {
      run('pkill', ['-TERM', '-f', exe]);
    } catch {
      /* already gone */
    }
    for (let i = 0; i < 20 && running(); i++) sleep(250);
  }
  if (running()) {
    throw Object.assign(new Error('Carrel is still open. Quit it, then run this command again.'), { code: 'STILL_OPEN' });
  }
}

/**
 * Changing the bundle (its name, icon and the app inside) breaks the seal of
 * Electron's signature on the outer app. Its helpers and frameworks are
 * untouched and keep their own signatures, so only the outer bundle is signed
 * again, for this computer only (an ad-hoc signature, which macOS accepts for
 * apps built locally). Signing every part with --deep is discouraged by Apple
 * and fails on some Macs ("main executable failed strict validation"), so it
 * is only a fallback. If signing fails anyway, Carrel is installed regardless:
 * an app built on this Mac opens without a fresh seal.
 */
function signApp(app, log) {
  // Extended attributes from the download (such as Finder info) make codesign refuse.
  try {
    run('xattr', ['-cr', app]);
  } catch {
    /* nothing to clear */
  }
  let problem = '';
  for (const args of [
    ['--force', '--sign', '-', app],
    ['--force', '--deep', '--sign', '-', app],
  ]) {
    try {
      run('codesign', args);
      return true;
    } catch (err) {
      problem = String(err.stderr || err.message).trim().split('\n').pop();
    }
  }
  log(`Could not sign it (${problem}); installing it anyway`);
  return false;
}

function installMac(log) {
  const dist = electronDist();
  const existing = installedApp();
  const applications = existing
    ? path.dirname(existing.path)
    : isWritable('/Applications')
      ? '/Applications'
      : path.join(os.homedir(), 'Applications');
  fs.mkdirSync(applications, { recursive: true });
  const target = path.join(applications, `${NAME}.app`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'carrel-app-'));
  const staging = path.join(work, `${NAME}.app`);

  try {
    log('Assembling Carrel.app');
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

    log('Making the icon');
    const iconset = path.join(work, 'carrel.iconset');
    fs.mkdirSync(iconset);
    const png = path.join(root, 'assets', 'icon.png');
    for (const size of [16, 32, 128, 256, 512]) {
      run('sips', ['-z', String(size), String(size), png, '--out', path.join(iconset, `icon_${size}x${size}.png`)]);
      run('sips', ['-z', String(size * 2), String(size * 2), png, '--out', path.join(iconset, `icon_${size}x${size}@2x.png`)]);
    }
    run('iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'electron.icns')]);

    log('Signing it for this Mac');
    signApp(staging, log);

    stopRunning(target, log);

    log(`Installing to ${target}`);
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
  return target;
}

function installLinux(log) {
  const dist = electronDist();
  const share = path.join(os.homedir(), '.local', 'share');
  const target = path.join(share, 'carrel');
  const staging = `${target}.new`;

  stopRunning(target, log);
  log('Assembling Carrel');
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
  return target;
}

/** Installs (or updates) the app and returns where it went. */
function install({ verbose = false } = {}) {
  const log = verbose ? (m) => console.log(`  ${m}`) : () => {};
  if (process.platform === 'darwin') return installMac(log);
  if (process.platform === 'linux') return installLinux(log);
  throw new Error('Installing Carrel as an app works on macOS and Linux for now.');
}

module.exports = { install, installedApp, openInstalled, canInstall, version: pkg.version };

if (require.main === module) {
  try {
    console.log(`Installing Carrel ${pkg.version}`);
    const where = install({ verbose: true });
    console.log(`\n✓ Carrel is installed: ${where}\n`);
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
}
