const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'music.db');
let db = null;
let SQL = null;

async function getDb() {
  if (db) return db;
  SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  initSchema();
  return db;
}

function initSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS songs (
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
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT DEFAULT 'Unknown',
    artwork TEXT DEFAULT '',
    year INTEGER DEFAULT 0,
    song_count INTEGER DEFAULT 0,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    artwork TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    song_count INTEGER DEFAULT 0,
    album_count INTEGER DEFAULT 0,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    artwork TEXT DEFAULT '',
    song_count INTEGER DEFAULT 0,
    is_offline INTEGER DEFAULT 0,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modified DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS playlist_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    added_by TEXT DEFAULT 'user',
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS playback_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    duration_played REAL DEFAULT 0,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL UNIQUE,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS downloads (
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
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    type TEXT DEFAULT 'all',
    date_searched DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cached_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id TEXT NOT NULL UNIQUE,
    data TEXT DEFAULT '{}',
    date_cached DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS album_songs (
    album_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    PRIMARY KEY (album_id, song_id),
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS artist_songs (
    artist_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    PRIMARY KEY (artist_id, song_id),
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS artist_albums (
    artist_id INTEGER NOT NULL,
    album_id INTEGER NOT NULL,
    PRIMARY KEY (artist_id, album_id),
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
  )`);

  const count = db.exec('SELECT COUNT(*) as c FROM settings');
  const hasSettings = count.length > 0 && count[0].values.length > 0 && count[0].values[0][0] > 0;
  if (!hasSettings) {
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
    for (const [k, v] of defaults) {
      db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
  }
  save();
}

function save() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

// Convert object params with named placeholders (@key, :key, $key) to positional ?
function normalizeParams(sql, params) {
  if (!params || Array.isArray(params)) return { sql, bind: params || [] };
  const bind = [];
  // Replace named params with ? and collect values in order of appearance
  let idx = 0;
  const paramKeys = Object.keys(params);
  const paramMap = {};
  for (const k of paramKeys) {
    paramMap['@' + k] = k;
    paramMap[':' + k] = k;
    paramMap['$' + k] = k;
  }
  const converted = sql.replace(/[@:$]\w+/g, (match) => {
    const key = match.slice(1);
    if (key in params) {
      bind.push(params[key]);
      return '?';
    }
    return match;
  });
  return { sql: converted, bind };
}

function query(sql, params = []) {
  const { sql: sql2, bind } = normalizeParams(sql, params);
  const stmt = db.prepare(sql2);
  if (sql2.trim().toUpperCase().startsWith('SELECT') || sql2.trim().toUpperCase().startsWith('WITH')) {
    const rows = [];
    stmt.bind(bind);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }
  stmt.bind(bind);
  stmt.step();
  stmt.free();
  save();
  return [];
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function run(sql, params = []) {
  const { sql: sql2, bind } = normalizeParams(sql, params);
  db.run(sql2, bind);
  save();
  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
  return { lastInsertRowid: id };
}

function close() {
  if (db) { save(); db.close(); db = null; }
}

module.exports = { getDb, query, get, run, close, initSchema };
