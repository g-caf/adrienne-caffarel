(function () {
  const control = document.querySelector('[data-feed-map]');
  const toggle = document.querySelector('[data-feed-map-toggle]');
  const ribbon = document.getElementById('feed-map-sources');
  const ribbonTrack = ribbon ? ribbon.querySelector('.feed-map-ribbon-track') : null;
  const ribbonText = ribbon ? ribbon.querySelector('.feed-map-ribbon-text') : null;
  if (!control || !toggle) return;

  function updateMarquee() {
    if (!ribbon || !ribbonTrack || !ribbonText) return;
    const ribbonWidth = ribbon.getBoundingClientRect().width;
    const textWidth = ribbonText.getBoundingClientRect().width;
    const shouldForce = window.innerWidth <= 640 || window.innerWidth >= 1200;
    const shouldMarquee = shouldForce || textWidth > ribbonWidth * 0.92;
    ribbon.classList.toggle('is-marquee', shouldMarquee);
    if (shouldMarquee) {
      const distance = textWidth + 32;
      ribbonTrack.style.setProperty('--marquee-distance', `${distance}px`);
    } else {
      ribbonTrack.style.removeProperty('--marquee-distance');
    }
  }

  function setOpen(nextOpen) {
    control.classList.toggle('is-open', nextOpen);
    toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    if (nextOpen) {
      requestAnimationFrame(updateMarquee);
    }
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

  window.addEventListener('resize', function () {
    updateMarquee();
  });

  updateMarquee();
})();
