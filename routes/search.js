const express = require('express');
const router = express.Router();
const { query, get, run } = require('../db');
const searchEngine = require('../engine/search');

router.get('/search', (req, res) => {
  const q = req.query.q || '';
  const type = req.query.type || 'all';
  const recentSearches = query('SELECT DISTINCT query, type FROM search_history ORDER BY date_searched DESC LIMIT 10');
  res.render('search', { query: q, type, results: { songs: [], albums: [], artists: [], playlists: [] }, recentSearches, title: 'Search - ANPlayer' });
});

router.get('/search/results', async (req, res) => {
  const q = req.query.q || '';
  const type = req.query.type || 'all';

  if (!q.trim()) {
    return res.json({ songs: [], albums: [], artists: [], playlists: [] });
  }

  try {
    const results = await searchEngine.searchYouTube(q, type);
    if (q.trim()) searchEngine.saveSearchHistory(q, type);
    res.json(results);
  } catch (e) {
    res.json({ songs: [], albums: [], artists: [], playlists: [] });
  }
});

router.post('/search/save', (req, res) => {
  const { query: q, type } = req.body;
  if (q) {
    searchEngine.saveSearchHistory(q, type || 'all');
  }
  res.json({ success: true });
});

router.get('/search/history', (req, res) => {
  const history = query('SELECT DISTINCT query, type FROM search_history ORDER BY date_searched DESC LIMIT 10');
  res.json(history);
});

router.post('/search/history/clear', (req, res) => {
  run('DELETE FROM search_history');
  res.json({ success: true });
});

module.exports = router;
