# Development

```sh
npm install
npm start          # build and open the app
npm test           # unit tests (storage, guide, review intervals, ...)
npm run typecheck
npm link           # make the `carrel` command point at this checkout
npm run install-app  # build and install this checkout as Carrel.app
```

`install.sh` is what the one-line install runs: it downloads a tarball of the
repository, runs `npm ci` and `npm run build`, then `scripts/install-app.js`.
That script copies Electron into `Carrel.app` (on Linux, `~/.local/share/carrel`
plus a menu entry and a `carrel` launcher), puts the built app inside, gives it
the Carrel name and icon, and on macOS signs it ad hoc for this computer.
Set `CARREL_REF` to install another branch or tag, for example:

```sh
curl -fsSL https://raw.githubusercontent.com/Radyko/carrel/main/install.sh | CARREL_REF=some-branch bash
```

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
- `scripts/install-app.js` and `install.sh`: installing Carrel as an app.
- `assets/`: the app icon (`icon.svg` is the source of `icon.png`).

Set `CARREL_LIBRARY=/some/folder` to open a different library for one run, for
example to try things out without touching your own notes.

## Not in this version

Planned, but deliberately left out for now: downloading papers from arXiv or a
link, AI features (such as an assistant that maintains concept pages and a
knowledge graph across your notes), PDF highlighting and annotation, sync
between computers, accounts, notifications, an editor screen for the guide, and
statistics.
