#!/usr/bin/env bash
set -euo pipefail

echo "=== ANPlayer Linux Install ==="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required"
  echo "Install: https://nodejs.org or use your package manager"
  echo "  Ubuntu/Debian: sudo apt install nodejs npm"
  echo "  Fedora: sudo dnf install nodejs"
  echo "  Arch: sudo pacman -S nodejs npm"
  exit 1
fi

NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 16 ]; then
  echo "ERROR: Node.js 16+ required (found v$(node --version))"
  exit 1
fi
echo "Node.js: $(node --version)"

# Check/install yt-dlp
if ! command -v yt-dlp &>/dev/null; then
  echo "Installing yt-dlp..."
  if command -v pip3 &>/dev/null; then
    pip3 install yt-dlp --quiet --break-system-packages 2>/dev/null || pip3 install yt-dlp --quiet
  else
    echo "ERROR: pip3 not found. Install yt-dlp manually:"
    echo "  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp"
    echo "  sudo chmod +x /usr/local/bin/yt-dlp"
    exit 1
  fi
fi
echo "yt-dlp: $(yt-dlp --version 2>/dev/null || echo 'installed')"

# Playback now happens in the browser (<audio>), so mpv is no longer required.

# Check/install ffmpeg (needed by yt-dlp for audio conversion)
if ! command -v ffmpeg &>/dev/null; then
  echo "Installing ffmpeg..."
  if command -v apt &>/dev/null; then
    sudo apt install -y ffmpeg
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y ffmpeg
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm ffmpeg
  elif command -v brew &>/dev/null; then
    brew install ffmpeg
  else
    echo "WARNING: ffmpeg not installed. Audio downloads may fail."
  fi
fi
echo "ffmpeg: $(ffmpeg -version 2>/dev/null | head -1 || echo 'not found')"

# Install npm deps
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo ""
echo "Installing Node.js dependencies..."
cd "${SCRIPT_DIR}"
npm install --no-audit --no-fund

echo ""
echo "=== Install Complete ==="
echo ""
echo "Start the app:"
echo "  npm start"
echo ""
echo "Open in browser:"
echo "  http://localhost:3000"
echo ""
