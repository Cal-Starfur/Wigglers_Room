#!/bin/bash
# Auto-start bridge3.js in background
if [ -n "$BRIDGE_TOKEN" ] && [ -f "$HOME/bridge3.js" ]; then
    echo "[bridge] Starting bridge3.js..."
    nohup node ~/bridge3.js > /tmp/bridge.log 2>&1 &
    echo "[bridge] Started with PID $!"
else
    echo "[bridge] BRIDGE_TOKEN not set or bridge3.js not found — skipping"
fi
