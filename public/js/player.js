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

  // Media Session API -> drive the browser <audio> element
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) seekTo(details.seekTime);
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
