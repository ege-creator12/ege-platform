/* Presentation only: no requests, study state, or route interception. */
(() => {
  'use strict';
  const root = document.documentElement;
  try { root.classList.toggle('dark', localStorage.getItem('theme') !== 'light'); }
  catch { root.classList.add('dark'); }

  function mountAppearance() {
    const app = document.getElementById('app');
    if (!app) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    const selectors = '.continue,.exam,.section-card,.topic,.practice-mode,.ege-map-summary,.ai-pro-hero';
    let active = null;
    let frame = 0;
    let point = null;
    const visited = new WeakSet();
    const entering = new Set();
    const canAnimate = () => !motion.matches && pointer.matches && !document.hidden;

    const reveal = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (canAnimate()) entry.target.classList.add('depth-enter');
          reveal.unobserve(entry.target);
          entering.delete(entry.target);
        }
      }, { threshold: .08 })
      : null;

    function decorate(node) {
      if (!(node instanceof Element)) return;
      const cards = [...(node.matches(selectors) ? [node] : []), ...node.querySelectorAll(selectors)];
      for (const card of cards) {
        if (visited.has(card)) continue;
        visited.add(card);
        card.classList.add('depth-card');
        if (reveal && canAnimate()) {
          entering.add(card);
          reveal.observe(card);
        }
      }
    }

    function reset() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (active) {
        active.classList.remove('depth-active');
        for (const key of ['--tilt-x','--tilt-y','--glow-x','--glow-y']) active.style.removeProperty(key);
      }
      active = null;
      point = null;
    }

    function paint() {
      frame = 0;
      if (!active?.isConnected || !point || !canAnimate()) { reset(); return; }
      const bounds = active.getBoundingClientRect();
      if (!bounds.width || !bounds.height) { reset(); return; }
      const x = Math.max(0,Math.min(1,(point.x - bounds.left) / bounds.width));
      const y = Math.max(0,Math.min(1,(point.y - bounds.top) / bounds.height));
      const amount = active.matches('.continue,.ai-pro-hero') ? 3 : 5;
      active.style.setProperty('--tilt-x', `${((.5 - y) * amount).toFixed(2)}deg`);
      active.style.setProperty('--tilt-y', `${((x - .5) * amount).toFixed(2)}deg`);
      active.style.setProperty('--glow-x', `${(x * 100).toFixed(1)}%`);
      active.style.setProperty('--glow-y', `${(y * 100).toFixed(1)}%`);
      active.classList.add('depth-active');
    }

    app.addEventListener('pointermove', event => {
      if (!canAnimate() || event.pointerType === 'touch') return;
      const card = event.target instanceof Element ? event.target.closest('.depth-card') : null;
      if (!card) { if (active) reset(); return; }
      if (active !== card) { reset(); active = card; }
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });
    app.addEventListener('pointerleave', reset, { passive: true });
    app.addEventListener('pointercancel', reset, { passive: true });
    app.addEventListener('animationend', event => {
      if (event.animationName === 'forest-enter') event.target.classList.remove('depth-enter');
    });
    addEventListener('scroll', reset, { passive: true });
    addEventListener('blur', reset);
    addEventListener('hashchange', reset);
    document.addEventListener('visibilitychange', reset);
    motion.addEventListener('change', reset);
    pointer.addEventListener('change', reset);

    const observer = new MutationObserver(records => {
      if (active && !active.isConnected) reset();
      for (const card of entering) {
        if (!card.isConnected) { reveal?.unobserve(card); entering.delete(card); }
      }
      for (const record of records) for (const node of record.addedNodes) decorate(node);
    });
    decorate(app);
    observer.observe(app, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAppearance, { once: true });
  else mountAppearance();
})();
