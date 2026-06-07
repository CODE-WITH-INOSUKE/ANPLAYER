#!/data/data/com.termux/files/usr/bin/bash
echo "=== ANPlayer Setup ==="
echo "Installing dependencies..."
pkg update -y
pkg install -y nodejs sqlite ffmpeg yt-dlp mpv curl python

echo "Installing Node.js modules..."
npm install

echo "Creating database..."
node -e "require('./db').init()"

echo "Creating download directory..."
mkdir -p data/downloads

echo ""
echo "=== Setup Complete ==="
echo "Run 'npm start' to launch ANPlayer"
echo "Open http://localhost:3000 in your browser"
