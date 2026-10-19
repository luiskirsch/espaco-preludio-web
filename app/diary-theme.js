(() => {
  const key = 'ep.diary.appearance';
  const root = document.documentElement;
  function apply(value) {
    const night = value === 'night';
    root.dataset.diaryTheme = night ? 'night' : 'day';
    const button = document.getElementById('diaryThemeToggle');
    if (button) {
      button.setAttribute('aria-pressed', String(night));
      button.querySelector('[data-theme-label]').textContent = 'Modo noturno';
      button.querySelector('[data-theme-icon]').textContent = '☾';
      button.title = night ? 'Desativar modo noturno' : 'Ativar modo noturno';
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', night ? '#191a21' : '#2b2225');
  }
  let preference = 'day';
  try { preference = localStorage.getItem(key) || 'day'; } catch { /* Browsers may disable storage. */ }
  apply(preference);
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.diaryTheme);
    document.getElementById('diaryThemeToggle')?.addEventListener('click', () => {
      const value = root.dataset.diaryTheme === 'night' ? 'day' : 'night';
      apply(value);
      try { localStorage.setItem(key, value); } catch { /* The current page still changes. */ }
    });
  }, { once: true });
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(event.newValue); });
})();
