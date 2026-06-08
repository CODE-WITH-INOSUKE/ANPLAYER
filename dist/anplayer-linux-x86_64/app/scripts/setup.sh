#!/usr/bin/env bash
echo "=== ANPlayer Setup ==="

# Detect platform
if [ -d "/data/data/com.termux" ] && [ -f "/data/data/com.termux/files/usr/bin/pkg" ]; then
  echo "Termux detected"
  pkg update -y
  pkg install -y nodejs ffmpeg yt-dlp mpv curl python
else
  echo "Linux detected"
  bash "$(dirname "$0")/install.sh"
  exit 0
fi

echo "Installing Node.js modules..."
npm install

echo "Creating database..."
mkdir -p data/downloads
mkdir -p data

echo ""
echo "=== Setup Complete ==="
echo "Run 'npm start' to launch ANPlayer"
echo "Open http://localhost:3000 in your browser"
