#!/usr/bin/env zsh

set -e

CURSOR_SETTINGS_SOURCE="$HOME/Library/Application Support/Cursor/User/settings.json"
CURSOR_EXTENSIONS_SOURCE="$HOME/.cursor/extensions"
CURSOR_EXTENSIONS_JSON="$HOME/Library/Application Support/Cursor/User/extensions.json"
DOTFILES_SETTINGS_DEST="$PWD/dotfiles/cursor/settings.json"
DOTFILES_EXTENSIONS_DEST="$PWD/dotfiles/cursor/extensions"
DOTFILES_EXTENSIONS_JSON="$PWD/dotfiles/cursor/extensions.json"

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

# Export extensions.json if it exists
if [ -f "$CURSOR_EXTENSIONS_JSON" ]; then
  export_file "$CURSOR_EXTENSIONS_JSON" "$DOTFILES_EXTENSIONS_JSON" "extensions.json"
fi

# Export extensions directory
if [ -d "$CURSOR_EXTENSIONS_SOURCE" ]; then
  echo "📋 Exporting Cursor extensions directory..."
  mkdir -p "$DOTFILES_EXTENSIONS_DEST"
  
  # Backup existing extensions if they exist
  if [ -d "$DOTFILES_EXTENSIONS_DEST" ] && [ "$(ls -A "$DOTFILES_EXTENSIONS_DEST")" ]; then
    backup_path="$DOTFILES_EXTENSIONS_DEST.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Backing up existing extensions to $backup_path"
    mv "$DOTFILES_EXTENSIONS_DEST" "$backup_path"
    mkdir -p "$DOTFILES_EXTENSIONS_DEST"
  fi
  
  # Copy extensions
  cp -R "$CURSOR_EXTENSIONS_SOURCE"/* "$DOTFILES_EXTENSIONS_DEST"/
  echo "✅ Extensions exported successfully!"
  echo "📝 Extensions are at: $DOTFILES_EXTENSIONS_DEST"
fi 