#!/usr/bin/env bash
# Installs Carrel as an app on this computer.
#
#   curl -fsSL https://raw.githubusercontent.com/Radyko/carrel/main/install.sh | bash
#
# It downloads the source, builds it, and puts Carrel.app in /Applications
# (on Linux: a menu entry and a `carrel` command). Run it again to update.
# Your papers and notes in ~/Carrel are never touched.
set -euo pipefail

REPO="${CARREL_REPO:-Radyko/carrel}"
REF="${CARREL_REF:-main}"

say() { printf '%s\n' "$*"; }
die() { printf '\n%s\n\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin | Linux) ;;
  *) die "This installer works on macOS and Linux." ;;
esac

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  die "Carrel needs Node.js 22.12 or later to build. Install it from https://nodejs.org (or \`brew install node\`), then run this again."
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'; then
  die "Carrel needs Node.js 22.12 or later; you have $(node -v). Update it from https://nodejs.org (or \`brew upgrade node\`), then run this again."
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/carrel-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

say ""
say "Downloading Carrel ($REF)…"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$WORK" --strip-components=1 \
  || die "Could not download $REPO at $REF."

cd "$WORK"
say "Building (this takes a minute or two the first time)…"
npm ci --no-audit --no-fund --loglevel=error >/dev/null
npm run build --silent >/dev/null

node scripts/install-app.js --open
