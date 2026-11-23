(function () {
  const root = document.documentElement;
  const DEFAULT_BG = '#f5f7fb';

  // Темний фон чи світлий: від цього залежить колір тексту
  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b < 140;
  }

  window.applyBg = function (hex, save) {
    root.style.setProperty('--bg', hex);
    root.dataset.bg = hex;
    root.dataset.theme = isDark(hex) ? 'dark' : 'light';
    if (save) { try { localStorage.setItem('bg', hex); } catch {} }
  };

  let bg = null;
  try { bg = localStorage.getItem('bg'); } catch {}
  if (!/^#[0-9a-f]{6}$/i.test(bg || '')) bg = DEFAULT_BG;
  window.applyBg(bg, false);
})();