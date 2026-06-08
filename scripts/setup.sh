#!/usr/bin/env bash
echo "=== ANPlayer Setup ==="

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${SCRIPT_DIR}"

# Detect platform
if [ -d "/data/data/com.termux" ] && [ -f "/data/data/com.termux/files/usr/bin/pkg" ]; then
  echo "Termux detected"

  # Playback happens in the browser, so mpv is NOT required.
  # yt-dlp needs python + ffmpeg for searching and downloading audio.
  pkg update -y || echo "WARNING: 'pkg update' had issues, continuing..."
  pkg install -y nodejs ffmpeg python yt-dlp curl || {
    echo "ERROR: failed to install Termux packages."
    echo "Try running manually: pkg install nodejs ffmpeg python yt-dlp curl"
    exit 1
  }

  # Make sure yt-dlp is available (the pkg version can lag behind YouTube changes)
  if ! command -v yt-dlp >/dev/null 2>&1; then
    echo "Installing yt-dlp via pip..."
    pip install -U yt-dlp || echo "WARNING: could not install yt-dlp via pip"
  fi

  echo ""
  echo "Tip: run 'termux-setup-storage' once if you want downloads saved to shared storage."
else
  echo "Linux detected"
  bash "${SCRIPT_DIR}/scripts/install.sh"
  exit $?
fi

echo ""
echo "Installing Node.js modules..."
npm install --no-audit --no-fund || {
  echo "ERROR: 'npm install' failed."
  exit 1
}

echo "Creating data directories..."
mkdir -p data/downloads

echo ""
echo "=== Setup Complete ==="
echo "Run 'npm start' to launch ANPlayer"
echo "Open http://localhost:3000 in your browser"
