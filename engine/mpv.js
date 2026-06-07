const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { get, run } = require('../db');

let mpvProcess = null;
let socketClient = null;
let currentSong = null;
let playbackState = { playing: false, position: 0, duration: 0, paused: false };
let eventListeners = [];
const SOCKET_PATH = '/tmp/anplayer-mpv.sock';

function start() {
  if (mpvProcess) return;
  try { if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH); } catch(e) {}

  mpvProcess = spawn('mpv', [
    '--idle',
    '--no-video',
    `--input-ipc-server=${SOCKET_PATH}`,
    '--audio-display=no',
    '--keep-open=yes',
    '--term-status-msg=no',
    '--save-position-on-quit=no',
    '--demuxer-max-bytes=10M',
    '--demuxer-max-back-bytes=2M',
    '--cache=yes',
    '--cache-secs=30',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
  });

  mpvProcess.on('exit', () => {
    mpvProcess = null;
    currentSong = null;
    playbackState = { playing: false, position: 0, duration: 0, paused: false };
  });

  mpvProcess.on('error', (err) => {
    console.error('MPV Error:', err.message);
    mpvProcess = null;
  });

  setTimeout(connectSocket, 500);
}

function connectSocket() {
  if (socketClient) return;
  socketClient = net.createConnection(SOCKET_PATH, () => {
    observeProperties();
  });
  let buf = '';
  socketClient.on('data', (data) => {
    buf += data.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.trim()) handleEvent(line.trim());
    }
  });
  socketClient.on('error', () => {});
  socketClient.on('close', () => {
    socketClient = null;
    setTimeout(connectSocket, 1000);
  });
}

function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    if (!socketClient) return reject(new Error('Not connected'));
    const id = Date.now() + Math.random();
    const req = JSON.stringify({ command: cmd, request_id: id }) + '\n';
    const onData = (data) => {
      let str = data.toString();
      try {
        const parsed = JSON.parse(str);
        if (parsed.request_id === id) {
          socketClient.removeListener('data', onData);
          resolve(parsed);
        }
      } catch(e) {
        if (str.includes(JSON.stringify(id))) {
          socketClient.removeListener('data', onData);
          try {
            const lines = str.split('\n').filter(l => l.trim());
            for (const line of lines) {
              const p = JSON.parse(line);
              if (p.request_id === id) resolve(p);
            }
          } catch(e2) { resolve({}); }
        }
      }
    };
    socketClient.on('data', onData);
    socketClient.write(req);
    setTimeout(() => { socketClient.removeListener('data', onData); resolve({}); }, 5000);
  });
}

function observeProperties() {
  sendCommand(['observe_property', 1, 'time-pos']).catch(() => {});
  sendCommand(['observe_property', 2, 'duration']).catch(() => {});
  sendCommand(['observe_property', 3, 'pause']).catch(() => {});
  sendCommand(['observe_property', 4, 'filename']).catch(() => {});
  sendCommand(['observe_property', 5, 'media-title']).catch(() => {});
  sendCommand(['observe_property', 6, 'volume']).catch(() => {});
}

function handleEvent(line) {
  try {
    const data = JSON.parse(line);
    if (data.event === 'property-change') {
      const { name, data: value } = data;
      switch(name) {
        case 'time-pos': playbackState.position = value || 0; break;
        case 'duration': playbackState.duration = value || 0; break;
        case 'pause': playbackState.paused = value; playbackState.playing = !value; break;
        case 'volume': break;
      }
      emit('state', { ...playbackState, song: currentSong });
    }
    if (data.event === 'end-file') {
      emit('ended', { reason: data.reason });
      if (data.reason !== 'stop') {
        emit('next', {});
      }
    }
    if (data.event === 'start-file') {
      playbackState.position = 0;
      emit('started', {});
    }
    if (data.event === 'file-loaded') {
      emit('loaded', {});
    }
  } catch(e) {}
}

function load(url, song = null) {
  currentSong = song;
  playbackState.position = 0;
  if (!mpvProcess) start();
  sendCommand(['loadfile', url, 'replace']).catch(() => {});
  if (song) {
    run('UPDATE songs SET last_played = CURRENT_TIMESTAMP, play_count = play_count + 1 WHERE id = ?', { id: song.id || song.song_id });
    run('INSERT INTO playback_history (song_id) VALUES (?)', { song_id: song.id || song.song_id });
  }
}

function play() { sendCommand(['set_property', 'pause', false]).catch(() => {}); }
function pause() { sendCommand(['set_property', 'pause', true]).catch(() => {}); }
function togglePlay() { sendCommand(['cycle', 'pause']).catch(() => {}); }
function stop() { sendCommand(['stop']).catch(() => {}); currentSong = null; playbackState = { playing: false, position: 0, duration: 0, paused: false }; }
function seek(seconds) { sendCommand(['seek', seconds, 'absolute']).catch(() => {}); }
function seekRelative(seconds) { sendCommand(['seek', seconds, 'relative']).catch(() => {}); }
function setVolume(vol) { sendCommand(['set_property', 'volume', Math.max(0, Math.min(100, vol))]).catch(() => {}); }
function setSpeed(speed) { sendCommand(['set_property', 'speed', speed || 1.0]).catch(() => {}); }
function getVolume() { return new Promise((resolve) => { sendCommand(['get_property', 'volume']).then(r => resolve(r.data)).catch(() => resolve(80)); }); }
function getState() {
  const hasSong = currentSong !== null && currentSong !== undefined;
  return {
    playing: hasSong ? playbackState.playing : false,
    paused: hasSong ? playbackState.paused : true,
    position: playbackState.position,
    duration: playbackState.duration,
    song: currentSong
  };
}
function getCurrentSong() { return currentSong; }
function on(event, cb) { eventListeners.push({ event, cb }); }
function emit(event, data) { for (const l of eventListeners) { if (l.event === event) l.cb(data); } }

function quit() {
  if (socketClient) { try { socketClient.end(); } catch(e) {} }
  if (mpvProcess) {
    sendCommand(['quit']).catch(() => {});
    setTimeout(() => { if (mpvProcess) { mpvProcess.kill(); } }, 1000);
  }
}

module.exports = { start, load, play, pause, togglePlay, stop, seek, seekRelative, setVolume, setSpeed, getVolume, getState, getCurrentSong, on, emit, quit, sendCommand };
