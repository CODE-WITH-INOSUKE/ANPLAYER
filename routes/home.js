const express = require('express');
const router = express.Router();
const { query, get } = require('../db');

router.get('/', (req, res) => {
  const recentlyPlayed = query(`SELECT s.* FROM playback_history ph
    JOIN songs s ON ph.song_id = s.id
    GROUP BY s.id ORDER BY MAX(ph.played_at) DESC LIMIT 10`);

  const continueListening = query(`SELECT s.* FROM playback_history ph
    JOIN songs s ON ph.song_id = s.id
    GROUP BY s.id HAVING COUNT(ph.id) > 1
    ORDER BY MAX(ph.played_at) DESC LIMIT 10`);

  const downloads = query('SELECT * FROM songs WHERE is_downloaded = 1 ORDER BY date_added DESC LIMIT 10');

  const favorites = query(`SELECT s.* FROM favorites f
    JOIN songs s ON f.song_id = s.id
    ORDER BY f.date_added DESC LIMIT 10`);

  const trendingSongs = query('SELECT * FROM songs ORDER BY play_count DESC LIMIT 10');

  const albums = query('SELECT * FROM albums ORDER BY date_added DESC LIMIT 10');

  const playlists = query('SELECT * FROM playlists ORDER BY date_modified DESC LIMIT 10');

  const recentSearches = query('SELECT DISTINCT query FROM search_history ORDER BY date_searched DESC LIMIT 5');

  const currentQueue = query('SELECT COUNT(*) as count FROM queue');

  res.render('home', {
    recentlyPlayed,
    continueListening,
    downloads,
    favorites,
    trendingSongs,
    albums,
    playlists,
    recentSearches,
    queueCount: currentQueue[0]?.count || 0,
    title: 'ANPlayer'
  });
});

module.exports = router;
