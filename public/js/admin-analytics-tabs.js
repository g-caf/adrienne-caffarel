(function () {
  const root = document.querySelector('[data-admin-analytics]');
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll('[data-analytics-tab]'));
  const panes = Array.from(root.querySelectorAll('[data-analytics-pane]'));
  if (!tabs.length || !panes.length) return;
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const rangeSelect = root.querySelector('[data-analytics-range]');
  const sectionInput = root.querySelector('[data-analytics-section]');
  const sectionNames = tabs.map(function (tab) {
    return tab.getAttribute('data-analytics-tab');
  });

  function setActive(tabName) {
    const safeTabName = sectionNames.includes(tabName) ? tabName : 'overview';

    tabs.forEach(function (tab) {
      const active = tab.getAttribute('data-analytics-tab') === safeTabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panes.forEach(function (pane) {
      const active = pane.getAttribute('data-analytics-pane') === safeTabName;
      if (mobileQuery.matches) {
        pane.classList.toggle('is-active', active);
        pane.hidden = !active;
      } else {
        pane.classList.remove('is-active');
        pane.hidden = false;
      }
    });

    if (sectionInput) {
      sectionInput.value = safeTabName;
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      const tabName = tab.getAttribute('data-analytics-tab');
      setActive(tabName);

      const url = new URL(window.location.href);
      url.searchParams.set('section', tabName);
      window.history.replaceState(null, '', url);
    });
  });

  mobileQuery.addEventListener('change', function () {
    setActive(sectionInput ? sectionInput.value : 'overview');
  });

  if (rangeSelect) {
    rangeSelect.addEventListener('change', function () {
      rangeSelect.form.submit();
    });
  }

  const requestedSection = new URLSearchParams(window.location.search).get('section');
  setActive(requestedSection || 'overview');
})();
