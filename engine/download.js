const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { run, query, get } = require('../db');

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

    const dl = run('INSERT INTO downloads (song_id, url, format, quality, status) VALUES (?, ?, ?, ?, ?)',
      { song_id: songId, url, format, quality, status: 'downloading' });

    const dlId = dl.lastInsertRowid;

    const outputTemplate = path.join(fullPath, '%(title)s.%(ext)s');

    let ytArgs = [
      url,
      '-f', 'bestaudio/best',
      '--extract-audio',
      '--audio-format', format,
      '--audio-quality', quality,
      '-o', outputTemplate,
      '--no-warnings',
      '--newline',
      '--progress',
    ];

    const yt = spawn('yt-dlp', ytArgs);
    let lastProgress = 0;

    yt.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line.includes('%')) {
        const match = line.match(/([\d.]+)%/);
        if (match) {
          lastProgress = parseFloat(match[1]);
          run('UPDATE downloads SET progress = ?, speed = ?, eta = ? WHERE id = ?',
            { progress: lastProgress, speed: '', eta: '', id: dlId });
        }
      }
    });

    yt.stderr.on('data', (data) => {});

    yt.on('close', (code) => {
      if (code === 0) {
        run('UPDATE downloads SET status = ?, progress = 100, date_completed = CURRENT_TIMESTAMP WHERE id = ?',
          { status: 'completed', id: dlId });
        run('UPDATE songs SET is_downloaded = 1, path = ? WHERE id = ?',
          { path: fullPath, id: songId });
        delete activeDownloads[dlId];
        processNext();
        resolve({ id: dlId, status: 'completed' });
      } else {
        run('UPDATE downloads SET status = ? WHERE id = ?', { status: 'failed', id: dlId });
        delete activeDownloads[dlId];
        processNext();
        reject(new Error('Download failed'));
      }
    });

    yt.on('error', (err) => {
      run('UPDATE downloads SET status = ? WHERE id = ?', { status: 'failed', id: dlId });
      delete activeDownloads[dlId];
      processNext();
      reject(err);
    });

    activeDownloads[dlId] = { process: yt, id: dlId, songId, url, format, quality };
  });
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

module.exports = { startDownload, queueDownload, cancelDownload, getDownloads, getActiveDownloads, getDownloadProgress };
