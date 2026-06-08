const express = require('express');
const router = express.Router();
const { query, get, run } = require('../db');

router.get('/playlists', (req, res) => {
  const playlists = query('SELECT * FROM playlists ORDER BY date_modified DESC');
  res.render('playlists', { playlists, title: 'Playlists - ANPlayer' });
});

router.get('/playlists/new', (req, res) => {
  res.render('playlist_new', { title: 'New Playlist - ANPlayer' });
});

router.post('/playlists/new', (req, res) => {
  const { name, description } = req.body;
  const result = run('INSERT INTO playlists (name, description) VALUES (?, ?)', { name: name || 'Untitled', description: description || '' });
  res.redirect(`/playlists/${result.lastInsertRowid}`);
});

router.get('/playlists/:id', (req, res) => {
  const playlist = get('SELECT * FROM playlists WHERE id = ?', { id: req.params.id });
  if (!playlist) return res.redirect('/playlists');
  const songs = query(`SELECT s.*, pe.id as entry_id, pe.position FROM playlist_entries pe
    JOIN songs s ON pe.song_id = s.id
    WHERE pe.playlist_id = ?
    ORDER BY pe.position`, { playlist_id: playlist.id });
  res.render('playlist', { playlist, songs, title: `${playlist.name} - ANPlayer` });
});

router.post('/playlists/:id/rename', (req, res) => {
  const { name } = req.body;
  run('UPDATE playlists SET name = ?, date_modified = CURRENT_TIMESTAMP WHERE id = ?', { name, id: req.params.id });
  res.redirect(`/playlists/${req.params.id}`);
});

router.post('/playlists/:id/delete', (req, res) => {
  run('DELETE FROM playlists WHERE id = ?', { id: req.params.id });
  res.redirect('/playlists');
});

router.post('/playlists/:id/add', (req, res) => {
  const { song_id } = req.body;
  const maxPos = get('SELECT COALESCE(MAX(position), -1) + 1 as pos FROM playlist_entries WHERE playlist_id = ?', { playlist_id: req.params.id });
  run('INSERT INTO playlist_entries (playlist_id, song_id, position) VALUES (?, ?, ?)',
    { playlist_id: req.params.id, song_id, position: maxPos.pos || 0 });
  run('UPDATE playlists SET song_count = song_count + 1, date_modified = CURRENT_TIMESTAMP WHERE id = ?', { id: req.params.id });
  res.redirect(`/playlists/${req.params.id}`);
});

router.post('/playlists/:id/remove/:entryId', (req, res) => {
  run('DELETE FROM playlist_entries WHERE id = ? AND playlist_id = ?', { id: req.params.entryId, playlist_id: req.params.id });
  run('UPDATE playlists SET song_count = MAX(0, song_count - 1), date_modified = CURRENT_TIMESTAMP WHERE id = ?', { id: req.params.id });
  res.redirect(`/playlists/${req.params.id}`);
});

router.post('/playlists/:id/reorder', (req, res) => {
  const { entries } = req.body; // array of {id, position}
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      run('UPDATE playlist_entries SET position = ? WHERE id = ? AND playlist_id = ?',
        { position: entry.position, id: entry.id, playlist_id: req.params.id });
    }
  }
  run('UPDATE playlists SET date_modified = CURRENT_TIMESTAMP WHERE id = ?', { id: req.params.id });
  res.json({ success: true });
});

router.post('/playlists/import', async (req, res) => {
  const { url, name } = req.body;
  const { spawn } = require('child_process');

  try {
    const yt = spawn('yt-dlp', [
      url,
      '--dump-json',
      '--no-warnings',
      '--flat-playlist',
      '--skip-download',
    ]);
    let stdout = '';
    yt.stdout.on('data', (d) => { stdout += d.toString(); });
    yt.on('close', async () => {
      const lines = stdout.trim().split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const first = JSON.parse(lines[0]);
        const playlistName = name || first.playlist_title || 'Imported Playlist';
        const result = run('INSERT INTO playlists (name, description) VALUES (?, ?)',
          { name: playlistName, description: `Imported from ${url}` });
        const plId = result.lastInsertRowid;

        for (let i = 0; i < lines.length; i++) {
          try {
            const item = JSON.parse(lines[i]);
            const songResult = run(`INSERT INTO songs (title, artist, album, duration, artwork, youtube_id, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              { title: item.title || 'Unknown', artist: item.artist || item.uploader || 'Unknown',
                album: item.album || item.playlist_title || 'Unknown', duration: item.duration || 0,
                artwork: item.thumbnail || '', youtube_id: item.id || '', source: 'youtube' });
            run('INSERT INTO playlist_entries (playlist_id, song_id, position) VALUES (?, ?, ?)',
              { playlist_id: plId, song_id: songResult.lastInsertRowid, position: i });
          } catch(e) {}
        }
        run('UPDATE playlists SET song_count = ? WHERE id = ?', { song_count: lines.length, id: plId });
        res.redirect(`/playlists/${plId}`);
      } else {
        res.redirect('/playlists');
      }
    });
  } catch(e) {
    res.redirect('/playlists');
  }
});

module.exports = router;
