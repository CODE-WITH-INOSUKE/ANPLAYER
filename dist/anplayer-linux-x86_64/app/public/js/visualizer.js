// ANPlayer - Audio Visualizer
// Generates synthetic visualization based on playback state

let vizAnimId = null;
let vizAnalyser = null;
let vizAudioData = null;

// Generate synthetic audio data for visualization
function getSyntheticData(bars = 64) {
  const data = new Uint8Array(bars);
  const now = Date.now() / 1000;
  for (let i = 0; i < bars; i++) {
    const freq = (i / bars) * Math.PI * 8;
    const val = Math.sin(freq + now * 3) * 0.5
      + Math.sin(freq * 2 + now * 2) * 0.3
      + Math.sin(freq * 0.5 + now * 5) * 0.2;
    data[i] = Math.max(0, Math.min(255, (val + 1) * 128));
  }
  return data;
}

function startVisualizer(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;

  function resize() {
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth * (window.devicePixelRatio || 1);
      canvas.height = parent.clientHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      width = parent.clientWidth;
      height = parent.clientHeight;
    }
  }

  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, width, height);

    const isPlaying = currentState?.playing || false;
    if (!isPlaying) {
      vizAnimId = requestAnimationFrame(draw);
      return;
    }

    const data = getSyntheticData(64);
    const barWidth = width / data.length;
    const centerY = height / 2;

    // Draw spectrum bars from center
    for (let i = 0; i < data.length; i++) {
      const val = data[i] / 255;
      const barHeight = val * height * 0.8;
      const x = i * barWidth;
      const y = centerY - barHeight / 2;

      ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + val * 0.4})`;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    }

    vizAnimId = requestAnimationFrame(draw);
  }

  draw();
}

function startCircularVisualizer(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;

  function resize() {
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth * (window.devicePixelRatio || 1);
      canvas.height = parent.clientHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      width = parent.clientWidth;
      height = parent.clientHeight;
    }
  }

  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, width, height);

    const isPlaying = currentState?.playing || false;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.3;

    const data = getSyntheticData(32);
    const angleStep = (Math.PI * 2) / data.length;

    ctx.beginPath();
    for (let i = 0; i <= data.length; i++) {
      const idx = i % data.length;
      const val = data[idx] / 255;
      const r = radius + val * radius * 0.5;
      const angle = i * angleStep - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    if (isPlaying) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();
    }
    ctx.strokeStyle = isPlaying ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();

    vizAnimId = requestAnimationFrame(draw);
  }

  draw();
}

function stopVisualizer() {
  if (vizAnimId) {
    cancelAnimationFrame(vizAnimId);
    vizAnimId = null;
  }
}

// Auto-start visualizers
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('visualizerCanvas');
  if (canvas) startVisualizer('visualizerCanvas');

  const dockCanvas = document.getElementById('dockVisualizerCanvas');
  if (dockCanvas) startCircularVisualizer('dockVisualizerCanvas');
});
