// ANPlayer - Dock Mode

document.addEventListener('DOMContentLoaded', () => {
  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Fullscreen
  document.addEventListener('dblclick', toggleFullscreen);

  // Auto-hide
  const dockContainer = document.getElementById('dockContainer');
  let hideTimer = null;
  let isIdle = false;

  if (dockContainer) {
    dockContainer.addEventListener('mousemove', () => {
      dockContainer.classList.remove('auto-hide');
      isIdle = false;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        dockContainer.classList.add('auto-hide');
        isIdle = true;
      }, 3000);
    });

    dockContainer.addEventListener('touchstart', () => {
      if (isIdle) {
        dockContainer.classList.remove('auto-hide');
        isIdle = false;
        clearTimeout(hideTimer);
      } else {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          dockContainer.classList.add('auto-hide');
          isIdle = true;
        }, 4000);
      }
    });
  }

  // Fetch queue for dock display
  fetchQueueForDock();
  setInterval(fetchQueueForDock, 5000);
});

function updateClock() {
  const timeEl = document.getElementById('dockTime');
  const dateEl = document.getElementById('dockDate');
  if (!timeEl) return;
  const now = new Date();
  timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function toggleAmbient() {
  window.location.href = '/ambient';
}

function fetchQueueForDock() {
  fetch('/api/queue')
    .then(r => r.json())
    .then(queue => {
      const list = document.getElementById('dockQueueList');
      const count = document.getElementById('dockQueueCount');
      if (count) count.textContent = queue.length;
      if (!list) return;
      if (queue.length > 0) {
        const currentYoutubeId = currentState?.song?.youtube_id;
        list.innerHTML = queue.map((item, i) => `
          <div class="dock-queue-item ${item.youtube_id === currentYoutubeId ? 'current' : ''}">
            <div class="dock-queue-item-img">
              ${item.artwork ? `<img src="${item.artwork}" alt="" loading="lazy">` :
                `<div style="width:28px;height:28px;background:#111;border-radius:4px;display:flex;align-items:center;justify-content:center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                 </div>`}
            </div>
            <div class="dock-queue-item-info">
              <div class="dock-queue-item-title">${item.title || 'Unknown'}</div>
              <div class="dock-queue-item-artist">${item.artist || ''}</div>
            </div>
          </div>
        `).join('');
      } else {
        list.innerHTML = '<div class="dock-queue-empty">Queue is empty</div>';
      }
    })
    .catch(() => {});
}
