#!/bin/bash
# Double-click to play (macOS). Close this Terminal window to stop the server.
cd "$(dirname "$0")"
PORT=8080
( sleep 1.5; open "http://localhost:$PORT/" ) &
if command -v python3 >/dev/null 2>&1; then exec python3 -m http.server $PORT
elif command -v npx >/dev/null 2>&1; then exec npx --yes serve -l $PORT .
else echo "Install Python 3 (python.org) or Node.js (nodejs.org) and try again."; read -n1; fi
