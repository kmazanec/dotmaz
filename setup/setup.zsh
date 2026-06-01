#!/usr/bin/env zsh

set -e

# Run this from the dotmaz project root

echo "Setting up your machine!"

echo "Setting up key repeat preferences"

defaults write -g InitialKeyRepeat -int 12
defaults write -g KeyRepeat -int 1
defaults write -g ApplePressAndHoldEnabled -bool false

if command -v brew &> /dev/null || [ -f "/opt/homebrew/bin/brew" ]; then
  echo "Homebrew already installed, updating"
  if ! command -v brew &> /dev/null && [ -f "/opt/homebrew/bin/brew" ]; then
    echo "Homebrew is installed but not in PATH, adding it..."
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  brew update
else
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
fi

echo "Installing fav brews..."

brew bundle --file=./Brewfile

echo "Installing oh my zsh"

if [ -d "${HOME}/.oh-my-zsh" ]; then
  echo "oh-my-zsh is already installed"
else
  echo "Installing oh-my-zsh..."
  zsh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

# Only move the default .zshrc if it exists and isn't already moved
if [ -f ~/.zshrc ] && [ ! -f ~/.zshrc.default ]; then
  mv ~/.zshrc ~/.zshrc.default
fi

# Enable dotglob option to include dotfiles
setopt dotglob

echo "Setting up .files"

for f in $PWD/dotfiles/.*; do
  if [[ -f $f ]]; then
    fname=$(basename $f)
    
    # Check if symbolic link already exists
    if [[ -L ~/$fname ]]; then
      echo "✅ $fname is already linked"
    else
      echo "Linking $fname"
      # If regular file exists, back it up before linking
      if [[ -f ~/$fname ]]; then
        mv ~/$fname ~/$fname.local
      fi
      ln -s $f ~/$fname
    fi
  fi
done

# Disable dotglob option
unsetopt dotglob

echo "Linking Claude Code agents and skills"

# Symlink every agent (flat <name>.md) and skill (a directory containing SKILL.md)
# into ~/.claude/ so Claude Code discovers them. Idempotent: skips anything already linked.
mkdir -p ~/.claude/agents ~/.claude/skills

for f in $PWD/agents/*.md; do
  [[ -e $f ]] || continue
  name=$(basename $f)
  if [[ -L ~/.claude/agents/$name ]]; then
    echo "✅ agent $name is already linked"
  else
    echo "Linking agent $name"
    ln -s $f ~/.claude/agents/$name
  fi
done

for d in $PWD/skills/*; do
  [[ -d $d ]] || continue
  name=$(basename $d)
  if [[ -L ~/.claude/skills/$name ]]; then
    echo "✅ skill $name is already linked"
  else
    echo "Linking skill $name"
    ln -s $d ~/.claude/skills/$name
  fi
done

echo "Setting up Codex plugin"

# Codex discovers this repo through the personal plugin marketplace. The repo
# stays the source of truth; ~/plugins/dotmaz is only a stable local plugin path.
mkdir -p ~/plugins ~/.agents/plugins

if [[ -L ~/plugins/dotmaz ]]; then
  current_target="$(readlink ~/plugins/dotmaz)"
  if [[ "$current_target" == "$PWD" ]]; then
    echo "✅ Codex plugin path is already linked"
  else
    echo "⚠️ ~/plugins/dotmaz points to $current_target; leaving it unchanged"
  fi
elif [[ -e ~/plugins/dotmaz ]]; then
  echo "⚠️ ~/plugins/dotmaz already exists and is not a symlink; leaving it unchanged"
else
  echo "Linking Codex plugin path"
  ln -s "$PWD" ~/plugins/dotmaz
fi

if [[ ! -f ~/.agents/plugins/marketplace.json ]]; then
  cat > ~/.agents/plugins/marketplace.json <<'JSON'
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": []
}
JSON
fi

python3 - <<'PY'
import json
from pathlib import Path

path = Path.home() / ".agents" / "plugins" / "marketplace.json"
payload = json.loads(path.read_text())
plugins = payload.setdefault("plugins", [])
entry = {
    "name": "dotmaz",
    "source": {
        "source": "local",
        "path": "./plugins/dotmaz",
    },
    "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL",
    },
    "category": "Developer Tools",
}

for index, plugin in enumerate(plugins):
    if isinstance(plugin, dict) and plugin.get("name") == "dotmaz":
        plugins[index] = entry
        break
else:
    plugins.append(entry)

path.write_text(json.dumps(payload, indent=2) + "\n")
PY

if command -v codex &> /dev/null; then
  codex features enable child_agents_md || true
  codex plugin add dotmaz@personal || true
else
  echo "Codex is not installed; skipping Codex plugin install"
fi

echo "Installing Git completion and helpers"

if [ ! -f ~/.git-completion.bash ]; then
  echo "Downloading git-completion.bash..."
  curl -o ~/.git-completion.bash https://raw.githubusercontent.com/git/git/master/contrib/completion/git-completion.bash
else
  echo "✅ git-completion.bash already exists"
fi

if [ ! -f ~/.git-prompt.sh ]; then
  echo "Downloading git-prompt.sh..."
  curl -o ~/.git-prompt.sh https://raw.githubusercontent.com/git/git/master/contrib/completion/git-prompt.sh
else
  echo "✅ git-prompt.sh already exists"
fi

echo "Installing Vim plugin manager"

if [ ! -f ~/.vim/autoload/plug.vim ]; then
  echo "Installing Vim plugin manager..."
  curl -fLo ~/.vim/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
else
  echo "✅ Vim plugin manager already installed"
fi

echo "Installing NVM, latest node, latest yarn"

# Install NVM
if [ ! -d "$HOME/.nvm" ]; then
  echo "Installing NVM..."
  mkdir -p ~/.nvm
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
else
  echo "✅ NVM already installed"
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

if ! command -v node &> /dev/null; then
  echo "Installing Node LTS..."
  nvm install --lts
else
  echo "✅ Node already installed"
fi

if ! command -v yarn &> /dev/null; then
  echo "Installing Yarn..."
  curl -o- -L https://yarnpkg.com/install.sh | bash
else
  echo "✅ Yarn already installed"
fi

SCRIPT_DIR="$(dirname "$0")"

echo "🚀 Running SSH and Signed Commit setup..."
zsh "${SCRIPT_DIR}/setup_ssh.zsh"
echo "✅ SSH setup complete."

echo "🚀 Running MCP server setup..."
zsh "${SCRIPT_DIR}/install_mcp_servers.zsh"
echo "✅ MCP setup complete."

echo "🚀 Running Cursor setup..."
zsh "${SCRIPT_DIR}/setup_cursor.zsh"
echo "✅ Cursor setup complete."

echo ""
echo "Key repeat preferences may require a restart to take effect."
echo "✅ Done!"
