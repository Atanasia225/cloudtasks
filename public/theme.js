(function () {
  const root = document.documentElement;
  const DEFAULT_LIGHT = '#f4f6fb';
  const DEFAULT_DARK = '#0b1120';

  // Темний фон чи світлий: від цього залежить колір тексту
  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b < 140;
  }

  function applyBg(hex, save) {
    root.style.setProperty('--bg', hex);
    root.dataset.theme = isDark(hex) ? 'dark' : 'light';
    if (save) { try { localStorage.setItem('bg', hex); } catch {} }
  }

  function applyAccent(name, save) {
    root.dataset.accent = name;
    if (save) { try { localStorage.setItem('accent', name); } catch {} }
  }

  window.applyBg = applyBg;
  window.applyAccent = applyAccent;

  let bg = null, accent = 'blue';
  try {
    bg = localStorage.getItem('bg');
    accent = localStorage.getItem('accent') || 'blue';
  } catch {}
  if (!/^#[0-9a-f]{6}$/i.test(bg || '')) {
    bg = matchMedia('(prefers-color-scheme: dark)').matches ? DEFAULT_DARK : DEFAULT_LIGHT;
  }
  applyBg(bg, false);
  applyAccent(accent, false);
})();