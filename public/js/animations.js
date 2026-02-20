// Landing page animation
document.addEventListener('DOMContentLoaded', function() {
  const words = ['designing', 'developing', 'reading', 'writing'];
  const flipElement = document.querySelector('.word-flip');
  const headerFlipElement = document.querySelector('.header-word-flip');
  const landingPage = document.querySelector('.landing-page');
  const pageContainer = document.querySelector('.page-container');
  const WORD_DURATION_MS = 2500;
  const LANDING_CYCLES = 3;

  let currentWordIndex = 0;

  function renderWord(target, word) {
    if (!target) return;
    target.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = word;
    target.appendChild(span);
  }

  function startHeaderAnimation() {
    if (!headerFlipElement) return;

    let headerIndex = currentWordIndex % words.length;
    renderWord(headerFlipElement, words[headerIndex] + '.');
    headerIndex++;

    if (window.headerAnimationInterval) {
      clearInterval(window.headerAnimationInterval);
    }

    window.headerAnimationInterval = setInterval(function() {
      renderWord(headerFlipElement, words[headerIndex % words.length] + '.');
      headerIndex++;
    }, WORD_DURATION_MS);
  }

  function collapseToHeader() {
    if (!landingPage) return;

    landingPage.style.transition = 'all 0.8s ease-in-out';
    landingPage.style.minHeight = '60px';
    landingPage.style.alignItems = 'flex-start';
    landingPage.style.paddingTop = '10px';

    const landingContainer = document.querySelector('.landing-container');
    if (landingContainer) {
      landingContainer.style.transform = 'scale(0.3)';
      landingContainer.style.opacity = '0';
    }

    setTimeout(function() {
      landingPage.style.display = 'none';
      if (pageContainer) {
        pageContainer.style.display = 'flex';
      }
      startHeaderAnimation();
    }, 800);
  }

  // If there is no landing animation on this page, keep header animation running.
  if (!landingPage || !flipElement) {
    startHeaderAnimation();
    return;
  }

  function cycleWords() {
    const currentWord = words[currentWordIndex % words.length] + '.';
    renderWord(flipElement, currentWord);
    renderWord(headerFlipElement, currentWord);
    currentWordIndex++;

    if (currentWordIndex < words.length * LANDING_CYCLES) {
      setTimeout(cycleWords, WORD_DURATION_MS);
      return;
    }

    setTimeout(collapseToHeader, WORD_DURATION_MS);
  }

  cycleWords();
});

// Sticky header behavior when user scrolls
window.addEventListener('scroll', function() {
  const header = document.querySelector('.site-header');
  if (header) {
    if (window.scrollY > 50) {
      header.classList.add('sticky');
    } else {
      header.classList.remove('sticky');
    }
  }
});
