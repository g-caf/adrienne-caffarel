(function () {
  const control = document.querySelector('[data-feed-map]');
  const toggle = document.querySelector('[data-feed-map-toggle]');
  if (!control || !toggle) return;

  function setOpen(nextOpen) {
    control.classList.toggle('is-open', nextOpen);
    toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  }

  toggle.addEventListener('click', function () {
    const isOpen = control.classList.contains('is-open');
    setOpen(!isOpen);
  });

  document.addEventListener('click', function (event) {
    if (control.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });
})();
