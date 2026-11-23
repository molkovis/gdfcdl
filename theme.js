(() => {
  const storageKey = 'gdfc-theme';
  const validThemes = new Set(['dark', 'light']);
  let theme = 'dark';

  try {
    const saved = localStorage.getItem(storageKey);
    if (validThemes.has(saved)) theme = saved;
  } catch {
    // The site still works with the default theme when storage is unavailable.
  }

  const applyTheme = value => {
    theme = value;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f3f5f8' : '#111922');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      const label = nextTheme === 'light' ? 'Включить светлую тему' : 'Включить тёмную тему';
      button.textContent = nextTheme === 'light' ? '☀' : '☾';
      button.setAttribute('aria-label', label);
      button.title = label;
    });
  };

  document.documentElement.dataset.theme = theme;
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        try { localStorage.setItem(storageKey, nextTheme); } catch {}
      });
    });
  }, { once: true });
})();
