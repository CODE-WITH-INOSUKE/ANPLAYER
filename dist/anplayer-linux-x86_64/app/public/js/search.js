// ANPlayer - Search Module

let searchTimeout = null;
let searchType = 'all';

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  // Auto-search on load if there's a query
  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('q');
  if (q) {
    searchInput.value = q;
    doSearch();
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length > 0) {
      searchTimeout = setTimeout(doSearch, 400);
    } else {
      document.getElementById('searchResults').style.display = 'none';
      document.getElementById('searchInitial').style.display = 'block';
    }
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      searchType = btn.dataset.type;
      if (searchInput.value.trim()) doSearch();
    });
  });

  // Search tabs
  document.querySelectorAll('.search-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.search-tab-content').forEach(c => c.style.display = 'none');
      document.getElementById(tabName + 'Tab').style.display = 'block';
    });
  });
});

function doSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) {
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('searchInitial').style.display = 'block';
    return;
  }

  document.getElementById('searchInitial').style.display = 'none';
  document.getElementById('searchResults').style.display = 'block';

  fetch(`/search/results?q=${encodeURIComponent(query)}&type=${searchType}`)
    .then(r => r.json())
    .then(results => {
      renderSearchResults(results);
      // Save to history
      fetch('/search/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: searchType })
      }).catch(() => {});
    })
    .catch(() => {});
}

function renderSearchResults(results) {
  const songs = results.songs || [];
  const albums = results.albums || [];
  const artists = results.artists || [];
  const playlists = results.playlists || [];

  // Update counts
  const sc = document.getElementById('songCount');
  const ac = document.getElementById('albumCount');
  const arc = document.getElementById('artistCount');
  const plc = document.getElementById('playlistCount');
  if (sc) sc.textContent = songs.length;
  if (ac) ac.textContent = albums.length;
  if (arc) arc.textContent = artists.length;
  if (plc) plc.textContent = playlists.length;

  // Render songs
  const songContainer = document.getElementById('songResults');
  if (songContainer) {
    if (songs.length > 0) {
      songContainer.innerHTML = songs.map((s, i) => `
        <div class="song-item" onclick="loadSong({id: '${s.youtube_id}', title: '${escapeJs(s.title)}', artist: '${escapeJs(s.artist)}', album: '${escapeJs(s.album)}', duration: ${s.duration || 0}, artwork: '${escapeJs(s.artwork)}', youtube_id: '${s.youtube_id}'})">
          <div class="song-pos">${i + 1}</div>
          <div class="song-artwork">
            ${s.artwork ? `<img src="/api/artwork?url=${encodeURIComponent(s.artwork)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'song-artwork-placeholder\\'><svg width=\\'20\\' height=\\'20\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'/><polygon points=\\'10 8 16 12 10 16 10 8\\'/></svg></div>'">` :
              `<div class="song-artwork-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg></div>`}
          </div>
          <div class="song-info">
            <div class="song-title">${s.title}</div>
            <div class="song-artist">${s.artist}</div>
          </div>
          <div class="song-duration">${formatTime(s.duration)}</div>
          <div class="song-actions">
            <button class="song-action-btn" onclick="event.stopPropagation(); downloadFromSearch('${s.youtube_id}', '${escapeJs(s.title)}', '${escapeJs(s.artist)}', '${escapeJs(s.album)}', ${s.duration || 0}, '${escapeJs(s.artwork)}')" title="Download">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="song-action-btn" onclick="event.stopPropagation(); addToQueueFromSearch('${s.youtube_id}', '${escapeJs(s.title)}', '${escapeJs(s.artist)}', '${escapeJs(s.album)}', ${s.duration || 0}, '${escapeJs(s.artwork)}')" title="Add to Queue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
      `).join('');
    } else {
      songContainer.innerHTML = '<div class="empty-state"><p>No songs found</p></div>';
    }
  }

  // Albums
  const albumContainer = document.getElementById('albumResults');
  if (albumContainer) {
    if (albums.length > 0) {
      albumContainer.innerHTML = albums.map(a => `
        <div class="card" onclick="searchAlbum('${escapeJs(a.title)}', '${escapeJs(a.artist)}')">
          <div class="card-artwork">
            <div class="card-artwork-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
          </div>
          <div class="card-info">
            <div class="card-title">${a.title}</div>
            <div class="card-subtitle">${a.artist}</div>
          </div>
        </div>
      `).join('');
    } else {
      albumContainer.innerHTML = '<div class="empty-state"><p>No albums found</p></div>';
    }
  }

  // Artists
  const artistContainer = document.getElementById('artistResults');
  if (artistContainer) {
    if (artists.length > 0) {
      artistContainer.innerHTML = artists.map(a => `
        <div class="card" onclick="searchArtist('${escapeJs(a.name || a.artist)}')">
          <div class="card-artwork">
            <div class="card-artwork-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          </div>
          <div class="card-info">
            <div class="card-title">${a.name || a.artist}</div>
            <div class="card-subtitle">${a.song_count || 0} songs</div>
          </div>
        </div>
      `).join('');
    } else {
      artistContainer.innerHTML = '<div class="empty-state"><p>No artists found</p></div>';
    }
  }

  // Playlists (from search)
  const playlistContainer = document.getElementById('playlistResults');
  if (playlistContainer) {
    if (playlists.length > 0) {
      playlistContainer.innerHTML = playlists.map(p => `
        <div class="card">
          <div class="card-artwork">
            <div class="card-artwork-placeholder" style="background: linear-gradient(135deg, #1a1a2e, #16213e);">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
          </div>
          <div class="card-info">
            <div class="card-title">${p.title || 'Playlist'}</div>
            <div class="card-subtitle">${p.song_count || 0} tracks</div>
          </div>
        </div>
      `).join('');
    } else {
      playlistContainer.innerHTML = '';
    }
  }
}

function addToQueueFromSearch(youtubeId, title, artist, album, duration, artwork) {
  fetch('/api/queue/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtube_id: youtubeId, title, artist, album, duration, artwork })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      showToast('Added to queue');
    }
  })
  .catch(() => {});
}

function searchAlbum(title, artist) {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = `${title} ${artist} album`;
    doSearch();
  }
}

function searchArtist(name) {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = name;
    document.querySelector('.filter-btn[data-type="artist"]')?.click();
    doSearch();
  }
}

function escapeJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
}
