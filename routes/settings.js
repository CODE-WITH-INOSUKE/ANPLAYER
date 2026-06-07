const express = require('express');
const router = express.Router();
const { query, get, run } = require('../db');

router.get('/settings', (req, res) => {
  const settings = {};
  const rows = query('SELECT * FROM settings');
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  const downloads = query(`SELECT d.*, s.title, s.artist FROM downloads d
    LEFT JOIN songs s ON d.song_id = s.id
    ORDER BY d.date_added DESC LIMIT 20`);

  res.render('settings', { settings, downloads, title: 'Settings - ANPlayer' });
});

router.post('/settings/update', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', { key, value });
  }
  res.redirect('/settings');
});

router.post('/settings/clear-history', (req, res) => {
  run('DELETE FROM playback_history');
  res.redirect('/settings');
});

router.post('/settings/refresh-library', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const downloadPath = get('SELECT value FROM settings WHERE key = ?', { key: 'download_path' });
  const dir = downloadPath ? downloadPath.value : 'data/downloads';

  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.ogg') || f.endsWith('.flac') || f.endsWith('.opus'));
    for (const file of files) {
      const existing = get('SELECT * FROM songs WHERE path = ?', { path: path.join(dir, file) });
      if (!existing) {
        const name = path.basename(file, path.extname(file));
        const parts = name.split(' - ');
        const title = parts.length > 1 ? parts.slice(1).join(' - ') : name;
        const artist = parts.length > 1 ? parts[0] : 'Unknown';
        run('INSERT INTO songs (title, artist, path, is_downloaded, source, format) VALUES (?, ?, ?, ?, ?, ?)',
          { title, artist, path: path.join(dir, file), is_downloaded: 1, source: 'local', format: path.extname(file).slice(1) });
      }
    }
  }
  res.redirect('/settings');
});

router.post('/settings/reset', (req, res) => {
  run('DELETE FROM settings');
  const defaults = [
    ['theme', 'amoled'],
    ['gapless', '1'],
    ['crossfade', '0'],
    ['crossfade_duration', '3'],
    ['download_path', 'data/downloads'],
    ['download_quality', '128'],
    ['download_format', 'mp3'],
    ['volume', '80'],
    ['playback_speed', '1.0'],
    ['audio_normalization', '1'],
    ['lyrics_enabled', '1'],
    ['visualizer', 'spectrum'],
    ['dock_auto_hide', '1'],
    ['screen_wake_lock', '1'],
  ];
  for (const [k, v] of defaults) run('INSERT INTO settings (key, value) VALUES (?, ?)', { key: k, value: v });
  res.redirect('/settings');
});

module.exports = router;
