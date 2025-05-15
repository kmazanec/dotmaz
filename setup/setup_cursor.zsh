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

# Link plugins file
if [ -f ~/Library/Application\ Support/Cursor/User/plugins.json ]; then
  echo "✅ Cursor plugins already exist"
else
  echo "Linking Cursor plugins..."
  ln -s "$PWD/dotfiles/cursor/plugins.json" ~/Library/Application\ Support/Cursor/User/plugins.json
fi

# Install plugins if plugins.json exists
if [ -f "$PWD/dotfiles/cursor/plugins.json" ]; then
  echo "Installing Cursor plugins..."
  # Read plugins from the JSON file and install them
  # Note: This assumes the plugins.json is in a format that can be parsed by jq
  # You might need to adjust this based on the actual format of your plugins.json
  if command -v jq &> /dev/null; then
    plugins=$(jq -r '.plugins[]' "$PWD/dotfiles/cursor/plugins.json" 2>/dev/null)
    if [ $? -eq 0 ]; then
      for plugin in $plugins; do
        echo "Installing plugin: $plugin"
        # Note: You'll need to replace this with the actual command to install plugins
        # This is a placeholder as the actual plugin installation command might vary
        cursor --install-extension "$plugin"
      done
    else
      echo "⚠️ Could not parse plugins.json, skipping plugin installation"
    fi
  else
    echo "⚠️ jq not found, skipping plugin installation"
  fi
fi

echo "✅ Cursor setup complete!"