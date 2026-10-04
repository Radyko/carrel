# Using Carrel

On Linux, use Ctrl wherever this page says ⌘.

## The library

The library is laid out like the Finder. On the left are groups (To read, In
progress, and so on), your collections, and your topics. Your papers are in the
middle; click a column header to sort them. A preview on the right shows a
paper's details and your summaries, so you can refresh your memory without
opening it.

- **Search** (⌘F) looks through titles, authors and everything you wrote.
- **Hide the sidebar** with the button at the top left (or ⌃⌘S) when you just
  want the list.

## Adding papers

- Drop a PDF on the window, or click **Add PDF…** (⌘O).
- For a paper you read in print, click **Add without PDF…** (⌘N).

Carrel copies the PDF into your library. Your original stays where it was.

## Collections

Use a collection for each course, project or reading group. A paper can be in
several.

- **Make one**: click **+** next to Collections in the sidebar.
- **Add papers**: drag them onto the collection, or right-click a paper and
  choose **Collections**.
- **Rename or delete**: right-click the collection. Deleting a collection
  never deletes its papers.

Papers you add while a collection is selected go into it.

## Reading

The reader shows the PDF on the left and your notes on the right. Drag the
line between them to resize.

Each pass has:

- its goal and a rough time to aim for,
- a timer you start and pause yourself (it never interrupts you),
- a short checklist and a few questions,
- a choice at the end: keep going, come back later, or stop here.

Move between the tabs freely. Everything saves as you type. Summary questions
have a button that hides the PDF while you write from memory. Show it again
afterwards to check what you missed.

## Highlights and notes

1. Select text in the PDF.
2. Pick a colour from the small bar that appears (or press ⌘⇧H for yellow).
3. A note card opens on the right. Type your comment; it saves as you go.

Click a highlight later to open its note again, change its colour, copy it or
remove it. Escape closes the card. Highlights with a note get a small dot in
the margin. All your highlights are listed below the questions; click one to
jump to it in the PDF.

## Review

Papers you finish at pass 2 or 3 come back under **Due for review** after one
week, then one month, then three months. Write what you remember, then compare
it with what you wrote before. Mark it **Remembered** to move on to the next
interval, or **Fuzzy** to see it again sooner. There are no notifications;
Carrel just shows how many are due.

## Settings

Open Settings from the bottom of the sidebar (or ⌘,).

- **Mode**: Light, Dark, or match your computer.
- **Background**: Linen (the default) and Sepia are warm, easier on the eyes
  in long sessions, and tint the PDF pages too. Paper is plain white, Mist is
  cool, and Sage is a soft green.
- **Accent**: the colour of buttons, selections and links. Yale blue is the
  default; the other dots are deep, muted colours. The rainbow dot lets you
  choose any colour. Carrel adjusts how light it is so text stays readable in
  both light and dark mode.
- **Updates**: shows your version and installs a new one when there is one.
- **Your files**: where your library lives, and the reading guide file.

## Updating

When a new version is out, **Update to …** appears at the bottom of the
sidebar, and Settings shows an **Update** button. Carrel closes, updates
itself, and opens again in about a minute. Your papers and notes aren't
touched.

From Terminal, this always installs the latest version:

```sh
npx radyko/carrel
```

To check for updates, Carrel asks npm (where it is published) for the latest
version number. Nothing else is sent.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| ⌘O | Add a PDF |
| ⌘N | New entry without a PDF |
| ⌘F | Search the library |
| ↑ ↓, Return | Move through the list, open the selected paper |
| ⌘⌫ | Move the selected paper to the Trash |
| ⌘L or Escape | Back to the library |
| ⌘1 – ⌘4 | Purpose, Pass 1, Pass 2, Pass 3 |
| ⌘T | Start or pause the timer |
| ⌘⇧P | Hide or show the PDF |
| ⌘= / ⌘− / ⌘0 | Zoom in, zoom out, fit to width |
| ⌘⇧H | Highlight the selected text |
| ⌃⌘S (Ctrl+Alt+S on Linux) | Show or hide the sidebar |
| ⌘I | Edit a paper's details |
| ⌘⇧R | Show the paper's folder |
| ⌘R | Review due papers |
| ⌘, | Settings |
