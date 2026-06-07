document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);

  document.addEventListener('dblclick', toggleFullscreen);

  const dockContainer = document.getElementById('dockContainer');
  let hideTimer = null;
  let isIdle = false;

  function startHideTimer(delay) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      dockContainer.classList.add('auto-hide');
      dockContainer.classList.remove('touch-active');
      isIdle = true;
    }, delay);
  }

  function showUI() {
    dockContainer.classList.remove('auto-hide');
    isIdle = false;
    clearTimeout(hideTimer);
  }

  if (dockContainer) {
    dockContainer.addEventListener('mousemove', () => {
      showUI();
      startHideTimer(3000);
    });

    dockContainer.addEventListener('mouseleave', () => {
      startHideTimer(1000);
    });

    dockContainer.addEventListener('touchstart', (e) => {
      if (isIdle) {
        dockContainer.classList.remove('auto-hide');
        dockContainer.classList.add('touch-active');
        isIdle = false;
        clearTimeout(hideTimer);
        startHideTimer(5000);
      } else {
        dockContainer.classList.add('touch-active');
        clearTimeout(hideTimer);
        startHideTimer(5000);
      }
    });
  }

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
        list.innerHTML = queue.map((item) => `
          <div class="dock-queue-item ${item.youtube_id === currentYoutubeId ? 'current' : ''}">
            <div class="dock-queue-item-img">
              ${item.artwork ? `<img src="${item.artwork}" alt="" loading="lazy">` :
                `<div style="width:24px;height:24px;background:#111;border-radius:4px;display:flex;align-items:center;justify-content:center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
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
