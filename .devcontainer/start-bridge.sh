#!/bin/bash
BRIDGE_FILE="/workspaces/Wigglers_Room/bridge3.js"
BRIDGE_CMD="nohup node $BRIDGE_FILE > /tmp/bridge.log 2>&1 &"

# Inject into .bashrc if not already there
if ! grep -q "bridge3.js" ~/.bashrc 2>/dev/null; then
    echo "# Auto-start bridge3.js" >> ~/.bashrc
    echo "$BRIDGE_CMD" >> ~/.bashrc
    echo "[bridge] Added to .bashrc"
fi

# Also fire immediately if not already running
if ! pgrep -f "bridge3.js" > /dev/null 2>&1; then
    if [ -n "$BRIDGE_TOKEN" ] && [ -f "$BRIDGE_FILE" ]; then
        nohup node "$BRIDGE_FILE" > /tmp/bridge.log 2>&1 &
        echo "[bridge] Started with PID $!"
    else
        echo "[bridge] BRIDGE_TOKEN not set — skipping immediate start"
    fi
else
    echo "[bridge] Already running (PID $(pgrep -f bridge3.js))"
fi
