#!/usr/bin/env zsh

set -e

echo "🚀 Setting up Cursor..."

# Check if Cursor is already installed
if [ -d "/Applications/Cursor.app" ]; then
  echo "✅ Cursor is already installed"
else
  echo "Installing Cursor..."
  # Download and install Cursor
  curl -L "https://download.cursor.sh/mac/Cursor.dmg" -o ~/Downloads/Cursor.dmg
  hdiutil attach ~/Downloads/Cursor.dmg
  cp -R "/Volumes/Cursor/Cursor.app" /Applications/
  hdiutil detach "/Volumes/Cursor"
  rm ~/Downloads/Cursor.dmg
fi

# Create Cursor settings directory if it doesn't exist
mkdir -p ~/Library/Application\ Support/Cursor/User

# Link settings file
if [ -f ~/Library/Application\ Support/Cursor/User/settings.json ]; then
  echo "✅ Cursor settings already exist"
else
  echo "Linking Cursor settings..."
  ln -s "$PWD/dotfiles/cursor/settings.json" ~/Library/Application\ Support/Cursor/User/settings.json
fi

# Link extensions.json if it exists
if [ -f "$PWD/dotfiles/cursor/extensions.json" ]; then
  if [ -f ~/Library/Application\ Support/Cursor/User/extensions.json ]; then
    echo "✅ Cursor extensions.json already exists"
  else
    echo "Linking Cursor extensions.json..."
    ln -s "$PWD/dotfiles/cursor/extensions.json" ~/Library/Application\ Support/Cursor/User/extensions.json
  fi
fi

# Set up extensions directory
if [ -d "$PWD/dotfiles/cursor/extensions" ]; then
  echo "Setting up Cursor extensions..."
  mkdir -p ~/.cursor/extensions
  
  # Copy extensions
  echo "Copying extensions..."
  cp -R "$PWD/dotfiles/cursor/extensions"/* ~/.cursor/extensions/
  echo "✅ Extensions copied successfully!"
fi

echo "✅ Cursor setup complete!"