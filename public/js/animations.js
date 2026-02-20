// Landing page animation
document.addEventListener('DOMContentLoaded', function() {
  const landingPage = document.querySelector('.landing-page');
  
  if (!landingPage) return;
  
  const words = ['designing', 'developing', 'reading', 'writing'];
  const flipElement = document.querySelector('.word-flip');
  const headerFlipElement = document.querySelector('.header-word-flip');
  
  if (!flipElement) return;
  
  let currentWordIndex = 0;
  let wordFlipInterval;
  
  // Display words in sequence (both landing and header)
  function cycleWords() {
    const currentWord = words[currentWordIndex % words.length] + '.'; // Add period
    
    // Update landing page word flip
    flipElement.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = currentWord;
    flipElement.appendChild(span);
    
    // Update header word flip if visible
    if (headerFlipElement) {
      headerFlipElement.innerHTML = '';
      const headerSpan = document.createElement('span');
      headerSpan.textContent = currentWord;
      headerFlipElement.appendChild(headerSpan);
    }
    
    currentWordIndex++;
    
    // Cycle through words - animation duration is 2.5s, so wait that long for next word
    if (currentWordIndex < words.length * 3) {
      wordFlipInterval = setTimeout(cycleWords, 2500);  // matches animation duration
    } else {
      // After cycling through words 3 times, transition to main page
      setTimeout(collapseToHeader, 2500);
    }
  }
  
  // Start animation when page loads
  cycleWords();
  
  // Collapse animation
  function collapseToHeader() {
    landingPage.style.transition = 'all 0.8s ease-in-out';
    landingPage.style.minHeight = '60px';
    landingPage.style.alignItems = 'flex-start';
    landingPage.style.paddingTop = '10px';
    
    const landingContainer = document.querySelector('.landing-container');
    if (landingContainer) {
      landingContainer.style.transform = 'scale(0.3)';
      landingContainer.style.opacity = '0';
    }
    
    // Show main page after collapse
    setTimeout(function() {
      landingPage.style.display = 'none';
      const pageContainer = document.querySelector('.page-container');
      if (pageContainer) {
        pageContainer.style.display = 'flex';
        // Start header animation once page is visible
        continueHeaderAnimation();
      }
    }, 800);
  }
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

// Continue word flip animation in header after landing page collapse
function continueHeaderAnimation() {
  if (!headerFlipElement) return;
  
  // Start with the next word after the landing animation stopped
  let headerIndex = currentWordIndex % words.length;
  
  function updateHeaderWord() {
    const currentWord = words[headerIndex % words.length] + '.';
    headerFlipElement.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = currentWord;
    headerFlipElement.appendChild(span);
    headerIndex++;
  }
  
  // Update immediately with first word
  updateHeaderWord();
  
  // Then continue cycling every 2.5 seconds
  window.headerAnimationInterval = setInterval(updateHeaderWord, 2500);
}
