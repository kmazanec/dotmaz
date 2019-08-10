#! /bin/bash

# Run this from the dotmaz project root

echo "Setting up yo machine!"

echo "Setting up key repeat preferences"

defaults write -g InitialKeyRepeat -int 12
defaults write -g KeyRepeat -int 1

if [[ -x "$(command -v brew)" ]]; then
  echo "Homebrew already installed, updating"
#  brew update
else
  echo "Installing Homebrew..."
  ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
fi

echo "Installing fav brews..."

#brew install macvim
# brew install python
#brew install chruby
#brew install ruby-install
# brew install mercurial
#brew install go
#brew install redis

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

echo "Installing Vim plugin manager"

# Set up vim plugin manager
curl -fLo ~/.vim/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim

# TODO: install postgres

echo "Installing NVM, latest node, latest yarn"

# Install NVM
mkdir ~/.nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm install --lts

curl -o- -L https://yarnpkg.com/install.sh | bash

# echo 'Loading dotmatrix'
# 
# pushd ..
# git clone https://github.com/hashrocket/dotmatrix.git
# cd dotmatrix
# 
# echo 'Running install script'
# bin/install
