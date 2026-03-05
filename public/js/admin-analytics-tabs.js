(function () {
  const root = document.querySelector('[data-admin-analytics]');
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll('[data-analytics-tab]'));
  const panes = Array.from(root.querySelectorAll('[data-analytics-pane]'));
  if (!tabs.length || !panes.length) return;
  const mobileQuery = window.matchMedia('(max-width: 760px)');

  function setActive(tabName) {
    tabs.forEach(function (tab) {
      const active = tab.getAttribute('data-analytics-tab') === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panes.forEach(function (pane) {
      const active = pane.getAttribute('data-analytics-pane') === tabName;
      if (mobileQuery.matches) {
        pane.classList.toggle('is-active', active);
        pane.hidden = !active;
      } else {
        pane.classList.remove('is-active');
        pane.hidden = false;
      }
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      setActive(tab.getAttribute('data-analytics-tab'));
    });
  });

  mobileQuery.addEventListener('change', function () {
    setActive('overview');
  });

  setActive('overview');
})();
