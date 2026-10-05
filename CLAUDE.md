# Working on Carrel

- Carrel is for researchers who aren't programmers. Keep it simple, clean and
  frictionless, and write user-facing text and docs in plain language.
- **Every PR that changes what people get** (the app, `scripts/install.sh`,
  `bin/`, `guide/`) **bumps the version** with
  `npm version patch --no-git-tag-version` (minor for bigger features).
  Merging a version bump to main releases it automatically
  (`.github/workflows/release.yml`); there are no tags to push. PRs that only
  touch docs, tests or `site/` don't bump it.
- Checks before pushing: `npm run typecheck` and `npm test`.
- Never mention Yale anywhere; the default accent is called Navy.
