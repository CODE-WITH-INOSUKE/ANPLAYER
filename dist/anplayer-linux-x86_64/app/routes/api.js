const express = require('express');
const router = express.Router();
const { query, get, run } = require('../db');
const mpv = require('../engine/mpv');
const search = require('../engine/search');
const downloadEngine = require('../engine/download');
const https = require('https');
const http = require('http');

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

// Artwork proxy - fetch thumbnail images through our server
router.get('/api/artwork', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end();
  const client = url.startsWith('https') ? https : http;
  client.get(url, (proxyRes) => {
    res.set('Cache-Control', 'public, max-age=86400');
    proxyRes.pipe(res);
  }).on('error', () => res.status(404).end());
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
