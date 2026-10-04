# Development

```sh
npm install
npm start          # build and open the app
npm test           # unit tests (storage, guide, review intervals, ...)
npm run typecheck
npm link           # make the `carrel` command point at this checkout
npm run install-app  # build and install this checkout as Carrel.app
```

The `carrel` command (`bin/carrel.js`) installs Carrel as an app on first run
and opens it; later runs open the installed app, updating it first when the
package is newer. `--here` runs straight from the package instead, and a source
checkout (one with a `src` folder, as after `npm link`) always runs itself.

`scripts/install-app.js` does the installing. It copies Electron into
`Carrel.app` (on Linux, `~/.local/share/carrel` plus a menu entry and a
`carrel` launcher), puts the built app inside, gives it the Carrel name and
icon, and on macOS signs it ad hoc for this computer.

The package is published to npm as `@radyko/carrel` (npm refused the plain
name `carrel` as too similar to `parcel`), so people run `npx @radyko/carrel`.
To release a new version: `npm version minor` (or `patch`), then `npm publish`.

If you change `guide/default-guide.yaml`, add the SHA-256 of the *previous*
default (`git show HEAD:guide/default-guide.yaml | shasum -a 256`) to
`PREVIOUS_DEFAULTS` in `src/main/storage/guideFile.ts`. People who never edited
their guide then get the new one automatically.

`npx github:Radyko/carrel` also works, without publishing, because the
`prepare` script builds the package when npm fetches it from GitHub. Add
`#branch-name` to try a branch: `npx github:Radyko/carrel#some-branch`.

The code is Electron with TypeScript, React and Vite, and PDF.js for PDFs.

- `src/main/`: the Electron main process. `storage/` holds the file format:
  `notesFile.ts` parses and writes notes files without losing anything,
  `library.ts` manages paper folders, `guideFile.ts` loads the guide.
- `src/preload/`: the small API the interface is allowed to use. The
  interface runs with context isolation, sandboxing and no Node integration.
- `src/shared/`: logic shared by both sides: the guide schema, the paper
  model, review scheduling, filtering and sorting.
- `src/renderer/`: the React interface (plain React and CSS; no other UI
  libraries).
- `guide/default-guide.yaml`: the default method.
- `bin/carrel.js` and `scripts/install-app.js`: the `carrel` command and installing Carrel as an app.
- `assets/`: the app icon (`icon.svg` is the source of `icon.png`).

Set `CARREL_LIBRARY=/some/folder` to open a different library for one run, for
example to try things out without touching your own notes.

## Not in this version

Planned, but deliberately left out for now: downloading papers from arXiv or a
link, AI features (such as an assistant that maintains concept pages and a
knowledge graph across your notes), PDF annotations beyond highlights, sync
between computers, accounts, notifications, an editor screen for the guide, and
statistics.
