<p align="center">
  <img src="assets/icon.png" width="128" alt="">
</p>

<h1 align="center">Carrel</h1>

<p align="center">A quiet study desk for reading research papers.</p>

Carrel guides you through a paper one stage at a time, keeps your notes next to
the PDF, and brings papers back later so you remember them. Your notes are
plain text files that belong to you.

## Install

Open Terminal and paste:

```sh
curl -fsSL https://raw.githubusercontent.com/Radyko/carrel/main/install.sh | bash
```

That's it. Carrel opens when it's done, and from then on it's in your
Applications folder like any other app: find it with Spotlight or Launchpad,
or keep it in the Dock.

You need [Node.js](https://nodejs.org) 22.12 or later to install it (check with
`node -v`; if you use Homebrew, `brew install node`). Installing takes a minute
or two. It works on macOS, and on Linux it adds Carrel to your applications
menu.

To **update**, run the same command again. To **uninstall**, move Carrel from
Applications to the Trash (on Linux, delete `~/.local/share/carrel`). Your
notes stay in `~/Carrel` either way.

## How it works

1. **Add a paper.** Drop a PDF onto the window, or add one you read on paper.
2. **Say why you're reading it.** Your purpose suggests how deep to go.
3. **Read in passes**, and decide after each one whether to keep going:
   - **Survey** (5 to 10 minutes): get the big picture.
   - **Comprehend** (up to an hour): understand it well enough to explain it.
   - **Reconstruct** (1 to 5 hours): rebuild it in your head and find its flaws.

   Each pass asks you a few pointed questions. Stopping after the first pass is
   normal; most papers don't need more.
4. **Summarise from memory.** Carrel can hide the PDF while you write.
5. **Review.** A week, a month and three months later, Carrel asks what you
   remember, then shows you what you wrote at the time.

Everything saves as you type.

## Your notes

Everything lives in `~/Carrel`: one folder per paper, holding the PDF and a
`notes.md` file you can open in any editor. There's no database and no
account. Carrel never deletes your writing; removing a paper moves it to the
Trash.

## Learn more

- [The reading method](docs/method.md): where the method comes from and why it works
- [Using Carrel](docs/using-carrel.md): the library, the reader, review, and keyboard shortcuts
- [Notes and files](docs/notes-and-files.md): the notes format, and how to change the method itself
- [Development](docs/development.md): building and changing Carrel
