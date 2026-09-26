/* ══════════════════════════════════════════════════════════════════════
   rewards-client.js — الجوائزُ والتقدّم (المرحلة ٤)
   ──────────────────────────────────────────────────────────────────────
   شاشةٌ غامرةٌ (على نمطِ المتجر) بثلاثةِ ألسنة: المهامُّ اليوميّة/الأسبوعيّة،
   والإنجازات، والمخزون (زينتُك مع تجهيز/إلغاء). كلُّ التقدّمِ خادميُّ المصدرِ
   (amkhEconomy.state) والمطالبةُ/التجهيزُ عبر مساراتٍ موثّقة — لا كتابةَ من
   بلوبِ العميل. النصوصُ ثنائيّةُ اللغةِ عبر L(ar,en) فلا تسريبَ i18n.
   العرضُ يعيدُ نفسَه على حدثَي amkh:cosmetics (تحديث الحالة) وamkh:lang. */
(function () {
  'use strict';
  function L(ar, en) { try { return (window.I18N && I18N.lang === 'en') ? en : ar; } catch (e) { return ar; } }
  function api() { try { return (window.getApiBase && window.getApiBase()) || ((window.SERVER_HTTP || '') + '/api'); } catch (e) { return '/api'; } }
  function token() { try { return window.amkhAuth && window.amkhAuth.token; } catch (e) { return null; } }
  function esc(s) { try { return (window.amkhUI && amkhUI.esc) ? amkhUI.esc(s) : String(s == null ? '' : s); } catch (e) { return String(s == null ? '' : s); } }
  function econ() { try { return window.amkhEconomy; } catch (e) { return null; } }
  function state() { var e = econ(); return e && e.state; }
  function fmt(n) { n = Number(n) || 0; if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'; return String(n); }

  /* أيقوناتُ الإنجازاتِ: SVG صغيرةٌ مرسومةٌ (بلا إيموجي). */
  function achIcon(id) {
    var p = {
      medal: '<circle cx="12" cy="9" r="5.4"/><path d="M8 13.5 L6 21 L12 18 L18 21 L16 13.5"/>',
      board: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9 H20 M4 14 H20 M9 4 V20 M14 4 V20"/>',
      crown: '<path d="M4 18 L6 8 L10 13 L12 6 L14 13 L18 8 L20 18 Z"/><path d="M4 18 H20"/>',
      bulb: '<path d="M9 15 A5 5 0 1 1 15 15 L14 18 H10 Z"/><path d="M10 20.5 H14"/>',
      star: '<path d="M12 3 L14.6 9.2 L21 9.7 L16.2 14 L17.7 20.3 L12 16.8 L6.3 20.3 L7.8 14 L3 9.7 L9.4 9.2 Z"/>',
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">' + (p[id] || p.medal) + '</svg>';
  }

  /* ══ RewardsWash: بوّابةُ "قاعةِ الشرف" — شروقٌ ذهبيٌّ كاملُ الشاشةِ بأشعّةٍ
     دوّارةٍ ونجومٍ صاعدةٍ وإكليلِ غارٍ ينفتحُ من المركز. مختلفةٌ كليًّا عن بوّابةِ
     المتجر (خزنةٌ + عملاتٌ منهمرة): هنا احتفاءٌ بالتتويجِ لا كنزٌ يُفتَح.
     كلُّه transform/canvas — يتوقّفُ ذاتيًّا، ويحترمُ prefers-reduced-motion. */
  var RewardsWash = {
    _raf: 0, _cv: null, _ctx: null,
    _prep: function () {
      var cv = document.getElementById('rw-wash-cv'); if (!cv) return null;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      var w = Math.max(1, Math.round((cv.clientWidth || window.innerWidth) * dpr));
      var h = Math.max(1, Math.round((cv.clientHeight || window.innerHeight) * dpr));
      if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
      this._cv = cv; this._ctx = cv.getContext('2d'); return cv;
    },
    _bg: function (ctx, W, H, a) {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(40,26,8,' + a + ')'); g.addColorStop(0.5, 'rgba(24,15,5,' + a + ')');
      g.addColorStop(1, 'rgba(8,6,14,' + a + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
    _star: function (ctx, x, y, r, a) {
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a;
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
      g.addColorStop(0, 'rgba(255,249,214,' + a + ')'); g.addColorStop(1, 'rgba(255,209,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
      ctx.beginPath();
      for (var i = 0; i < 4; i++) { var ang = i * 1.5708; ctx.lineTo(Math.cos(ang) * r * 2.2, Math.sin(ang) * r * 2.2); ctx.lineTo(Math.cos(ang + 0.7854) * r * 0.6, Math.sin(ang + 0.7854) * r * 0.6); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    },
    _laurel: function (ctx, cx, cy, R, open, side) {
      /* قوسُ إكليلِ غارٍ ينفتحُ للخارج: صفٌّ من الأوراقِ على قوسٍ جانبيّ */
      ctx.save(); ctx.translate(cx, cy);
      var base = side < 0 ? Math.PI : 0, spread = 2.4, off = (1 - open) * 0.9;
      ctx.rotate(base);
      ctx.fillStyle = 'rgba(245,196,81,' + (0.5 + 0.45 * open) + ')';
      for (var i = 0; i < 9; i++) {
        var t = i / 8, ang = (-spread / 2 + t * spread) - side * off;
        var lr = R * (0.30 + 0.20 * open), x = Math.cos(ang) * lr, y = Math.sin(ang) * lr;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang + 1.5708);
        ctx.beginPath(); ctx.ellipse(0, 0, R * 0.055, R * 0.022, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
    play: function () {
      if (!this._prep()) return;
      var ctx = this._ctx, cv = this._cv, self = this;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      cancelAnimationFrame(this._raf);
      var W = cv.width, H = cv.height, cx = W / 2, cy = H * 0.44, R = Math.hypot(W, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      this._bg(ctx, W, H, 1);
      if (reduce) {
        var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
        rg.addColorStop(0, 'rgba(255,224,140,0.6)'); rg.addColorStop(1, 'rgba(255,224,140,0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); return;
      }
      var stars = []; for (var i = 0; i < 30; i++) {
        stars.push({ x: cx + (Math.random() - 0.5) * W * 0.9, y0: H * (0.6 + Math.random() * 0.5),
          r: R * (0.004 + Math.random() * 0.012), rise: R * (0.3 + Math.random() * 0.4), t: Math.random() * 0.3, ph: Math.random() * 6.28 });
      }
      var DUR = 2100, t0 = performance.now(), ease = function (x) { return 1 - Math.pow(1 - x, 3); };
      var step = function (now) {
        var p = Math.min(1, (now - t0) / DUR);
        self._bg(ctx, W, H, 1);
        var open = ease(Math.min(1, Math.max(0, (p - 0.05) / 0.55)));
        /* شروقٌ مركزيٌّ متوهّج */
        var la = 0.16 + 0.84 * open, lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.24 + 0.42 * open));
        lg.addColorStop(0, 'rgba(255,250,224,' + la + ')'); lg.addColorStop(0.32, 'rgba(255,214,120,' + (la * 0.85) + ')');
        lg.addColorStop(0.68, 'rgba(206,140,40,' + (la * 0.38) + ')'); lg.addColorStop(1, 'rgba(90,54,14,0)');
        ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
        /* أشعّةٌ دوّارةٌ (شمسُ الشرف) */
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.translate(cx, cy); ctx.rotate((now - t0) * 0.00028);
        for (var k = 0; k < 16; k++) { ctx.rotate(0.3927); ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.lineTo(R * 0.66, -R * 0.014); ctx.lineTo(R * 0.66, R * 0.014); ctx.closePath();
          ctx.fillStyle = 'rgba(255,228,150,' + (0.05 * open) + ')'; ctx.fill(); }
        ctx.restore();
        /* إكليلا الغارِ ينفتحان يمينًا ويسارًا */
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        self._laurel(ctx, cx, cy, R, open, 1); self._laurel(ctx, cx, cy, R, open, -1);
        ctx.restore();
        /* نجومٌ صاعدةٌ تتلألأ */
        ctx.globalCompositeOperation = 'screen';
        for (var s = 0; s < stars.length; s++) { var o = stars[s], tp = (p - 0.10 - o.t) / (0.90 - o.t);
          if (tp <= 0) continue; tp = Math.min(1, tp);
          var y = o.y0 - o.rise * ease(tp), tw = 0.5 + 0.5 * Math.sin(o.ph + p * 22);
          var av = (tp < 0.8 ? 1 : (1 - (tp - 0.8) / 0.2)) * (0.5 + 0.5 * tw);
          self._star(ctx, o.x, y, o.r, av * open);
        }
        ctx.globalCompositeOperation = 'source-over';
        if (p < 1) self._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    },
    stop: function () { cancelAnimationFrame(this._raf); this._raf = 0; }
  };

  var REWARDS = {
    _cat: null, _tab: 'missions', _open: false, _bound: false,

    /* ══ فتحٌ/إغلاق ══ */
    open: function () {
      var ov = document.getElementById('rewards-ov'); if (!ov) return;
      this._open = true;
      ov.classList.add('open');
      /* بوّابةُ الجوائز: دوّامةُ الشروقِ الذهبيّ + صوتُها المميّز (مختلفان عن المتجر) */
      try { var w = document.getElementById('rw-wash'); if (w) { w.classList.remove('play'); void w.offsetWidth; w.classList.add('play'); } RewardsWash.play(); } catch (e) {}
      try { if (window.SFX && SFX.rewardsOpen) SFX.rewardsOpen(); } catch (e) {}
      try { if (window.AppBar && AppBar.setOverlay) AppBar.setOverlay(true); } catch (e) {}
      try { if (window.amkhGrabModalFreeze) window.amkhGrabModalFreeze(); } catch (e) {}
      this._bind();
      var self = this;
      var e = econ(); if (e && e.refresh) { try { e.refresh(); } catch (x) {} }
      if (!this._cat) { this._loadCatalog(function () { self._render(); }); }
      this._render();
    },
    close: function () {
      var ov = document.getElementById('rewards-ov'); if (ov) ov.classList.remove('open');
      this._open = false;
      try { var w = document.getElementById('rw-wash'); if (w) w.classList.remove('play'); RewardsWash.stop(); } catch (e) {}
      try { if (window.AppBar && AppBar.setOverlay) AppBar.setOverlay(false); } catch (e) {}
      /* لازم نسيب تجميد السكرول اللي مسكناه في open()، وإلا فضل
         body.overflow=hidden للأبد فتجمّدت الشاشة الرئيسية (بلاغ جوجو). */
      try { if (window.amkhReleaseModalFreeze) window.amkhReleaseModalFreeze(); } catch (e) {}
    },

    /* ══ الكتالوج (يُجلَب مرّةً) ══ */
    _loadCatalog: function (cb) {
      var self = this, tok = token(); if (!tok) { if (cb) cb(); return; }
      fetch(api() + '/economy/catalog', { headers: { 'Authorization': 'Bearer ' + tok, 'ngrok-skip-browser-warning': 'true' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) {
          if (c) {
            self._cat = c;
            self._itemMeta = {};
            (c.items || []).forEach(function (it) { self._itemMeta[it.id] = it; });
          }
          if (cb) cb();
        }).catch(function () { if (cb) cb(); });
    },

    /* ══ ربطُ الألسنةِ مرّةً ══ */
    _bind: function () {
      if (this._bound) return; this._bound = true;
      var self = this, tabs = document.getElementById('rw-tabs');
      if (tabs) tabs.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('.rw-tab') : null; if (!b) return;
        try { if (window.SFX) SFX.btn(); } catch (e) {}
        self._tab = b.getAttribute('data-tab') || 'missions';
        self._render();
      });
      var body = document.getElementById('rw-body');
      if (body) body.addEventListener('click', function (ev) {
        var claim = ev.target.closest ? ev.target.closest('[data-claim]') : null;
        var equip = ev.target.closest ? ev.target.closest('[data-equip]') : null;
        if (claim) { self._claim(claim.getAttribute('data-claim')); return; }
        if (equip) { self._equip(equip.getAttribute('data-equip'), equip.getAttribute('data-type')); return; }
      });
    },

    /* ══ العرضُ الكامل ══ */
    _render: function () {
      if (!this._open) return;
      this._renderHead();
      this._renderBar();
      // نشِّطْ اللسانَ المختار
      var tabs = document.querySelectorAll('#rw-tabs .rw-tab');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('is-on', tabs[i].getAttribute('data-tab') === this._tab);
      }
      var body = document.getElementById('rw-body'); if (!body) return;
      if (this._tab === 'achievements') body.innerHTML = this._achievementsHTML();
      else if (this._tab === 'inventory') body.innerHTML = this._inventoryHTML();
      else body.innerHTML = this._missionsHTML();
    },

    _renderHead: function () {
      var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
      set('rw-kicker', L('AM-KH · التقدّم', 'AM-KH · Progress'));
      set('rw-title', L('جوائزُك وتقدّمُك', 'Your Rewards & Progress'));
      set('rw-sub', L('أكمِلِ المهامَّ، افتحِ الإنجازات، وجهِّزْ زينتَك.', 'Complete missions, unlock achievements, and equip your cosmetics.'));
      var tl = { missions: L('المهام', 'Missions'), achievements: L('الإنجازات', 'Achievements'), inventory: L('المخزون', 'Inventory') };
      var tabs = document.querySelectorAll('#rw-tabs .rw-tab');
      for (var i = 0; i < tabs.length; i++) { var k = tabs[i].getAttribute('data-tab'); tabs[i].textContent = tl[k] || k; }
    },

    _renderBar: function () {
      var s = state() || {};
      var cv = document.getElementById('rw-balance-val'); if (cv) cv.textContent = fmt(s.coins);
      var lv = document.getElementById('rw-level'); if (lv) lv.textContent = String(s.level || 1);
      var fill = document.getElementById('rw-xp-fill');
      if (fill) {
        var lo = Number(s.thisLevelXp) || 0, hi = Number(s.nextLevelXp) || (lo + 1), xp = Number(s.xp) || 0;
        var pct = hi > lo ? Math.max(0, Math.min(100, ((xp - lo) / (hi - lo)) * 100)) : 100;
        if (s.level >= (s.maxLevel || 50)) pct = 100;
        fill.style.width = pct.toFixed(1) + '%';
      }
    },

    /* ══ لسانُ المهام ══ */
    _missionsHTML: function () {
      var s = state() || {}, cat = this._cat || {}, defs = cat.missions || [];
      var live = {}; (s.missions || []).forEach(function (m) { live[m.id] = m; });
      if (!defs.length) return '<div class="rw-empty">' + esc(L('لا مهامَّ الآن.', 'No missions right now.')) + '</div>';
      var groups = [{ p: 'daily', t: L('يوميّة', 'Daily') }, { p: 'weekly', t: L('أسبوعيّة', 'Weekly') }];
      var html = '';
      groups.forEach(function (g) {
        var rows = defs.filter(function (d) { return d.period === g.p; });
        if (!rows.length) return;
        html += '<h3 class="rw-grp">' + esc(g.t) + '</h3><div class="rw-list">';
        rows.forEach(function (d) {
          var lv = live[d.id] || { progress: 0, claimed: false, done: false };
          var prog = Math.min(d.target, Number(lv.progress) || 0), pct = d.target ? Math.round(prog / d.target * 100) : 0;
          var done = (lv.done || prog >= d.target), claimed = !!lv.claimed;
          var btn = claimed
            ? '<span class="rw-claimed">' + esc(L('مُستلَمة', 'Claimed')) + '</span>'
            : done
              ? '<button class="rw-claim" type="button" data-claim="' + esc(d.id) + '">' + esc(L('استلِمْ', 'Claim')) + '</button>'
              : '<span class="rw-prog-txt">' + prog + '/' + d.target + '</span>';
          html += '<div class="rw-mission' + (done ? ' is-done' : '') + (claimed ? ' is-claimed' : '') + '">'
            + '<div class="rw-mission__main"><div class="rw-mission__name">' + esc(L(d.ar, d.en)) + '</div>'
            + '<div class="rw-mission__bar"><span style="width:' + pct + '%"></span></div></div>'
            + '<div class="rw-mission__side"><span class="rw-reward"><span class="rw-reward__coin" aria-hidden="true"></span>' + fmt(d.coins) + '</span>' + btn + '</div>'
            + '</div>';
        });
        html += '</div>';
      });
      return html;
    },

    /* ══ لسانُ الإنجازات ══ */
    _achievementsHTML: function () {
      var s = state() || {}, cat = this._cat || {}, defs = cat.achievements || [];
      var have = {}; (s.achievements || []).forEach(function (id) { have[id] = 1; });
      if (!defs.length) return '<div class="rw-empty">' + esc(L('لا إنجازاتٍ بعد.', 'No achievements yet.')) + '</div>';
      var html = '<div class="rw-ach-grid">';
      defs.forEach(function (a) {
        var un = !!have[a.id];
        html += '<div class="rw-ach' + (un ? ' is-un' : '') + '">'
          + '<div class="rw-ach__ic">' + achIcon(a.icon) + '</div>'
          + '<div class="rw-ach__body"><div class="rw-ach__name">' + esc(L(a.ar, a.en)) + '</div>'
          + '<div class="rw-ach__desc">' + esc(L(a.descAr, a.descEn)) + '</div>'
          + '<div class="rw-ach__foot"><span class="rw-reward"><span class="rw-reward__coin" aria-hidden="true"></span>' + fmt(a.coins) + '</span>'
          + '<span class="rw-ach__status">' + esc(un ? L('مفتوح', 'Unlocked') : L('مقفل', 'Locked')) + '</span></div></div>'
          + '</div>';
      });
      return html + '</div>';
    },

    /* ══ لسانُ المخزون ══ */
    _inventoryHTML: function () {
      var s = state() || {}, meta = this._itemMeta || {};
      var owned = s.owned || [], eq = s.equipped || {};
      if (!owned.length) return '<div class="rw-empty">' + esc(L('مخزونُك فارغٌ — اقتنِ عناصرَ من المتجر.', 'Your inventory is empty — get items from the store.')) + '</div>';
      var order = ['frame', 'background', 'badge', 'celebration', 'mate_fx'];
      var T = (window.STORE && STORE.TYPE) || {};
      var byType = {}; owned.forEach(function (id) { var m = meta[id]; if (!m) return; (byType[m.type] = byType[m.type] || []).push(m); });
      var html = '';
      order.forEach(function (tp) {
        var list = byType[tp]; if (!list || !list.length) return;
        var tn = T[tp] ? L(T[tp].ar, T[tp].en) : tp;
        html += '<h3 class="rw-grp">' + esc(tn) + '</h3><div class="rw-inv-grid">';
        list.forEach(function (m) {
          var art = (window.STORE && STORE.art) ? STORE.art(m) : '';
          var isEq = eq[tp] === m.id;
          html += '<div class="rw-inv' + (isEq ? ' is-eq' : '') + '">'
            + '<div class="rw-inv__art">' + art + '</div>'
            + '<div class="rw-inv__name">' + esc(L(m.ar, m.en)) + '</div>'
            + '<button class="rw-equip' + (isEq ? ' is-on' : '') + '" type="button" data-equip="' + (isEq ? '' : esc(m.id)) + '" data-type="' + esc(tp) + '">'
            + esc(isEq ? L('مُجهَّز — إلغاء', 'Equipped — remove') : L('تجهيز', 'Equip')) + '</button>'
            + '</div>';
        });
        html += '</div>';
      });
      return html;
    },

    /* ══ المطالبةُ/التجهيزُ عبر الخادم ثم تحديثُ الحالةِ محليًّا ══ */
    _post: function (path, body, done) {
      var tok = token(); if (!tok) { if (done) done(null); return; }
      fetch(api() + path, { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }, body: JSON.stringify(body || {}) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) { var e = econ(); if (res && e && e.apply) e.apply(res); if (done) done(res); })
        .catch(function () { if (done) done(null); });
    },
    _claim: function (id) { try { if (window.SFX) SFX.btn(); } catch (e) {} var self = this; this._post('/economy/claim-mission', { missionId: id }, function () { self._render(); }); },
    _equip: function (itemId, type) { try { if (window.SFX) SFX.btn(); } catch (e) {} var self = this; this._post('/economy/equip', { itemId: itemId || '', type: type || '' }, function () { self._render(); }); }
  };

  window.REWARDS = REWARDS;
  try { window.addEventListener('amkh:cosmetics', function () { if (REWARDS._open) REWARDS._render(); }); } catch (e) {}
  try { window.addEventListener('amkh:lang', function () { if (REWARDS._open) REWARDS._render(); }); } catch (e) {}
})();
