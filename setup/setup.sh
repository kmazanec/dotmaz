#! /bin/sh

# Run this from the dotmaz project root

echo "Setting up your machine!"

echo "Setting up key repeat preferences"

defaults write -g InitialKeyRepeat -int 12
defaults write -g KeyRepeat -int 1

if [[ -x "$(command -v brew)" ]]; then
  echo "Homebrew already installed, updating"
  brew update
else
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
fi

echo "Installing fav brews..."

brew install chruby
brew install go
brew install macvim
brew install postgresql
brew install python
brew install redis
brew install ruby-install
brew install the_silver_searcher
brew install inetutils

echo "Installing oh my zsh"

sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Move the default .zshrc file that comes with oh-my-zsh in favor of the one in this repo
mv ~/.zshrc ~/.zshrc.default

echo "Setting up .files"

for f in $PWD/dotfiles/.*
do
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

echo "Installing Git completion and helpers"

curl -o ~/.git-completion.bash https://raw.githubusercontent.com/git/git/master/contrib/completion/git-completion.bash
curl -o ~/.git-prompt.sh https://raw.githubusercontent.com/git/git/master/contrib/completion/git-prompt.sh

echo "Installing Vim plugin manager"

# Set up vim plugin manager
curl -fLo ~/.vim/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim

# TODO: install postgres

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
