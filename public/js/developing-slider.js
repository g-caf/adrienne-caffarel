document.addEventListener('DOMContentLoaded', function() {
  const slider = document.querySelector('[data-video-slider]');
  const prevBtn = document.querySelector('[data-slider-prev]');
  const nextBtn = document.querySelector('[data-slider-next]');

  if (!slider || !prevBtn || !nextBtn) return;

  const videos = slider.querySelectorAll('video');
  videos.forEach((video) => {
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  });

  function slideWidth() {
    const firstSlide = slider.querySelector('.video-slide');
    if (!firstSlide) return slider.clientWidth;

    const styles = window.getComputedStyle(slider);
    const gap = parseFloat(styles.columnGap || styles.gap || '0');
    return firstSlide.getBoundingClientRect().width + gap;
  }

  prevBtn.addEventListener('click', function() {
    slider.scrollBy({ left: -slideWidth(), behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', function() {
    slider.scrollBy({ left: slideWidth(), behavior: 'smooth' });
  });
});
