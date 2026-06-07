// ANPlayer - Ambient Mode

document.addEventListener('DOMContentLoaded', () => {
  updateAmbientClock();
  setInterval(updateAmbientClock, 1000);

  // Tap zone for play/pause is the whole container (handled by onclick on container)
  // Touch to show controls briefly
  let controlsTimer = null;
  const actions = document.querySelector('.ambient-actions');
  if (actions) {
    actions.style.opacity = '0';
    document.querySelector('.ambient-container').addEventListener('touchstart', () => {
      actions.style.opacity = '1';
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(() => { actions.style.opacity = '0'; }, 3000);
    });
  }
});

function updateAmbientClock() {
  const timeEl = document.getElementById('ambientTime');
  const dateEl = document.getElementById('ambientDate');
  if (!timeEl) return;
  const now = new Date();
  timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }
}
