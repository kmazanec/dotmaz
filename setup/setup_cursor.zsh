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

# Install extensions from list
if [ -f "$PWD/dotfiles/cursor/extensions.txt" ]; then
  echo "Installing Cursor extensions..."
  
  # Create extensions directory if it doesn't exist
  mkdir -p ~/.cursor/extensions
  
  # Read and install each extension
  while IFS= read -r extension_id; do
    if [ -n "$extension_id" ]; then
      echo "Installing extension: $extension_id"
      # Note: You'll need to replace this with the actual command to install extensions
      # This is a placeholder as the actual extension installation command might vary
      cursor --install-extension "$extension_id"
    fi
  done < "$PWD/dotfiles/cursor/extensions.txt"
  
  echo "✅ Extensions installation complete!"
fi

echo "✅ Cursor setup complete!"