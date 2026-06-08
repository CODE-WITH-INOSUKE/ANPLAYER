const express = require('express');
const router = express.Router();
const { query, get, run } = require('../db');

router.get('/queue', (req, res) => {
  const queue = query(`SELECT q.*, s.title, s.artist, s.album, s.duration, s.artwork, s.youtube_id
    FROM queue q
    JOIN songs s ON q.song_id = s.id
    ORDER BY q.position`);

  const history = query(`SELECT s.*, ph.played_at, ph.duration_played FROM playback_history ph
    JOIN songs s ON ph.song_id = s.id
    ORDER BY ph.played_at DESC LIMIT 20`);

  const recentSearches = query('SELECT DISTINCT query FROM search_history ORDER BY date_searched DESC LIMIT 5');

  res.render('queue', {
    queue,
    history,
    recentSearches,
    queueCount: queue.length,
    title: 'Queue - ANPlayer'
  });
});

router.post('/queue/add', (req, res) => {
  const { song_id } = req.body;
  const maxPos = get('SELECT COALESCE(MAX(position), -1) + 1 as pos FROM queue');
  run('INSERT INTO queue (song_id, position) VALUES (?, ?)', { song_id, position: maxPos.pos || 0 });
  res.redirect('/queue');
});

router.post('/queue/play', async (req, res) => {
  const { song_id } = req.body;
  const song = get('SELECT * FROM songs WHERE id = ?', { id: song_id });
  if (song) {
    // Clear current queue and play this song
    run('DELETE FROM queue');
    const mpv = require('../engine/mpv');
    let audioUrl = song.path;
    if (!audioUrl || !song.is_downloaded) {
      const search = require('../engine/search');
      try { audioUrl = await search.getAudioUrl(song.youtube_id); } catch(e) {}
    }
    if (audioUrl) {
      mpv.load(audioUrl, song);
    }
  }
  res.redirect(req.get('Referer') || '/');
});

router.post('/queue/add/next', (req, res) => {
  const { song_id } = req.body;
  const firstPos = get('SELECT MIN(position) as pos FROM queue');
  run('INSERT INTO queue (song_id, position) VALUES (?, ?)',
    { song_id, position: (firstPos ? firstPos.pos - 1 : 0) });
  res.json({ success: true });
});

router.post('/queue/clear', (req, res) => {
  run('DELETE FROM queue');
  res.redirect('/queue');
});

router.post('/queue/remove/:id', (req, res) => {
  run('DELETE FROM queue WHERE id = ?', { id: req.params.id });
  res.redirect('/queue');
});

router.post('/queue/shuffle', (req, res) => {
  const items = query('SELECT * FROM queue ORDER BY position');
  // Fisher-Yates shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  for (let i = 0; i < items.length; i++) {
    run('UPDATE queue SET position = ? WHERE id = ?', { position: i, id: items[i].id });
  }
  res.redirect('/queue');
});

module.exports = router;
