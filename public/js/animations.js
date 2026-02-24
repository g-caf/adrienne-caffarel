// Landing page animation
document.addEventListener('DOMContentLoaded', function() {
  function initDevelopingSnakeRibbon() {
    const textPath = document.querySelector('.dev-snake-text-path');
    if (!textPath || textPath.dataset.flowInit === '1') return;

    textPath.dataset.flowInit = '1';
    const phrase = 'I ALSO BUILT THIS WEBSITE  ';
    textPath.textContent = phrase.repeat(80);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const svg = textPath.ownerSVGElement;
    if (!svg) return;

    const tempText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tempText.setAttribute('class', 'dev-snake-text');
    const tempTextPath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
    tempTextPath.setAttribute('href', '#dev-snake-path');
    tempTextPath.textContent = phrase;
    tempText.appendChild(tempTextPath);
    svg.appendChild(tempText);
    const phraseLength = Math.max(1, tempText.getComputedTextLength());
    svg.removeChild(tempText);

    let lastTs = null;
    let offset = 0;
    const unitsPerSecond = phraseLength / 2.6;

    function tick(ts) {
      if (lastTs === null) {
        lastTs = ts;
      }
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      offset -= unitsPerSecond * dt;
      if (offset <= -phraseLength) {
        offset += phraseLength;
      }
      textPath.setAttribute('startOffset', offset.toFixed(2));
      window.requestAnimationFrame(tick);
    }

    window.requestAnimationFrame(tick);
  }

  initDevelopingSnakeRibbon();

  const words = ['designing', 'developing', 'reading', 'writing'];
  const flipElement = document.querySelector('.word-flip');
  const headerFlipElement = document.querySelector('.header-word-flip');
  const landingPage = document.querySelector('.landing-page');
  const pageContainer = document.querySelector('.page-container');
  const landingDownArrow = document.querySelector('.landing-down-arrow');
  const WORD_DURATION_MS = 2500;
  const AUTO_COLLAPSE_CYCLES = 2;

  let currentWordIndex = 0;
  let hasShownDownArrow = false;
  let isCollapsing = false;

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
    if (!landingPage || isCollapsing) return;
    isCollapsing = true;

    if (landingDownArrow) {
      landingDownArrow.classList.remove('visible');
    }

    if (pageContainer) {
      pageContainer.classList.remove('preload-hidden');
      pageContainer.classList.add('is-entering');
    }

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        landingPage.classList.add('is-collapsing');
        if (pageContainer) {
          pageContainer.classList.add('is-visible');
        }
      });
    });

    setTimeout(function() {
      landingPage.style.display = 'none';
      if (pageContainer) {
        pageContainer.classList.remove('is-entering');
      }
      startHeaderAnimation();
    }, 760);
  }

  // If there is no landing animation on this page, keep header animation running.
  if (!landingPage || !flipElement) {
    startHeaderAnimation();
    return;
  }

  function showDownArrow() {
    if (!landingDownArrow || hasShownDownArrow) return;
    hasShownDownArrow = true;
    landingDownArrow.classList.add('visible');
    landingDownArrow.addEventListener('click', collapseToHeader);
  }

  function cycleWords() {
    if (isCollapsing) return;

    const currentWord = words[currentWordIndex % words.length] + '.';
    renderWord(flipElement, currentWord);
    renderWord(headerFlipElement, currentWord);
    currentWordIndex++;

    if (currentWordIndex === words.length) {
      showDownArrow();
    }

    if (currentWordIndex < words.length * AUTO_COLLAPSE_CYCLES) {
      setTimeout(cycleWords, WORD_DURATION_MS);
      return;
    }

    collapseToHeader();
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
