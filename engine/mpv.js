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
const SOCKET_PATH = path.join(__dirname, '..', 'data', 'mpv.sock');
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let cmdIdCounter = 0;
let pendingCommands = new Map();

function checkMpv() {
  return new Promise((resolve) => {
    const proc = spawn('mpv', ['--version'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => resolve(false));
    setTimeout(() => { proc.kill(); resolve(false); }, 3000);
  });
}

function start() {
  checkMpv().then((found) => {
    if (!found) {
      console.error('mpv not found in PATH. Install mpv and ensure it is accessible.');
      return;
    }
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
      '--audio-buffer=2',
      '--volume=80',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });

    mpvProcess.on('exit', (code) => {
      mpvProcess = null;
      currentSong = null;
      playbackState = { playing: false, position: 0, duration: 0, paused: false };
      if (code !== 0) {
        setTimeout(start, 2000);
      }
    });

    mpvProcess.on('error', (err) => {
      console.error('MPV Error:', err.message);
      mpvProcess = null;
    });

    mpvProcess.stderr.on('data', () => {});

    setTimeout(() => connectSocket(SOCKET_PATH), 1000);
  });
}

function connectSocket(socketPath) {
  if (socketClient) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

  socketClient = net.createConnection(socketPath, () => {
    reconnectAttempts = 0;
    observeProperties();
    loadSavedVolume();
  });

  let buf = '';
  socketClient.on('data', (data) => {
    buf += data.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.trim()) handleResponse(line.trim());
    }
  });

  socketClient.on('error', () => {
    socketClient = null;
  });

  socketClient.on('close', () => {
    socketClient = null;
    reconnectAttempts++;
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(() => connectSocket(socketPath), 1000 * Math.min(reconnectAttempts, 5));
    }
  });
}

function sendCommand(cmd) {
  return new Promise((resolve) => {
    if (!socketClient) return resolve({ error: 'not connected' });
    cmdIdCounter++;
    const id = cmdIdCounter;
    const req = JSON.stringify({ command: cmd, request_id: id }) + '\n';

    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      resolve({});
    }, 3000);

    pendingCommands.set(id, { resolve, timer });
    socketClient.write(req);
  });
}

function handleResponse(line) {
  try {
    const data = JSON.parse(line);
    if (data.request_id && pendingCommands.has(data.request_id)) {
      const entry = pendingCommands.get(data.request_id);
      clearTimeout(entry.timer);
      pendingCommands.delete(data.request_id);
      entry.resolve(data);
      return;
    }
    handleEvent(data);
  } catch(e) {}
}

function observeProperties() {
  sendCommand(['observe_property', 1, 'time-pos']);
  sendCommand(['observe_property', 2, 'duration']);
  sendCommand(['observe_property', 3, 'pause']);
  sendCommand(['observe_property', 4, 'filename']);
  sendCommand(['observe_property', 5, 'media-title']);
  sendCommand(['observe_property', 6, 'volume']);
}

function loadSavedVolume() {
  try {
    const setting = get('SELECT value FROM settings WHERE key = ?', { key: 'volume' });
    if (setting && setting.value) {
      setVolume(parseInt(setting.value) || 80);
    }
  } catch(e) {}
}

function handleEvent(data) {
  try {
    if (data.event === 'property-change') {
      const { name, data: value } = data;
      switch(name) {
        case 'time-pos': playbackState.position = value || 0; break;
        case 'duration': playbackState.duration = value || 0; break;
        case 'pause':
          playbackState.paused = value;
          playbackState.playing = !value;
          break;
        case 'volume': break;
      }
      emit('state', { ...playbackState, song: currentSong });
    }
    if (data.event === 'end-file') {
      emit('ended', { reason: data.reason });
      if (data.reason === 'eof') {
        setTimeout(() => emit('next', {}), 300);
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
  if (!url) return;
  currentSong = song;
  playbackState.position = 0;
  playbackState.duration = 0;
  if (!mpvProcess) start();
  sendCommand(['loadfile', url, 'replace']);
  if (song && song.id) {
    try {
      run('UPDATE songs SET last_played = CURRENT_TIMESTAMP, play_count = play_count + 1 WHERE id = ?', { id: song.id });
      run('INSERT INTO playback_history (song_id) VALUES (?)', { song_id: song.id });
    } catch(e) {}
  }
}

function play() { sendCommand(['set_property', 'pause', false]); }
function pause() { sendCommand(['set_property', 'pause', true]); }
function togglePlay() { sendCommand(['cycle', 'pause']); }
function stop() {
  sendCommand(['stop']);
  currentSong = null;
  playbackState = { playing: false, position: 0, duration: 0, paused: false };
}
function seek(seconds) { sendCommand(['seek', seconds, 'absolute']); }
function seekRelative(seconds) { sendCommand(['seek', seconds, 'relative']); }
function setVolume(vol) {
  const v = Math.max(0, Math.min(100, parseInt(vol) || 80));
  sendCommand(['set_property', 'volume', v]);
  try { run('UPDATE settings SET value = ? WHERE key = ?', { value: String(v), key: 'volume' }); } catch(e) {}
}
function setSpeed(speed) {
  const s = parseFloat(speed) || 1.0;
  sendCommand(['set_property', 'speed', s]);
  try { run('UPDATE settings SET value = ? WHERE key = ?', { value: String(s), key: 'playback_speed' }); } catch(e) {}
}
function getVolume() {
  return new Promise((resolve) => {
    sendCommand(['get_property', 'volume']).then(r => resolve(r.data)).catch(() => resolve(80));
  });
}
function getState() {
  const hasSong = currentSong !== null && currentSong !== undefined;
  return {
    playing: hasSong ? playbackState.playing : false,
    paused: hasSong ? playbackState.paused : true,
    position: playbackState.position || 0,
    duration: playbackState.duration || 0,
    song: currentSong
  };
}
function getCurrentSong() { return currentSong; }
function on(event, cb) { eventListeners.push({ event, cb }); }
function emit(event, data) {
  for (const l of eventListeners) {
    if (l.event === event) {
      try { l.cb(data); } catch(e) {}
    }
  }
}

function quit() {
  if (socketClient) {
    sendCommand(['quit']);
    try { socketClient.end(); } catch(e) {}
  }
  if (mpvProcess) {
    setTimeout(() => {
      if (mpvProcess) { try { mpvProcess.kill('SIGTERM'); } catch(e) {} }
    }, 500);
  }
}

module.exports = { start, load, play, pause, togglePlay, stop, seek, seekRelative, setVolume, setSpeed, getVolume, getState, getCurrentSong, on, emit, quit, sendCommand };
