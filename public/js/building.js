(function () {
  const spotifyCard = document.querySelector('[data-spotify-card]');
  if (spotifyCard) {
    const art = spotifyCard.querySelector('[data-spotify-art]');
    const statusEl = spotifyCard.querySelector('[data-spotify-status]');
    const trackEl = spotifyCard.querySelector('[data-spotify-track]');
    const artistEl = spotifyCard.querySelector('[data-spotify-artist]');
    const linkEl = spotifyCard.querySelector('[data-spotify-link]');

    function renderFallback(message) {
      if (statusEl) statusEl.textContent = message;
      if (trackEl) trackEl.textContent = '';
      if (artistEl) artistEl.textContent = '';
      if (linkEl) {
        linkEl.href = '';
        linkEl.style.display = 'none';
      }
      if (art) {
        art.src = '';
        art.alt = '';
      }
    }

    function renderTrack(payload) {
      const track = payload.track;
      if (!track) {
        renderFallback('Spotify is quiet right now.');
        return;
      }

      if (statusEl) {
        statusEl.textContent = payload.status === 'playing' ? 'Now playing' : 'Last played';
      }
      if (trackEl) trackEl.textContent = track.name || '';
      if (artistEl) artistEl.textContent = (track.artists || []).join(', ');
      if (linkEl) {
        linkEl.href = track.trackUrl || '';
        linkEl.style.display = track.trackUrl ? 'inline-flex' : 'none';
      }
      if (art) {
        art.src = track.albumImage || '';
        art.alt = track.album ? `Album art for ${track.album}` : '';
      }
    }

    async function fetchSpotify() {
      try {
        const response = await fetch('/api/spotify/now-playing', { cache: 'no-store' });
        if (!response.ok) {
          renderFallback('Spotify is offline.');
          return;
        }
        const payload = await response.json();
        if (payload.status === 'unauthorized') {
          renderFallback('Spotify is not connected yet.');
          return;
        }
        renderTrack(payload);
      } catch (error) {
        renderFallback('Spotify is offline.');
      }
    }

    fetchSpotify();
    setInterval(fetchSpotify, 30000);
  }

  const visitorCountEl = document.querySelector('[data-visitor-count]');
  if (visitorCountEl) {
    const updateCount = (value) => {
      if (typeof value === 'number') {
        visitorCountEl.textContent = value.toLocaleString('en-US');
      }
    };

    const initialValue = Number.parseInt(String(visitorCountEl.textContent || '').replace(/,/g, ''), 10);
    if (Number.isFinite(initialValue)) {
      updateCount(initialValue);
    }

    const startPolling = () => {
      const poll = async () => {
        try {
          const response = await fetch('/api/unique-visitors', { cache: 'no-store' });
          if (!response.ok) return;
          const data = await response.json();
          if (typeof data.uniqueVisitors === 'number') {
            updateCount(data.uniqueVisitors);
          }
        } catch (error) {
          // Ignore polling errors.
        }
      };

      poll();
      setInterval(poll, 20000);
    };

    if (window.EventSource) {
      const source = new EventSource('/api/unique-visitors/stream');
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data || '{}');
          if (typeof data.uniqueVisitors === 'number') {
            updateCount(data.uniqueVisitors);
          }
        } catch (error) {
          // Ignore malformed events.
        }
      };
      source.onerror = () => {
        source.close();
        startPolling();
      };
    } else {
      startPolling();
    }
  }
})();
