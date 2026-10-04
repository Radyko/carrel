# Development

```sh
npm install
npm start          # build and open the app
npm test           # unit tests (storage, guide, review intervals, ...)
npm run typecheck
npm link           # make the `carrel` command point at this checkout
npm run install-app  # build and install this checkout as Carrel.app
```

People install Carrel with one line (see [How people install and
update](#how-people-install-and-update)). For development:

The `carrel` command (`bin/carrel.js`) installs Carrel as an app on first run
and opens it; later runs open the installed app, updating it first when the
package is newer (never downgrading it). Because npx can reuse a copy it
downloaded earlier, the command first asks the npm registry for the latest
version and hands over to `npx @radyko/carrel@latest` if this copy is older.
`--here` runs straight from the package instead, and a source checkout (one
with a `src` folder, as after `npm link`) always runs itself.

## Releasing

```sh
npm version patch        # or minor; makes the commit and the v0.x.y tag
git push --follow-tags
```

The tag starts `.github/workflows/release.yml`, which:

1. builds a ready-made Carrel on GitHub's machines with
   `scripts/package-app.js`: `Carrel-mac-arm64.zip` and `Carrel-mac-x64.zip`
   on a Mac, `Carrel-linux-x64.tar.gz` on Linux;
2. creates the GitHub release with those, `install.sh` and `latest.json`
   (the version number);
3. publishes to npm too, if the repository has an `NPM_TOKEN` secret.

`.github/workflows/pages.yml` publishes `site/` to
[radyko.github.io/carrel](https://radyko.github.io/carrel): the page people
are sent to, and `/install`, a tiny script that fetches `install.sh` from the
latest release and runs it. Pages must be on once: Settings → Pages → Source:
GitHub Actions. With a domain of your own, add it there and the install line
becomes `curl -fsSL yourdomain/install | sh`; nothing else changes.

## How people install and update

`curl -fsSL radyko.github.io/carrel/install | sh` runs `scripts/install.sh`
from the latest release. It downloads the ready-made app for the computer
(Apple silicon or Intel Mac, or Linux), closes a running Carrel (asking it to
quit first, so it saves), replaces the app in Applications (or
`~/.local/share/carrel` on Linux) and opens it. It needs only `curl`, so no
Node, npm or git. Files downloaded with curl aren't quarantined by macOS, so
there is no "can't be opened" warning; the app is signed ad hoc on GitHub's
Mac.

The installed app checks for a new version by reading `latest.json` from the
latest release (`src/main/updates.ts`): at start, every 15 minutes while open,
and when its window regains focus, the sidebar opens, the library comes back
or Settings opens (all but Settings skip a check made in the last 30 seconds).
**Update** quits Carrel and runs that release's `install.sh` for the exact
version found, trying twice more if the download fails. The new version opens
when that finishes. If it fails, the old one opens again, the output is in
`update.log` in Carrel's logs folder, and a note in `update-pending.json` lets
the next start say in Settings that the update didn't finish.
`CARREL_RELEASES` and `CARREL_DOWNLOAD` point both at another copy of the
releases, for testing.

The app also restarts itself if it finds a different version on disk when it
loads its window, so an update can never run new screens against old code.

The npm route still works for developers: `npx radyko/carrel` (npm's shorthand
for this repository, built with the `prepare` script) or `npx @radyko/carrel`.
`bin/carrel.js` installs with `scripts/install-app.js`, which assembles the app
on the person's own computer, then opens it. Copies installed that way update
through the GitHub releases like any other.

If you change `guide/default-guide.yaml`, add the SHA-256 of the *previous*
default (`git show HEAD:guide/default-guide.yaml | shasum -a 256`) to
`PREVIOUS_DEFAULTS` in `src/main/storage/guideFile.ts`. People who never edited
their guide then get the new one automatically.

To try a branch before merging it, add its name:
`npx radyko/carrel#some-branch`.

The code is Electron with TypeScript, React and Vite, and PDF.js for PDFs.

- `src/main/`: the Electron main process. `storage/` holds the file format:
  `notesFile.ts` parses and writes notes files without losing anything,
  `library.ts` manages paper folders, `guideFile.ts` loads the guide.
- `src/preload/`: the small API the interface is allowed to use. The
  interface runs with context isolation, sandboxing and no Node integration.
- `src/shared/`: logic shared by both sides: the guide schema, the paper
  model, review scheduling, filtering and sorting, and the colour choices
  (`look.ts`).
- Colours are CSS custom properties in `src/renderer/styles.css`, each a
  `light-dark()` pair. A background tone (`data-tone` on the root) swaps the
  neutrals. Every accent shade is derived from one `--accent-base` colour with
  OKLCH relative colours, clamping lightness so text on it stays readable.
- `src/renderer/`: the React interface (plain React and CSS; no other UI
  libraries).
- `guide/default-guide.yaml`: the default method.
- `scripts/install.sh`: the installer people run; `scripts/package-app.js`:
  builds the ready-made apps for a release; `bin/carrel.js` and
  `scripts/install-app.js`: the `carrel` command for npm, which builds the app
  on the person's computer.
- `site/`: the install page and the short `/install` address.
- `assets/`: the app icon (`icon.svg` is the source of `icon.png`) and the
  README banner (`banner.html` is the source of `banner.png`). Render them by
  opening each in a browser at 1024×1024 and 1280×400 (2× scale) and taking a
  screenshot with a transparent background.

Set `CARREL_LIBRARY=/some/folder` to open a different library for one run, for
example to try things out without touching your own notes.

## Not in this version

Planned, but deliberately left out for now: downloading papers from arXiv or a
link, AI features (such as an assistant that maintains concept pages and a
knowledge graph across your notes), PDF annotations beyond highlights, sync
between computers, accounts, notifications, an editor screen for the guide, and
statistics.
