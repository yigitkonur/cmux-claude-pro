#!/bin/bash
# cmux-claude-pro installer
# works on both local (cmux) and remote (SSH) machines
# on machines without cmux, the handler simply no-ops (exits 0 silently)
set -e

INSTALL_DIR="$HOME/.cc-cmux"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  cmux-claude-pro"
echo "  ==============="
echo ""

# Create install directory
mkdir -p "$INSTALL_DIR"

# Copy handler files
if [ -f "$SCRIPT_DIR/dist/handler.cjs" ]; then
  cp "$SCRIPT_DIR/dist/handler.cjs" "$INSTALL_DIR/handler.cjs"
  cp "$SCRIPT_DIR/dist/tab-title-worker.cjs" "$INSTALL_DIR/tab-title-worker.cjs"
  echo "  [ok] handler files copied to $INSTALL_DIR/"
else
  echo "  [!!] dist/handler.cjs not found. run 'npm run build' first."
  exit 1
fi

# Create default config if none exists
if [ ! -f "$INSTALL_DIR/config.json" ]; then
  cat > "$INSTALL_DIR/config.json" << 'CONF'
{
  "features": {
    "statusPills": true,
    "progress": true,
    "logs": true,
    "notifications": true,
    "tabTitles": false,
    "gitIntegration": true,
    "subagentTracking": true,
    "visibleAgentPanes": false
  },
  "notifications": {
    "onStop": true,
    "onError": true,
    "onPermission": true
  },
  "tabTitle": {
    "style": "directory"
  }
}
CONF
  echo "  [ok] default config created"
else
  echo "  [ok] existing config preserved"
fi

# Verify node is available
if ! command -v node &>/dev/null; then
  echo "  [!!] node not found. cmux-claude-pro requires Node.js 20+."
  exit 1
fi

NODE_VERSION=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "  [!!] Node.js v$NODE_VERSION detected, need 20+."
  exit 1
fi
echo "  [ok] node v$(node -e 'process.stdout.write(process.versions.node)')"

# Test the handler
echo '{}' | node "$INSTALL_DIR/handler.cjs" 2>/dev/null
if [ $? -eq 0 ]; then
  echo "  [ok] handler verified (clean exit)"
else
  echo "  [!!] handler test failed"
  exit 1
fi

# Check cmux
if [ -n "$CMUX_SOCKET_PATH" ] && [ -S "$CMUX_SOCKET_PATH" ]; then
  echo "  [ok] cmux detected — sidebar integration active"
else
  echo "  [--] cmux not detected — handler will no-op (safe for ssh/remote)"
fi

# Add hooks to settings.json
SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
  # Check if hooks already added
  if grep -q "cc-cmux:" "$SETTINGS" 2>/dev/null; then
    echo "  [ok] hooks already in settings.json"
  else
    echo ""
    echo "  next steps:"
    echo "  1. add hooks to $SETTINGS (see README.md)"
    echo "  2. restart claude code"
  fi
else
  echo ""
  echo "  next steps:"
  echo "  1. create $SETTINGS with hooks (see README.md)"
  echo "  2. restart claude code"
fi

echo ""
echo "  IMPORTANT: disable cmux's built-in claude code integration"
echo "  cmux Settings (Cmd+,) → Automation → Claude Code Integration → OFF"
echo ""
echo "  this avoids two systems fighting over the same status pill."
echo "  cmux-claude-pro takes over completely with richer features."
echo ""
echo "  installed:"
echo "    ~/.cc-cmux/handler.cjs          ($(wc -c < "$INSTALL_DIR/handler.cjs" | tr -d ' ') bytes)"
echo "    ~/.cc-cmux/tab-title-worker.cjs ($(wc -c < "$INSTALL_DIR/tab-title-worker.cjs" | tr -d ' ') bytes)"
echo "    ~/.cc-cmux/config.json"
echo ""
