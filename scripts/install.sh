#!/bin/sh
# Installs or updates Carrel, without Node or npm:
#
#   curl -fsSL radyko.github.io/carrel/install | sh
#
# It downloads the ready-made app from the latest GitHub release, puts it in
# Applications (on Linux, ~/.local/share/carrel with a menu entry), and opens
# it. Your papers and notes in ~/Carrel are never touched. Running it again
# updates Carrel; the app's Update button runs it too.
#
#   CARREL_VERSION=0.6.0   install that version instead of the latest
#   CARREL_RELEASES=url    use another copy of the releases (for testing)
#   CARREL_DOWNLOAD=url    download this version's files from somewhere else (for testing)
#   CARREL_QUIET=1         no progress bar (used by the app)
set -eu

releases=${CARREL_RELEASES:-https://github.com/Radyko/carrel/releases}
if [ -n "${CARREL_DOWNLOAD:-}" ]; then
  base=$CARREL_DOWNLOAD
elif [ -n "${CARREL_VERSION:-}" ]; then
  base=$releases/download/v$CARREL_VERSION
else
  base=$releases/latest/download
fi

say() { printf '%s\n' "$*"; }
fail() { printf '\nCarrel could not be installed: %s\n\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=mac ;;
  Linux) os=linux ;;
  *) fail "it runs on macOS and Linux." ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) fail "this computer's processor ($(uname -m)) isn't supported." ;;
esac
# A Terminal running under Rosetta on Apple silicon reports x86_64; use the native app.
if [ $os = mac ] && [ $arch = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
  arch=arm64
fi
if [ $os = mac ]; then file=Carrel-mac-$arch.zip; else file=Carrel-linux-$arch.tar.gz; fi
command -v curl >/dev/null 2>&1 || fail "curl is needed to download it."

tmp=$(mktemp -d "${TMPDIR:-/tmp}/carrel-install.XXXXXX")
trap 'rm -rf "$tmp"' EXIT INT TERM

say ""
say "  Carrel · a quiet study desk for research papers"
say ""
say "Downloading Carrel…"
if [ -n "${CARREL_QUIET:-}" ]; then
  curl -fsSL --retry 3 -o "$tmp/$file" "$base/$file" || fail "the download didn't work. Check your internet connection and try again."
else
  curl -fL --retry 3 --progress-bar -o "$tmp/$file" "$base/$file" || fail "the download didn't work. Check your internet connection and try again."
fi

# Closes a running copy before its files are replaced, asking it to quit first so it saves.
running() { pgrep -f "$1" >/dev/null 2>&1; }
stop_running() {
  exe=$1
  running "$exe" || return 0
  say "Closing the open copy of Carrel…"
  i=0
  while running "$exe" && [ $i -lt 24 ]; do
    if [ $os = mac ] && [ $((i % 4)) = 0 ]; then
      osascript -e 'if application "Carrel" is running then tell application "Carrel" to quit' >/dev/null 2>&1 || true
    fi
    sleep 0.5
    i=$((i + 1))
  done
  if running "$exe"; then
    pkill -TERM -f "$exe" 2>/dev/null || true
    sleep 2
  fi
  running "$exe" && fail "Carrel is still open. Quit it, then run this again."
  return 0
}

if [ $os = mac ]; then
  # Update in place if Carrel is already installed; otherwise use Applications.
  dest=""
  for dir in /Applications "$HOME/Applications"; do
    if [ -d "$dir/Carrel.app" ]; then dest=$dir; break; fi
  done
  if [ -z "$dest" ]; then
    if [ -w /Applications ]; then dest=/Applications; else dest=$HOME/Applications; fi
  fi
  mkdir -p "$dest"
  ditto -x -k "$tmp/$file" "$tmp/unpacked" || fail "the download was damaged. Try again."
  [ -d "$tmp/unpacked/Carrel.app" ] || fail "the download was damaged. Try again."
  stop_running "$dest/Carrel.app/Contents/MacOS/"
  say "Installing to ${dest}…"
  rm -rf "$dest/Carrel.app"
  ditto "$tmp/unpacked/Carrel.app" "$dest/Carrel.app"
  xattr -cr "$dest/Carrel.app" 2>/dev/null || true
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$dest/Carrel.app" >/dev/null 2>&1 || true
  say ""
  say "✓ Carrel is in $dest. Open it from there, Launchpad or Spotlight any time."
  say "  Opening it now. The first time, macOS checks the new app, which can take a minute."
  say ""
  open "$dest/Carrel.app"
else
  share=$HOME/.local/share
  target=$share/carrel
  mkdir -p "$tmp/unpacked"
  tar -xzf "$tmp/$file" -C "$tmp/unpacked" || fail "the download was damaged. Try again."
  [ -x "$tmp/unpacked/electron" ] || fail "the download was damaged. Try again."
  stop_running "$target/electron"
  say "Installing to ${target}…"
  mkdir -p "$share"
  rm -rf "$target.new"
  mv "$tmp/unpacked" "$target.new"
  rm -rf "$target"
  mv "$target.new" "$target"
  mkdir -p "$HOME/.local/bin" "$share/applications"
  printf '#!/bin/sh\nexec "%s" "$@"\n' "$target/electron" >"$HOME/.local/bin/carrel"
  chmod 755 "$HOME/.local/bin/carrel"
  cat >"$share/applications/carrel.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Carrel
Comment=Read research papers with a purpose
Exec="$target/electron" %U
Icon=$target/resources/app/assets/icon.png
Categories=Education;Office;
Terminal=false
EOF
  say ""
  say "✓ Carrel is installed. Find it in your applications menu, or run: carrel"
  say ""
  nohup "$target/electron" >/dev/null 2>&1 &
fi
