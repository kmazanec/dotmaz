#! /bin/zsh

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

echo "Remember to set up your .ssh config"
echo "Key repeat preferences may require a restart to take effect."
echo "Done! You may also want to run the bd.sh setup script"
