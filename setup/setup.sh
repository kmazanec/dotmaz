#! /bin/bash

echo 'Setting up yo machine!'

echo 'Installing Homebrew...'

ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

echo 'Installing fav brews...'

brew install macvim
brew install python


echo 'Setting up .files'

ln -s $PWD/.bash_profile ~/.bash_profile
mv ~/.gitconfig ~/.gitconfig.local
ln -s $PWD/.gitconfig ~/.gitconfig

ln -s $PWD/.vimbundle.local ~/.vimbundle.local
ln -s $PWD/.vimrc.local ~/.vimrc.local
ln -s $PWD/.psqlrc ~/.psqlrc


echo 'Loading dotmatrix'

pushd ..
git clone https://github.com/hashrocket/dotmatrix.git
cd dotmatrix

echo 'Running install script'
bin/install

echo 'Installing vimbundles'
bin/vimbundles.sh
popd


echo 'Setting up pathogen'

mkdir ~/.vim/autoload
curl -LSso ~/.vim/autoload/pathogen.vim https://tpo.pe/pathogen.vim


echo 'Setting up keyboard preferences'

defaults write -g InitialKeyRepeat -int 15
defaults write -g KeyRepeat -int 1
