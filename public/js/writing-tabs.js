(() => {
  const root = document.querySelector('[data-writing-editorial]');
  if (!root) return;

  const tabButtons = Array.from(root.querySelectorAll('[data-writing-tab]'));
  const panes = Array.from(root.querySelectorAll('[data-writing-pane]'));

  const setActiveTab = (tabName) => {
    tabButtons.forEach((button) => {
      const isActive = button.getAttribute('data-writing-tab') === tabName;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panes.forEach((pane) => {
      const isActive = pane.getAttribute('data-writing-pane') === tabName;
      pane.classList.toggle('is-active', isActive);
    });
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-writing-tab');
      setActiveTab(tabName);
    });
  });
})();
