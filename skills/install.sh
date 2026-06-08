#!/usr/bin/env bash
#
# install-skill.sh
#
# Install the gant-atlas-generate skill into Claude Code's skill directory.
# Creates a symlink so changes to the source are immediately reflected.
#
# Usage:
#   ./install.sh          # install to ~/.claude/skills/gant-atlas-generate
#   ./install.sh --check  # verify installation status
#   ./install.sh --uninstall  # remove the symlink
#
# After installation, run `/gant-atlas-generate` in Claude Code.

set -euo pipefail

SKILL_NAME="gant-atlas-generate"
SKILL_SRC="$(cd "$(dirname "$0")" && pwd)/generate-docs"
SKILL_DST="$HOME/.claude/skills/$SKILL_NAME"

# Resolve the plugin root (one level up from this script's parent)
PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- Functions ---

info()  { echo -e "\033[34m[info]\033[0m  $*"; }
ok()    { echo -e "\033[32m[ok]\033[0m    $*"; }
warn()  { echo -e "\033[33m[warn]\033[0m  $*"; }
error() { echo -e "\033[31m[error]\033[0m $*" >&2; exit 1; }

check_prerequisites() {
  # Check skill source exists
  if [ ! -d "$SKILL_SRC" ]; then
    error "Skill source not found at $SKILL_SRC"
  fi
  if [ ! -f "$SKILL_SRC/SKILL.md" ]; then
    error "SKILL.md not found at $SKILL_SRC/SKILL.md"
  fi

  # Check compiled dist exists
  if [ ! -f "$PLUGIN_ROOT/dist/code-scanner.js" ]; then
    warn "Compiled dist not found. Run 'pnpm run build' first."
  fi

  # Check node >= 22
  if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 22 ]; then
      error "Node.js >= 22 required, found $(node -v)"
    fi
  else
    error "Node.js not found. Install Node.js >= 22."
  fi

  # Create ~/.claude/skills if it doesn't exist
  mkdir -p "$HOME/.claude/skills"
}

do_install() {
  check_prerequisites

  if [ -L "$SKILL_DST" ]; then
    local current_target
    current_target=$(readlink -f "$SKILL_DST")
    if [ "$current_target" = "$(readlink -f "$SKILL_SRC")" ]; then
      ok "Already installed: $SKILL_DST -> $current_target"
      return 0
    else
      warn "Symlink exists but points to $current_target"
      warn "Updating to $SKILL_SRC"
      rm "$SKILL_DST"
    fi
  elif [ -d "$SKILL_DST" ]; then
    warn "Directory exists at $SKILL_DST (not a symlink)"
    warn "Backing up to ${SKILL_DST}.bak"
    mv "$SKILL_DST" "${SKILL_DST}.bak"
  fi

  ln -s "$SKILL_SRC" "$SKILL_DST"
  ok "Installed: $SKILL_DST -> $SKILL_SRC"
  echo ""
  info "Usage:"
  echo "  In Claude Code, type: /gant-atlas-generate <project-id>"
  echo "  Options: --module <module> --page <pageId> --full"
  echo ""
  info "Project config: ~/.gant-atlas/projects.json"
  echo '  Example: {"projects": [{"id": "demo", "docsPath": "/path/to/feature-docs", "codeDir": "/path/to/src", "routesFile": "/path/to/maps.ts"}]}'
}

do_check() {
  echo "Skill: $SKILL_NAME"
  echo "Source: $SKILL_SRC"

  if [ -L "$SKILL_DST" ]; then
    local target
    target=$(readlink -f "$SKILL_DST")
    ok "Installed: $SKILL_DST -> $target"

    if [ "$target" != "$(readlink -f "$SKILL_SRC")" ]; then
      warn "Target mismatch! Expected $(readlink -f "$SKILL_SRC")"
    fi
  elif [ -d "$SKILL_DST" ]; then
    warn "Directory exists (not a symlink): $SKILL_DST"
  else
    error "Not installed. Run: $0"
  fi

  echo ""
  echo "Plugin root: $PLUGIN_ROOT"
  if [ -f "$PLUGIN_ROOT/dist/code-scanner.js" ]; then
    ok "Compiled dist exists"
  else
    warn "Compiled dist missing. Run: cd $PLUGIN_ROOT && pnpm run build"
  fi

  echo ""
  echo "Project config: ~/.gant-atlas/projects.json"
  if [ -f "$HOME/.gant-atlas/projects.json" ]; then
    ok "Config exists"
    cat "$HOME/.gant-atlas/projects.json"
  else
    warn "Config not found. Create it with project settings."
  fi
}

do_uninstall() {
  if [ -L "$SKILL_DST" ]; then
    rm "$SKILL_DST"
    ok "Removed: $SKILL_DST"
  elif [ -d "$SKILL_DST" ]; then
    warn "Not a symlink, skipping. Remove manually: rm -rf $SKILL_DST"
  else
    ok "Not installed (nothing to remove)"
  fi
}

# --- Main ---

case "${1:-}" in
  --check|-c)
    do_check
    ;;
  --uninstall|-u)
    do_uninstall
    ;;
  --help|-h)
    echo "Usage: $0 [--check|--uninstall|--help]"
    echo ""
    echo "Install gant-atlas-generate skill into Claude Code."
    echo ""
    echo "Options:"
    echo "  (default)     Install the skill"
    echo "  --check, -c   Check installation status"
    echo "  --uninstall   Remove the installed skill"
    echo "  --help, -h    Show this help"
    ;;
  *)
    do_install
    ;;
esac
