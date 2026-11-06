@echo off
cd /d "%~dp0"
echo Starting Dirt Track Tour at http://localhost:8080  (close this window to stop)
start "" http://localhost:8080/
where py >nul 2>nul && (py -m http.server 8080 & goto :eof)
where python >nul 2>nul && (python -m http.server 8080 & goto :eof)
where npx >nul 2>nul && (npx --yes serve -l 8080 . & goto :eof)
echo.
echo Could not find Python or Node.js. Install Python from https://www.python.org/downloads/
echo (tick "Add python.exe to PATH") or Node.js from https://nodejs.org, then run this again.
pause
