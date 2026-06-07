const { spawn } = require('child_process');
const { run, query, get } = require('../db');

const SPAWN_TIMEOUT = 15000;

function spawnYtDlp(args) {
  return new Promise((resolve, reject) => {
    const yt = spawn('yt-dlp', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      yt.kill('SIGKILL');
      reject(new Error('yt-dlp timed out'));
    }, SPAWN_TIMEOUT);

    yt.stdout.on('data', (d) => { stdout += d.toString(); });
    yt.stderr.on('data', (d) => { stderr += d.toString(); });

    yt.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim().split('\n').filter(l => l.trim()));
      } else if (stdout.trim()) {
        resolve(stdout.trim().split('\n').filter(l => l.trim()));
      } else {
        reject(new Error(stderr.trim() || 'No output from yt-dlp'));
      }
    });

    yt.on('error', (err) => {
      clearTimeout(timer);
      if (!killed) reject(err);
    });
  });
}

function parseSong(item) {
  return {
    title: item.title || 'Unknown',
    artist: item.artist || item.uploader || item.channel || 'Unknown',
    album: item.album || item.playlist_title || '',
    duration: item.duration || 0,
    artwork: item.thumbnail || '',
    youtube_id: item.id || '',
    source: 'youtube',
    url: item.webpage_url || `https://youtube.com/watch?v=${item.id}`,
  };
}

async function searchYouTube(query_str, type = 'all') {
  const results = { songs: [], albums: [], artists: [], playlists: [] };

  try {
    const lines = await spawnYtDlp([
      `ytsearch10:${query_str}`,
      '--dump-json',
      '--no-warnings',
      '--flat-playlist',
      '--extract-flat',
      '--skip-download',
    ]);

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        const song = parseSong(item);
        results.songs.push(song);

        if (item.playlist_title) {
          results.albums.push({
            title: item.playlist_title,
            artist: item.artist || item.uploader || 'Unknown',
            artwork: item.thumbnail || '',
            song_count: item.playlist_count || 0,
          });
        }
      } catch(e) {}
    }
  } catch(e) {}

  if (type === 'album' || type === 'all') {
    try {
      const albumLines = await spawnYtDlp([
        `ytsearch5:${query_str} album`,
        '--dump-json',
        '--no-warnings',
        '--flat-playlist',
        '--skip-download',
      ]);

      for (const line of albumLines) {
        try {
          const item = JSON.parse(line);
          if (item.playlist_title) {
            results.albums.push({
              title: item.playlist_title,
              artist: item.artist || item.uploader || 'Unknown',
              artwork: item.thumbnail || '',
              song_count: item.playlist_count || 0,
            });
          }
        } catch(e) {}
      }
    } catch(e) {}
  }

  return results;
}

function getSongInfo(url) {
  return new Promise((resolve, reject) => {
    const yt = spawn('yt-dlp', [
      url,
      '--dump-json',
      '--no-warnings',
      '--skip-download',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      yt.kill('SIGKILL');
      reject(new Error('yt-dlp timed out'));
    }, SPAWN_TIMEOUT);

    yt.stdout.on('data', (d) => { stdout += d.toString(); });
    yt.on('close', () => {
      clearTimeout(timer);
      if (killed) return;
      try {
        const data = JSON.parse(stdout.trim());
        resolve({
          title: data.title || 'Unknown',
          artist: data.artist || data.uploader || 'Unknown',
          album: data.album || '',
          duration: data.duration || 0,
          artwork: data.thumbnail || '',
          youtube_id: data.id || '',
          url: data.webpage_url || url,
          formats: data.formats || [],
        });
      } catch(e) { reject(e); }
    });
    yt.on('error', (err) => { clearTimeout(timer); if (!killed) reject(err); });
  });
}

function getAudioUrl(youtubeId) {
  return new Promise((resolve, reject) => {
    const url = `https://youtube.com/watch?v=${youtubeId}`;
    const yt = spawn('yt-dlp', [
      url,
      '-f', 'bestaudio/best',
      '--get-url',
      '--no-warnings',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      yt.kill('SIGKILL');
      reject(new Error('yt-dlp timed out getting audio URL'));
    }, SPAWN_TIMEOUT);

    yt.stdout.on('data', (d) => { stdout += d.toString(); });
    yt.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim().split('\n')[0]);
      } else if (stdout.trim()) {
        resolve(stdout.trim().split('\n')[0]);
      } else {
        reject(new Error('No audio URL found'));
      }
    });
    yt.on('error', (err) => { clearTimeout(timer); if (!killed) reject(err); });
  });
}

function saveSearchHistory(query_str, type = 'all') {
  try {
    run('INSERT INTO search_history (query, type) VALUES (?, ?)', { query: query_str, type });
  } catch(e) {}
}

function getSearchHistory(limit = 10) {
  try {
    return query('SELECT * FROM search_history ORDER BY date_searched DESC LIMIT ?', { limit });
  } catch(e) { return []; }
}

module.exports = { searchYouTube, getSongInfo, getAudioUrl, saveSearchHistory, getSearchHistory };
