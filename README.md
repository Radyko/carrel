Carrel walks you through a paper one step at a time, keeps your notes beside
the PDF, and brings the paper back later so you remember it. Your notes are
plain text files on your computer, and they belong to you.

## Get Carrel

1. Open **Terminal**: press **⌘ Space**, type **Terminal**, and press **Return**.
2. Paste this line and press **Return**:

   ```sh
   curl -fsSL radyko.github.io/carrel/install | sh
   ```

A minute later Carrel opens. It's now in your Applications folder like any
other app: open it from Launchpad, Spotlight or the Dock. There's nothing else
to install, and you won't need Terminal again.

Works on macOS (Apple silicon and Intel) and Linux. On Linux it shows up in
your applications menu. The same steps are on
[radyko.github.io/carrel](https://radyko.github.io/carrel), with a Copy button.

<sub>Developers can also run `npx radyko/carrel`, which needs Node.js.</sub>

## Update

When there's a new version, **Update ready** appears at the bottom of the
sidebar within about 15 minutes of its release. Click it, then **Update**.
Carrel closes, updates itself, and opens again. Your papers and notes stay
exactly as they are. One click always gets the newest version, even if you
skipped a few. Running the install line again also updates Carrel.

To see which version you have, open **Settings**. The version number is under
the title.

## How it works

1. **Add a paper.** Drop a PDF on the window, or add one you read on paper.
2. **Say why you're reading it.** This decides how deep to go.
3. **Read in passes.** After each one, decide whether to keep going.
   - **Survey** (5–10 minutes): the big picture.
   - **Comprehend** (up to an hour): enough to explain it to someone.
   - **Reconstruct** (a few hours): rebuild it and find its weak spots.

   Stopping after the first pass is normal. Most papers don't need more.
   On the first pass, a guide walks you through the parts worth skimming,
   lighting up each one and dimming the rest of the PDF.
4. **Highlight and comment.** Select text in the PDF, pick a colour, and write
   a note beside it.
5. **Summarise from memory.** Carrel can hide the PDF while you write.
6. **Review.** After a week, a month and three months, Carrel asks what you
   remember, then shows what you wrote.

Everything saves as you type. Group papers into **collections**, such as one
per course or project.

## Make it yours

In **Settings → Look**:

- Choose a **background** tone. Carrel starts on **Linen**, a warm off-white
  that is soft on the eyes and tints the PDF pages too.
- Pick an **accent** colour. Carrel starts on **Navy**, and the others are
  deep, quiet colours like slate, old gold and oxblood. Want something louder?
  The rainbow dot opens a picker for any colour.
- Use **Light**, **Dark**, or match your computer.

## Your notes

Everything lives in the `Carrel` folder in your home folder. Each paper gets
its own folder holding the PDF and a `notes.md` file that any text editor can
open. There's no account and no cloud. Carrel never deletes your writing.
Removing a paper moves it to the Trash.

## If something goes wrong

- **The install line says the download didn't work**: check your internet
  connection and run it again.
- **Your papers seem to be missing after an update**: they aren't gone; they
  are still in the `Carrel` folder. Quit Carrel completely (⌘Q, or right-click
  its Dock icon and choose Quit), then open it again. This could happen with
  updates to version 0.3 or earlier if Carrel was open. Updates now close
  Carrel properly first.
- **Carrel takes a while to open the first time**: macOS checks a newly
  installed app before opening it, which can take a minute on a slower
  computer. Later opens are quick.
- **Anything else**: [open an issue](https://github.com/Radyko/carrel/issues)
  and say what you did and what you saw.

## Uninstall

Move Carrel from Applications to the Trash. On Linux, delete
`~/.local/share/carrel`. Your notes stay in the `Carrel` folder until you
delete it yourself.

## Learn more

- [Using Carrel](docs/using-carrel.md): every feature and keyboard shortcut
- [The reading method](docs/method.md): where the passes come from and why they work
- [Notes and files](docs/notes-and-files.md): the notes format, and how to change the questions
- [Development](docs/development.md): building and releasing Carrel
