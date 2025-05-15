#!/usr/bin/env zsh

set -e

CURSOR_SETTINGS_SOURCE="$HOME/Library/Application Support/Cursor/User/settings.json"
CURSOR_EXTENSIONS_SOURCE="$HOME/.cursor/extensions"
DOTFILES_SETTINGS_DEST="$PWD/dotfiles/cursor/settings.json"
DOTFILES_EXTENSIONS_LIST="$PWD/dotfiles/cursor/extensions.txt"

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

# Export list of extensions
if [ -d "$CURSOR_EXTENSIONS_SOURCE" ]; then
  echo "📋 Exporting list of Cursor extensions..."
  mkdir -p "$(dirname "$DOTFILES_EXTENSIONS_LIST")"
  
  # Backup existing extensions list if it exists
  if [ -f "$DOTFILES_EXTENSIONS_LIST" ]; then
    backup_path="$DOTFILES_EXTENSIONS_LIST.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Backing up existing extensions list to $backup_path"
    cp "$DOTFILES_EXTENSIONS_LIST" "$backup_path"
  fi
  
  # Get list of extension IDs from the extensions directory
  # Each extension directory is named like: publisher.name-version
  # We want to extract just the publisher.name part
  find "$CURSOR_EXTENSIONS_SOURCE" -maxdepth 1 -type d -not -path "$CURSOR_EXTENSIONS_SOURCE" | \
    while read -r ext_dir; do
      basename "$ext_dir" | sed -E 's/-[0-9]+\.[0-9]+\.[0-9]+$//'
    done | sort -u > "$DOTFILES_EXTENSIONS_LIST"
  
  echo "✅ Extensions list exported successfully!"
  echo "📝 Extensions list is at: $DOTFILES_EXTENSIONS_LIST"
fi 