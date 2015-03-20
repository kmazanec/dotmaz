#! /bin/bash

echo 'Setting up yo machine!'

echo 'Installing Homebrew...'

ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"


echo 'Setting up .files'

ln -s $PWD/.bash_profile ~/.bash_profile

echo 'Setting up keyboard preferences'

defaults write -g InitialKeyRepeat -int 14
defaults write -g KeyRepeat -int 1
