const express = require('express');
const router = express.Router();
const { query, get } = require('../db');

router.get('/library', (req, res) => {
  const section = req.query.section || 'songs';
  let items = [];
  let title = 'Library';

  switch(section) {
    case 'songs':
      items = query('SELECT * FROM songs ORDER BY artist, title');
      title = 'Songs - ANPlayer';
      break;
    case 'artists':
      items = query('SELECT * FROM artists ORDER BY name');
      title = 'Artists - ANPlayer';
      break;
    case 'albums':
      items = query('SELECT * FROM albums ORDER BY artist, title');
      title = 'Albums - ANPlayer';
      break;
    case 'favorites':
      items = query(`SELECT s.* FROM favorites f JOIN songs s ON f.song_id = s.id ORDER BY f.date_added DESC`);
      title = 'Favorites - ANPlayer';
      break;
    case 'downloads':
      items = query('SELECT * FROM songs WHERE is_downloaded = 1 ORDER BY date_added DESC');
      title = 'Downloads - ANPlayer';
      break;
    case 'playlists':
      items = query('SELECT * FROM playlists ORDER BY date_modified DESC');
      title = 'Playlists - ANPlayer';
      break;
    case 'recent':
      items = query(`SELECT s.*, MAX(ph.played_at) as last_played FROM playback_history ph
        JOIN songs s ON ph.song_id = s.id
        GROUP BY s.id ORDER BY last_played DESC LIMIT 50`);
      title = 'Recently Played - ANPlayer';
      break;
    case 'most':
      items = query('SELECT * FROM songs ORDER BY play_count DESC LIMIT 50');
      title = 'Most Played - ANPlayer';
      break;
    default:
      items = query('SELECT * FROM songs ORDER BY artist, title');
  }

  const recentSearches = query('SELECT DISTINCT query FROM search_history ORDER BY date_searched DESC LIMIT 5');

  res.render('library', {
    section,
    items,
    recentSearches,
    queueCount: query('SELECT COUNT(*) as count FROM queue')[0]?.count || 0,
    title
  });
});

router.get('/library/artists/:id', (req, res) => {
  const artist = get('SELECT * FROM artists WHERE id = ?', { id: req.params.id });
  if (!artist) return res.redirect('/library?section=artists');
  const songs = query('SELECT s.* FROM songs s WHERE s.artist = ? ORDER BY s.album, s.track_number', { artist: artist.name });
  const albums = query('SELECT * FROM albums WHERE artist = ? ORDER BY year DESC', { artist: artist.name });
  res.render('artist', { artist, songs, albums, title: `${artist.name} - ANPlayer` });
});

router.get('/library/albums/:id', (req, res) => {
  const album = get('SELECT * FROM albums WHERE id = ?', { id: req.params.id });
  if (!album) return res.redirect('/library?section=albums');
  const songs = query('SELECT s.* FROM album_songs asp JOIN songs s ON asp.song_id = s.id WHERE asp.album_id = ? ORDER BY s.track_number', { album_id: album.id });
  if (songs.length === 0) {
    const altSongs = query('SELECT * FROM songs WHERE album = ? AND artist = ? ORDER BY track_number', { album: album.title, artist: album.artist });
    res.render('album', { album, songs: altSongs, title: `${album.title} - ANPlayer` });
  } else {
    res.render('album', { album, songs, title: `${album.title} - ANPlayer` });
  }
});

module.exports = router;
