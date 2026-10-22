#!/bin/sh
# Installs lore from its GitHub releases:
#   curl -fsSL https://apisandipas.github.io/lore/install.sh | sh
# LORE_VERSION picks a release (v0.1.0-alpha.4; default: the newest, prereleases
# included). LORE_INSTALL_DIR picks where it goes (default: ~/.local/bin).
set -eu

repo=apisandipas/lore
dir=${LORE_INSTALL_DIR:-$HOME/.local/bin}

fail() { echo "install.sh: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "needs $1"; }
need curl
need tar

case $(uname -s) in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) fail "no build for $(uname -s); on Windows, download lore-windows-x64.zip from https://github.com/$repo/releases" ;;
esac
case $(uname -m) in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) fail "no build for $(uname -m)" ;;
esac

version=${LORE_VERSION:-}
if [ -z "$version" ]; then
  # /releases/latest skips prereleases, and every lore release so far is one.
  version=$(curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=1" |
    sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
  [ -n "$version" ] || fail "could not find the newest release"
fi

asset=lore-$os-$arch.tar.gz
url=https://github.com/$repo/releases/download/$version
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading lore $version for $os-$arch"
curl -fsSL "$url/$asset" -o "$tmp/$asset" || fail "no $asset in release $version"
curl -fsSL "$url/SHA256SUMS" -o "$tmp/SHA256SUMS" || fail "no SHA256SUMS in release $version"

expected=$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$asset" | cut -d' ' -f1)
else
  actual=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)
fi
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "checksum mismatch for $asset"

tar -xzf "$tmp/$asset" -C "$tmp"
mkdir -p "$dir"
mv "$tmp/lore" "$dir/lore"
chmod +x "$dir/lore"
echo "Installed $dir/lore ($("$dir/lore" --version))"

case :$PATH: in
  *:"$dir":*) ;;
  *) echo "Add $dir to your PATH to run lore." ;;
esac
command -v rg >/dev/null 2>&1 ||
  echo "lore also needs ripgrep (rg): brew install ripgrep, apt install ripgrep, or see https://github.com/BurntSushi/ripgrep#installation"
