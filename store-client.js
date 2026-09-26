/* ══════════════════════════════════════════════════════════════════════
   store-client.js — المتجرُ الديناميكيّ (المرحلة ٢)
   ──────────────────────────────────────────────────────────────────────
   بوّابةُ كنزٍ غامرةٌ (على نهجِ بوّابةِ المحرّك) تنقشعُ كاشفةً واجهةَ متجرٍ
   نابضةٍ بندراتٍ ملوّنةٍ وعدّادٍ تنازليٍّ للنافذةِ القادمة. الخادمُ مرجعُ
   الحقيقةِ: العناصرُ والوقتُ والشراءُ كلُّها من /api/economy/store/*.
   ثنائيُّ اللغةِ عبر L(ar,en) — نصّان صريحان فلا تسريبَ i18n إطلاقًا.
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function L(ar, en) { try { return (window.I18N && I18N.lang === 'en') ? en : ar; } catch (e) { return ar; } }
  function api() { try { return (window.getApiBase && window.getApiBase()) || ((window.SERVER_HTTP || '') + '/api'); } catch (e) { return '/api'; } }
  function token() { try { return window.amkhAuth && window.amkhAuth.token; } catch (e) { return null; } }
  function esc(s) { try { return (window.amkhUI && amkhUI.esc) ? amkhUI.esc(s) : String(s == null ? '' : s); } catch (e) { return String(s == null ? '' : s); } }

  var RARITY = {
    common:    { ar: 'شائع',    en: 'Common' },
    rare:      { ar: 'نادر',    en: 'Rare' },
    epic:      { ar: 'ملحميّ',  en: 'Epic' },
    legendary: { ar: 'أسطوريّ', en: 'Legendary' },
    seasonal:  { ar: 'موسميّ',  en: 'Seasonal' }
  };

  /* ══ StoreWash: دوّامةُ كنزٍ ذهبيّةٌ كاملةُ الشاشة (تقنيةُ التغذيةِ الراجعةِ
     نفسُها في بوّابةِ المحرّكِ لكن بلوحةٍ ذهبيّةٍ/أرجوانيّةٍ تليقُ بالمتجر). */
  var StoreWash = {
    _raf: 0, _cv: null, _ctx: null,
    _prep: function () {
      var cv = document.getElementById('store-wash-cv'); if (!cv) return null;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      var w = Math.max(1, Math.round((cv.clientWidth || window.innerWidth) * dpr));
      var h = Math.max(1, Math.round((cv.clientHeight || window.innerHeight) * dpr));
      if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
      this._cv = cv; this._ctx = cv.getContext('2d'); return cv;
    },
    _fill: function (ctx, W, H, cx, cy, R, a) {
      var g = ctx.createRadialGradient(cx, cy, R * 0.02, cx, cy, R * 0.72);
      g.addColorStop(0, 'rgba(64,32,96,' + a + ')'); g.addColorStop(0.3, 'rgba(44,22,70,' + a + ')');
      g.addColorStop(0.6, 'rgba(28,14,46,' + a + ')'); g.addColorStop(1, 'rgba(12,6,20,' + a + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
    _blob: function (ctx, x, y, r, head, a) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, head + a + ')'); g.addColorStop(1, head + '0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    },
    play: function () {
      if (!this._prep()) return;
      var ctx = this._ctx, cv = this._cv;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      cancelAnimationFrame(this._raf);
      var W = cv.width, H = cv.height, cx = W / 2, cy = H * 0.46, R = Math.hypot(W, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      this._fill(ctx, W, H, cx, cy, R, 1);
      if (reduce) return;
      var DUR = 2300, t0 = performance.now(), self = this;
      var step = function (now) {
        var p = Math.min(1, (now - t0) / DUR), drain = p < 0.72 ? 0 : (p - 0.72) / 0.28;
        var zoom = 0.963 - 0.055 * drain, spin = 0.06 + 0.035 * p + 0.06 * drain;
        ctx.save(); ctx.globalAlpha = 0.93;
        ctx.translate(cx, cy); ctx.rotate(spin); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);
        ctx.drawImage(cv, 0, 0, W, H); ctx.restore(); ctx.globalAlpha = 1;
        ctx.globalAlpha = 0.085; self._fill(ctx, W, H, cx, cy, R, 1); ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'screen';        /* شررٌ ذهبيّ */
        for (var i = 0; i < 18; i++) { var an = Math.random() * 6.2832, rr = R * (0.14 + Math.random() * 0.56);
          self._blob(ctx, cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 0.98, R * (0.010 + Math.random() * 0.05), 'rgba(245,200,90,', (0.06 + Math.random() * 0.14)); }
        var rotArm = (now - t0) * 0.0048, arms = 3, tw = 2.6 * 6.2832, b = 0.17, a0 = R * 0.045;
        for (var k = 0; k < arms; k++) {
          ctx.beginPath();
          for (var s = 0; s <= 64; s++) { var th = (s / 64) * tw, r2 = a0 * Math.exp(b * th);
            var ang = th + rotArm + k * (6.2832 / arms), x = cx + Math.cos(ang) * r2, y = cy + Math.sin(ang) * r2 * 0.98;
            s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.lineWidth = R * 0.02; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(245,200,90,0.08)'; ctx.stroke();
          ctx.lineWidth = R * 0.007; ctx.strokeStyle = 'rgba(255,240,190,0.10)'; ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        for (var j = 0; j < 6; j++) { var a3 = Math.random() * 6.2832, r3 = R * (0.16 + Math.random() * 0.44);
          self._blob(ctx, cx + Math.cos(a3) * r3, cy + Math.sin(a3) * r3 * 0.98, R * (0.03 + Math.random() * 0.08), 'rgba(22,10,36,', (0.10 + Math.random() * 0.12)); }
        var eye = Math.max(1, R * (0.05 + 0.03 * Math.sin(p * 6.28) + 0.55 * drain));
        var eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, eye);
        eg.addColorStop(0, 'rgba(10,5,16,0.98)'); eg.addColorStop(0.55, 'rgba(16,8,26,0.92)'); eg.addColorStop(1, 'rgba(16,8,26,0)');
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(cx, cy, eye * 1.3, 0, 6.2832); ctx.fill();
        ctx.globalCompositeOperation = 'screen';
        ctx.lineWidth = R * 0.006; ctx.strokeStyle = 'rgba(255,232,160,' + (0.12 + 0.10 * Math.sin(p * 9)) + ')';
        ctx.beginPath(); ctx.arc(cx, cy, eye * 1.15, 0, 6.2832); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        if (p < 1) self._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    },
    stop: function () { cancelAnimationFrame(this._raf); this._raf = 0; }
  };

  /* معايناتٌ مرسومةٌ (SVG، بلا إيموجي) — لونُها من الندرة عبر CSS currentColor.
     المرحلةُ ٣ تُظهرُ هذه العناصرَ فعليًّا حولَ الأفاتار؛ هنا معاينةُ المتجر. */
  function art(it) {
    switch (it.type) {
      case 'frame':
        return '<svg viewBox="0 0 64 64" class="st-svg"><defs><linearGradient id="fr-' + esc(it.id) + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient></defs><rect x="7" y="7" width="50" height="50" rx="14" fill="none" stroke="url(#fr-' + esc(it.id) + ')" stroke-width="5"/><circle cx="32" cy="32" r="14" fill="rgba(255,255,255,.08)"/></svg>';
      case 'background':
        return '<svg viewBox="0 0 64 64" class="st-svg"><rect x="6" y="10" width="52" height="44" rx="10" fill="currentColor" opacity=".85"/><circle cx="20" cy="24" r="2" fill="#fff"/><circle cx="40" cy="20" r="1.5" fill="#fff"/><circle cx="48" cy="34" r="2.2" fill="#fff"/><circle cx="28" cy="40" r="1.6" fill="#fff"/></svg>';
      case 'badge':
        return '<svg viewBox="0 0 64 64" class="st-svg"><path fill="currentColor" d="M32 6l7 14 15 2-11 11 3 15-14-7-14 7 3-15L10 22l15-2z"/></svg>';
      case 'celebration':
        return '<svg viewBox="0 0 64 64" class="st-svg"><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M32 32L18 14"/><path d="M32 32l18-14"/><path d="M32 32l16 20"/><path d="M32 32L14 48"/></g><circle cx="32" cy="32" r="5" fill="currentColor"/></svg>';
      case 'mate_fx':
        return '<svg viewBox="0 0 64 64" class="st-svg"><path fill="currentColor" d="M36 6L16 36h12l-6 22 24-32H34z"/></svg>';
      default:
        return '<svg viewBox="0 0 64 64" class="st-svg"><circle cx="32" cy="32" r="20" fill="currentColor"/></svg>';
    }
  }

  var STORE = {
    _cur: null, _timer: 0, _open: false,

    open: function () {
      var ov = document.getElementById('store-ov'); if (!ov) return;
      this._open = true;
      ov.classList.add('open');
      var sc = ov.querySelector('.store-scroll'); if (sc) sc.scrollTop = 0;
      try { var w = document.getElementById('store-wash'); if (w) { w.classList.remove('play'); void w.offsetWidth; w.classList.add('play'); } StoreWash.play(); } catch (e) {}
      try { if (window.amkhGrabModalFreeze) amkhGrabModalFreeze(); } catch (e) {}
      try { if (window.SFX && SFX.storeOpen) SFX.storeOpen(); } catch (e) {}
      try { if (window.AppBar) AppBar.setOverlay(true); } catch (e) {}
      this._renderBalance();
      this._load();
    },
    close: function () {
      this._open = false;
      var ov = document.getElementById('store-ov'); if (ov) ov.classList.remove('open');
      try { StoreWash.stop(); } catch (e) {}
      var w = document.getElementById('store-wash'); if (w) w.classList.remove('play');
      if (this._timer) { clearInterval(this._timer); this._timer = 0; }
      try { if (window.amkhReleaseModalFreeze) amkhReleaseModalFreeze(); } catch (e) {}
      try { if (window.AppBar) AppBar.setOverlay(false); } catch (e) {}
    },

    _renderBalance: function () {
      var el = document.getElementById('store-balance-val');
      if (el && window.amkhEconomy) el.textContent = String(amkhEconomy.coins());
    },

    _load: function () {
      var grid = document.getElementById('store-grid');
      var tok = token();
      if (!tok) { if (grid) grid.innerHTML = '<p class="store-empty">' + esc(L('سجّل الدخول لفتح المتجر.', 'Sign in to open the store.')) + '</p>'; return; }
      if (grid) grid.innerHTML = '<p class="store-empty">' + esc(L('جارٍ فتح الخزائن…', 'Opening the vaults…')) + '</p>';
      var self = this;
      fetch(api() + '/economy/store/current', { headers: { 'Authorization': 'Bearer ' + tok, 'ngrok-skip-browser-warning': 'true' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) { if (grid) grid.innerHTML = '<p class="store-empty">' + esc(L('تعذّر فتح المتجر.', 'Could not open the store.')) + '</p>'; return; }
          self._cur = data; self._render(data);
        })
        .catch(function () { if (grid) grid.innerHTML = '<p class="store-empty">' + esc(L('تعذّر فتح المتجر.', 'Could not open the store.')) + '</p>'; });
    },

    _render: function (data) {
      this._renderBalance();
      var grid = document.getElementById('store-grid'); if (!grid) return;
      var owned = (window.amkhEconomy && amkhEconomy.state && amkhEconomy.state.owned) || [];
      var self = this;
      grid.innerHTML = data.items.map(function (it) { return self._card(it, owned.indexOf(it.id) >= 0); }).join('');
      grid.querySelectorAll('[data-buy]').forEach(function (b) {
        b.onclick = function () { try { if (window.SFX) SFX.btn(); } catch (e) {} STORE.buy(b.getAttribute('data-buy')); };
      });
      this._startCountdown(data.serverNow, data.endsAt);
    },

    _card: function (it, owned) {
      var r = RARITY[it.rarity] || RARITY.common;
      var name = L(it.ar, it.en);
      var have = owned || it.owned;
      var canAfford = (window.amkhEconomy ? amkhEconomy.coins() : 0) >= it.price;
      var action;
      if (have) action = '<span class="store-owned">' + esc(L('مملوك', 'Owned')) + '</span>';
      else action = '<button class="store-buy' + (canAfford ? '' : ' is-locked') + '" data-buy="' + esc(it.id) + '"><span class="store-buy__coin" aria-hidden="true"></span>' + it.price + '</button>';
      return '<div class="store-card store-card--' + esc(it.rarity) + (have ? ' is-owned' : '') + '">'
        + '<span class="store-card__rar">' + esc(L(r.ar, r.en)) + '</span>'
        + '<div class="store-card__art store-art--' + esc(it.type) + '">' + art(it) + '</div>'
        + '<div class="store-card__nm">' + esc(name) + '</div>'
        + '<div class="store-card__foot">' + action + '</div>'
        + '</div>';
    },

    _startCountdown: function (serverNow, endsAt) {
      var el = document.getElementById('store-countdown'); if (!el) return;
      var skew = Date.now() - (Number(serverNow) || Date.now());   /* فرقُ ساعةِ الجهازِ عن الخادم */
      if (this._timer) clearInterval(this._timer);
      var tick = function () {
        var ms = endsAt - (Date.now() - skew); if (ms < 0) ms = 0;
        var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
        el.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        if (ms <= 0) { if (STORE._timer) { clearInterval(STORE._timer); STORE._timer = 0; } STORE._load(); }
      };
      tick(); this._timer = setInterval(tick, 1000);
    },

    buy: function (itemId) {
      var tok = token(); if (!tok) return;
      var self = this;
      fetch(api() + '/economy/store/buy', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ itemId: itemId })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          if (!res) return;
          if (res.coins != null && window.amkhEconomy) amkhEconomy.apply(res);   /* يحدّث الرصيد/الملكيّة والشريط في الرئيسيّة */
          if (res.ok) {
            try { if (window.SFX && SFX.storeBuy) SFX.storeBuy(); } catch (e) {}
            if (res.store) { self._cur = res.store; self._render(res.store); }
          } else {
            self._toast(res.reason);
            if (res.store) { self._cur = res.store; self._render(res.store); }
          }
        }).catch(function () {});
    },

    _toast: function (reason) {
      var msg = reason === 'insufficient' ? L('عملاتُك لا تكفي لشراءِ هذا العنصر.', 'You don\'t have enough coins.')
        : reason === 'owned' ? L('تملكُ هذا العنصرَ بالفعل.', 'You already own this item.')
        : reason === 'not_in_window' ? L('انتهى عرضُ هذا العنصرِ في هذه النافذة.', 'This item is no longer offered.')
        : L('تعذّرت عمليّةُ الشراء.', 'Purchase failed.');
      try { if (window.Modal && Modal.show) Modal.show(msg, L('المتجر', 'Store'), '◈', null); } catch (e) {}
    }
  };

  window.STORE = STORE;
  try { window.addEventListener('amkh:lang', function () { if (STORE._open && STORE._cur) STORE._render(STORE._cur); }); } catch (e) {}
})();
