// Tweaks: cambia variant / density / accent en vivo + persiste en localStorage
(function () {
  const KEY = 'golgana-pro-tweaks';
  const defaults = { variant: 'bento', density: 'normal', accent: 'muted' };

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      return Object.assign({}, defaults, v);
    } catch (e) { return Object.assign({}, defaults); }
  }
  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  function apply(state) {
    document.body.dataset.variant = state.variant;
    document.body.dataset.density = state.density;
    document.body.dataset.accent  = state.accent;
    document.querySelectorAll('.tweaks-segment button').forEach((btn) => {
      const k = btn.dataset.tweak;
      const v = btn.dataset.value;
      btn.setAttribute('aria-pressed', state[k] === v ? 'true' : 'false');
    });
  }

  function init() {
    const state = load();

    // Build panel
    const host = document.createElement('div');
    host.className = 'tweaks-host';
    host.dataset.open = 'false';
    host.innerHTML = `
      <button class="tweaks-toggle" type="button" aria-expanded="false">Tweaks</button>
      <div class="tweaks-panel" role="dialog" aria-label="Tweaks">
        <div class="tweaks-row">
          <h4>Layout</h4>
          <div class="tweaks-segment">
            <button data-tweak="variant" data-value="bento">Bento</button>
            <button data-tweak="variant" data-value="editorial">Editorial</button>
          </div>
        </div>
        <div class="tweaks-row">
          <h4>Densidad</h4>
          <div class="tweaks-segment tweaks-segment--3">
            <button data-tweak="density" data-value="compact">Compact</button>
            <button data-tweak="density" data-value="normal">Normal</button>
            <button data-tweak="density" data-value="comfy">Comfy</button>
          </div>
        </div>
        <div class="tweaks-row">
          <h4>Acento verde</h4>
          <div class="tweaks-segment">
            <button data-tweak="accent" data-value="muted">Suave</button>
            <button data-tweak="accent" data-value="bold">Fuerte</button>
          </div>
        </div>
        <a class="tweaks-link" href="./home-mejorada.html">← Ver todas las páginas</a>
      </div>
    `;
    document.body.appendChild(host);

    const toggle = host.querySelector('.tweaks-toggle');
    toggle.addEventListener('click', () => {
      const open = host.dataset.open !== 'true';
      host.dataset.open = open;
      toggle.setAttribute('aria-expanded', open);
    });

    host.querySelectorAll('[data-tweak]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state[btn.dataset.tweak] = btn.dataset.value;
        save(state);
        apply(state);
      });
    });

    apply(state);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
