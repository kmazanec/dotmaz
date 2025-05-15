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

# Link extensions file
if [ -f ~/Library/Application\ Support/Cursor/User/extensions.json ]; then
  echo "✅ Cursor extensions already exist"
else
  echo "Linking Cursor extensions..."
  ln -s "$PWD/dotfiles/cursor/extensions.json" ~/Library/Application\ Support/Cursor/User/extensions.json
fi

# Install extensions if extensions.json exists
if [ -f "$PWD/dotfiles/cursor/extensions.json" ]; then
  echo "Installing Cursor extensions..."
  # Read extensions from the JSON file and install them
  if command -v jq &> /dev/null; then
    extensions=$(jq -r '.extensions[]' "$PWD/dotfiles/cursor/extensions.json" 2>/dev/null)
    if [ $? -eq 0 ]; then
      for extension in $extensions; do
        echo "Installing extension: $extension"
        # Note: You'll need to replace this with the actual command to install extensions
        # This is a placeholder as the actual extension installation command might vary
        cursor --install-extension "$extension"
      done
    else
      echo "⚠️ Could not parse extensions.json, skipping extension installation"
    fi
  else
    echo "⚠️ jq not found, skipping extension installation"
  fi
fi

echo "✅ Cursor setup complete!"