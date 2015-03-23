
echo 'Setting up sublime settings assuming you are using Sublime Text 3'

ln -s /Applications/Sublime\ Text.app/Contents/SharedSupport/bin/subl /usr/local/bin/subl
ln -s $PWD/Preferences.sublime-settings $HOME/Library/Application\ Support/Sublime\ Text\ 3/Packages/User/Preferences.sublime-settings
ln -s $PWD/Default\ \(OSX\).sublime-keymap $HOME/Library/Application\ Support/Sublime\ Text\ 3/Packages/User/Default\ \(OSX\).sublime-keymap
ln -s $PWD/kmaz_snippets.sublime-snippet $HOME/Library/Application\ Support/Sublime\ Text\ 3/Packages/User/kmaz_snippets.sublime-snippet

echo 'Setting up the list of packages'
echo '  if you already a package list, it will be moved to `Package Control.sublime-settings.local`'
mv $HOME/Library/Application\ Support/Sublime\ Text\ 3/Packages/User/Package\ Control.sublime-settings{,.local}
ln -s $PWD/Package\ Control.sublime-settings $HOME/Library/Application\ Support/Sublime\ Text\ 3/Packages/User/Package\ Control.sublime-settings
