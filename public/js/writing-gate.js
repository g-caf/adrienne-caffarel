document.addEventListener('DOMContentLoaded', function() {
  const form = document.querySelector('[data-writing-gate-form]');
  const submitButton = document.querySelector('[data-writing-submit]');

  if (!form || !submitButton) return;

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function hasLikelyValidInput() {
    const firstName = (form.querySelector('#first_name')?.value || '').trim();
    const lastName = (form.querySelector('#last_name')?.value || '').trim();
    const email = (form.querySelector('#email')?.value || '').trim();
    return Boolean(firstName && lastName && emailPattern.test(email));
  }

  form.addEventListener('submit', function(event) {
    if (submitButton.classList.contains('is-submitting')) {
      event.preventDefault();
      return;
    }

    if (!hasLikelyValidInput()) {
      return;
    }

    event.preventDefault();
    submitButton.classList.add('is-submitting');
    submitButton.disabled = true;

    setTimeout(function() {
      form.submit();
    }, 1300);
  });
});
