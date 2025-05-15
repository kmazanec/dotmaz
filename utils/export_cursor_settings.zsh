#!/usr/bin/env zsh

set -e

CURSOR_SETTINGS_SOURCE="$HOME/Library/Application Support/Cursor/User/settings.json"
CURSOR_PLUGINS_SOURCE="$HOME/Library/Application Support/Cursor/User/plugins.json"
DOTFILES_SETTINGS_DEST="$PWD/dotfiles/cursor/settings.json"
DOTFILES_PLUGINS_DEST="$PWD/dotfiles/cursor/plugins.json"

# Function to handle file export
export_file() {
  local source=$1
  local dest=$2
  local file_type=$3

  if [ ! -f "$source" ]; then
    echo "❌ No Cursor $file_type found at $source"
    return 1
  fi

  # Create the cursor directory if it doesn't exist
  mkdir -p "$(dirname "$dest")"

  # Backup existing file if it exists
  if [ -f "$dest" ]; then
    backup_path="$dest.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Backing up existing $file_type to $backup_path"
    cp "$dest" "$backup_path"
  fi

  # Copy the file
  echo "📋 Exporting Cursor $file_type to dotfiles..."
  cp "$source" "$dest"
  echo "✅ $file_type exported successfully!"
  echo "📝 New $file_type are at: $dest"
  if [ -f "$backup_path" ]; then
    echo "📦 Old $file_type backed up to: $backup_path"
  fi
}

# Export settings
export_file "$CURSOR_SETTINGS_SOURCE" "$DOTFILES_SETTINGS_DEST" "settings"

# Export plugins
export_file "$CURSOR_PLUGINS_SOURCE" "$DOTFILES_PLUGINS_DEST" "plugins" 