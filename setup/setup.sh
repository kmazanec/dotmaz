#! /bin/zsh

set -e

# Run this from the dotmaz project root

echo "Setting up your machine!"

echo "Setting up key repeat preferences"

defaults write -g InitialKeyRepeat -int 12
defaults write -g KeyRepeat -int 1
defaults write -g ApplePressAndHoldEnabled -bool false

if command -v brew &> /dev/null; then
  echo "Homebrew already installed, updating"
  brew update
else
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
fi

echo "Installing fav brews..."

brew bundle --file=../Brewfile

echo "Installing oh my zsh"

zsh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Move the default .zshrc file that comes with oh-my-zsh in favor of the one in this repo
mv ~/.zshrc ~/.zshrc.default

# Enable dotglob option to include dotfiles
setopt dotglob

echo "Setting up .files"

for f in $PWD/dotfiles/.*; do
  if [[ -f $f ]]; then
    fname=$(basename $f)
    echo "Linking $fname"

    if [[ -f ~/$fname && ! -L ~/$fname ]]; then
      mv ~/$fname ~/$fname.local
    else
      ln -s $f ~/$fname
    fi
  fi
done

# Disable dotglob option
unsetopt dotglob

echo "Installing Git completion and helpers"

curl -o ~/.git-completion.bash https://raw.githubusercontent.com/git/git/master/contrib/completion/git-completion.bash
curl -o ~/.git-prompt.sh https://raw.githubusercontent.com/git/git/master/contrib/completion/git-prompt.sh

echo "Installing Vim plugin manager"

# Set up vim plugin manager
curl -fLo ~/.vim/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim

echo "Installing NVM, latest node, latest yarn"

# Install NVM
mkdir -p ~/.nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm install --lts

curl -o- -L https://yarnpkg.com/install.sh | bash

# Set up SSH and signed commits

# === Config ===
GIT_EMAIL=$(git config --global user.email)

if [ -z "$GIT_EMAIL" ]; then
  echo "❌ Error: No global Git email found. Set one with:"
  echo "   git config --global user.email 'you@example.com'"
  exit 1
fi

SSH_KEY="${HOME}/.ssh/id_ed25519"
SIGNERS_FILE="${HOME}/.config/git/allowed_signers"

echo ""
echo "🔧 Preparing SSH signing setup for:"
echo "Git email:       $GIT_EMAIL"
echo "SSH key:         $SSH_KEY"
echo "Allowed signers: $SIGNERS_FILE"
echo ""

# === Step 1: Generate SSH key if missing ===
if [ ! -f "${SSH_KEY}" ]; then
  echo "🔐 Generating new SSH key..."
  ssh-keygen -t ed25519 -C "${GIT_EMAIL}" -f "${SSH_KEY}" -N ""
else
  echo "✅ SSH key already exists at ${SSH_KEY}"
fi

# === Step 2: Ensure ~/.config/git exists ===
mkdir -p "$(dirname "$SIGNERS_FILE")"

# === Step 3: Add entry to allowed_signers if missing ===
PUB_KEY_CONTENT=$(cat "${SSH_KEY}.pub")
SIGNER_ENTRY="${GIT_EMAIL} ${PUB_KEY_CONTENT}"

if grep -Fxq "${SIGNER_ENTRY}" "${SIGNERS_FILE}" 2>/dev/null; then
  echo "✅ allowed_signers already contains key for ${GIT_EMAIL}"
else
  echo "✍️  Adding key to allowed_signers..."
  echo "${SIGNER_ENTRY}" >> "${SIGNERS_FILE}"
fi

chmod 644 "${SIGNERS_FILE}"

echo ""
echo "🎉 SSH signing support setup complete!"

echo ""
echo "Key repeat preferences may require a restart to take effect."
echo "Done!"
