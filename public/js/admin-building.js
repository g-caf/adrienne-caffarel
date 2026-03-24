(() => {
  const list = document.querySelector('[data-building-order-list]');
  const input = document.querySelector('[data-building-order-input]');
  if (!list || !input) return;

  let dragging = null;

  const updateInput = () => {
    const slugs = Array.from(list.querySelectorAll('[data-building-slug]'))
      .map((item) => item.dataset.buildingSlug)
      .filter(Boolean);
    input.value = slugs.join(',');
  };

  list.addEventListener('dragstart', (event) => {
    const handle = event.target.closest('[data-building-handle]');
    const item = event.target.closest('[data-building-slug]');
    if (!item || !handle) {
      event.preventDefault();
      return;
    }
    dragging = item;
    item.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.dataset.buildingSlug || '');
  });

  list.addEventListener('dragover', (event) => {
    event.preventDefault();
    const item = event.target.closest('[data-building-slug]');
    if (!item || item === dragging) return;
    const rect = item.getBoundingClientRect();
    const shouldInsertAfter = event.clientY > rect.top + rect.height / 2;
    if (shouldInsertAfter) {
      list.insertBefore(dragging, item.nextSibling);
    } else {
      list.insertBefore(dragging, item);
    }
  });

  list.addEventListener('dragend', () => {
    if (dragging) {
      dragging.classList.remove('is-dragging');
      dragging = null;
    }
    updateInput();
  });

  updateInput();
})();
