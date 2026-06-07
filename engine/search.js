const { exec, spawn } = require('child_process');
const { run, query, get } = require('../db');

function searchYouTube(query_str, type = 'all') {
  return new Promise((resolve, reject) => {
    const searchTypes = type === 'all' ? ['song', 'album', 'artist', 'playlist'] : [type];
    const results = { songs: [], albums: [], artists: [], playlists: [] };

    let completed = 0;
    const total = type === 'all' ? 4 : 1;

    // Search songs
    const searchArgs = [
      'ytsearch5:' + query_str,
      '--dump-json',
      '--no-warnings',
      '--flat-playlist',
      '--extract-flat',
      '--skip-download',
    ];

    const yt = spawn('yt-dlp', searchArgs);
    let stdout = '';
    let stderr = '';

    yt.stdout.on('data', (d) => { stdout += d.toString(); });
    yt.stderr.on('data', (d) => { stderr += d.toString(); });
    yt.on('close', (code) => {
      const lines = stdout.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          const song = {
            title: item.title || 'Unknown',
            artist: item.artist || item.uploader || 'Unknown',
            album: item.album || item.playlist_title || 'Unknown',
            duration: item.duration || 0,
            artwork: item.thumbnail || '',
            youtube_id: item.id || '',
            source: 'youtube',
            url: item.webpage_url || `https://youtube.com/watch?v=${item.id}`,
          };
          if (item.playlist_title && type === 'album') {
            results.albums.push({
              title: item.playlist_title,
              artist: item.artist || item.uploader || 'Unknown',
              artwork: item.thumbnail || '',
              song_count: item.playlist_count || 0,
            });
          }
          results.songs.push(song);
        } catch(e) {}
      }

      if (type === 'album' || type === 'all') {
        const albumYt = spawn('yt-dlp', [
          'ytsearch5:' + query_str + ' album',
          '--dump-json',
          '--no-warnings',
          '--flat-playlist',
          '--skip-download',
        ]);
        let aStdout = '';
        albumYt.stdout.on('data', (d) => { aStdout += d.toString(); });
        albumYt.on('close', () => {
          const alines = aStdout.trim().split('\n').filter(l => l.trim());
          for (const line of alines) {
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
          completed++;
          if (completed >= total) resolve(results);
        });
      } else {
        completed++;
        if (completed >= total) resolve(results);
      }
    });
  });
}

function getSongInfo(url) {
  return new Promise((resolve, reject) => {
    const yt = spawn('yt-dlp', [
      url,
      '--dump-json',
      '--no-warnings',
      '--skip-download',
    ]);
    let stdout = '';
    yt.stdout.on('data', (d) => { stdout += d.toString(); });
    yt.on('close', () => {
      try {
        const data = JSON.parse(stdout.trim());
        resolve({
          title: data.title || 'Unknown',
          artist: data.artist || data.uploader || 'Unknown',
          album: data.album || 'Unknown',
          duration: data.duration || 0,
          artwork: data.thumbnail || '',
          youtube_id: data.id || '',
          url: data.webpage_url || url,
          formats: data.formats || [],
        });
      } catch(e) { reject(e); }
    });
    yt.on('error', reject);
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
    ]);
    let stdout = '';
    yt.stdout.on('data', (d) => { stdout += d.toString(); });
    yt.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim().split('\n')[0]);
      } else reject(new Error('No audio URL found'));
    });
    yt.on('error', reject);
  });
}

function saveSearchHistory(query_str, type = 'all') {
  run('INSERT INTO search_history (query, type) VALUES (?, ?)', { query: query_str, type });
}

function getSearchHistory(limit = 10) {
  return query('SELECT * FROM search_history ORDER BY date_searched DESC LIMIT ?', { limit });
}

module.exports = { searchYouTube, getSongInfo, getAudioUrl, saveSearchHistory, getSearchHistory };
