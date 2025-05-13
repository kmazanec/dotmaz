#!/usr/bin/env zsh

set -e

echo "🛠 Installing prerequisites..."
if ! command -v go >/dev/null 2>&1; then
  echo "❌ Go is not installed. Aborting."
  exit 1
fi

# Install location
INSTALL_DIR="$HOME/.mcp"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "⬇️ Cloning GitHub MCP Server..."
if [[ ! -d github-mcp-server ]]; then
  git clone https://github.com/github/github-mcp-server.git
fi
cd github-mcp-server
go build ./cmd/github-mcp-server
cat > .env <<EOF
# GitHub MCP Server environment variables
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_personal_access_token
EOF
cd ..

echo "✅ GitHub MCP Server built and .env created."

echo "⬇️ Cloning Jira MCP Server..."
if [[ ! -d jira-mcp ]]; then
  git clone https://github.com/nguyenvanduocit/jira-mcp.git
fi
cd jira-mcp
go build -o jira-mcp
cat > .env <<EOF
# Jira MCP Server environment variables
ATLASSIAN_HOST=https://your-domain.atlassian.net
ATLASSIAN_EMAIL=your_email@example.com
ATLASSIAN_TOKEN=your_jira_api_token
EOF
cd ..

echo ""
echo "✅ Jira MCP Server built and .env created."

# Summary
echo ""
echo "📦 MCP servers installed in ~/.mcp"
echo "📄 Env files:"
echo "  ~/.mcp/github-mcp-server/.env"
echo "  ~/.mcp/jira-mcp/.env"
echo ""
echo "⚙️ Run them with:"
echo "  cd ~/.mcp/github-mcp-server && source .env && ./github-mcp"
echo "  cd ~/.mcp/jira-mcp && source .env && ./jira-mcp"
echo ""
echo "🎯 Add them to Cursor under Settings > Features > MCP (transport: stdio)"
