// Builds a ready-to-run Carrel for a release, so people can install it
// without Node (see scripts/install.sh). Run on the platform being built for:
//
//   node scripts/package-app.js --arch arm64 --out release   (macOS: Carrel-mac-arm64.zip)
//   node scripts/package-app.js --arch x64 --out release     (macOS: Carrel-mac-x64.zip)
//   node scripts/package-app.js --out release                (Linux: Carrel-linux-x64.tar.gz)
//
// The build must exist first (npm run build).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const installer = require('./install-app.js');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const arch = option('arch', process.arch);
const out = path.resolve(option('out', 'release'));
const platform = process.platform === 'darwin' ? 'mac' : process.platform;
const log = (m) => console.log(`  ${m}`);

/** Electron for the architecture being built: the installed one, or a download. */
async function electronFor(work) {
  if (arch === process.arch) return installer.electronDist();
  const electronDir = path.dirname(require.resolve('electron/package.json'));
  const { version } = require(path.join(electronDir, 'package.json'));
  const name = `electron-v${version}-${process.platform}-${arch}.zip`;
  const base = `https://github.com/electron/electron/releases/download/v${version}`;
  log(`Downloading ${name}`);
  const zip = path.join(work, name);
  installer.run('curl', ['-fsSL', '--retry', '3', '-o', zip, `${base}/${name}`]);
  // Check it against Electron's published checksums.
  const sums = installer.run('curl', ['-fsSL', '--retry', '3', `${base}/SHASUMS256.txt`]);
  const expected = sums.split('\n').find((l) => l.trim().endsWith(`*${name}`) || l.trim().endsWith(` ${name}`));
  const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  if (!expected || !expected.startsWith(actual)) throw new Error(`${name} does not match Electron's checksum.`);
  const dist = path.join(work, 'electron');
  fs.mkdirSync(dist);
  // ditto keeps the symbolic links inside Electron's frameworks.
  if (process.platform === 'darwin') installer.run('ditto', ['-x', '-k', zip, dist]);
  else installer.run('unzip', ['-q', zip, '-d', dist]);
  return dist;
}

async function main() {
  if (platform !== 'mac' && platform !== 'linux') throw new Error(`Packaging for ${process.platform} isn't set up.`);
  fs.mkdirSync(out, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'carrel-package-'));
  try {
    console.log(`Packaging Carrel ${installer.version} for ${platform}-${arch}`);
    const dist = await electronFor(work);
    if (platform === 'mac') {
      const app = path.join(work, `${installer.NAME}.app`);
      installer.assembleMac(app, dist, work, log);
      const zip = path.join(out, `Carrel-mac-${arch}.zip`);
      fs.rmSync(zip, { force: true });
      installer.run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
      console.log(`✓ ${zip}`);
    } else {
      const dir = path.join(work, 'carrel');
      installer.assembleLinux(dir, dist);
      const tarball = path.join(out, `Carrel-linux-${arch}.tar.gz`);
      installer.run('tar', ['-czf', tarball, '-C', dir, '.']);
      console.log(`✓ ${tarball}`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
