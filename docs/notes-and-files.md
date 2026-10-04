# Notes and files

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
collections: [Research methods, Thesis]
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

Highlights you make in the PDF are kept in the same file, under
`# Highlights`, one per line. The quote and page number are plain text; the
comment at the end, which markdown viewers hide, records where on the page the
highlight sits:

```markdown
# Highlights

- p. 4: “PagedAttention divides the KV cache into blocks” <!-- carrel id=k3f9 color=yellow rects=0.112,0.341,0.402,0.012 -->
```

Deleting a line in an editor removes that highlight.

Collections live in each paper's `collections` field. `~/Carrel/collections.yaml`
remembers their names and order, so a collection can exist before it has any
papers. (Older notes files with a single `course:` field are read as a
collection and updated the next time Carrel saves them.)

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
from [`guide/default-guide.yaml`](../guide/default-guide.yaml). Edit it in any
text editor; Carrel reloads it when its window regains focus. Comments at the
top of the file explain the rules.

If the file is missing or invalid, Carrel falls back to the built-in guide and
says so at the top of the window. Settings has a button to restore the
default.
