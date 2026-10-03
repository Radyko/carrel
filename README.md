# Carrel

A carrel is the private study desk in a university library. Carrel is a quiet
desktop app that guides you through reading a computer science research paper,
and keeps your papers and notes in one place, as plain files you own.

## The reading method

Carrel's default method is a synthesis of common advice on reading papers, not
one author's system. It rests on four principles:

1. **Read with a purpose.** Before you start, say why you are reading the paper
   and what you want from it. The purpose decides how deep to go.
2. **Read in stages of increasing depth, and decide after each one whether to
   continue.** Never read straight through. This is the common ground between
   S. Keshav's three-pass approach ("How to Read a Paper", 2007), Andrew Ng's
   advice on reading research, and Jason Eisner's "How to Read a Technical
   Paper". Stopping after the first stage is a normal, successful outcome for
   most papers.
3. **Answer specific questions in your own words.** A blank notes box produces
   transcription; pointed questions produce understanding.
4. **Recall, don't reread.** Dunlosky et al. (2013) rate self-testing and spaced
   review as the most effective study techniques, and rereading, highlighting,
   and summarising with the text in front of you as the least. So summaries are
   written from memory, and Carrel brings papers back for a short recall check.

In practice, every paper goes through:

| Stage | Target | What you do |
| --- | --- | --- |
| **Purpose** | under a minute | Choose why you are reading (assigned for a course, surveying an area, might build on it, reviewing or presenting it, curiosity) and write one to three questions of your own. The purpose suggests a depth; it never enforces one. |
| **Pass 1: Survey** | 5 to 10 minutes | Title, abstract, conclusion, figures, headings, references. Answer the five Cs (Category, Context, Correctness, Contributions, Clarity), then summarise from memory. Decide: continue, come back later, or stop here. |
| **Pass 2: Comprehend** | up to 1 hour | Read with care, skipping proofs. Answer Problem, Approach, Results, Conclusion. Note figures, references to chase, and terms you didn't know. Summarise from memory as if explaining it to a classmate, then check whether you got what you came for. |
| **Pass 3: Reconstruct** | 1 to 5 hours | Re-create the work: assumptions, alternatives, strengths, weaknesses, how you would have done it, future work, and connections to other papers. |
| **Review** | about two minutes | A week, a month and three months after you finish a paper at pass 2 or 3, write what you remember without opening it, then compare with your saved summaries. |

The method is a default, not a law: it lives in an editable file (see
[Changing the method](#changing-the-method)).

## Install

Carrel needs [Node.js](https://nodejs.org) 22.12 or later. Then either run it
directly:

```sh
npx carrel
```

or install it once and run it by name:

```sh
npm install -g carrel
carrel
```

The first run downloads Electron (about 100 MB), so it takes a minute. The
`carrel` command opens the window and returns your terminal; use
`carrel --foreground` to keep it attached and see log output.

macOS is the platform Carrel is built and tested for. Nothing in it is
macOS-only, but Linux and Windows have not been tested yet.

## Using Carrel

**The library** works like the Finder: groups, topics and courses in the
sidebar; your papers in the middle (click a column header to sort); and a
preview on the right with the details and your pass 1 and pass 2 summaries, so
you can refresh your memory of a paper without opening it. The search box
matches titles, authors and the text of your notes.

**Add a paper** by dropping a PDF on the window, with **Add PDF…** (⌘O), or
with **Add without PDF…** (⌘N) for papers you read in print or elsewhere. The
PDF is copied into your library; the original stays where it was. If the PDF
has a title in its metadata, the form starts with it.

**The reader** puts the PDF on the left and the guided notes on the right; drag
the divider to resize. Each pass tab has its goal, a target time, a timer you
start and pause yourself (it never alarms), a checklist, the questions, and the
decision at the end. Move between tabs freely. Everything you type saves
automatically. Summary fields have a button that hides the PDF while you write
from memory; show it again afterwards to correct what you got wrong.

**Review**: papers you finish at pass 2 or pass 3 come back in **Due for
review** after 1 week, then 1 month, then 3 months. Mark each review
*Remembered* (move to the next interval) or *Fuzzy* (repeat the current one).
You can skip a review (it asks again tomorrow) or remove a paper from the
schedule. There are no notifications.

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| ⌘O | Add a PDF |
| ⌘N | New entry without a PDF |
| ⌘F | Search the library |
| ↑ ↓, Return or ⌘↓ | Move through the list, open the selected paper |
| ⌘⌫ | Move the selected paper to the Trash (in the list) |
| ⌘L or Escape | Back to the library (Escape first leaves a text field) |
| ⌘1 – ⌘4 | Purpose, Pass 1, Pass 2, Pass 3 |
| ⌘T | Start or pause the timer |
| ⌘⇧P | Hide or show the PDF |
| ⌘= / ⌘− / ⌘0 | Zoom in, zoom out, fit to width |
| ⌘I | Edit details |
| ⌘⇧R | Reveal in Finder |
| ⌘R | Review due papers |
| ⌘, | Settings |

## Where your notes live

Everything is ordinary files in `~/Carrel` (change the folder in Settings).
There is no database: Carrel builds its library by scanning the folder when it
starts and again whenever its window regains focus, so you can edit, add or
move files with any other tool.

```
~/Carrel/
  guide.yaml                      the reading method (see below)
  papers/
    2007-keshav-how-to-read-a-paper/
      paper.pdf
      notes.md
```

Each `notes.md` starts with YAML front matter for the structured details,
followed by a markdown body with one heading per stage and one sub-heading per
question, in the order the guide defines:

```markdown
---
title: How to Read a Paper
authors: [S. Keshav]
year: 2007
venue: ACM SIGCOMM Computer Communication Review
link: https://doi.org/10.1145/1273445.1273458
topics: [method]
course: Research methods
status: read              # to-read, in-progress, read or set-aside
furthest_pass: 2
decisions:
  pass1: continue
  pass2: done
rating: 4
added: 2026-10-03
last_worked: 2026-10-03T21:40
time_spent_seconds:
  pass1: 540
  pass2: 2710
last_page: 3
purpose: course
checklist:
  pass1: [abstract, conclusion, figures]
next_review: 2026-10-10
review_interval: 7         # days
---
# Purpose

## What do I want to get out of it?

How should I structure my reading this term?

# Pass 1: Survey

## Category

A position paper on method.

...

# Notes

Free-form notes.

# Reviews

## 2026-10-10 · Remembered

Three passes of increasing depth...
```

The headings are the schema: Carrel reads and writes each answer under its
heading. Things to know:

- **Your text is never discarded.** If a notes file has headings or front
  matter fields Carrel doesn't recognise, they are kept exactly as they are
  when Carrel saves. Answers under headings the guide no longer includes are
  shown read-only under "Other notes".
- **Saves are safe.** Carrel writes to a temporary file and renames it into
  place, so a crash during autosave cannot leave a half-written notes file.
  Each save is applied to the latest version on disk, so edits you make in
  another editor while Carrel is open are kept.
- If an answer contains a line starting with `#` or `##`, Carrel stores it as
  `\#` so it can't be mistaken for a heading.
- If a file's front matter isn't valid YAML, Carrel shows the paper read-only
  and tells you, rather than overwriting it.
- **Deleting** a paper moves its folder to the system Trash. Nothing is ever
  removed permanently.

## Changing the method

The whole method (stages, goals, target times, checklists, questions, helper
text, decisions, purpose choices and their suggested depths, and review
intervals) lives in `~/Carrel/guide.yaml`, which Carrel writes on first run
from [`guide/default-guide.yaml`](guide/default-guide.yaml). Edit it in any
text editor; Carrel reloads it when its window regains focus. Comments at the
top of the file explain the rules.

If the file is missing or invalid, Carrel falls back to the built-in guide and
says so at the top of the window. Settings has a button to restore the
default.

## Development

```sh
npm install
npm start          # build and open the app
npm test           # unit tests (storage, guide, review intervals, ...)
npm run typecheck
npm link           # make the `carrel` command point at this checkout
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

Set `CARREL_LIBRARY=/some/folder` to open a different library for one run, for
example to try things out without touching your own notes.

## Not in this version

Planned, but deliberately left out for now: downloading papers from arXiv or a
link, AI features (such as an assistant that maintains concept pages and a
knowledge graph across your notes), PDF highlighting and annotation, sync
between computers, accounts, notifications, an editor screen for the guide, and
statistics.
