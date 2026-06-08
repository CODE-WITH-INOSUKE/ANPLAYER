const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { run, query, get } = require('../db');

const emitter = new EventEmitter();
let activeDownloads = {};
let downloadQueue = [];

function startDownload(songId, url, format = 'mp3', quality = '128') {
  return new Promise((resolve, reject) => {
    const downloadPath = get('SELECT value FROM settings WHERE key = ?', { key: 'download_path' });
    const basePath = downloadPath ? downloadPath.value : 'data/downloads';
    const fullPath = path.resolve(basePath);

    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    const song = get('SELECT * FROM songs WHERE id = ?', { id: songId });
    if (!song) return reject(new Error('Song not found'));

    const dl = run('INSERT INTO downloads (song_id, url, format, quality, status) VALUES (?, ?, ?, ?, ?)',
      { song_id: songId, url, format, quality, status: 'downloading' });

    const dlId = dl.lastInsertRowid;

    const extMap = { mp3: 'mp3', m4a: 'm4a', opus: 'opus', flac: 'flac', ogg: 'ogg' };
    const ext = extMap[format] || 'mp3';
    const outputTemplate = path.join(fullPath, '%(title)s.%(ext)s');

    const ytArgs = [
      url,
      '-f', 'bestaudio/best',
      '--extract-audio',
      '--audio-format', format,
      '--audio-quality', quality,
      '-o', outputTemplate,
      '--no-warnings',
      '--newline',
      '--progress',
      '--print', 'after_move:filepath',
    ];

    const yt = spawn('yt-dlp', ytArgs);
    let lastProgress = 0;
    let finalPath = '';

    yt.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (!line) return;

      // Try to parse progress
      const pctMatch = line.match(/([\d.]+)%/);
      if (pctMatch) {
        lastProgress = parseFloat(pctMatch[1]);
        run('UPDATE downloads SET progress = ? WHERE id = ?', { progress: lastProgress, id: dlId });
        emitter.emit('progress', { id: dlId, songId, progress: lastProgress, status: 'downloading' });
        return;
      }

      // The --print after_move:filepath output is the last line on success
      if (line.startsWith('/') || (line.length > 10 && line.includes('.'))) {
        finalPath = line;
      }
    });

    yt.stderr.on('data', () => {});

    yt.on('close', (code) => {
      if (code === 0) {
        const resolvedPath = finalPath || findOutputFile(fullPath, song.title, ext);
        run('UPDATE downloads SET status = ?, progress = 100, file_path = ?, date_completed = CURRENT_TIMESTAMP WHERE id = ?',
          { status: 'completed', file_path: resolvedPath, id: dlId });
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          const stats = fs.statSync(resolvedPath);
          run('UPDATE songs SET is_downloaded = 1, path = ?, file_size = ?, format = ? WHERE id = ?',
            { path: resolvedPath, file_size: stats.size, format: ext, id: songId });
        } else {
          run('UPDATE songs SET is_downloaded = 1, path = ? WHERE id = ?',
            { path: resolvedPath || fullPath, id: songId });
        }
        delete activeDownloads[dlId];
        emitter.emit('progress', { id: dlId, songId, progress: 100, status: 'completed', file_path: resolvedPath });
        processNext();
        resolve({ id: dlId, status: 'completed', file_path: resolvedPath });
      } else {
        run('UPDATE downloads SET status = ? WHERE id = ?', { status: 'failed', id: dlId });
        delete activeDownloads[dlId];
        emitter.emit('progress', { id: dlId, songId, progress: lastProgress, status: 'failed' });
        processNext();
        reject(new Error('Download failed'));
      }
    });

    yt.on('error', (err) => {
      run('UPDATE downloads SET status = ? WHERE id = ?', { status: 'failed', id: dlId });
      delete activeDownloads[dlId];
      emitter.emit('progress', { id: dlId, songId, progress: 0, status: 'failed' });
      processNext();
      reject(err);
    });

    activeDownloads[dlId] = { process: yt, id: dlId, songId, url, format, quality };
    emitter.emit('progress', { id: dlId, songId, progress: 0, status: 'downloading' });
  });
}

function findOutputFile(dir, title, ext) {
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir);
  const match = files.find(f => f.toLowerCase().includes(title.toLowerCase()) && f.endsWith('.' + ext));
  return match ? path.join(dir, match) : '';
}

function processNext() {
  if (downloadQueue.length > 0 && Object.keys(activeDownloads).length < 3) {
    const next = downloadQueue.shift();
    startDownload(next.songId, next.url, next.format, next.quality).catch(() => {});
  }
}

function queueDownload(songId, url, format = 'mp3', quality = '128') {
  downloadQueue.push({ songId, url, format, quality });
  processNext();
}

function cancelDownload(dlId) {
  if (activeDownloads[dlId]) {
    try { activeDownloads[dlId].process.kill(); } catch(e) {}
    delete activeDownloads[dlId];
    run('UPDATE downloads SET status = ? WHERE id = ?', { status: 'cancelled', id: dlId });
    emitter.emit('progress', { id: dlId, progress: 0, status: 'cancelled' });
  }
}

function getDownloads() {
  return query(`SELECT d.*, s.title, s.artist, s.artwork
    FROM downloads d
    LEFT JOIN songs s ON d.song_id = s.id
    ORDER BY d.date_added DESC`);
}

function getActiveDownloads() {
  return query(`SELECT d.*, s.title, s.artist, s.artwork
    FROM downloads d
    LEFT JOIN songs s ON d.song_id = s.id
    WHERE d.status IN ('downloading', 'pending')
    ORDER BY d.date_added DESC`);
}

function getDownloadProgress(dlId) {
  return get('SELECT * FROM downloads WHERE id = ?', { id: dlId });
}

module.exports = { startDownload, queueDownload, cancelDownload, getDownloads, getActiveDownloads, getDownloadProgress, emitter };
