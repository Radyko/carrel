<p align="center">
  <img src="assets/icon.png" width="128" alt="">
</p>

<h1 align="center">Carrel</h1>

<p align="center">A quiet study desk for reading research papers.</p>

Carrel walks you through a paper one step at a time, keeps your notes beside
the PDF, and brings the paper back later so you remember it. Your notes are
plain text files on your computer, and they belong to you.

## Get Carrel

You need **Node.js** first. It's free. Get it from [nodejs.org](https://nodejs.org)
(choose the LTS version), or with Homebrew run `brew install node`.

Then open **Terminal** and paste this:

```sh
npx @radyko/carrel@latest
```

Press Return. If it asks "Ok to proceed?", type `y`. A minute later Carrel opens.

That's it. Carrel is now in your Applications folder like any other app. Open
it from Launchpad, Spotlight or the Dock. You won't need Terminal again
day to day.

Works on macOS and Linux. On Linux it shows up in your applications menu.

## Update

When there's a new version, **Update to …** appears at the bottom of the
sidebar. Click it, then **Update**. Carrel closes, updates itself, and opens
again. Your papers and notes stay exactly as they are.

You can also update from Terminal at any time, with the same command you
used to install:

```sh
npx @radyko/carrel@latest
```

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
4. **Highlight and comment.** Select text in the PDF, pick a colour, and write
   a note beside it.
5. **Summarise from memory.** Carrel can hide the PDF while you write.
6. **Review.** After a week, a month and three months, Carrel asks what you
   remember, then shows what you wrote.

Everything saves as you type. Group papers into **collections**, such as one
per course or project.

## Make it yours

In **Settings → Look**:

- Choose a **background** tone. **Linen** and **Sepia** are warm and soft on the
  eyes, and they tint the PDF pages too.
- Pick an **accent** colour, or click the rainbow dot to choose any colour you
  like.
- Use **Light**, **Dark**, or match your computer.

## Your notes

Everything lives in the `Carrel` folder in your home folder. Each paper gets
its own folder holding the PDF and a `notes.md` file that any text editor can
open. There's no account and no cloud. Carrel never deletes your writing.
Removing a paper moves it to the Trash.

## If something goes wrong

- **"command not found: npx"**: Node.js isn't installed yet. See
  [Get Carrel](#get-carrel).
- **Your papers seem to be missing after an update**: they aren't gone; they
  are still in the `Carrel` folder. Quit Carrel completely (⌘Q, or right-click
  its Dock icon and choose Quit), then open it again. This could happen with
  updates to version 0.3 or earlier if Carrel was open. Updates now close
  Carrel properly first.
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
