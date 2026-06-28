#!/bin/bash
# SessionStart hook: configure the Claude Code on the web environment.
#
# The remote container ships with Node and pnpm, but not `just`, which every
# project recipe (build/test/lint) depends on. This hook installs `just` and
# then runs `just setup` so tests and linters work in web sessions.
set -euo pipefail

# Only configure the remote (Claude Code on the web) environment. Local runs
# already have whatever the developer installed.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

JUST_VERSION="1.42.4"          # pinned for reproducible cold builds
INSTALL_DIR="$HOME/.local/bin"

# Tools the base image is expected to provide. Fail loudly if ever absent so the
# breakage is obvious rather than surfacing as a confusing downstream error.
command -v node >/dev/null 2>&1 || { echo "session-start: node not found in environment" >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "session-start: pnpm not found in environment" >&2; exit 1; }

# Install `just` (the only missing build tool), idempotently. just.systems is
# blocked by the network policy, so source the installer from GitHub raw; the
# release binary itself is fetched from GitHub releases (allowed).
if ! command -v just >/dev/null 2>&1 && [ ! -x "$INSTALL_DIR/just" ]; then
  mkdir -p "$INSTALL_DIR"
  curl --proto '=https' --tlsv1.2 -sSf \
    "https://raw.githubusercontent.com/casey/just/master/www/install.sh" \
    | bash -s -- --tag "$JUST_VERSION" --to "$INSTALL_DIR"
fi

# Put just on PATH for this script and persist it for the rest of the session.
export PATH="$INSTALL_DIR:$PATH"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# Install project dependencies via the existing recipe.
just setup
