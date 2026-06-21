#!/bin/bash
# Auto-start bridge3.js in background
BRIDGE_FILE="/workspaces/Wigglers_Room/bridge3.js"
if [ -n "$BRIDGE_TOKEN" ] && [ -f "$BRIDGE_FILE" ]; then
    echo "[bridge] Starting bridge3.js..."
    nohup node "$BRIDGE_FILE" > /tmp/bridge.log 2>&1 &
    echo "[bridge] Started with PID $!"
else
    echo "[bridge] BRIDGE_TOKEN not set or bridge3.js not found at $BRIDGE_FILE"
fi
