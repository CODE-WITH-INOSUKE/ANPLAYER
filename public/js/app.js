// ANPlayer - Client Core
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}`;
let ws = null;
let currentState = { playing: false, position: 0, duration: 0, paused: false, song: null };
let currentSongId = null;
let reconnectTimer = null;

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch(e) {}
    };
    ws.onclose = () => {
      reconnectTimer = setTimeout(connectWebSocket, 2000);
    };
    ws.onerror = () => { ws.close(); };
  } catch(e) {
    reconnectTimer = setTimeout(connectWebSocket, 3000);
  }
}

function sendWS(type, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function handleWSMessage(msg) {
  switch(msg.type) {
    case 'state':
      currentState = msg.data;
      updatePlayerUI(msg.data);
      break;
    case 'ended':
      break;
    case 'searchResults':
      renderSearchResults(msg.data);
      break;
    case 'queueUpdated':
      break;
    case 'downloadQueued':
      showToast('Download queued');
      break;
    case 'favoriteAdded':
      updateFavoriteBtn(true);
      break;
    case 'favoriteRemoved':
      updateFavoriteBtn(false);
      break;
    case 'queueSaved':
      showToast('Queue saved as playlist');
      break;
    case 'downloads':
      break;
  }
}

// Player Controls (global functions)
function loadSong(song) {
  currentSongId = song.id || song.song_id;
  sendWS('load', { song, url: song.url || '' });
}

function togglePlay() {
  if (currentState.playing) sendWS('pause');
  else sendWS('play');
}

function nextTrack() { sendWS('next'); }
function prevTrack() { sendWS('prev'); }

function setVolume(vol) {
  sendWS('volume', { volume: parseInt(vol) });
}

function setSpeed(speed) {
  sendWS('speed', { speed: parseFloat(speed) });
}

function seekTo(position) {
  sendWS('seek', { position });
}

function toggleMute() {
  // Toggle between 0 and previous volume
  const slider = document.getElementById('volumeSlider') || document.getElementById('dockVolumeSlider');
  if (slider) {
    if (parseInt(slider.value) > 0) {
      slider.dataset.prevVol = slider.value;
      slider.value = 0;
    } else {
      slider.value = slider.dataset.prevVol || 80;
    }
    setVolume(slider.value);
  }
}

function toggleShuffle() {
  const btn = document.getElementById('shuffleBtn');
  if (btn) btn.classList.toggle('active');
  // Shuffle via fetch
  fetch('/queue/shuffle', { method: 'POST' }).then(() => {});
}

function toggleRepeat() {
  const btn = document.getElementById('repeatBtn');
  if (btn) btn.classList.toggle('active');
}

function toggleFavorite() {
  if (currentSongId) {
    sendWS('toggleFavorite', { songId: currentSongId });
  }
}

function addToQueue(songId) {
  sendWS('addToQueue', { songId });
  showToast('Added to queue');
}

function removeFromQueue(queueId) {
  sendWS('removeFromQueue', { queueId });
}

function clearQueue() {
  if (confirm('Clear the queue?')) {
    sendWS('clearQueue');
  }
}

function saveQueue() {
  sendWS('saveQueue');
}

function toggleQueuePanel() {
  document.getElementById('queuePanel').classList.toggle('open');
}

function saveQueueToPlaylist() {
  sendWS('saveQueue');
}

function updateFavoriteBtn(liked) {
  const btn = document.getElementById('npLikeBtn');
  if (btn) {
    btn.classList.toggle('liked', liked);
  }
}

function updatePlayerUI(state) {
  const { song, playing, paused, position, duration } = state;

  // Mini player
  const mn = document.getElementById('miniTitle');
  const ma = document.getElementById('miniArtist');
  const mp = document.getElementById('miniPlayBtn');
  const mpr = document.querySelector('.mini-player-progress');
  if (mn) {
    if (song) {
      mn.textContent = song.title || 'Unknown';
      ma.textContent = song.artist || 'Unknown';
      mpr.style.display = 'block';
      const pct = duration > 0 ? (position / duration) * 100 : 0;
      mpr.style.background = `linear-gradient(to right, #fff ${pct}%, var(--border) ${pct}%)`;
    } else {
      mn.textContent = 'Not Playing';
      ma.textContent = 'No tracks';
      mpr.style.display = 'none';
    }
  }
  if (mp) {
    mp.innerHTML = playing
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }

  // Now playing page
  const npTitle = document.getElementById('npTitle');
  const npArtist = document.getElementById('npArtist');
  const npAlbum = document.getElementById('npAlbum');
  const npArtwork = document.getElementById('npArtwork');
  const npPlayBtn = document.getElementById('npPlayBtn');
  const npPlayIcon = document.getElementById('npPlayIcon');
  const npProgressFill = document.getElementById('npProgressFill');
  const npCurrentTime = document.getElementById('npCurrentTime');
  const npTotalTime = document.getElementById('npTotalTime');
  const npBg = document.getElementById('npBackground');

  if (npTitle && song) {
    npTitle.textContent = song.title || 'Unknown';
    npArtist.textContent = song.artist || 'Unknown';
    npAlbum.textContent = song.album || '';
    if (song.artwork) {
      const img = npArtwork.querySelector('img') || document.createElement('img');
      img.src = song.artwork;
      img.alt = song.title;
      img.loading = 'eager';
      if (!npArtwork.contains(img)) { npArtwork.innerHTML = ''; npArtwork.appendChild(img); }
      if (npBg) npBg.style.background = `url(${song.artwork}) center/cover`;
    } else {
      npArtwork.innerHTML = `<div class="np-artwork-placeholder"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg></div>`;
      if (npBg) npBg.style.background = '#000';
    }
    currentSongId = song.id;
  }

  if (npPlayBtn) {
    if (npPlayIcon) {
      npPlayIcon.innerHTML = playing
        ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
        : '<polygon points="5 3 19 12 5 21 5 3"/>';
    }
  }

  if (npProgressFill) {
    const pct = duration > 0 ? (position / duration) * 100 : 0;
    npProgressFill.style.width = `${pct}%`;
    const thumb = document.getElementById('npProgressThumb');
    if (thumb) thumb.style.left = `${pct}%`;
  }
  if (npCurrentTime) npCurrentTime.textContent = formatTime(position);
  if (npTotalTime) npTotalTime.textContent = formatTime(duration);

  // Dock mode
  const dockTitle = document.getElementById('dockTitle');
  const dockArtist = document.getElementById('dockArtist');
  const dockArtwork = document.getElementById('dockArtwork');
  const dockPlayBtn = document.getElementById('dockPlayBtn');
  const dockPlayIcon = document.getElementById('dockPlayIcon');
  const dockProgressFill = document.getElementById('dockProgressFill');
  const dockCurTime = document.getElementById('dockCurrentTime');
  const dockTotTime = document.getElementById('dockTotalTime');
  const dockBg = document.getElementById('dockBackground');

  if (dockTitle && song) {
    dockTitle.textContent = song.title || 'Not Playing';
    dockArtist.textContent = song.artist || 'No tracks';
    if (song.artwork) {
      const img = dockArtwork.querySelector('img') || document.createElement('img');
      img.src = song.artwork;
      img.alt = song.title;
      if (!dockArtwork.contains(img)) { dockArtwork.innerHTML = ''; dockArtwork.appendChild(img); }
      if (dockBg) dockBg.style.background = `url(${song.artwork}) center/cover`;
    } else {
      dockArtwork.innerHTML = `<div class="dock-artwork-placeholder"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg></div>`;
    }
  }
  if (dockPlayBtn && dockPlayIcon) {
    dockPlayIcon.innerHTML = playing
      ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
      : '<polygon points="5 3 19 12 5 21 5 3"/>';
  }
  if (dockProgressFill) {
    const pct = duration > 0 ? (position / duration) * 100 : 0;
    dockProgressFill.style.width = `${pct}%`;
  }
  if (dockCurTime) dockCurTime.textContent = formatTime(position);
  if (dockTotTime) dockTotTime.textContent = formatTime(duration);

  // Ambient mode
  const ambTitle = document.getElementById('ambientTitle');
  const ambArtist = document.getElementById('ambientArtist');
  const ambArtwork = document.getElementById('ambientArtwork');
  const ambPlayBtn = document.getElementById('ambientPlayBtn');
  const ambPlayIcon = document.getElementById('ambientPlayIcon');
  const ambBg = document.getElementById('ambientBg');
  const ambPulse = document.getElementById('ambientPulse');
  const ambStatus = document.getElementById('ambientStatus');

  if (ambTitle && song) {
    ambTitle.textContent = song.title || 'Not Playing';
    ambArtist.textContent = song.artist || 'Tap to play/pause';
    if (song.artwork) {
      const img = ambArtwork.querySelector('img') || document.createElement('img');
      img.src = song.artwork;
      img.alt = song.title;
      if (!ambArtwork.contains(img)) { ambArtwork.innerHTML = ''; ambArtwork.appendChild(img); }
      if (ambBg) ambBg.style.background = `radial-gradient(ellipse at center, ${song.artwork ? '#111' : '#000'}, #000)`;
    }
  }
  if (ambPlayBtn && ambPlayIcon) {
    ambPlayIcon.innerHTML = playing
      ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
      : '<polygon points="5 3 19 12 5 21 5 3"/>';
  }
  if (ambPulse) ambPulse.style.opacity = playing ? '1' : '0.3';
  if (ambStatus) ambStatus.textContent = playing ? 'Playing' : 'Paused';
}

// Click on progress bar to seek
document.addEventListener('click', (e) => {
  const progressBar = e.target.closest('.np-progress-bar');
  if (progressBar) {
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const duration = currentState.duration || 0;
    seekTo(pct * duration);
  }
  const dockProgressBar = e.target.closest('.dock-progress-bar');
  if (dockProgressBar) {
    const rect = dockProgressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const duration = currentState.duration || 0;
    seekTo(pct * duration);
  }
});

// Format helpers
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
  return formatTime(seconds);
}

// Toast
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(255,255,255,0.9)', color: '#000',
    padding: '10px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: '500',
    zIndex: '999', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    transition: 'opacity 0.3s ease', opacity: '1',
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2000);
}

// Sidebar
document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const closeBtn = document.getElementById('sidebarClose');
  function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('open'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
  if (menuToggle) menuToggle.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  connectWebSocket();

  // Restore volume
  fetch('/api/volume').then(r => r.json()).then(data => {
    const vol = data.volume || 80;
    const sliders = document.querySelectorAll('.volume-slider, .dock-volume-slider');
    sliders.forEach(s => s.value = vol);
  }).catch(() => {});

  // Search clear button
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  if (searchInput && searchClear) {
    searchInput.addEventListener('input', () => {
      searchClear.style.display = searchInput.value ? 'flex' : 'none';
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.focus();
      searchClear.style.display = 'none';
      document.getElementById('searchResults').style.display = 'none';
      document.getElementById('searchInitial').style.display = 'block';
    });
  }
});

// Format duration for EJS
function formatDuration(d) {
  if (!d || isNaN(d)) return '0:00';
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Search history clear
function clearSearchHistory() {
  fetch('/search/history/clear', { method: 'POST' })
    .then(() => location.reload())
    .catch(() => location.reload());
}
