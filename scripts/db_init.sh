#!/data/data/com.termux/files/usr/bin/bash
sqlite3 ../data/music.db <<EOF
CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'Unknown',
  album TEXT DEFAULT 'Unknown',
  album_artist TEXT DEFAULT '',
  track_number INTEGER DEFAULT 0,
  duration REAL DEFAULT 0,
  year INTEGER DEFAULT 0,
  genre TEXT DEFAULT '',
  artwork TEXT DEFAULT '',
  path TEXT DEFAULT '',
  youtube_id TEXT DEFAULT '',
  source TEXT DEFAULT 'youtube',
  file_size INTEGER DEFAULT 0,
  format TEXT DEFAULT '',
  bitrate INTEGER DEFAULT 0,
  sample_rate INTEGER DEFAULT 0,
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_played DATETIME,
  play_count INTEGER DEFAULT 0,
  is_downloaded INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'Unknown',
  artwork TEXT DEFAULT '',
  year INTEGER DEFAULT 0,
  song_count INTEGER DEFAULT 0,
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  artwork TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  song_count INTEGER DEFAULT 0,
  album_count INTEGER DEFAULT 0,
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  artwork TEXT DEFAULT '',
  song_count INTEGER DEFAULT 0,
  is_offline INTEGER DEFAULT 0,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_modified DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  song_id INTEGER NOT NULL,
  position INTEGER DEFAULT 0,
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL,
  position INTEGER DEFAULT 0,
  added_by TEXT DEFAULT 'user',
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playback_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_played REAL DEFAULT 0,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL UNIQUE,
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress REAL DEFAULT 0,
  speed TEXT DEFAULT '',
  eta TEXT DEFAULT '',
  file_path TEXT DEFAULT '',
  format TEXT DEFAULT 'mp3',
  quality TEXT DEFAULT '128',
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_completed DATETIME,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  type TEXT DEFAULT 'all',
  date_searched DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('theme', 'amoled'),
  ('gapless', '1'),
  ('crossfade', '0'),
  ('crossfade_duration', '3'),
  ('download_path', 'data/downloads'),
  ('download_quality', '128'),
  ('download_format', 'mp3'),
  ('volume', '80'),
  ('playback_speed', '1.0'),
  ('audio_normalization', '1'),
  ('lyrics_enabled', '1'),
  ('visualizer', 'spectrum'),
  ('dock_auto_hide', '1'),
  ('screen_wake_lock', '1');

CREATE TABLE IF NOT EXISTS cached_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT NOT NULL UNIQUE,
  data TEXT DEFAULT '{}',
  date_cached DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS album_songs (
  album_id INTEGER NOT NULL,
  song_id INTEGER NOT NULL,
  PRIMARY KEY (album_id, song_id),
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artist_songs (
  artist_id INTEGER NOT NULL,
  song_id INTEGER NOT NULL,
  PRIMARY KEY (artist_id, song_id),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artist_albums (
  artist_id INTEGER NOT NULL,
  album_id INTEGER NOT NULL,
  PRIMARY KEY (artist_id, album_id),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);
EOF
echo "Database initialized."
