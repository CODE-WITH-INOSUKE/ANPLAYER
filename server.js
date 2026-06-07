const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { initSchema, getDb, query, get, run } = require('./db');
const mpv = require('./engine/mpv');
const search = require('./engine/search');
const download = require('./engine/download');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global middleware for view variables
app.use((req, res, next) => {
  try {
    const queueCount = query('SELECT COUNT(*) as count FROM queue')[0]?.count || 0;
    const recentSearches = query('SELECT * FROM search_history ORDER BY date_searched DESC LIMIT 10');
    res.locals.queueCount = queueCount;
    res.locals.recentSearches = recentSearches || [];
  } catch(e) {
    res.locals.queueCount = 0;
    res.locals.recentSearches = [];
  }
  next();
});

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'state', data: mpv.getState() }));

  ws.on('message', (msg) => {
    try {
      const { type, data } = JSON.parse(msg.toString());
      handleWSMessage(ws, type, data);
    } catch(e) {}
  });

  ws.on('close', () => clients.delete(ws));
});

mpv.on('state', (state) => {
  broadcast({ type: 'state', data: state });
});

mpv.on('ended', (data) => {
  broadcast({ type: 'ended', data });
});

function broadcast(msg) {
  const str = JSON.stringify(msg);
  for (const ws of clients) {
    try { ws.send(str); } catch(e) {}
  }
}

async function handleWSMessage(ws, type, data) {
  switch(type) {
    case 'play':
      mpv.play();
      break;
    case 'pause':
      mpv.pause();
      break;
    case 'toggle':
      mpv.togglePlay();
      break;
    case 'seek':
      mpv.seek(data.position);
      break;
    case 'seekRelative':
      mpv.seekRelative(data.seconds);
      break;
    case 'volume':
      mpv.setVolume(data.volume);
      break;
    case 'speed':
      mpv.setSpeed(data.speed);
      break;
    case 'load':
      const song = data.song;
      const audioUrl = data.url || await search.getAudioUrl(song.youtube_id);
      // Save song to DB if not exists
      let existing = get('SELECT * FROM songs WHERE youtube_id = ?', { youtube_id: song.youtube_id });
      if (!existing) {
        const result = run(`INSERT INTO songs (title, artist, album, duration, artwork, youtube_id, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          { title: song.title, artist: song.artist, album: song.album || 'Unknown', duration: song.duration || 0, artwork: song.artwork || '', youtube_id: song.youtube_id, source: 'youtube' });
        song.id = result.lastInsertRowid;
      } else {
        song.id = existing.id;
        // Update artwork if empty
        if (!existing.artwork && song.artwork) {
          run('UPDATE songs SET artwork = ? WHERE id = ?', { artwork: song.artwork, id: existing.id });
        }
      }
      mpv.load(audioUrl, song);
      break;
    case 'search':
      const results = await search.searchYouTube(data.query, data.type || 'all');
      ws.send(JSON.stringify({ type: 'searchResults', data: results }));
      if (data.query) search.saveSearchHistory(data.query, data.type || 'all');
      break;
    case 'addToQueue':
      run('INSERT INTO queue (song_id, position) VALUES (?, (SELECT COALESCE(MAX(position),0)+1 FROM queue))',
        { song_id: data.songId });
      broadcast({ type: 'queueUpdated' });
      break;
    case 'removeFromQueue':
      run('DELETE FROM queue WHERE id = ?', { id: data.queueId });
      broadcast({ type: 'queueUpdated' });
      break;
    case 'reorderQueue':
      const { from, to } = data;
      // Simple reorder by swapping positions
      const items = query('SELECT * FROM queue ORDER BY position');
      if (from >= 0 && from < items.length && to >= 0 && to < items.length) {
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        for (let i = 0; i < items.length; i++) {
          run('UPDATE queue SET position = ? WHERE id = ?', { position: i, id: items[i].id });
        }
      }
      broadcast({ type: 'queueUpdated' });
      break;
    case 'clearQueue':
      run('DELETE FROM queue');
      broadcast({ type: 'queueUpdated' });
      break;
    case 'next':
      playNext();
      break;
    case 'prev':
      playPrev();
      break;
    case 'download':
      download.queueDownload(data.songId, data.url, data.format, data.quality);
      ws.send(JSON.stringify({ type: 'downloadQueued', data: { songId: data.songId } }));
      break;
    case 'cancelDownload':
      download.cancelDownload(data.downloadId);
      break;
    case 'getDownloads':
      ws.send(JSON.stringify({ type: 'downloads', data: download.getDownloads() }));
      break;
    case 'toggleFavorite':
      const fav = get('SELECT * FROM favorites WHERE song_id = ?', { song_id: data.songId });
      if (fav) {
        run('DELETE FROM favorites WHERE song_id = ?', { song_id: data.songId });
        ws.send(JSON.stringify({ type: 'favoriteRemoved', data: { songId: data.songId } }));
      } else {
        run('INSERT INTO favorites (song_id) VALUES (?)', { song_id: data.songId });
        ws.send(JSON.stringify({ type: 'favoriteAdded', data: { songId: data.songId } }));
      }
      break;
    case 'saveQueue':
      const qItems = query('SELECT * FROM queue ORDER BY position');
      const plResult = run('INSERT INTO playlists (name, description) VALUES (?, ?)',
        { name: `Queue ${new Date().toLocaleString()}`, description: 'Saved queue' });
      const plId = plResult.lastInsertRowid;
      for (let i = 0; i < qItems.length; i++) {
        run('INSERT INTO playlist_entries (playlist_id, song_id, position) VALUES (?, ?, ?)',
          { playlist_id: plId, song_id: qItems[i].song_id, position: i });
      }
      ws.send(JSON.stringify({ type: 'queueSaved', data: { playlistId: plId } }));
      break;
  }
}

async function playNext() {
  const queue = query('SELECT * FROM queue ORDER BY position LIMIT 1');
  if (queue.length > 0) {
    const entry = queue[0];
    const song = get('SELECT * FROM songs WHERE id = ?', { id: entry.song_id });
    if (song) {
      run('DELETE FROM queue WHERE id = ?', { id: entry.id });
      const audioUrl = song.is_downloaded ? song.path : await search.getAudioUrl(song.youtube_id);
      mpv.load(audioUrl, song);
      broadcast({ type: 'queueUpdated' });
    }
  }
}

function playPrev() {
  mpv.seek(0);
}

async function start() {
  await getDb();
  mpv.start();
  app.use(require('./routes/home'));
  app.use(require('./routes/search'));
  app.use(require('./routes/library'));
  app.use(require('./routes/playlist'));
  app.use(require('./routes/queue'));
  app.use(require('./routes/settings'));
  app.use(require('./routes/nowplaying'));
  app.use(require('./routes/api'));

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ANPlayer running on http://0.0.0.0:${PORT}`);
    console.log(`Open in browser: http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  mpv.quit();
  server.close();
  process.exit(0);
});
