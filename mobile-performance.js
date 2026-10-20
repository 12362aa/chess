/* Shared mobile rendering budget. Product art stays animated in its detail view. */
(function () {
  'use strict';
  const mobile = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    || matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const api = window.AMKHPerf = {
    mobile,
    preview(svg) {
      // Catalog thumbnails use a representative frame; detail art retains motion.
      return String(svg || '').replace(/<animate(?:Transform|Motion)?\b[^>]*(?:\/>|>[\s\S]*?<\/animate(?:Transform|Motion)?>)/gi, '')
        .replace(/filter="url\(#[^"]+\)"/g, '');
    },
    portal(host, kind) {
      if (!host) return;
      host.innerHTML = '<div class="amkh-portal amkh-portal--' + kind + '" aria-hidden="true">'
        + '<div class="amkh-portal__halo"></div><div class="amkh-portal__door left"></div><div class="amkh-portal__door right"></div>'
        + '<div class="amkh-portal__emblem">' + (kind === 'rewards'
          ? '<svg viewBox="0 0 96 96"><path d="M28 18h40v23c0 19-9 29-20 29S28 60 28 41Z" fill="#f4c969"/><path d="M28 25H15v12c0 14 8 22 19 23M68 25h13v12c0 14-8 22-19 23" fill="none" stroke="#c89035" stroke-width="7"/><path d="M48 69v12M31 84h34" stroke="#f4c969" stroke-width="8" stroke-linecap="round"/><path d="m48 28 4 9 10 1-8 7 2 10-8-5-8 5 2-10-8-7 10-1Z" fill="#fff4c2"/></svg>'
          : '<svg viewBox="0 0 96 96"><rect x="15" y="35" width="66" height="45" rx="9" fill="#ad762c"/><path d="M15 42V29a15 15 0 0 1 15-15h36a15 15 0 0 1 15 15v13Z" fill="#edbd55"/><path d="M15 44h66M31 15v65M65 15v65" stroke="#fff0b4" stroke-width="4"/><rect x="41" y="36" width="14" height="24" rx="4" fill="#ffd875"/></svg>')
        + '</div></div>';
      host.classList.remove('play');
      void host.offsetWidth;
      host.classList.add('play');
    },
  };
  document.documentElement.classList.toggle('amkh-mobile', mobile);
  let scheduled = false;
  const refresh = () => {
    scheduled = false;
    const game = document.getElementById('s-game');
    document.body.classList.toggle('amkh-playing', !!(game && game.classList.contains('active')));
    const layers = [...document.querySelectorAll('.screen.active,.ds-overlay.is-open,#engine-ov.open,#store-ov.open,#rewards-ov.open,#go-ov.open,#review-ov.open')];
    const pause = document.hidden || reduced.matches;
    document.querySelectorAll('svg').forEach(svg => {
      if (!svg.pauseAnimations) return;
      // Decorative SVG in inactive screens must not consume CPU behind the board.
      const active = !pause && layers.some(layer => layer.contains(svg))
        && !svg.closest('.store-card__art,.rw-inv__art');
      try { active ? svg.unpauseAnimations() : svg.pauseAnimations(); } catch (_) {}
    });
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); } };
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(records => {
      if (records.some(r => r.type === 'childList'
        ? [...r.addedNodes].some(n=>n.nodeType===1 && (n.matches('svg') || n.querySelector('svg')))
        : r.target.matches('.screen,.ds-overlay,#engine-ov,#store-ov,#rewards-ov,#go-ov,#review-ov'))) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    schedule();
  }, { once: true });
  document.addEventListener('visibilitychange', schedule);
})();
