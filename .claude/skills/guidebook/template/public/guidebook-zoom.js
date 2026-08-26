(() => {
  const ZOOM_TARGET_SELECTOR = [
    'pre.mermaid svg',
    'pre.astro-mermaid svg',
    '.mermaid svg',
    '.mermaid-svg-container svg',
    'div[data-mermaid] svg',
    '.sl-markdown-content img',
    'main img:not([data-no-zoom])',
  ].join(', ');

  function decorate(el) {
    if (el.dataset.gbZoomable === '1') return;
    el.dataset.gbZoomable = '1';
    el.style.cursor = 'zoom-in';
    el.addEventListener('click', onClick);
  }

  function scan() {
    const nodes = document.querySelectorAll(ZOOM_TARGET_SELECTOR);
    nodes.forEach(decorate);
  }

  function onClick(e) {
    const source = e.currentTarget;
    e.preventDefault();
    e.stopPropagation();
    openOverlay(source);
  }

  let activeOverlay = null;
  let escHandler = null;

  function close() {
    if (!activeOverlay) return;
    activeOverlay.classList.add('gb-zoom-overlay--leaving');
    setTimeout(() => {
      activeOverlay?.remove();
      activeOverlay = null;
    }, 180);
    document.body.style.overflow = '';
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
  }

  function openOverlay(source) {
    close();
    const overlay = document.createElement('div');
    overlay.className = 'gb-zoom-overlay';

    const stage = document.createElement('div');
    stage.className = 'gb-zoom-stage';

    let clone;
    const tag = source.tagName.toLowerCase();
    if (tag === 'svg') {
      clone = source.cloneNode(true);
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      clone.style.width = 'auto';
      clone.style.height = 'auto';
      clone.style.maxWidth = '100%';
      clone.style.maxHeight = '100%';
    } else {
      clone = source.cloneNode(true);
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      clone.style.maxWidth = '100%';
      clone.style.maxHeight = '100%';
      clone.style.objectFit = 'contain';
    }
    clone.classList.add('gb-zoom-clone');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gb-zoom-close';
    closeBtn.setAttribute('aria-label', '閉じる');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    stage.appendChild(clone);
    overlay.appendChild(stage);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    activeOverlay = overlay;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === stage) close();
    });

    escHandler = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', escHandler);

    requestAnimationFrame(() => overlay.classList.add('gb-zoom-overlay--visible'));
  }

  let observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    scan();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('astro:page-load', init);
})();
