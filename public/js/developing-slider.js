document.addEventListener('DOMContentLoaded', function() {
  const slider = document.querySelector('[data-video-slider]');
  const prevBtn = document.querySelector('[data-slider-prev]');
  const nextBtn = document.querySelector('[data-slider-next]');

  if (!slider || !prevBtn || !nextBtn) return;

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
