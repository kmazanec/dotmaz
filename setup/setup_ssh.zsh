#!/usr/bin/env zsh

set -e

# Set up SSH and signed commits

# === Config ===
GIT_EMAIL=$(git config --global user.email)

if [ -z "$GIT_EMAIL" ]; then
  echo "❌ Error: No global Git email found. Set one with:"
  echo "   git config --global user.email 'you@example.com'"
  exit 1
fi

SSH_KEY="${HOME}/.ssh/id_ed25519"
SIGNERS_FILE="${HOME}/.config/git/allowed_signers"

echo ""
echo "🔧 Preparing SSH signing setup for:"
echo "Git email:       $GIT_EMAIL"
echo "SSH key:         $SSH_KEY"
echo "Allowed signers: $SIGNERS_FILE"
echo ""

# === Step 1: Generate SSH key if missing ===
if [ ! -f "${SSH_KEY}" ]; then
  echo "🔐 Generating new SSH key..."
  ssh-keygen -t ed25519 -C "${GIT_EMAIL}" -f "${SSH_KEY}" -N ""
  echo "🔑 Adding key to SSH keychain..."
  ssh-add "${SSH_KEY}"
else
  echo "✅ SSH key already exists at ${SSH_KEY}"
fi

# === Step 2: Ensure ~/.config/git exists ===
mkdir -p "$(dirname "$SIGNERS_FILE")"

# === Step 3: Add entry to allowed_signers if missing ===
PUB_KEY_CONTENT=$(cat "${SSH_KEY}.pub")
SIGNER_ENTRY="${GIT_EMAIL} ${PUB_KEY_CONTENT}"

if grep -Fxq "${SIGNER_ENTRY}" "${SIGNERS_FILE}" 2>/dev/null; then
  echo "✅ allowed_signers already contains key for ${GIT_EMAIL}"
else
  echo "✍️  Adding key to allowed_signers..."
  echo "${SIGNER_ENTRY}" >> "${SIGNERS_FILE}"
fi

chmod 644 "${SIGNERS_FILE}"

echo ""
echo "🎉 SSH signing support setup complete!"
