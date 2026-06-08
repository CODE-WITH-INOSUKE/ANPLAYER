const express = require('express');
const router = express.Router();
const { query, get } = require('../db');

router.get('/now-playing', (req, res) => {
  const queue = query(`SELECT q.*, s.title, s.artist, s.album, s.duration, s.artwork, s.youtube_id
    FROM queue q JOIN songs s ON q.song_id = s.id ORDER BY q.position`);

  const recentSearches = query('SELECT DISTINCT query FROM search_history ORDER BY date_searched DESC LIMIT 5');

  res.render('nowplaying', {
    queue,
    queueCount: queue.length,
    recentSearches,
    title: 'Now Playing - ANPlayer'
  });
});

router.get('/dock', (req, res) => {
  res.render('dock', { title: 'Dock Mode - ANPlayer' });
});

router.get('/ambient', (req, res) => {
  res.render('ambient', { title: 'Ambient Mode - ANPlayer' });
});

module.exports = router;
