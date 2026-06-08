const express = require('express');
const router = express.Router();
const { query, get, run } = require('../db');
const mpv = require('../engine/mpv');
const search = require('../engine/search');
const downloadEngine = require('../engine/download');
const https = require('https');
const http = require('http');
const fs = require('fs');

router.get('/api/state', (req, res) => {
  res.json(mpv.getState());
});

router.get('/api/queue', (req, res) => {
  const queue = query(`SELECT q.*, s.title, s.artist, s.album, s.duration, s.artwork, s.youtube_id
    FROM queue q JOIN songs s ON q.song_id = s.id ORDER BY q.position`);
  res.json(queue);
});

router.get('/api/queue/count', (req, res) => {
  const count = get('SELECT COUNT(*) as count FROM queue');
  res.json(count);
});

router.post('/api/queue/add', (req, res) => {
  const { youtube_id, title, artist, album, duration, artwork } = req.body;
  if (!youtube_id) return res.status(400).json({ success: false, error: 'Missing youtube_id' });
  try {
    let song = get('SELECT * FROM songs WHERE youtube_id = ?', { youtube_id });
    if (!song) {
      const result = run(`INSERT INTO songs (title, artist, album, duration, artwork, youtube_id, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        { title: title || 'Unknown', artist: artist || 'Unknown', album: album || '', duration: duration || 0, artwork: artwork || '', youtube_id, source: 'youtube' });
      song = get('SELECT * FROM songs WHERE id = ?', { id: result.lastInsertRowid });
    }
    if (song) {
      const maxPos = get('SELECT COALESCE(MAX(position), -1) + 1 as pos FROM queue');
      run('INSERT INTO queue (song_id, position) VALUES (?, ?)', { song_id: song.id, position: maxPos.pos || 0 });
      res.json({ success: true, song });
    } else {
      res.json({ success: false, error: 'Failed to save song' });
    }
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

router.get('/api/songs', (req, res) => {
  const { q, artist, album, limit = 50, offset = 0 } = req.query;
  let sql = 'SELECT * FROM songs WHERE 1=1';
  const params = {};
  if (q) { sql += ' AND (title LIKE @q OR artist LIKE @q)'; params.q = `%${q}%`; }
  if (artist) { sql += ' AND artist = @artist'; params.artist = artist; }
  if (album) { sql += ' AND album = @album'; params.album = album; }
  sql += ' ORDER BY artist, title LIMIT @limit OFFSET @offset';
  params.limit = parseInt(limit);
  params.offset = parseInt(offset);
  res.json(query(sql, params));
});

router.get('/api/songs/:id', (req, res) => {
  const song = get('SELECT * FROM songs WHERE id = ?', { id: req.params.id });
  if (!song) return res.status(404).json({ error: 'Not found' });
  const isFav = get('SELECT * FROM favorites WHERE song_id = ?', { song_id: song.id });
  res.json({ ...song, is_favorite: !!isFav });
});

router.get('/api/albums', (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM albums';
  const params = {};
  if (q) { sql += ' WHERE title LIKE @q OR artist LIKE @q'; params.q = `%${q}%`; }
  sql += ' ORDER BY artist, title';
  res.json(query(sql, params));
});

router.get('/api/artists', (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM artists';
  const params = {};
  if (q) { sql += ' WHERE name LIKE @q'; params.q = `%${q}%`; }
  sql += ' ORDER BY name';
  res.json(query(sql, params));
});

router.get('/api/favorites', (req, res) => {
  const songs = query(`SELECT s.* FROM favorites f JOIN songs s ON f.song_id = s.id ORDER BY f.date_added DESC`);
  res.json(songs);
});

router.post('/api/favorites/toggle', (req, res) => {
  const { song_id } = req.body;
  const fav = get('SELECT * FROM favorites WHERE song_id = ?', { song_id });
  if (fav) {
    run('DELETE FROM favorites WHERE song_id = ?', { song_id });
    res.json({ favorited: false });
  } else {
    run('INSERT INTO favorites (song_id) VALUES (?)', { song_id });
    res.json({ favorited: true });
  }
});

router.get('/api/downloads', (req, res) => {
  const downloads = query(`SELECT d.*, s.title, s.artist, s.artwork FROM downloads d
    LEFT JOIN songs s ON d.song_id = s.id ORDER BY d.date_added DESC`);
  res.json(downloads);
});

router.get('/api/playlists', (req, res) => {
  const playlists = query('SELECT * FROM playlists ORDER BY date_modified DESC');
  res.json(playlists);
});

router.get('/api/playlists/:id', (req, res) => {
  const playlist = get('SELECT * FROM playlists WHERE id = ?', { id: req.params.id });
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  const songs = query(`SELECT s.*, pe.id as entry_id, pe.position FROM playlist_entries pe
    JOIN songs s ON pe.song_id = s.id WHERE pe.playlist_id = ? ORDER BY pe.position`, { playlist_id: playlist.id });
  res.json({ ...playlist, songs });
});

router.get('/api/search/history', (req, res) => {
  const history = query('SELECT DISTINCT query FROM search_history ORDER BY date_searched DESC LIMIT 10');
  res.json(history);
});

// Artwork proxy - fetch thumbnail images through our server.
// Forwards Content-Type and follows redirects so images render on Android/WebView.
function proxyImage(url, res, redirectsLeft = 3) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return res.status(400).end();
  }
  const client = parsed.protocol === 'http:' ? http : https;
  const reqOpts = {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
  };
  const upstream = client.get(url, reqOpts, (proxyRes) => {
    const status = proxyRes.statusCode || 0;
    // Follow redirects
    if (status >= 300 && status < 400 && proxyRes.headers.location && redirectsLeft > 0) {
      proxyRes.resume();
      const next = new URL(proxyRes.headers.location, url).toString();
      return proxyImage(next, res, redirectsLeft - 1);
    }
    if (status !== 200) {
      proxyRes.resume();
      return res.status(status || 404).end();
    }
    res.set('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
    if (proxyRes.headers['content-length']) {
      res.set('Content-Length', proxyRes.headers['content-length']);
    }
    res.set('Cache-Control', 'public, max-age=86400');
    proxyRes.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.status(404).end(); });
  upstream.setTimeout(10000, () => upstream.destroy());
}

router.get('/api/artwork', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end();
  proxyImage(url, res);
});

// --- Browser playback ---------------------------------------------------
// Register a song (upsert by youtube_id) and return the DB id + local info.
// The client then points an <audio> element at /api/stream/:id.
router.post('/api/play/register', (req, res) => {
  const { youtube_id, title, artist, album, duration, artwork } = req.body;
  if (!youtube_id) return res.status(400).json({ success: false, error: 'Missing youtube_id' });
  try {
    let song = get('SELECT * FROM songs WHERE youtube_id = ?', { youtube_id });
    if (!song) {
      const result = run(`INSERT INTO songs (title, artist, album, duration, artwork, youtube_id, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        { title: title || 'Unknown', artist: artist || 'Unknown', album: album || '', duration: duration || 0, artwork: artwork || '', youtube_id, source: 'youtube' });
      song = get('SELECT * FROM songs WHERE id = ?', { id: result.lastInsertRowid });
    } else if (!song.artwork && artwork) {
      run('UPDATE songs SET artwork = ? WHERE id = ?', { artwork, id: song.id });
    }
    // Count the play
    try {
      run('UPDATE songs SET last_played = CURRENT_TIMESTAMP, play_count = play_count + 1 WHERE id = ?', { id: song.id });
      run('INSERT INTO playback_history (song_id) VALUES (?)', { song_id: song.id });
    } catch (e) {}
    const isFav = get('SELECT 1 FROM favorites WHERE song_id = ?', { song_id: song.id });
    res.json({ success: true, id: song.id, is_downloaded: !!song.is_downloaded, is_favorite: !!isFav });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Cache of resolved YouTube audio URLs (they expire, so keep them short-lived).
const audioUrlCache = new Map();
const AUDIO_URL_TTL = 25 * 60 * 1000;

function copyRangeHeaders(from, res) {
  const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
  for (const h of passthrough) {
    if (from.headers[h]) res.set(h, from.headers[h]);
  }
}

function streamRemote(audioUrl, req, res, retried) {
  let parsed;
  try { parsed = new URL(audioUrl); } catch (e) { return res.status(502).end(); }
  const client = parsed.protocol === 'http:' ? http : https;
  const headers = { 'User-Agent': 'Mozilla/5.0' };
  if (req.headers.range) headers['Range'] = req.headers.range;

  const upstream = client.get(audioUrl, { headers }, (up) => {
    if (up.statusCode >= 400) {
      up.resume();
      if (!res.headersSent) res.status(502).end();
      return;
    }
    res.status(up.statusCode || 200);
    copyRangeHeaders(up, res);
    if (!up.headers['accept-ranges']) res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'no-store');
    up.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.status(502).end(); });
  upstream.setTimeout(20000, () => upstream.destroy());
  req.on('close', () => upstream.destroy());
}

// Stream audio for a song id: local file if downloaded, otherwise proxy YouTube.
router.get('/api/stream/:id', async (req, res) => {
  const song = get('SELECT * FROM songs WHERE id = ?', { id: parseInt(req.params.id) });
  if (!song) return res.status(404).end();

  // Serve a downloaded local file (Express handles Range/Content-Type for us).
  if (song.is_downloaded && song.path && fs.existsSync(song.path)) {
    return res.sendFile(song.path, (err) => { if (err && !res.headersSent) res.status(404).end(); });
  }

  if (!song.youtube_id) return res.status(404).end();

  // Resolve (and cache) the direct audio URL.
  const cached = audioUrlCache.get(song.youtube_id);
  const now = Date.now();
  if (cached && (now - cached.ts) < AUDIO_URL_TTL) {
    return streamRemote(cached.url, req, res);
  }
  try {
    const audioUrl = await search.getAudioUrl(song.youtube_id);
    audioUrlCache.set(song.youtube_id, { url: audioUrl, ts: Date.now() });
    streamRemote(audioUrl, req, res);
  } catch (e) {
    if (!res.headersSent) res.status(502).end();
  }
});

// Trigger download of a song
router.post('/api/download', (req, res) => {
  const { youtube_id, title, artist, album, duration, artwork } = req.body;
  if (!youtube_id) return res.status(400).json({ success: false, error: 'Missing youtube_id' });
  try {
    let song = get('SELECT * FROM songs WHERE youtube_id = ?', { youtube_id });
    if (!song) {
      const result = run(`INSERT INTO songs (title, artist, album, duration, artwork, youtube_id, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        { title: title || 'Unknown', artist: artist || 'Unknown', album: album || '', duration: duration || 0, artwork: artwork || '', youtube_id, source: 'youtube' });
      song = get('SELECT * FROM songs WHERE id = ?', { id: result.lastInsertRowid });
    }
    if (!song) return res.json({ success: false, error: 'Failed to save song' });

    const dlSettings = {};
    const rows = query('SELECT * FROM settings WHERE key IN ("download_format", "download_quality")');
    for (const r of rows) dlSettings[r.key] = r.value;

    const url = `https://youtube.com/watch?v=${youtube_id}`;
    downloadEngine.queueDownload(song.id, url, dlSettings.download_format || 'mp3', dlSettings.download_quality || '128');
    res.json({ success: true, song, message: 'Download queued' });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// Get all downloads with full song info
router.get('/api/downloads', (req, res) => {
  const downloads = downloadEngine.getDownloads();
  res.json(downloads);
});

// Cancel a download
router.post('/api/downloads/cancel', (req, res) => {
  const { id } = req.body;
  downloadEngine.cancelDownload(id);
  res.json({ success: true });
});

// Get download progress by ID
router.get('/api/downloads/:id', (req, res) => {
  const dl = downloadEngine.getDownloadProgress(parseInt(req.params.id));
  if (!dl) return res.status(404).json({ error: 'Not found' });
  res.json(dl);
});

router.get('/api/volume', async (req, res) => {
  const vol = await mpv.getVolume();
  res.json({ volume: vol });
});

router.get('/api/settings', (req, res) => {
  const settings = {};
  const rows = query('SELECT * FROM settings');
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

module.exports = router;
