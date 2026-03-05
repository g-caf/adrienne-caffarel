(function () {
  const links = Array.from(document.querySelectorAll('a.article-link'));
  if (!links.length) return;

  const endpoint = '/analytics/event';

  function sendPayload(payload) {
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
      return;
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(function () {});
  }

  links.forEach(function (link) {
    link.addEventListener('click', function () {
      const href = link.getAttribute('href') || '';
      let targetHost = '';
      try {
        targetHost = new URL(href, window.location.origin).hostname;
      } catch (_error) {
        targetHost = '';
      }

      sendPayload({
        eventName: 'outbound_click',
        path: window.location.pathname,
        targetUrl: href,
        targetHost
      });
    });
  });
})();
