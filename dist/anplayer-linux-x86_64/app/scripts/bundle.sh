#!/usr/bin/env bash
set -euo pipefail

NAME="anplayer"
VERSION="1.0.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${ROOT}/dist"
BUNDLE="${DIST}/${NAME}-linux-$(uname -m)"
ARCHIVE="${DIST}/${NAME}-linux-$(uname -m).tar.gz"

echo "=== Building ${NAME} v${VERSION} for Linux ==="
echo "Output: ${BUNDLE}"
echo ""

rm -rf "${BUNDLE}" "${ARCHIVE}"
mkdir -p "${BUNDLE}/bin"
mkdir -p "${BUNDLE}/data"
mkdir -p "${BUNDLE}/downloads"

# ---- 1. Bundle yt-dlp ----
echo "[1/4] Bundling yt-dlp..."
YTDLP_URL=""
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64)  YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" ;;
  aarch64) YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64" ;;
  armv7l)  YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_armv7l" ;;
  *)
    echo "Unsupported arch: ${ARCH}"
    echo "Falling back to pip-based yt-dlp..."
    ;;
esac

if [ -n "${YTDLP_URL}" ]; then
  echo "  Downloading yt-dlp for ${ARCH}..."
  curl -sL "${YTDLP_URL}" -o "${BUNDLE}/bin/yt-dlp"
  chmod +x "${BUNDLE}/bin/yt-dlp"
else
  # Install via pip as fallback
  pip3 install yt-dlp -t "${BUNDLE}/bin/yt-dlp-pkg" --quiet
  cat > "${BUNDLE}/bin/yt-dlp" << 'PYEOF'
#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'yt-dlp-pkg'))
from yt_dlp import main
main()
PYEOF
  chmod +x "${BUNDLE}/bin/yt-dlp"
fi

# Verify
"${BUNDLE}/bin/yt-dlp" --version 2>/dev/null || {
  echo "  WARNING: yt-dlp not working, trying pip install..."
  pip3 install yt-dlp --quiet --break-system-packages 2>/dev/null || true
}

# ---- 2. Bundle mpv ----
echo "[2/4] Bundling mpv..."
# Try to find a static mpv build
MPV_BIN=""
if command -v mpv &>/dev/null; then
  MPV_BIN="$(command -v mpv)"
  echo "  Using system mpv at ${MPV_BIN}"
  cp "${MPV_BIN}" "${BUNDLE}/bin/mpv"
elif [ -f "/usr/bin/mpv" ]; then
  echo "  Using system mpv"
  cp /usr/bin/mpv "${BUNDLE}/bin/mpv"
else
  echo "  Downloading static mpv build..."
  # Use AppImage or static build from GitHub
  case "${ARCH}" in
    x86_64)
      # Try to get a static mpv binary
      curl -sL "https://github.com/leonardocabeza/static-mpv/releases/download/v0.38.0/mpv-linux-x86_64" -o "${BUNDLE}/bin/mpv" 2>/dev/null ||
      # Fallback: download mpv AppImage
      curl -sL "https://github.com/mpv-player/mpv/releases/download/v0.38.0/mpv-x86_64.AppImage" -o "${BUNDLE}/bin/mpv" 2>/dev/null || {
        echo "  WARNING: Could not download static mpv, will use system mpv if available"
        if command -v mpv &>/dev/null; then
          cp "$(command -v mpv)" "${BUNDLE}/bin/mpv"
        else
          echo "  ERROR: mpv is required. Install it: sudo apt install mpv"
          exit 1
        fi
      }
      ;;
    *)
      echo "  No static mpv for ${ARCH}, checking system..."
      if command -v mpv &>/dev/null; then
        cp "$(command -v mpv)" "${BUNDLE}/bin/mpv"
      else
        echo "  ERROR: mpv is required. Install it: sudo apt install mpv"
        exit 1
      fi
      ;;
  esac
fi

if [ -f "${BUNDLE}/bin/mpv" ]; then
  chmod +x "${BUNDLE}/bin/mpv"

  # Bundle needed libraries for mpv if it's dynamic
  if ldd "${BUNDLE}/bin/mpv" 2>/dev/null | grep -q '=> not found'; then
    echo "  Missing libraries detected, checking system install..."
    # Just ensure mpv is installed system-wide
    if ! command -v mpv &>/dev/null; then
      echo "  WARNING: mpv binary has missing libraries. Recommend installing mpv via package manager."
    fi
  elif ldd "${BUNDLE}/bin/mpv" 2>/dev/null | grep -q 'not a dynamic'; then
    echo "  Static binary - good!"
  else
    echo "  Dynamic binary - system libraries required"
  fi
fi

echo "  mpv version: $("${BUNDLE}/bin/mpv" --version 2>/dev/null | head -1 || echo 'unknown')"

# ---- 3. Copy application files ----
echo "[3/4] Copying application files..."
mkdir -p "${BUNDLE}/app"

# Core files
cp "${ROOT}/package.json" "${BUNDLE}/app/"
cp "${ROOT}/server.js" "${BUNDLE}/app/"
cp "${ROOT}/db.js" "${BUNDLE}/app/"

# Directories
for dir in routes views public engine scripts; do
  cp -r "${ROOT}/${dir}" "${BUNDLE}/app/"
done

# Remove any .gitkeep or empty markers
find "${BUNDLE}" -name '.gitkeep' -delete 2>/dev/null || true

# Install Node.js dependencies
echo "  Installing Node.js dependencies..."
cd "${BUNDLE}/app"
npm install --production --no-audit --no-fund 2>&1 | tail -2 || {
  echo "  ERROR: npm install failed. Node.js is required."
  exit 1
}

# ---- 4. Create launcher script ----
echo "[4/4] Creating launcher..."
cat > "${BUNDLE}/start.sh" << 'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

# ANPlayer Launcher
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="${SCRIPT_DIR}/bin:${PATH}"
export ANPLAYER_ROOT="${SCRIPT_DIR}"

# Create data directory
mkdir -p "${SCRIPT_DIR}/data"
mkdir -p "${SCRIPT_DIR}/downloads"

# Check for yt-dlp
if ! command -v yt-dlp &>/dev/null; then
  echo "ERROR: yt-dlp not found in PATH"
  echo "Try: pip3 install yt-dlp"
  exit 1
fi

# Check for mpv
if ! command -v mpv &>/dev/null; then
  echo "ERROR: mpv not found in PATH"
  echo "Install: sudo apt install mpv (or brew install mpv)"
  exit 1
fi

echo "ANPlayer v1.0.0"
echo "yt-dlp: $(yt-dlp --version 2>/dev/null || echo 'unknown')"
echo "mpv: $(mpv --version 2>/dev/null | head -1 || echo 'unknown')"
echo "Node.js: $(node --version 2>/dev/null || echo 'NOT FOUND')"
echo ""

cd "${SCRIPT_DIR}/app"
exec node server.js "$@"
LAUNCHER

chmod +x "${BUNDLE}/start.sh"

# Create desktop entry
cat > "${BUNDLE}/anplayer.desktop" << DESKTOP
[Desktop Entry]
Name=ANPlayer
Comment=Premium self-hosted music streaming
Exec=${BUNDLE}/start.sh
Terminal=true
Type=Application
Categories=Audio;Music;
StartupNotify=true
DESKTOP

# ---- Summary ----
echo ""
echo "=== Build Complete ==="
echo "Bundle: ${BUNDLE}"
echo ""
echo "Contents:"
du -sh "${BUNDLE}/bin" "${BUNDLE}/app" "${BUNDLE}/data" "${BUNDLE}/downloads"
echo ""
echo "Total size:"
du -sh "${BUNDLE}"
echo ""
echo "To run:"
echo "  ${BUNDLE}/start.sh"
echo ""
echo "Creating archive..."
cd "${DIST}"
tar czf "${ARCHIVE}" "$(basename "${BUNDLE}")"
echo "Archive: ${ARCHIVE}"
echo "Size: $(du -h "${ARCHIVE}" | cut -f1)"
echo ""
echo "Done!"
