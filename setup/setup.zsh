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
