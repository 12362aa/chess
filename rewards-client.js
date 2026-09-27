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
  /* قرصُ العملةِ الموحّدُ (نفسُ عملةِ الرئيسيّةِ) عبرَ المُصيّرِ المشترك. */
  function coinIc() { try { return (window.amkhCos && amkhCos.coin) ? amkhCos.coin() : ''; } catch (e) { return ''; } }

  /* أيقوناتُ الإنجازاتِ: SVG صغيرةٌ مرسومةٌ (بلا إيموجي). الأسماءُ مطابقةٌ
     لحقلِ icon في ACHIEVEMENTS على الخادمِ — أيُّ نقصٍ كان يسقطُ للميداليّةِ
     فتتشابهُ كلُّ الإنجازات (بلاغُ جوجو ٦). الآن لكلِّ فئةٍ رمزُها. */
  function achIcon(id) {
    var p = {
      medal: '<circle cx="12" cy="9" r="5.4"/><path d="M8 13.5 L6 21 L12 18 L18 21 L16 13.5"/>',
      board: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9 H20 M4 14 H20 M9 4 V20 M14 4 V20"/>',
      crown: '<path d="M4 18 L6 8 L10 13 L12 6 L14 13 L18 8 L20 18 Z"/><path d="M4 18 H20"/>',
      bulb: '<path d="M9 15 A5 5 0 1 1 15 15 L14 18 H10 Z"/><path d="M10 20.5 H14"/>',
      star: '<path d="M12 3 L14.6 9.2 L21 9.7 L16.2 14 L17.7 20.3 L12 16.8 L6.3 20.3 L7.8 14 L3 9.7 L9.4 9.2 Z"/>',
      sword: '<path d="M17.5 3 H21 V6.5 L12.5 15 L9 11.5 Z"/><path d="M9 11.5 L5 15.5 L8.5 19 L12.5 15"/><path d="M6.5 17 L3 20.5"/>',
      trophy: '<path d="M7 4 H17 V8 A5 5 0 0 1 7 8 Z"/><path d="M7 6 H4.4 A2.6 2.6 0 0 0 7.4 9.1"/><path d="M17 6 H19.6 A2.6 2.6 0 0 1 16.6 9.1"/><path d="M12 13 V16"/><path d="M9.6 16 H14.4 L15.6 20 H8.4 Z"/>',
      shield: '<path d="M12 3 L20 6 V12 C20 16 16.6 19.2 12 21 C7.4 19.2 4 16 4 12 V6 Z"/><path d="M9 12 L11.2 14.2 L15.5 10"/>',
      flame: '<path d="M12 3 C15 7 17 8.6 17 12 A5 5 0 0 1 7 12 C7 10 8 8.6 9.5 7 C9.9 8.6 10.7 9.3 11.5 9.6 C11 7.6 11.3 5.4 12 3 Z"/>',
      level: '<path d="M6 13 L12 7 L18 13"/><path d="M6 18.5 L12 12.5 L18 18.5"/>',
      brain: '<path d="M12 5.5 A3 3 0 0 0 6 6.1 A2.6 2.6 0 0 0 4.3 11 A2.8 2.8 0 0 0 5.6 15.4 A2.7 2.7 0 0 0 10 18.6 A2.4 2.4 0 0 0 12 19.6 Z"/><path d="M12 5.5 A3 3 0 0 1 18 6.1 A2.6 2.6 0 0 1 19.7 11 A2.8 2.8 0 0 1 18.4 15.4 A2.7 2.7 0 0 1 14 18.6 A2.4 2.4 0 0 1 12 19.6"/>',
      gem: '<path d="M8 4 H16 L20 9 L12 20 L4 9 Z"/><path d="M4 9 H20 M9.6 9 L12 20 M14.4 9 L12 20 M8 4 L9.6 9 M16 4 L14.4 9"/>',
      dragon: '<path d="M4 15 C4 11 7 8 11 8 H14 L17 5 L18 9 L21 10 L18 12 V15 C18 18 15 20 11 20 H7 Z"/><circle cx="14.2" cy="11" r=".95" fill="currentColor" stroke="none"/><path d="M8.5 20 L7.5 22 M13 20 L12 22"/>',
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">' + (p[id] || p.medal) + '</svg>';
  }

  /* أيقونةُ المهمّةِ حسبَ مقياسِها (metric يأتي في لقطةِ الخادم) — كلُّ مهمّةٍ
     صار لها رمزٌ مرسومٌ بدلًا من الصفِّ النصّيِّ العاري (بلاغُ جوجو ٥). */
  function misIcon(metric) {
    var p = {
      games: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9 H20 M4 14 H20 M9 4 V20 M14 4 V20"/>',
      wins: '<path d="M7 4 H17 V8 A5 5 0 0 1 7 8 Z"/><path d="M7 6 H4.4 A2.6 2.6 0 0 0 7.4 9.1"/><path d="M17 6 H19.6 A2.6 2.6 0 0 1 16.6 9.1"/><path d="M12 13 V16"/><path d="M9.6 16 H14.4 L15.6 20 H8.4 Z"/>',
      puzzles: '<path d="M5 5 H10.4 V7.1 A1.85 1.85 0 1 0 13.6 7.1 V5 H19 V10.4 H16.9 A1.85 1.85 0 1 0 16.9 13.6 H19 V19 H13.6 V16.9 A1.85 1.85 0 1 1 10.4 16.9 V19 H5 Z"/>',
      checkmate: '<path d="M12 3 V6 M10.4 4.6 H13.6"/><path d="M7 20.5 H17 L18 12 L14.8 14 L12 8.6 L9.2 14 L6 12 Z"/><path d="M3.6 21 L20.4 3.6"/>',
      streak: '<path d="M12 3 C15 7 17 8.6 17 12 A5 5 0 0 1 7 12 C7 10 8 8.6 9.5 7 C9.9 8.6 10.7 9.3 11.5 9.6 C11 7.6 11.3 5.4 12 3 Z"/>',
      nour: '<rect x="5" y="7" width="14" height="11" rx="3.4"/><path d="M12 3.6 V7"/><circle cx="9.4" cy="12.3" r="1.05" fill="currentColor" stroke="none"/><circle cx="14.6" cy="12.3" r="1.05" fill="currentColor" stroke="none"/><path d="M9.8 15.3 H14.2"/>',
      draws: '<circle cx="12" cy="12" r="8.4"/><path d="M8 10.2 H16 M8 13.8 H16"/>',
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">' + (p[metric] || p.games) + '</svg>';
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
      /* اللوحةُ نفسُها التي للمتجر: أرجوانٌ عميقٌ (توحيدُ الألوانِ — بلاغُ ٤).
         الشروقُ والإكليلُ والنجومُ تبقى ذهبيّةً فيبقى الطابعُ «قاعةَ شرفٍ». */
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(36,16,66,' + a + ')'); g.addColorStop(0.5, 'rgba(22,10,44,' + a + ')');
      g.addColorStop(1, 'rgba(12,6,24,' + a + ')');
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
      var bc = document.getElementById('rw-balance-coin'); if (bc && !bc.firstChild) bc.innerHTML = coinIc();
      var lv = document.getElementById('rw-level'); if (lv) lv.textContent = 'LV ' + String(s.level || 1);
      var maxed = (s.level || 1) >= (s.maxLevel || 50);
      var lo = Number(s.thisLevelXp) || 0, hi = Number(s.nextLevelXp) || (lo + 1), xp = Number(s.xp) || 0;
      var txt = document.getElementById('rw-xp-txt');
      if (txt) txt.textContent = maxed ? L('المستوى الأقصى', 'Max level') : (fmt(xp) + ' / ' + fmt(hi) + ' XP');
      var fill = document.getElementById('rw-xp-fill');
      if (fill) {
        var pct = hi > lo ? Math.max(0, Math.min(100, ((xp - lo) / (hi - lo)) * 100)) : 100;
        if (maxed) pct = 100;
        fill.style.width = pct.toFixed(1) + '%';
      }
    },

    /* ══ لسانُ المهام ══ */
    _missionsHTML: function () {
      /* المصدرُ الآن لقطةُ الخادمِ مباشرةً: مهامٌّ مولّدةٌ لكلِّ لاعبٍ تحملُ
         ar/en/period/metric/target/coins/xp/progress/done/claimed. */
      var s = state() || {}, defs = s.missions || [];
      if (!defs.length) return '<div class="rw-empty">' + esc(L('لا مهامَّ الآن.', 'No missions right now.')) + '</div>';
      var groups = [
        { p: 'daily',  t: L('مهامُّ اليوم', 'Today’s Missions'),  k: 'rw-grp--day',  sub: L('تتبدّلُ كلَّ يوم', 'Refreshes daily') },
        { p: 'weekly', t: L('مهامُّ الأسبوع', 'Weekly Missions'), k: 'rw-grp--week', sub: L('تتبدّلُ كلَّ أسبوع', 'Refreshes weekly') }
      ];
      var html = '';
      groups.forEach(function (g) {
        var rows = defs.filter(function (d) { return d.period === g.p; });
        if (!rows.length) return;
        var ready = rows.filter(function (d) { return (d.done || (Number(d.progress) || 0) >= d.target) && !d.claimed; }).length;
        html += '<div class="rw-sec ' + g.k + '">'
          + '<div class="rw-sec__hd"><span class="rw-sec__ttl">' + esc(g.t) + '</span>'
          + '<span class="rw-sec__sub">' + esc(g.sub) + '</span>'
          + (ready ? '<span class="rw-sec__rdy">' + esc(L('جاهزٌ للاستلام', 'Ready')) + ' ' + ready + '</span>' : '')
          + '</div><div class="rw-list">';
        rows.forEach(function (d) {
          var prog = Math.min(d.target, Number(d.progress) || 0), pct = d.target ? Math.round(prog / d.target * 100) : 0;
          var done = (d.done || prog >= d.target), claimed = !!d.claimed;
          var btn = claimed
            ? '<span class="rw-claimed">' + esc(L('مُستلَمة', 'Claimed')) + '</span>'
            : done
              ? '<button class="rw-claim" type="button" data-claim="' + esc(d.id) + '">' + esc(L('استلِمْ', 'Claim')) + '</button>'
              : '<span class="rw-prog-txt">' + prog + '/' + d.target + '</span>';
          html += '<div class="rw-mission' + (done ? ' is-done' : '') + (claimed ? ' is-claimed' : '') + '">'
            + '<span class="rw-mission__ic" aria-hidden="true">' + misIcon(d.metric) + '</span>'
            + '<div class="rw-mission__main"><div class="rw-mission__name">' + esc(L(d.ar, d.en)) + '</div>'
            + '<div class="rw-mission__bar"><span style="width:' + pct + '%"></span></div>'
            + '<div class="rw-mission__rewards"><span class="rw-reward"><span class="rw-reward__coin" aria-hidden="true">' + coinIc() + '</span>' + fmt(d.coins) + '</span>'
            + (d.xp ? '<span class="rw-xp-chip">+' + fmt(d.xp) + ' XP</span>' : '') + '</div></div>'
            + '<div class="rw-mission__side">' + btn + '</div>'
            + '</div>';
        });
        html += '</div></div>';
      });
      return html;
    },

    /* ══ لسانُ الإنجازات ══
       مجموعةٌ حسبَ الفئةِ (معارك/إتقان/ألغاز/مجموعة/خاصّة)، ولكلِّ إنجازٍ
       رتبتُه (برونزيّ→أسطوريّ) بصفيحةٍ مرسومةٍ ولونٍ خاصٍّ، ومكافأتُه
       تُعرَضُ عملةً **وXP** (كان الـXP غائبًا كليًّا — بلاغُ جوجو ٦). */
    _achievementsHTML: function () {
      var s = state() || {}, cat = this._cat || {}, defs = cat.achievements || [];
      var have = {}; (s.achievements || []).forEach(function (id) { have[id] = 1; });
      if (!defs.length) return '<div class="rw-empty">' + esc(L('لا إنجازاتٍ بعد.', 'No achievements yet.')) + '</div>';
      var CATS = [
        { k: 'battle',  ar: 'المعارك',   en: 'Battle' },
        { k: 'mastery', ar: 'الإتقان',   en: 'Mastery' },
        { k: 'puzzle',  ar: 'الألغاز',   en: 'Puzzles' },
        { k: 'collect', ar: 'المجموعة',  en: 'Collection' },
        { k: 'special', ar: 'الخاصّة',   en: 'Special' }
      ];
      var TIER = {
        bronze: { ar: 'برونزيّ', en: 'Bronze' }, silver: { ar: 'فضّيّ', en: 'Silver' },
        gold:   { ar: 'ذهبيّ',   en: 'Gold' },   legend: { ar: 'أسطوريّ', en: 'Legend' }
      };
      var un = 0; defs.forEach(function (a) { if (have[a.id]) un++; });
      var html = '<div class="rw-tally"><span class="rw-tally__n">' + un + ' / ' + defs.length + '</span>'
        + '<span class="rw-tally__t">' + esc(L('إنجازٌ مفتوح', 'unlocked')) + '</span>'
        + '<span class="rw-tally__bar"><span style="width:' + (defs.length ? Math.round(un / defs.length * 100) : 0) + '%"></span></span></div>';
      var buckets = {}; defs.forEach(function (a) { var c = a.cat || 'battle'; (buckets[c] = buckets[c] || []).push(a); });
      CATS.forEach(function (c) {
        var rows = buckets[c.k]; if (!rows || !rows.length) return;
        html += '<div class="rw-sec"><div class="rw-sec__hd"><span class="rw-sec__ttl">' + esc(L(c.ar, c.en)) + '</span></div>'
          + '<div class="rw-ach-grid">';
        rows.forEach(function (a) {
          var got = !!have[a.id], tr = TIER[a.tier] ? a.tier : 'bronze';
          html += '<div class="rw-ach rw-ach--' + tr + (got ? ' is-un' : '') + '">'
            + '<i class="rw-plate" aria-hidden="true"></i>'
            + '<div class="rw-ach__ic">' + achIcon(a.icon) + '</div>'
            + '<div class="rw-ach__body"><div class="rw-ach__name">' + esc(L(a.ar, a.en)) + '</div>'
            + '<div class="rw-ach__desc">' + esc(L(a.descAr, a.descEn)) + '</div>'
            + '<div class="rw-ach__foot">'
            + '<span class="rw-ach__rw"><span class="rw-reward"><span class="rw-reward__coin" aria-hidden="true">' + coinIc() + '</span>' + fmt(a.coins) + '</span>'
            + (a.xp ? '<span class="rw-xp-chip">+' + fmt(a.xp) + ' XP</span>' : '') + '</span>'
            + '<span class="rw-ach__status">' + esc(got ? L(TIER[tr].ar, TIER[tr].en) : L('مقفل', 'Locked')) + '</span>'
            + '</div></div></div>';
        });
        html += '</div></div>';
      });
      return html;
    },

    /* ══ لسانُ المخزون ══
       كلُّ بطاقةٍ صارت بندرةِ عنصرِها: لونٌ وصفيحةٌ مرسومةٌ ووسمُ ندرةٍ —
       نفسُ لغةِ المتجرِ البصريّةِ بالحرفِ (بلاغا جوجو ٤ و٧). */
    _inventoryHTML: function () {
      var s = state() || {}, meta = this._itemMeta || {};
      var owned = s.owned || [], eq = s.equipped || {};
      if (!owned.length) return '<div class="rw-empty">' + esc(L('مخزونُك فارغٌ — اقتنِ عناصرَ من المتجر.', 'Your inventory is empty — get items from the store.')) + '</div>';
      var order = ['frame', 'background', 'badge', 'celebration', 'mate_fx'];
      var T = (window.STORE && STORE.TYPE) || {};
      var R = (window.STORE && STORE.RARITY) || {};
      var byType = {}; owned.forEach(function (id) { var m = meta[id]; if (!m) return; (byType[m.type] = byType[m.type] || []).push(m); });
      var RANK = { mythic: 6, legendary: 5, seasonal: 4, epic: 3, rare: 2, common: 1 };
      var html = '';
      order.forEach(function (tp) {
        var list = byType[tp]; if (!list || !list.length) return;
        list = list.slice().sort(function (a, b) { return (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0); });
        var tn = T[tp] ? L(T[tp].ar, T[tp].en) : tp;
        html += '<div class="rw-sec"><div class="rw-sec__hd"><span class="rw-sec__ttl">' + esc(tn) + '</span>'
          + '<span class="rw-sec__sub">' + list.length + '</span></div><div class="rw-inv-grid">';
        list.forEach(function (m) {
          var art = (window.STORE && STORE.art) ? STORE.art(m) : '';
          var isEq = eq[tp] === m.id;
          var rar = m.rarity || 'common';
          var rn = R[rar] ? L(R[rar].ar, R[rar].en) : rar;
          html += '<div class="rw-inv rw-inv--' + esc(rar) + (isEq ? ' is-eq' : '') + '">'
            + '<i class="rw-plate" aria-hidden="true"></i>'
            + '<span class="rw-inv__rar">' + esc(rn) + '</span>'
            + '<div class="rw-inv__art">' + art + '</div>'
            + '<div class="rw-inv__name">' + esc(L(m.ar, m.en)) + '</div>'
            + '<button class="rw-equip' + (isEq ? ' is-on' : '') + '" type="button" data-equip="' + (isEq ? '' : esc(m.id)) + '" data-type="' + esc(tp) + '">'
            + esc(isEq ? L('مُجهَّز — إلغاء', 'Equipped — remove') : L('تجهيز', 'Equip')) + '</button>'
            + '</div>';
        });
        html += '</div></div>';
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
  /* مراقبةُ الترقّي عالميًّا (لا يشترطُ فتحَ شاشةِ الجوائز): نقارنُ مستوى كلِّ
     لقطةٍ جديدةٍ بالسابقةِ، وعندَ الارتفاعِ نُطلقُ احتفالَ الترقّي كاملَ الشاشة.
     أوّلُ لقطةٍ تُهيّئُ المرجعَ فقط فلا احتفالَ زائفٌ عندَ الإقلاع. */
  var _lvlSeen = null;
  function _watchLevel() {
    try {
      var s = state(); if (!s) return;
      var lvl = Number(s.level) || 1;
      if (_lvlSeen == null) { _lvlSeen = lvl; return; }
      if (lvl > _lvlSeen && window.amkhCos && amkhCos.levelUp) {
        amkhCos.levelUp(lvl, L('ارتقيتَ!', 'Level Up!'), L('المستوى ' + lvl, 'Level ' + lvl));
      }
      _lvlSeen = lvl;
    } catch (e) {}
  }
  try { window.addEventListener('amkh:cosmetics', function () { _watchLevel(); if (REWARDS._open) REWARDS._render(); }); } catch (e) {}
  try { window.addEventListener('amkh:lang', function () { if (REWARDS._open) REWARDS._render(); }); } catch (e) {}
})();
