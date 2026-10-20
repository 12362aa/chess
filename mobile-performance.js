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
      if(kind==='rewards'){
        host.innerHTML='<div class="reward-vault" aria-hidden="true"><div class="reward-vault__sky"></div><div class="reward-vault__rays"></div><div class="reward-vault__ring outer"></div><div class="reward-vault__ring inner"></div><div class="reward-vault__crest"><svg viewBox="0 0 200 240"><defs><linearGradient id="rw-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff2bb"/><stop offset=".45" stop-color="#edc164"/><stop offset="1" stop-color="#9e6427"/></linearGradient><linearGradient id="rw-purple" x2="0" y2="1"><stop stop-color="#a272cd"/><stop offset="1" stop-color="#291339"/></linearGradient></defs><path d="M100 16 180 48v77c0 47-48 79-80 98-32-19-80-51-80-98V48Z" fill="url(#rw-purple)" stroke="url(#rw-gold)" stroke-width="5"/><path d="M100 32 165 59v63c0 40-36 67-65 85-29-18-65-45-65-85V59Z" fill="none" stroke="#edc164" stroke-width="1.5" opacity=".6"/><path d="m67 76 12 16 21-28 21 28 12-16-5 32H72Z" fill="url(#rw-gold)"/><path d="M83 122c-4 10-3 22 2 30l-9 12v11h48v-11l-9-12c5-8 6-20 2-30Z" fill="url(#rw-gold)"/><path d="M75 185h50" stroke="#edc164" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="48" r="4" fill="#fff0be"/></svg></div>'+Array.from({length:12},(_,i)=>'<i class="reward-vault__star" style="--angle:'+i*30+'deg;--delay:'+i*20+'ms"></i>').join('')+'</div>';
        host.classList.remove('play');void host.offsetWidth;host.classList.add('play');return;
      }
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
