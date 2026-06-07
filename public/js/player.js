// ANPlayer - Player-specific UI enhancements

document.addEventListener('DOMContentLoaded', () => {
  // Volume slider sync
  const volumeSlider = document.getElementById('volumeSlider');
  const dockVolumeSlider = document.getElementById('dockVolumeSlider');

  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => setVolume(volumeSlider.value));
  }
  if (dockVolumeSlider) {
    dockVolumeSlider.addEventListener('input', () => setVolume(dockVolumeSlider.value));
  }

  // Media Session API
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => sendWS('play'));
    navigator.mediaSession.setActionHandler('pause', () => sendWS('pause'));
    navigator.mediaSession.setActionHandler('previoustrack', () => sendWS('prev'));
    navigator.mediaSession.setActionHandler('nexttrack', () => sendWS('next'));
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime) sendWS('seek', { position: details.seekTime });
    });
  }

  // Prevent sleep / wake lock
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {});
      }
    } catch(e) {}
  }
  // Request wake lock on playback
  document.addEventListener('click', () => {
    if (!wakeLock || wakeLock.released) requestWakeLock();
  });
});
