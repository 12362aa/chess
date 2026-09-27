/* ══════════════════════════════════════════════════════════════════════
   economy-client.js — واجهة اقتصاد Am-Kh Coins (المرحلة ١)
   ──────────────────────────────────────────────────────────────────────
   مرآة قراءة فقط: الخادم مصدر الحقيقة الوحيد للعملات/XP/المستوى/الملكية.
   لا نكتب أي رصيد للخادم من هنا — نطلب /api/economy/me ونعرض. الأحداث
   المكسِبة (لغز محلول/هزيمة نور) تُبلَّغ للخادم وهو يقرّر المنح.
   window.amkhEconomy: refresh(), apply(snap), state, notifyPuzzleSolved(),
   notifyBeatNour().
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LS_KEY = 'amkh_economy_cache';

  var amkhEconomy = {
    state: null,       // آخر لقطة من الخادم
    _inflight: false,

    // نداء موثّق مساعد
    _api: function () {
      try { return (window.getApiBase && window.getApiBase()) || ((window.SERVER_HTTP || '') + '/api'); }
      catch (e) { return '/api'; }
    },
    _token: function () {
      try { return window.amkhAuth && window.amkhAuth.token; } catch (e) { return null; }
    },

    /* اطلب اللقطة الحالية من الخادم. صامت لو لا يوجد توكن (زائر). */
    refresh: function () {
      var tok = this._token();
      if (!tok) { this._renderHidden(); return Promise.resolve(null); }
      if (this._inflight) return Promise.resolve(this.state);
      this._inflight = true;
      var self = this;
      return fetch(this._api() + '/economy/me', {
        headers: { 'Authorization': 'Bearer ' + tok, 'ngrok-skip-browser-warning': 'true' }
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (snap) { self._inflight = false; if (snap) self.apply(snap); return snap; })
        .catch(function () { self._inflight = false; return null; });
    },

    /* طبّق لقطة (من refresh أو من رسالة economy:update على السوكت). */
    apply: function (snap) {
      if (!snap || typeof snap !== 'object') return;
      this.state = snap;
      try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e) {}
      this._render();
      try { window.dispatchEvent(new Event('amkh:cosmetics')); } catch (e) {}
    },

    coins: function () { return (this.state && this.state.coins) || 0; },
    level: function () { return (this.state && this.state.level) || 1; },

    /* أبلغ الخادم بحلّ لغز — هو يطبّق السقف اليومي ويمنع التكرار. */
    notifyPuzzleSolved: function (puzzleId) {
      var tok = this._token(); if (!tok) return;
      var self = this;
      fetch(this._api() + '/economy/puzzle-solved', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ puzzleId: puzzleId != null ? String(puzzleId) : undefined })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) { if (res) self.apply(res); }).catch(function () {});
    },

    /* أبلغ الخادم بهزيمة نور (وضع اللعب ضدّه) — يُمنح مرّة واحدة. */
    notifyBeatNour: function () {
      var tok = this._token(); if (!tok) return;
      var self = this;
      fetch(this._api() + '/economy/beat-nour', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: '{}'
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) { if (res) self.apply(res); }).catch(function () {});
    },

    /* ══ العرض ══ */
    _fmt: function (n) {
      n = Number(n) || 0;
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      return String(n);
    },
    _renderHidden: function () {
      var wrap = document.getElementById('home-econ');
      if (wrap) wrap.hidden = true;
    },
    _render: function () {
      var s = this.state; if (!s) return;
      var wrap = document.getElementById('home-econ');
      if (!wrap) return;
      wrap.hidden = false;
      var cv = document.getElementById('home-econ-coin-val');
      if (cv) cv.textContent = this._fmt(s.coins);
      var lv = document.getElementById('home-econ-lvl');
      if (lv) lv.textContent = String(s.level || 1);
      var fill = document.getElementById('home-econ-xp-fill');
      var cap = document.getElementById('home-econ-xp-cap');
      var lo = Number(s.thisLevelXp) || 0, hi = Number(s.nextLevelXp) || (lo + 1);
      var xp = Number(s.xp) || 0, maxed = (s.level || 1) >= (s.maxLevel || 50);
      if (fill) {
        var pct = hi > lo ? Math.max(0, Math.min(100, ((xp - lo) / (hi - lo)) * 100)) : 100;
        if (maxed) pct = 100;
        fill.style.width = pct.toFixed(1) + '%';
      }
      /* رقمُ XP صريحٌ تحتَ الشريطِ (محايدُ اللغةِ: XP مفهومةٌ في اللغتين). */
      if (cap) cap.textContent = maxed ? ('MAX · ' + this._fmt(xp) + ' XP') : (this._fmt(xp) + ' / ' + this._fmt(hi) + ' XP');
    },

    init: function () {
      // اعرض النسخة المخبّأة فورًا (تجربة أسرع) ثم حدّث من الخادم
      try {
        var cached = localStorage.getItem(LS_KEY);
        if (cached) { this.state = JSON.parse(cached); this._render(); }
      } catch (e) {}
      var self = this;
      // أول تحديث بعد أن يجهز التوكن
      var tries = 0;
      var tick = function () {
        if (self._token()) { self.refresh(); return; }
        if (++tries < 40) setTimeout(tick, 500); // حتى 20ث بانتظار الدخول
      };
      tick();
    }
  };

  window.amkhEconomy = amkhEconomy;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { amkhEconomy.init(); });
  } else {
    amkhEconomy.init();
  }
})();

/* ══════════════════════════════════════════════════════════════════════
   amkhCos — محرّك التجميل الظاهر (المرحلة ٣)
   ──────────────────────────────────────────────────────────────────────
   يُنتج أجزاء HTML مكتفية بذاتها (SVG SMIL يتحرّك وحده في WebView) تُدسّ
   داخل صناديق الأفاتار/الاسم في كل مكان يظهر فيه اللاعب: الصدارة، بطاقة
   اللاعب، الأصدقاء، الشات، الرئيسية، داخل المباراة. كله transform/opacity
   فقط — لا مساس بأداء اللوح. cos = {frame,background,badge,celebration,mate_fx}.
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // لوحات ألوان الإطارات: [رئيسي، غامق، لمعة]
  var FRAME = {
    frame_gold:    ['#f7d774', '#b8860b', '#fff3c4'],
    frame_neon:    ['#00eaff', '#ff00e6', '#a6fbff'],
    frame_flame:   ['#ffb347', '#ff2d00', '#ffe08a'],
    frame_frost:   ['#bfefff', '#3aa0e0', '#ffffff'],
    frame_royal:   ['#c9a84c', '#6a3fd6', '#fff0b0'],
    frame_ocean:   ['#33d0ff', '#0066aa', '#bff0ff'],
    frame_aurora:  ['#5affc0', '#8a5cff', '#c8ffe6'],
    frame_shadow:  ['#8a7bd6', '#140f28', '#c4b8ff'],
    frame_emerald: ['#4cffa0', '#0a8a4a', '#c8ffe0'],
    frame_galaxy:  ['#a86bff', '#2233aa', '#e0c8ff'],
    frame_phoenix: ['#ff8a3a', '#ff1e00', '#ffd27a'],
    frame_sakura:  ['#ffc2dd', '#ff5fa2', '#ffe6f0'],
    // ═══ Mythic (الأندرُ — طوقٌ متعدّدُ الطبقاتِ فخم) ═══
    frame_dragon:    ['#ff7a2f', '#7a1500', '#ffd27a'],
    frame_celestial: ['#8fd4ff', '#183a8f', '#ffffff'],
    frame_inferno:   ['#ff3d00', '#3a0505', '#ffb347'],
    frame_void:      ['#b06bff', '#0a0618', '#e0c8ff'],
    frame_thunder:   ['#ffe14a', '#2a2d6a', '#fff7c4'],
    frame_prism:     ['#5affc0', '#ff6ad5', '#8fd4ff'],
    frame_seraph:    ['#fff0b0', '#c9a84c', '#ffffff'],
    frame_obsidian:  ['#7a7a90', '#0a0a12', '#d0d0e0'],
    // ═══ توسعةُ البناء ٦٢ — نادرٌ وملحميٌّ بجودةِ الفاخرِ نفسِها ═══
    frame_steel:   ['#c8d2de', '#495568', '#ffffff'],
    frame_vine:    ['#6fcf5a', '#1a5226', '#d8ffcc'],
    frame_ruby:    ['#ff4a6a', '#7a0a20', '#ffc2cf'],
    frame_sand:    ['#e8c37a', '#8a6020', '#fff0cc'],
    frame_tide:    ['#4ad6ff', '#0a4a7a', '#cceeff'],
    frame_storm:   ['#9fb0d6', '#1a1f3a', '#eef4ff'],
    frame_arcane:  ['#c07aff', '#2a0a4a', '#eeccff'],
    frame_venom:   ['#9fff2f', '#255208', '#e0ffb0'],
    frame_solar:   ['#ffb02f', '#a03a00', '#fff0b0'],
    frame_lunar:   ['#dce6f5', '#3a4a6a', '#ffffff'],
  };
  // (لم يعد فيه إطارٌ يعتمد على النبض العام — كلٌّ له رسمُه الخاصّ أدناه)
  var FRAME_GLOW = {};

  // رُسومٌ خاصّةٌ مميّزةٌ لكلّ إطارٍ (مطابقةٌ/متفوّقةٌ على فنّ المتجر) — viewBox 0 0 100 100
  // الإطارُ طوقٌ حولَ الأفاتار (بلا رسمِ وجهٍ)، فالحلقةُ الرئيسيّةُ عندَ r≈45.
  var FRAME_SPECIAL = {
    // الذهب: طوقٌ مزدوجٌ + قوسا لمعانٍ متعاكسان + ٨ نجومٍ تتلألأ + نجمةٌ مدارية
    frame_gold: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="7"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="1.3" opacity="0.5"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#fff8dc" stroke-width="6.5" stroke-linecap="round" stroke-dasharray="22 320"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="2.6s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="2" stroke-linecap="round" stroke-dasharray="8 58" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="6s" repeatCount="indefinite"/></circle>'
        + '<g fill="#fff8dc"><circle cx="50" cy="5" r="1.7"><animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite"/></circle><circle cx="82" cy="18" r="1.4"><animate attributeName="opacity" values="0;1;0" dur="1.5s" begin="0.4s" repeatCount="indefinite"/></circle><circle cx="95" cy="50" r="1.5"><animate attributeName="opacity" values="0;1;0" dur="1.5s" begin="0.7s" repeatCount="indefinite"/></circle><circle cx="18" cy="82" r="1.4"><animate attributeName="opacity" values="0;1;0" dur="1.5s" begin="1s" repeatCount="indefinite"/></circle><circle cx="5" cy="50" r="1.5"><animate attributeName="opacity" values="0;1;0" dur="1.5s" begin="1.3s" repeatCount="indefinite"/></circle></g>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/><path d="M50 2 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z" fill="#fff"/></g>';
    },
    // النيون: هالةٌ متبدّلةُ اللونِ + شريطٌ منسابٌ + مذنّبٌ مداريٌّ متوهّج
    frame_neon: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[0] + '" stroke-width="10" opacity="0.28"><animate attributeName="stroke" values="' + t[0] + ';' + t[1] + ';' + t[0] + '" dur="2.6s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[0] + '" stroke-width="4"><animate attributeName="stroke" values="' + t[0] + ';' + t[1] + ';' + t[2] + ';' + t[0] + '" dur="3.2s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="3" stroke-dasharray="7 11" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="0" to="36" dur="1s" repeatCount="indefinite"/></circle>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="2.2s" repeatCount="indefinite"/><circle cx="50" cy="5" r="3" fill="#fff"/><circle cx="50" cy="5" r="5" fill="' + t[2] + '" opacity="0.4"/><circle cx="58" cy="6" r="1.6" fill="' + t[2] + '" opacity="0.6"/><circle cx="66" cy="8" r="1" fill="' + t[2] + '" opacity="0.35"/></g>';
    },
    // اللهب: طوقٌ ناريٌّ + ألسنةُ لهبٍ حولَ كاملِ الطوق + جمراتٌ صاعدة
    frame_flame: function (t, g) {
      var tongue = function (cx, cy, s, rot, dur, bg) { return '<path d="M' + cx + ' ' + cy + ' q' + (-3 * s) + ' ' + (-6 * s) + ' 0 ' + (-12 * s) + ' q' + (3 * s) + ' ' + (6 * s) + ' 0 ' + (12 * s) + 'z" fill="' + bg + '" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"><animate attributeName="opacity" values="0.35;1;0.35" dur="' + dur + 's" repeatCount="indefinite"/></path>'; };
      var ring = '';
      var pts = [[50,5,0],[73,12,42],[88,27,80],[95,50,90],[88,73,120],[73,88,150],[50,95,180],[27,88,210],[12,73,240],[5,50,270],[12,27,300],[27,12,330]];
      for (var i = 0; i < pts.length; i++) ring += tongue(pts[i][0], pts[i][1], (i % 2 ? 1 : 1.4), pts[i][2], (0.6 + (i % 3) * 0.18).toFixed(2), i % 2 ? t[2] : t[0]);
      return '<circle cx="50" cy="50" r="43" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<g>' + ring + '</g>'
        + '<g fill="' + t[2] + '"><circle cx="40" cy="94" r="1.8"><animate attributeName="cy" values="94;56" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="60" cy="96" r="1.4"><animate attributeName="cy" values="96;54" dur="2.1s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2.1s" repeatCount="indefinite"/></circle></g>';
    },
    // الصقيع: طوقٌ بلّوريٌّ + بلّوراتٌ + ثلجٌ متساقطٌ حيٌّ (طلب جوجو الأهمّ)
    frame_frost: function (t, g) {
      var flake = function (x, r, dur) {
        return '<circle cx="' + x + '" cy="6" r="' + r + '"><animate attributeName="cy" values="4;96" dur="' + dur + 's" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="' + dur + 's" repeatCount="indefinite"/></circle>';
      };
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<g stroke="' + t[2] + '" stroke-width="2" stroke-linecap="round" opacity="0.95" fill="none"><path d="M50 12 v9 M45 16 h10 M50 12 l-4 4 M50 12 l4 4"/></g>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-dasharray="5 320" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3.4s" repeatCount="indefinite"/></circle>'
        + '<g fill="#ffffff">' + flake(38, 2, 3.2) + flake(58, 1.6, 3.9) + flake(50, 1.4, 2.9) + flake(30, 1.5, 3.5) + flake(66, 1.7, 4.2) + '</g>';
    },
    // الملكيّ: طوقٌ ذهبيٌّ + تاجٌ في القمّةِ + جواهرُ تتلألأ + قوسُ ضوءٍ يجول
    frame_royal: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="6.5"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#fff8dc" stroke-width="3" stroke-linecap="round" stroke-dasharray="16 320" opacity="0.9"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/></circle>'
        + '<g fill="' + t[1] + '"><circle cx="94" cy="50" r="4.2"/><circle cx="50" cy="94" r="4.2"/><circle cx="6" cy="50" r="4.2"/></g>'
        + '<g><path d="M38 12 L43 3 L50 9 L57 3 L62 12 Z" fill="' + t[0] + '" stroke="' + t[1] + '" stroke-width="0.8"/><circle cx="50" cy="8" r="1.6" fill="#fff"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite"/></circle></g>'
        + '<g fill="#ffffff"><circle cx="94" cy="50" r="1.5"><animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="0.4s" repeatCount="indefinite"/></circle><circle cx="50" cy="94" r="1.5"><animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="0.8s" repeatCount="indefinite"/></circle><circle cx="6" cy="50" r="1.5"><animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="1.2s" repeatCount="indefinite"/></circle></g>';
    },
    // المحيط: طوقٌ + تيّارٌ منسابٌ + موجتان تتمدّدان + فقاعاتٌ صاعدة
    frame_ocean: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="2.4" stroke-dasharray="6 9"><animate attributeName="stroke-dashoffset" from="30" to="0" dur="2s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="34" fill="none" stroke="' + t[2] + '" stroke-width="1.6"><animate attributeName="r" values="34;47;34" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.55;0;0.55" dur="2.4s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="34" fill="none" stroke="' + t[0] + '" stroke-width="1.2"><animate attributeName="r" values="34;47;34" dur="2.4s" begin="1.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" begin="1.2s" repeatCount="indefinite"/></circle>'
        + '<g fill="none" stroke="' + t[2] + '" stroke-width="1"><circle cx="34" cy="90" r="2"><animate attributeName="cy" values="92;12" dur="3.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0" dur="3.2s" repeatCount="indefinite"/></circle><circle cx="66" cy="88" r="1.5"><animate attributeName="cy" values="94;16" dur="3.9s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.8;0" dur="3.9s" repeatCount="indefinite"/></circle></g>';
    },
    // الشفق: طوقٌ متبدّلُ الألوانِ + شريطٌ شفقيٌّ في القمّةِ + نجومٌ سابحةٌ + قوسُ لمعان
    frame_aurora: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[0] + '" stroke-width="6" opacity="0.6"><animate attributeName="stroke" values="' + t[0] + ';' + t[1] + ';' + t[2] + ';' + t[0] + '" dur="4s" repeatCount="indefinite"/></circle>'
        + '<path d="M10 30 Q30 14 50 26 Q70 38 90 22" fill="none" stroke="' + t[2] + '" stroke-width="3" stroke-linecap="round" opacity="0.7"><animate attributeName="opacity" values="0.25;0.8;0.25" dur="3s" repeatCount="indefinite"/><animate attributeName="stroke" values="' + t[2] + ';' + t[0] + ';' + t[1] + ';' + t[2] + '" dur="4s" repeatCount="indefinite"/></path>'
        + '<g fill="#fff"><circle cx="26" cy="20" r="1.3"><animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></circle><circle cx="74" cy="80" r="1.2"><animate attributeName="opacity" values="0;1;0" dur="2.3s" begin="0.6s" repeatCount="indefinite"/></circle><circle cx="84" cy="34" r="1" fill="' + t[2] + '"><animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="1s" repeatCount="indefinite"/></circle></g>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-dasharray="12 320" stroke-linecap="round" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3s" repeatCount="indefinite"/></circle>';
    },
    // العنقاء: حلقةٌ + جناحان ناريّان جانبيّان + جمراتٌ صاعدة
    frame_phoenix: function (t, g) {
      return '<circle cx="50" cy="50" r="42" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<g fill="url(#' + g + ')">'
        + '<path d="M22 54 Q5 40 11 18 Q28 30 34 46 Q28 51 22 54Z"><animate attributeName="opacity" values="0.7;1;0.7" dur="1.1s" repeatCount="indefinite"/></path>'
        + '<path d="M78 54 Q95 40 89 18 Q72 30 66 46 Q72 51 78 54Z"><animate attributeName="opacity" values="1;0.7;1" dur="1.1s" repeatCount="indefinite"/></path>'
        + '</g>'
        + '<g fill="' + t[2] + '">'
        + '<circle cx="42" cy="92" r="2.2"><animate attributeName="cy" values="94;62" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.5s" repeatCount="indefinite"/></circle>'
        + '<circle cx="58" cy="92" r="1.8"><animate attributeName="cy" values="96;60" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite"/></circle>'
        + '</g>';
    },
    // الكرز/الساكورا: حلقةٌ + إكليلُ بتلاتٍ دوّار (٦ بتلات) — مختلفٌ تمامًا عن العنقاء
    frame_sakura: function (t, g) {
      var pet = ['<ellipse cx="50" cy="9" rx="4.5" ry="7"/>',
        '<ellipse cx="85.5" cy="29.5" rx="4.5" ry="7" transform="rotate(60 85.5 29.5)"/>',
        '<ellipse cx="85.5" cy="70.5" rx="4.5" ry="7" transform="rotate(120 85.5 70.5)"/>',
        '<ellipse cx="50" cy="91" rx="4.5" ry="7"/>',
        '<ellipse cx="14.5" cy="70.5" rx="4.5" ry="7" transform="rotate(60 14.5 70.5)"/>',
        '<ellipse cx="14.5" cy="29.5" rx="4.5" ry="7" transform="rotate(120 14.5 29.5)"/>'].join('');
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="4.5"/>'
        + '<g fill="' + t[0] + '"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="9s" repeatCount="indefinite"/>' + pet + '</g>';
    },
    // المجرّة: حلقةٌ + مداران متعاكسان بكواكبَ ونجومٍ + لبٌّ لولبيٌّ متوهّج + وميض
    frame_galaxy: function (t, g) {
      return '<circle cx="50" cy="50" r="43" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="5s" repeatCount="indefinite"/>'
        + '<circle cx="50" cy="7" r="4" fill="#ffffff"/><circle cx="50" cy="7" r="6" fill="#fff" opacity="0.3"/><circle cx="90" cy="57" r="3.2" fill="' + t[2] + '"/><circle cx="13" cy="63" r="2.6" fill="' + t[0] + '"/></g>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="8s" repeatCount="indefinite"/><circle cx="50" cy="18" r="2" fill="' + t[2] + '"/><circle cx="82" cy="50" r="1.6" fill="#fff"/><circle cx="22" cy="40" r="1.4" fill="' + t[0] + '"/></g>'
        + '<circle cx="50" cy="50" r="10" fill="none" stroke="' + t[2] + '" stroke-width="1.2" opacity="0.5"><animate attributeName="opacity" values="0.25;0.7;0.25" dur="2.2s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="4" fill="' + t[2] + '" opacity="0.6"><animate attributeName="r" values="3;5;3" dur="2.2s" repeatCount="indefinite"/></circle>';
    },
    // الزمرّد: مثمّنٌ مُوجَّهٌ + بريقٌ يجول على الحوافّ + جواهرُ تتلألأ على الزوايا
    frame_emerald: function (t, g) {
      var oct = '50,6 76,18 94,50 76,82 50,94 24,82 6,50 24,18';
      var verts = [[50,6],[76,18],[94,50],[76,82],[50,94],[24,82],[6,50],[24,18]], gems = '';
      for (var i = 0; i < verts.length; i++) gems += '<circle cx="' + verts[i][0] + '" cy="' + verts[i][1] + '" r="1.6" fill="#fff"><animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="' + (i * 0.22).toFixed(2) + 's" repeatCount="indefinite"/></circle>';
      return '<polygon points="' + oct + '" fill="none" stroke="url(#' + g + ')" stroke-width="6" stroke-linejoin="round"/>'
        + '<polygon points="' + oct + '" fill="none" stroke="' + t[1] + '" stroke-width="1.4" stroke-linejoin="round" opacity="0.6"/>'
        + '<polygon points="' + oct + '" fill="none" stroke="' + t[2] + '" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="14 240"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3s" repeatCount="indefinite"/></polygon>'
        + '<g>' + gems + '</g>';
    },
    // الظلّ: حلقةٌ + خصلاتٌ ظلاميّةٌ نابضةٌ + جمراتٌ بنفسجيّةٌ مداريّةٌ + قوسٌ متقطّعٌ معاكس
    frame_shadow: function (t, g) {
      return '<circle cx="50" cy="50" r="44" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<circle cx="50" cy="50" r="44" fill="none" stroke="' + t[2] + '" stroke-width="2" stroke-dasharray="4 12" stroke-linecap="round" opacity="0.6"><animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="5s" repeatCount="indefinite"/></circle>'
        + '<g fill="' + t[0] + '">'
        + '<circle cx="50" cy="7" r="5"><animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0.95;0.5" dur="2s" repeatCount="indefinite"/></circle>'
        + '<circle cx="90" cy="64" r="4"><animate attributeName="r" values="4;6.5;4" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0.9;0.5" dur="2.4s" repeatCount="indefinite"/></circle>'
        + '<circle cx="12" cy="58" r="4"><animate attributeName="r" values="4;6.5;4" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.8s" repeatCount="indefinite"/></circle>'
        + '</g>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3.6s" repeatCount="indefinite"/><circle cx="50" cy="9" r="2" fill="' + t[2] + '"/><circle cx="50" cy="9" r="3.4" fill="' + t[2] + '" opacity="0.35"/></g>';
    },
    // ═══ Mythic ═══
    // التنّين: طوقٌ ناريٌّ مزدوجٌ + رأسُ تنّينٍ في القمّةِ بعينٍ متوهّجةٍ + جناحان + جمراتٌ صاعدة
    frame_dragon: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="7"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="2" stroke-linecap="round" stroke-dasharray="10 300"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3s" repeatCount="indefinite"/></circle>'
        + '<g fill="url(#' + g + ')"><path d="M18 40 Q2 34 6 14 Q22 24 30 40 Q24 42 18 40Z"><animate attributeName="opacity" values="0.7;1;0.7" dur="1.2s" repeatCount="indefinite"/></path><path d="M82 40 Q98 34 94 14 Q78 24 70 40 Q76 42 82 40Z"><animate attributeName="opacity" values="1;0.7;1" dur="1.2s" repeatCount="indefinite"/></path></g>'
        + '<g fill="' + t[0] + '"><path d="M40 8 Q50 -2 60 8 Q66 12 62 18 L58 14 Q50 8 42 14 L38 18 Q34 12 40 8Z"/><circle cx="46" cy="11" r="1.6" fill="#fff"><animate attributeName="opacity" values="0.4;1;0.4" dur="0.9s" repeatCount="indefinite"/></circle><circle cx="54" cy="11" r="1.6" fill="#fff"><animate attributeName="opacity" values="1;0.4;1" dur="0.9s" repeatCount="indefinite"/></circle></g>'
        + '<g fill="' + t[2] + '"><circle cx="40" cy="94" r="2"><animate attributeName="cy" values="94;58" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.5s" repeatCount="indefinite"/></circle><circle cx="60" cy="96" r="1.6"><animate attributeName="cy" values="96;56" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite"/></circle></g>';
    },
    // السماويّ: طوقٌ + هالةٌ متّسعةٌ + كوكبان مداريّان + سحابةُ نجوم
    frame_celestial: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<circle cx="50" cy="50" r="38" fill="none" stroke="' + t[2] + '" stroke-width="1.4"><animate attributeName="r" values="38;47;38" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0;0.6" dur="3s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-dasharray="14 300" stroke-linecap="round" opacity="0.9"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/></circle>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="6s" repeatCount="indefinite"/><circle cx="50" cy="6" r="3.4" fill="#fff"/><circle cx="50" cy="6" r="5.5" fill="' + t[0] + '" opacity="0.35"/><circle cx="94" cy="50" r="2.6" fill="' + t[2] + '"/></g>'
        + '<g fill="#fff"><circle cx="28" cy="22" r="1.3"><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="74" cy="26" r="1.1"><animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite"/></circle><circle cx="70" cy="76" r="1.2"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.8s" repeatCount="indefinite"/></circle><circle cx="26" cy="74" r="1" fill="' + t[0] + '"><animate attributeName="opacity" values="0;1;0" dur="2.2s" repeatCount="indefinite"/></circle></g>';
    },
    // الجحيم: طوقٌ + ألسنةُ لهبٍ كثيفةٌ حولَ كاملِ المحيطِ + توهّجٌ أحمرُ نابضٌ داخليّ
    frame_inferno: function (t, g) {
      var tongue = function (cx, cy, s, rot, dur) { return '<path d="M' + cx + ' ' + cy + ' q' + (-4 * s) + ' ' + (-8 * s) + ' 0 ' + (-16 * s) + ' q' + (4 * s) + ' ' + (8 * s) + ' 0 ' + (16 * s) + 'z" fill="url(#' + g + ')" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"><animate attributeName="opacity" values="0.4;1;0.4" dur="' + dur + 's" repeatCount="indefinite"/></path>'; };
      var pts = [[50,5,0],[73,12,42],[88,27,80],[95,50,90],[88,73,120],[73,88,150],[50,95,180],[27,88,210],[12,73,240],[5,50,270],[12,27,300],[27,12,330]], ring = '';
      for (var i = 0; i < pts.length; i++) ring += tongue(pts[i][0], pts[i][1], (i % 2 ? 1.1 : 1.5), pts[i][2], (0.5 + (i % 3) * 0.16).toFixed(2));
      return '<circle cx="50" cy="50" r="42" fill="' + t[1] + '" opacity="0.35"><animate attributeName="opacity" values="0.15;0.5;0.15" dur="1.2s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="42" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<g>' + ring + '</g>'
        + '<circle cx="50" cy="50" r="42" fill="none" stroke="' + t[2] + '" stroke-width="1.6" stroke-dasharray="6 10"><animate attributeName="stroke-dashoffset" from="0" to="32" dur="0.8s" repeatCount="indefinite"/></circle>';
    },
    // الفراغ: دوّامةٌ سوداءُ + حلقتان بنفسجيّتان تنكمشان نحوَ المركزِ + جسيماتٌ تُبتَلَع
    frame_void: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<circle cx="50" cy="50" r="30" fill="' + t[1] + '"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[0] + '" stroke-width="2" stroke-dasharray="8 8"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="26" fill="none" stroke="' + t[2] + '" stroke-width="1.4"><animate attributeName="r" values="45;10" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="2.4s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="26" fill="none" stroke="' + t[0] + '" stroke-width="1.4"><animate attributeName="r" values="45;10" dur="2.4s" begin="1.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="2.4s" begin="1.2s" repeatCount="indefinite"/></circle>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3s" repeatCount="indefinite"/><circle cx="50" cy="8" r="2" fill="#fff"/><circle cx="86" cy="60" r="1.6" fill="' + t[2] + '"/><circle cx="16" cy="58" r="1.4" fill="' + t[0] + '"/></g>';
    },
    /*MYTHIC_FRAMES_MORE*/
    // الرعد: طوقٌ + صواعقُ دوّارةٌ خارجةٌ من المحيطِ + ومضةٌ عامّةٌ نابضة
    frame_thunder: function (t, g) {
      var bolt = function (rot) { return '<path d="M50 6 L46 24 L53 24 L47 44" fill="none" stroke="' + t[2] + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="rotate(' + rot + ' 50 50)"><animate attributeName="opacity" values="0;1;0" dur="1.1s" begin="' + (rot / 360).toFixed(2) + 's" repeatCount="indefinite"/></path>'; };
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[0] + '" stroke-width="7" opacity="0.25"><animate attributeName="opacity" values="0.1;0.5;0.1" dur="0.9s" repeatCount="indefinite"/></circle>'
        + '<g>' + bolt(0) + bolt(90) + bolt(180) + bolt(270) + '</g>'
        + '<g fill="' + t[0] + '"><circle cx="82" cy="24" r="1.4"><animate attributeName="opacity" values="0;1;0" dur="0.7s" repeatCount="indefinite"/></circle><circle cx="20" cy="76" r="1.2"><animate attributeName="opacity" values="1;0;1" dur="0.9s" repeatCount="indefinite"/></circle></g>';
    },
    // المنشور: طوقٌ قزحيٌّ متبدّلٌ + شعاعٌ طيفيٌّ دوّارٌ + وميضٌ أبيضُ نقيّ
    frame_prism: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="7"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[0] + '" stroke-width="6" opacity="0.5"><animate attributeName="stroke" values="' + t[0] + ';' + t[1] + ';' + t[2] + ';#ffe14a;' + t[0] + '" dur="3s" repeatCount="indefinite"/></circle>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/>'
        + '<path d="M50 50 L50 3 L60 6 Z" fill="' + t[1] + '" opacity="0.7"/><path d="M50 50 L94 40 L92 52 Z" fill="' + t[2] + '" opacity="0.7"/><path d="M50 50 L58 96 L46 94 Z" fill="#ffe14a" opacity="0.7"/><path d="M50 50 L8 60 L10 47 Z" fill="' + t[0] + '" opacity="0.7"/></g>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 300" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="2s" repeatCount="indefinite"/></circle>';
    },
    // الملائكيّ (السيراف): طوقٌ ذهبيٌّ + زوجا أجنحةٍ جانبيّةٌ + هالةٌ + ريشٌ متساقط
    frame_seraph: function (t, g) {
      var wing = function (sx, dir) { return '<g fill="url(#' + g + ')" opacity="0.9"><path d="M' + sx + ' 40 q' + (dir * 18) + ' -6 ' + (dir * 24) + ' -20 q' + (dir * -2) + ' 12 ' + (dir * -8) + ' 16 q' + (dir * 14) + ' -2 ' + (dir * 18) + ' -12 q' + (dir * -1) + ' 12 ' + (dir * -10) + ' 18 q' + (dir * 10) + ' 0 ' + (dir * 12) + ' -6 q' + (dir * 1) + ' 10 ' + (dir * -12) + ' 14 Z"><animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite"/></path></g>'; };
      return '<circle cx="50" cy="50" r="43" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + wing(28, -1) + wing(72, 1)
        + '<ellipse cx="50" cy="12" rx="12" ry="4" fill="none" stroke="' + t[2] + '" stroke-width="2"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite"/></ellipse>'
        + '<g fill="#ffffff"><circle cx="40" cy="92" r="1.4"><animate attributeName="cy" values="86;96" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2.4s" repeatCount="indefinite"/></circle><circle cx="60" cy="90" r="1.2"><animate attributeName="cy" values="84;96" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="3s" repeatCount="indefinite"/></circle></g>';
    },
    // السبج: طوقٌ حجريٌّ داكنٌ مشظّى + بريقٌ زجاجيٌّ يجولُ على الحوافّ + شظايا لامعة
    frame_obsidian: function (t, g) {
      var oct = '50,5 74,14 92,38 95,62 78,86 50,95 22,86 5,62 8,38 26,14';
      return '<polygon points="' + oct + '" fill="' + t[1] + '" stroke="url(#' + g + ')" stroke-width="4" stroke-linejoin="round"/>'
        + '<polygon points="' + oct + '" fill="none" stroke="' + t[2] + '" stroke-width="1" stroke-linejoin="round" opacity="0.5"/>'
        + '<polygon points="' + oct + '" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round" stroke-dasharray="12 220" stroke-linecap="round" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3.4s" repeatCount="indefinite"/></polygon>'
        + '<g fill="' + t[2] + '"><path d="M50 14 l3 5 -3 5 -3 -5z"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite"/></path><path d="M84 50 l4 4 -4 4 -4 -4z"><animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/></path><path d="M16 50 l4 4 -4 4 -4 -4z"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite"/></path></g>';
    },

    /* ════ توسعةُ البناء ٦٢: عشرةُ إطاراتٍ جديدة ════
       القاعدةُ نفسُها: الطوقُ عندَ r=45، ولا نرسمُ فوقَ الوجهِ إلّا جسيماتٍ
       عابرةً كالثلجِ، وكلُّ إطارٍ له لغةٌ بصريّةٌ لا تشبهُ غيرَه. */

    // الفولاذ: طوقٌ مصقولٌ مزدوجٌ + ثمانيةُ مساميرَ بارزةٍ + لمعةٌ معدنيّةٌ تجولُ
    frame_steel: function (t, g) {
      var P = [[95, 50], [81.8, 81.8], [50, 95], [18.2, 81.8], [5, 50], [18.2, 18.2], [50, 5], [81.8, 18.2]];
      var riv = '';
      for (var i = 0; i < P.length; i++) riv += '<circle cx="' + P[i][0] + '" cy="' + P[i][1] + '" r="2.5" fill="' + t[2] + '" stroke="' + t[1] + '" stroke-width="0.9"/><circle cx="' + P[i][0] + '" cy="' + P[i][1] + '" r="1" fill="' + t[1] + '" opacity="0.55"/>';
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="8"/>'
        + '<circle cx="50" cy="50" r="48.6" fill="none" stroke="' + t[1] + '" stroke-width="1.5" opacity="0.75"/>'
        + '<circle cx="50" cy="50" r="41.4" fill="none" stroke="' + t[1] + '" stroke-width="1.5" opacity="0.75"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="7.4" stroke-dasharray="3 22" opacity="0.22"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-dasharray="15 268" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3.2s" repeatCount="indefinite"/></circle>'
        + riv;
    },
    // اللبلاب: طوقٌ خشبيٌّ + ساقٌ تلتفُّ حولَه + ثمانيةُ أوراقٍ تنبضُ نموًّا
    frame_vine: function (t, g) {
      var leaf = '';
      for (var i = 0; i < 8; i++) {
        leaf += '<g transform="rotate(' + (i * 45) + ' 50 50)"><ellipse cx="50" cy="5" rx="5" ry="2.7" fill="' + (i % 2 ? t[0] : t[2]) + '"><animate attributeName="rx" values="2.6;5.8;2.6" dur="' + (2 + (i % 3) * 0.55).toFixed(2) + 's" begin="' + (i * 0.3).toFixed(1) + 's" repeatCount="indefinite"/></ellipse><path d="M45.5 5 h9" stroke="' + t[1] + '" stroke-width="0.7" opacity="0.6"/></g>';
      }
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="8"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="4.2" stroke-dasharray="11 7" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="0" to="36" dur="3.4s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[0] + '" stroke-width="1.6" stroke-dasharray="3 9" opacity="0.6"><animate attributeName="stroke-dashoffset" from="12" to="0" dur="2.4s" repeatCount="indefinite"/></circle>'
        + leaf;
    },
    // الياقوت: طوقٌ داكنٌ + أربعُ ياقوتاتٍ مصقولةٍ ببريقٍ داخليّ + حلقةٌ معاكسة
    frame_ruby: function (t, g) {
      var gem = function (cx, cy) {
        return '<g><polygon points="' + cx + ',' + (cy - 7.2) + ' ' + (cx + 5.6) + ',' + cy + ' ' + cx + ',' + (cy + 7.2) + ' ' + (cx - 5.6) + ',' + cy + '" fill="' + t[0] + '" stroke="' + t[2] + '" stroke-width="0.9"/>'
          + '<polygon points="' + cx + ',' + (cy - 7.2) + ' ' + (cx + 5.6) + ',' + cy + ' ' + cx + ',' + cy + '" fill="' + t[2] + '" opacity="0.5"/>'
          + '<circle cx="' + cx + '" cy="' + cy + '" r="1.7" fill="#ffffff"><animate attributeName="opacity" values="0.15;1;0.15" dur="1.8s" repeatCount="indefinite"/></circle></g>';
      };
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="9"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="3.4"/>'
        + '<circle cx="50" cy="50" r="41" fill="none" stroke="' + t[0] + '" stroke-width="1.6" stroke-dasharray="6 14" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="7s" repeatCount="indefinite"/></circle>'
        + gem(50, 5) + gem(95, 50) + gem(50, 95) + gem(5, 50)
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-dasharray="9 274" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4.2s" repeatCount="indefinite"/></circle>';
    },
    // الرمال: طوقٌ صحراويٌّ + حبيباتٌ تدورُ في ثلاثِ مداراتٍ بسرعاتٍ مختلفة
    frame_sand: function (t, g) {
      var orb = function (r, n, dur, rad, op, rev) {
        var s = '<g opacity="' + op + '"><animateTransform attributeName="transform" type="rotate" from="' + (rev ? 360 : 0) + ' 50 50" to="' + (rev ? 0 : 360) + ' 50 50" dur="' + dur + 's" repeatCount="indefinite"/>';
        for (var i = 0; i < n; i++) {
          var a = (i / n) * Math.PI * 2;
          s += '<circle cx="' + (50 + r * Math.cos(a)).toFixed(1) + '" cy="' + (50 + r * Math.sin(a)).toFixed(1) + '" r="' + rad + '" fill="' + t[2] + '"/>';
        }
        return s + '</g>';
      };
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="7"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="1.3" opacity="0.65"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="6.4" stroke-dasharray="3 7" opacity="0.32"><animate attributeName="stroke-dashoffset" from="0" to="20" dur="1.8s" repeatCount="indefinite"/></circle>'
        + orb(48.6, 9, 9, 1.1, 0.9, 0) + orb(45, 12, 6, 0.8, 0.55, 1) + orb(41.4, 7, 12, 1.3, 0.45, 0);
    },
    // المدّ: قوسا ماءٍ متعاكسانِ + حلقةٌ داخليّةٌ مُتموّجةٌ + قطراتٌ تصعد
    frame_tide: function (t, g) {
      var drop = function (x, r, dur, bg) { return '<circle cx="' + x + '" cy="93" r="' + r + '" fill="' + bg + '"><animate attributeName="cy" values="93;9" dur="' + dur + 's" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0" dur="' + dur + 's" repeatCount="indefinite"/></circle>'; };
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="8"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="5" stroke-linecap="round" stroke-dasharray="80 203"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4.6s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="3" stroke-linecap="round" stroke-dasharray="52 231" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="3.2s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="40.5" fill="none" stroke="' + t[0] + '" stroke-width="1.5" stroke-dasharray="5 11" opacity="0.5"><animate attributeName="stroke-dashoffset" from="16" to="0" dur="1.4s" repeatCount="indefinite"/></circle>'
        + drop(30, 1.6, 2.2, t[2]) + drop(70, 1.3, 2.8, t[0]) + drop(50, 1.1, 3.4, t[2]);
    },
    // العاصفة: طوقٌ رصاصيٌّ + دوّاماتُ ريحٍ تلتفّ + ثلاثُ صواعقَ تخفقُ تعاقبًا
    frame_storm: function (t, g) {
      var bolt = function (rot, dly) { return '<g transform="rotate(' + rot + ' 50 50)"><path d="M52 3 L45 16 L51 16 L47 25 L59 12 L52 12 Z" fill="' + t[2] + '"><animate attributeName="opacity" values="0;0;1;0.15;1;0" keyTimes="0;0.55;0.62;0.68;0.74;1" dur="2.8s" begin="' + dly + 's" repeatCount="indefinite"/></path></g>'; };
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="9.5"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="4"/>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="5.2s" repeatCount="indefinite"/><path d="M50 5 A45 45 0 0 1 81.8 18.2" fill="none" stroke="' + t[0] + '" stroke-width="2.4" stroke-linecap="round" opacity="0.85"/><path d="M50 95 A45 45 0 0 1 18.2 81.8" fill="none" stroke="' + t[0] + '" stroke-width="2.4" stroke-linecap="round" opacity="0.85"/></g>'
        + '<g><animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="3.6s" repeatCount="indefinite"/><path d="M50 10.5 A39.5 39.5 0 0 1 78 22" fill="none" stroke="' + t[2] + '" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/></g>'
        + bolt(0, 0) + bolt(120, 0.95) + bolt(240, 1.9);
    },
    // الطلاسم: طوقان + ١٢ رمزًا يدورُ ببطءٍ ويتنفّسُ + حلقةُ شَرَطاتٍ معاكسة
    frame_arcane: function (t, g) {
      var R = ['M-2 -4 h4 M0 -4 v8 M-2 4 h4', 'M-3 -4 l6 4 -6 4', 'M-3 -4 v8 M3 -4 v8 M-3 0 h6', 'M0 -4 l3 4 -3 4 -3 -4z', 'M-3 4 l3 -8 3 8', 'M-3 -4 h6 l-6 8 h6'];
      var runes = '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="15s" repeatCount="indefinite"/>';
      for (var i = 0; i < 12; i++) {
        runes += '<g transform="rotate(' + (i * 30) + ' 50 50) translate(50 5)"><path d="' + R[i % R.length] + '" fill="none" stroke="' + t[2] + '" stroke-width="1.3" stroke-linecap="round"><animate attributeName="opacity" values="0.22;1;0.22" dur="2.8s" begin="' + (i * 0.23).toFixed(2) + 's" repeatCount="indefinite"/></path></g>';
      }
      runes += '</g>';
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="11"/>'
        + '<circle cx="50" cy="50" r="49" fill="none" stroke="url(#' + g + ')" stroke-width="2"/>'
        + '<circle cx="50" cy="50" r="41" fill="none" stroke="url(#' + g + ')" stroke-width="2"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[0] + '" stroke-width="9" stroke-dasharray="1 15" opacity="0.35"><animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="24s" repeatCount="indefinite"/></circle>'
        + runes;
    },
    // السموم: طوقٌ حامضيٌّ + وميضٌ سامٌّ يسري + فقاقيعُ مجوّفةٌ تنزل
    frame_venom: function (t, g) {
      var bub = function (x, r, dur, dly) { return '<circle cx="' + x + '" cy="7" r="' + r + '" fill="none" stroke="' + t[0] + '" stroke-width="1.1"><animate attributeName="cy" values="7;95" dur="' + dur + 's" begin="' + dly + 's" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.82;1" dur="' + dur + 's" begin="' + dly + 's" repeatCount="indefinite"/></circle>'; };
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="9"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="4.5"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="8" stroke-dasharray="2 9" opacity="0.38"><animate attributeName="stroke-dashoffset" from="0" to="22" dur="2.2s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="11 272" opacity="0.6"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="2.8s" repeatCount="indefinite"/></circle>'
        + bub(18, 2.2, 2.6, 0) + bub(82, 1.8, 3.2, 0.7) + bub(50, 1.5, 2.2, 1.3) + bub(66, 2.6, 3.8, 1.9);
    },
    // الشمس: إكليلٌ من ١٦ شعاعًا ينبضُ + توهّجٌ يمسحُ الطوقَ + قلبٌ ذهبيّ
    frame_solar: function (t, g) {
      var rays = '';
      for (var i = 0; i < 16; i++) {
        rays += '<g transform="rotate(' + (i * 22.5) + ' 50 50)"><path d="M50 4.6 L47.7 2.6 L50 0.4 L52.3 2.6 Z" fill="' + (i % 2 ? t[0] : t[2]) + '"><animate attributeName="opacity" values="0.25;1;0.25" dur="' + (1.6 + (i % 4) * 0.28).toFixed(2) + 's" begin="' + (i * 0.11).toFixed(2) + 's" repeatCount="indefinite"/></path></g>';
      }
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="8.5"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="5"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="9" opacity="0.2"><animate attributeName="opacity" values="0.1;0.34;0.1" dur="2.6s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#fffbe6" stroke-width="6" stroke-linecap="round" stroke-dasharray="26 257" opacity="0.9"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3.6s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="41" fill="none" stroke="' + t[2] + '" stroke-width="1.2" stroke-dasharray="4 8" opacity="0.6"><animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="9s" repeatCount="indefinite"/></circle>'
        + rays;
    },
    // القمر: طوقٌ فضّيٌّ + هلالٌ أعلى + نجومٌ تدورُ + بريقٌ باردٌ يسري
    frame_lunar: function (t, g) {
      var stars = '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="11s" repeatCount="indefinite"/>';
      var S = [[50, 5, 1.9], [81.8, 18.2, 1.3], [95, 50, 1.6], [81.8, 81.8, 1.2], [50, 95, 1.7], [18.2, 81.8, 1.3], [5, 50, 1.5], [18.2, 18.2, 1.2]];
      for (var i = 0; i < S.length; i++) stars += '<path d="M' + S[i][0] + ' ' + (S[i][1] - S[i][2] * 2) + ' l' + S[i][2] + ' ' + S[i][2] * 2 + ' l' + S[i][2] * 2 + ' ' + S[i][2] + ' l-' + S[i][2] * 2 + ' ' + S[i][2] + ' l-' + S[i][2] + ' ' + S[i][2] * 2 + ' l-' + S[i][2] + ' -' + S[i][2] * 2 + ' l-' + S[i][2] * 2 + ' -' + S[i][2] + ' l' + S[i][2] * 2 + ' -' + S[i][2] + 'z" fill="' + t[2] + '"><animate attributeName="opacity" values="0.2;1;0.2" dur="' + (1.8 + (i % 3) * 0.5).toFixed(1) + 's" begin="' + (i * 0.26).toFixed(2) + 's" repeatCount="indefinite"/></path>';
      stars += '</g>';
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[1] + '" stroke-width="8.5"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="4.4"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round" stroke-dasharray="18 265" opacity="0.8"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="5.4s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="41" fill="none" stroke="' + t[0] + '" stroke-width="1.1" opacity="0.5"/>'
        + stars
        + '<path d="M50 10 A6 6 0 1 0 50 22 A4.4 4.4 0 1 1 50 10 Z" fill="' + t[2] + '" stroke="' + t[1] + '" stroke-width="0.6"><animate attributeName="opacity" values="0.65;1;0.65" dur="3s" repeatCount="indefinite"/></path>';
    },
  };

  // شارات: [لون، مسار SVG، عيون؟]
  var BADGE = {
    badge_star:    ['#ffd54a', 'M50 6 61 38 95 38 67 58 78 92 50 72 22 92 33 58 5 38 39 38Z'],
    badge_crown:   ['#f4c542', 'M12 80 L20 34 L38 56 L50 24 L62 56 L80 34 L88 80 Z'],
    badge_bolt:    ['#38e0ff', 'M55 6 L24 54 L46 54 L40 94 L80 38 L54 38 Z'],
    badge_shield:  ['#6fb3ff', 'M50 8 L86 22 V50 C86 74 68 88 50 94 C32 88 14 74 14 50 V22 Z'],
    badge_flame:   ['#ff7a2f', 'M50 6 C64 30 78 40 70 64 C66 86 34 86 30 64 C26 48 40 44 40 28 C48 40 44 52 54 54 C60 46 52 32 50 6 Z'],
    badge_diamond: ['#57e8ff', 'M50 8 L84 40 L50 94 L16 40 Z'],
    badge_skull:   ['#d7dbe6', 'M28 42 A22 22 0 0 1 72 42 V62 A10 10 0 0 1 62 72 H38 A10 10 0 0 1 28 62 Z', 1],
    badge_moon:    ['#cfd6e6', 'M64 12 A40 40 0 1 0 64 88 A32 32 0 1 1 64 12 Z'],
    badge_gem:     ['#b06bff', 'M30 20 H70 L90 50 L70 80 H30 L10 50 Z'],
    badge_heart:   ['#ff5a7a', 'M50 88 C10 58 12 22 38 22 C48 22 50 34 50 34 C50 34 52 22 62 22 C88 22 90 58 50 88 Z'],
    // ═══ Mythic (رموزٌ فخمةٌ نادرة) ═══
    badge_dragon:  ['#ff6a2f', 'M12 58 Q22 40 40 42 Q46 30 60 30 Q55 38 59 45 Q78 42 88 58 Q75 54 64 58 Q67 69 56 66 Q50 75 42 66 Q33 71 29 62 Q19 65 12 58 Z',
                    '<circle cx="58" cy="41" r="2.4" fill="#1a1020"/>'],
    badge_phoenix: ['#ff8a3a', 'M50 10 C57 24 70 26 67 41 C76 37 85 44 80 54 C88 57 85 69 74 68 C66 84 50 94 50 94 C50 94 34 84 26 68 C15 69 12 57 20 54 C15 44 24 37 33 41 C30 26 43 24 50 10 Z'],
    badge_infinity:['#8fd4ff', 'M50 50 C40 33 16 33 16 50 C16 67 40 67 50 50 C60 33 84 33 84 50 C84 67 60 67 50 50 Z M28 50 A6 6 0 1 1 40 50 A6 6 0 1 1 28 50 Z M60 50 A6 6 0 1 0 72 50 A6 6 0 1 0 60 50 Z'],
    badge_trophy:  ['#ffd54a', 'M28 14 H72 V20 C84 20 90 30 84 42 C80 50 72 53 68 53 C65 60 59 64 55 65 V74 H67 V82 H33 V74 H45 V65 C41 64 35 60 32 53 C28 53 20 50 16 42 C10 30 16 20 28 20 Z'],
    badge_lotus:   ['#ff7ab0', 'M50 86 C34 78 20 60 28 40 C35 51 44 55 50 44 C56 55 65 51 72 40 C80 60 66 78 50 86 Z',
                    '<path d="M50 82 C42 74 36 62 42 50 C46 57 50 58 50 50 C50 58 54 57 58 50 C64 62 58 74 50 82 Z" fill="#ffd6e6" opacity="0.7"/>'],
    badge_eye:     ['#b06bff', 'M8 50 Q50 16 92 50 Q50 84 8 50 Z',
                    '<circle cx="50" cy="50" r="12" fill="#170a24"/><circle cx="50" cy="50" r="5.5" fill="#e0c8ff"/><circle cx="53" cy="47" r="2" fill="#fff"/>'],
    /* ═══ توسعةُ البناء ٦٢ — شاراتٌ نادرةٌ وملحميّة ═══ */
    badge_anchor:  ['#7fd0e8', 'M46 18 h8 v54 h-8 Z M30 34 h40 v7 H30 Z M50 88 C28 84 15 68 14 46 H26 C27 64 36 75 50 78 Z M50 88 C72 84 85 68 86 46 H74 C73 64 64 75 50 78 Z',
                    '<circle cx="50" cy="12" r="7" fill="none" stroke="#7fd0e8" stroke-width="4"/><path d="M14 46 l-6 -11 12 0z M86 46 l6 -11 -12 0z" fill="#7fd0e8"/>'],
    badge_leaf:    ['#6fcf5a', 'M50 6 C74 22 86 46 74 68 C64 86 44 92 30 84 C14 74 12 48 26 28 C34 16 42 10 50 6 Z',
                    '<path d="M50 12 C48 40 44 62 34 82" fill="none" stroke="#1a5226" stroke-width="3" stroke-linecap="round"/><path d="M47 30 l15 6 M45 45 l17 4 M42 59 l16 1" fill="none" stroke="#1a5226" stroke-width="2" opacity="0.65"/>'],
    badge_sword:   ['#d8e2f0', 'M50 3 L59 24 V54 H41 V24 Z M25 54 H75 V63 H25 Z M45 63 H55 V84 H45 Z M39 84 H61 V93 H39 Z',
                    '<path d="M50 9 V52" stroke="#4a5568" stroke-width="2.4" opacity="0.55"/><circle cx="50" cy="58.5" r="3" fill="#ffd54a"/>'],
    badge_rook:    ['#e2c79a', 'M26 16 H36 V26 H44 V16 H56 V26 H64 V16 H74 V36 L66 44 V66 L74 86 H26 L34 66 V44 L26 36 Z',
                    '<path d="M34 44 H66 M34 66 H66" stroke="#6a4a22" stroke-width="2.6" opacity="0.6"/><path d="M42 50 h6 v10 h-6z M52 50 h6 v10 h-6z" fill="#6a4a22" opacity="0.4"/>'],
    badge_knight:  ['#cfd9ea', 'M24 88 H80 C80 74 76 62 68 52 C62 44 58 40 58 34 L68 24 L58 16 C50 10 40 12 34 20 L24 34 L36 38 L28 48 C24 56 30 62 38 60 C34 68 28 76 24 88 Z',
                    '<circle cx="44" cy="28" r="2.6" fill="#16101f"/><path d="M58 20 L64 26" stroke="#16101f" stroke-width="2" opacity="0.5"/><path d="M28 36 L40 40" stroke="#16101f" stroke-width="2.4" opacity="0.4"/>'],
    badge_rune:    ['#c07aff', 'M50 6 L86 26 V72 L50 94 L14 72 V26 Z',
                    '<path d="M50 6 L86 26 V72 L50 94 L14 72 V26 Z" fill="none" stroke="#eeccff" stroke-width="2" opacity="0.7"/><path d="M38 28 V72 M38 28 L62 48 M38 50 L62 30 M38 72 H62" fill="none" stroke="#2a0a4a" stroke-width="4" stroke-linecap="round"/>'],
    badge_wing:    ['#cfe4ff', 'M8 78 C14 48 32 24 58 12 C52 26 48 36 48 44 C60 34 74 28 90 28 C76 40 66 52 60 62 C70 60 80 60 90 64 C72 70 56 78 44 90 C34 84 20 80 8 78 Z',
                    '<path d="M30 70 C40 58 52 46 66 36 M23 75 C33 66 43 56 55 48" fill="none" stroke="#5a7ba8" stroke-width="2" opacity="0.5"/>'],
    badge_sun:     ['#ffc63a', 'M50 26 A24 24 0 1 1 49.9 26 Z M50 4 L44 26 L56 26 Z M50 96 L44 74 L56 74 Z M4 50 L26 44 L26 56 Z M96 50 L74 44 L74 56 Z M82 18 L66 28 L72 34 Z M18 18 L34 28 L28 34 Z M82 82 L66 72 L72 66 Z M18 82 L34 72 L28 66 Z',
                    '<circle cx="50" cy="50" r="15" fill="#fff3c0" opacity="0.85"><animate attributeName="r" values="12;17;12" dur="2.6s" repeatCount="indefinite"/></circle>'],
  };

  /* ═══════════════════════════════════════════════════════════════════
     شاراتٌ فاخرةٌ مرسومةٌ (مصدرُ الحقيقةِ الوحيد) — لوحةُ ألوانٍ [رئيسيّ،
     غامق، فاتح] + دوالُّ رسمٍ بطبقاتٍ وتدرّجٍ وتوهّجٍ وحركةٍ حقيقيّة، بشكلٍ
     يطابقُ الاسمَ فعلًا (ألماسٌ مُوجَّهٌ، فارسُ شطرنجٍ، تنّينٌ بقرنَين…).
     ترفعُ الشاراتِ لمستوى FRAME_SPECIAL نفسِه في المتجرِ والمخزونِ والأفاتار. */
  var BADGE_ART = {
    badge_star:['#ffd54a','#c8891a','#fff2b0'], badge_crown:['#f4c542','#b8801e','#fff0b8'],
    badge_bolt:['#38e0ff','#0a7fb0','#d6fbff'], badge_shield:['#6fb3ff','#2b5fb0','#d6e8ff'],
    badge_flame:['#ff7a2f','#c02a00','#ffe08a'], badge_diamond:['#7fe9ff','#1f8fc8','#eaffff'],
    badge_skull:['#d7dbe6','#8a90a2','#ffffff'], badge_moon:['#cfd6e6','#7f8aa8','#ffffff'],
    badge_gem:['#b06bff','#5a1fb0','#e8d0ff'], badge_heart:['#ff5a7a','#b01f45','#ffd0dc'],
    badge_dragon:['#ff6a2f','#8a1500','#ffd08a'], badge_phoenix:['#ff8a3a','#c83a00','#ffe08a'],
    badge_infinity:['#8fd4ff','#2f7fd0','#e0f4ff'], badge_trophy:['#ffd54a','#b8801e','#fff2b0'],
    badge_lotus:['#ff7ab0','#c02a70','#ffd6e6'], badge_eye:['#b06bff','#4a1a8a','#e8d0ff'],
    badge_anchor:['#7fd0e8','#2f7f9a','#d6f4ff'], badge_leaf:['#6fcf5a','#2a7a2a','#c8f0b0'],
    badge_sword:['#d8e2f0','#8a94a8','#ffffff'], badge_rook:['#e2c79a','#9a7a4a','#fff0d0'],
    badge_knight:['#cfd9ea','#7a8498','#ffffff'], badge_rune:['#c07aff','#4a1a8a','#eeccff'],
    badge_wing:['#cfe4ff','#7f9ac0','#ffffff'], badge_sun:['#ffc63a','#d8801a','#fff2b0'],
  };
  var BADGE_SPECIAL = {
    // نجمةٌ متلألئةٌ بطبقتَينِ وبريقٍ نابض
    badge_star: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M50 8 L61 38 93 39 68 59 77 91 50 73 23 91 32 59 7 39 39 38 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2" stroke-linejoin="round"><animateTransform attributeName="transform" type="rotate" values="-4 50 50;4 50 50;-4 50 50" dur="5s" repeatCount="indefinite"/></path>'
        + '<path d="M50 22 L56 40 74 41 59 52 65 72 50 60 35 72 41 52 26 41 44 40 Z" fill="' + t[2] + '" opacity="0.5"/>'
        + '<path d="M40 30 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6Z" fill="#fff"><animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></path></g>';
    },
    // تاجٌ مرصّعٌ بأحجارٍ ملوّنةٍ وطوقٍ ذهبيّ
    badge_crown: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M12 78 L18 34 L34 54 L50 22 L66 54 L82 34 L88 78 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2" stroke-linejoin="round"/>'
        + '<rect x="12" y="76" width="76" height="13" rx="3.5" fill="' + t[1] + '"/>'
        + '<rect x="12" y="76" width="76" height="4" rx="2" fill="' + t[2] + '" opacity="0.7"/>'
        + '<circle cx="18" cy="32" r="5" fill="' + t[2] + '"/><circle cx="50" cy="20" r="6" fill="#ff5a7a"/><circle cx="82" cy="32" r="5" fill="' + t[2] + '"/>'
        + '<circle cx="34" cy="70" r="4" fill="#57e8ff"/><circle cx="50" cy="70" r="4.6" fill="#ff5a7a"/><circle cx="66" cy="70" r="4" fill="#5aff9a"/>'
        + '<path d="M20 46 L34 60 50 40 66 60 80 46" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.4"><animate attributeName="opacity" values="0.15;0.6;0.15" dur="2.6s" repeatCount="indefinite"/></path></g>';
    },
    // صاعقةٌ كهربيّةٌ ترتجفُ ببريقٍ داخليّ
    badge_bolt: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M56 6 L26 52 45 52 40 94 74 40 53 40 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2" stroke-linejoin="round"><animate attributeName="opacity" values="1;0.5;1;0.85;1" dur="1.2s" repeatCount="indefinite"/></path>'
        + '<path d="M54 16 L36 50 47 50 44 78" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/></g>';
    },
    // درعٌ بشعارِ صليبٍ + نبضةُ طاقةٍ حولَ القلب
    badge_shield: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M50 8 L86 22 V50 C86 74 68 88 50 94 C32 88 14 74 14 50 V22 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2.5" stroke-linejoin="round"/>'
        + '<path d="M50 16 L79 27 V50 C79 69 65 81 50 87 Z" fill="' + t[2] + '" opacity="0.22"/>'
        + '<path d="M50 26 V74 M28 44 H72" stroke="' + t[2] + '" stroke-width="5.5" stroke-linecap="round"/>'
        + '<circle cx="50" cy="44" r="6" fill="' + t[2] + '"/>'
        + '<circle cx="50" cy="44" r="9" fill="none" stroke="#fff" stroke-width="1.6" opacity="0.6"><animate attributeName="r" values="9;15;9" dur="2.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0;0.6" dur="2.6s" repeatCount="indefinite"/></circle></g>';
    },
    // لهبٌ حيٌّ يتماوجُ بلسانٍ داخليٍّ أفتح
    badge_flame: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M50 6 C64 30 78 40 70 64 C66 86 34 86 30 64 C26 48 40 44 40 28 C48 40 44 52 54 54 C60 46 52 32 50 6 Z" fill="url(#' + g + ')"><animate attributeName="d" values="M50 6 C64 30 78 40 70 64 C66 86 34 86 30 64 C26 48 40 44 40 28 C48 40 44 52 54 54 C60 46 52 32 50 6 Z;M50 4 C68 28 74 42 70 64 C66 88 34 88 30 62 C27 46 42 46 41 26 C50 42 42 52 55 55 C61 46 50 30 50 4 Z;M50 6 C64 30 78 40 70 64 C66 86 34 86 30 64 C26 48 40 44 40 28 C48 40 44 52 54 54 C60 46 52 32 50 6 Z" dur="1.4s" repeatCount="indefinite"/></path>'
        + '<path d="M50 34 C58 46 60 56 54 68 C50 76 44 74 43 66 C42 58 50 54 46 44 C50 48 50 52 52 52 C54 48 52 42 50 34 Z" fill="' + t[2] + '"><animate attributeName="opacity" values="0.7;1;0.7" dur="0.9s" repeatCount="indefinite"/></path></g>';
    },
    // ألماسةٌ حقيقيّةٌ بقصٍّ لامعٍ: طاولةٌ + أوجُهُ تاجٍ وبطنٍ متمايزةٌ الإضاءة + وميض
    badge_diamond: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M32 24 H68 L84 44 L50 94 L16 44 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.6" stroke-linejoin="round"/>'
        + '<path d="M32 24 L50 44 L16 44 Z" fill="' + t[2] + '" opacity="0.55"/>'
        + '<path d="M68 24 L84 44 L50 44 Z" fill="' + t[1] + '" opacity="0.35"/>'
        + '<path d="M32 24 H68 L50 44 Z" fill="' + t[2] + '" opacity="0.3"/>'
        + '<path d="M16 44 L50 94 L32 44 Z" fill="' + t[1] + '" opacity="0.4"/>'
        + '<path d="M84 44 L50 94 L68 44 Z" fill="' + t[2] + '" opacity="0.35"/>'
        + '<path d="M32 44 L50 94 L50 44 Z" fill="' + t[2] + '" opacity="0.5"/>'
        + '<path d="M16 44 H84 M32 24 V44 M68 24 V44 M32 44 L50 94 M68 44 L50 94 M50 44 V94 M32 24 L50 44 L68 24" fill="none" stroke="#fff" stroke-width="0.9" opacity="0.55"/>'
        + '<path d="M40 20 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#fff"><animate attributeName="opacity" values="0;1;0" dur="2.2s" repeatCount="indefinite"/></path></g>';
    },
    // جمجمةٌ بمحجرَينِ متوهّجَينِ وأسنانٍ وفكّ
    badge_skull: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M26 44 A24 24 0 0 1 74 44 V58 A8 8 0 0 1 68 66 Q68 78 58 80 L58 88 H52 V82 H48 V88 H42 V80 Q32 78 32 66 A8 8 0 0 1 26 58 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.6"/>'
        + '<ellipse cx="40" cy="50" rx="8" ry="9" fill="#15111c"/><ellipse cx="60" cy="50" rx="8" ry="9" fill="#15111c"/>'
        + '<circle cx="42" cy="52" r="2.6" fill="' + t[0] + '"><animate attributeName="opacity" values="0.2;1;0.2" dur="2.4s" repeatCount="indefinite"/></circle>'
        + '<circle cx="58" cy="52" r="2.6" fill="' + t[0] + '"><animate attributeName="opacity" values="0.2;1;0.2" dur="2.4s" begin="0.4s" repeatCount="indefinite"/></circle>'
        + '<path d="M50 58 l-4.5 9 h9 Z" fill="#15111c"/>'
        + '<path d="M42 74 V82 M50 74 V85 M58 74 V82" stroke="' + t[1] + '" stroke-width="2" opacity="0.7"/></g>';
    },
    // هلالٌ قمريٌّ بفوّهاتٍ ونجومٍ متلألئة
    badge_moon: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M66 10 A40 40 0 1 0 66 90 A32 32 0 1 1 66 10 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.4"/>'
        + '<circle cx="40" cy="34" r="5" fill="' + t[1] + '" opacity="0.4"/><circle cx="34" cy="56" r="7" fill="' + t[1] + '" opacity="0.35"/><circle cx="48" cy="68" r="4" fill="' + t[1] + '" opacity="0.4"/>'
        + '<g fill="' + t[2] + '"><path d="M80 30 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4Z"><animate attributeName="opacity" values="0.2;1;0.2" dur="2s" repeatCount="indefinite"/></path>'
        + '<path d="M86 60 l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1Z"><animate attributeName="opacity" values="0.3;1;0.3" dur="2.6s" begin="0.6s" repeatCount="indefinite"/></path></g></g>';
    },
    // جوهرةٌ سداسيّةٌ بقصٍّ زمرّديٍّ وأوجُهٍ ووميض
    badge_gem: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M30 18 H70 L90 50 L70 82 H30 L10 50 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.8" stroke-linejoin="round"/>'
        + '<path d="M30 18 L40 34 H60 L70 18 Z" fill="' + t[2] + '" opacity="0.5"/>'
        + '<path d="M10 50 L26 44 V56 Z" fill="' + t[2] + '" opacity="0.4"/><path d="M90 50 L74 44 V56 Z" fill="' + t[1] + '" opacity="0.4"/>'
        + '<path d="M30 82 L40 66 H60 L70 82 Z" fill="' + t[1] + '" opacity="0.45"/>'
        + '<path d="M40 34 H60 V66 H40 Z" fill="' + t[2] + '" opacity="0.25"/>'
        + '<path d="M40 34 H60 M40 66 H60 M40 34 V66 M60 34 V66 M30 18 L40 34 M70 18 L60 34 M10 50 L40 50 M90 50 L60 50 M30 82 L40 66 M70 82 L60 66" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.5"/>'
        + '<path d="M36 26 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4Z" fill="#fff"><animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></path></g>';
    },
    // قلبٌ لمّاعٌ ببريقٍ وهالةِ نبض
    badge_heart: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<circle cx="50" cy="50" r="30" fill="' + t[2] + '" opacity="0"><animate attributeName="opacity" values="0;0.35;0" dur="1.2s" repeatCount="indefinite"/></circle>'
        + '<path d="M50 88 C10 58 12 22 38 22 C48 22 50 34 50 34 C50 34 52 22 62 22 C88 22 90 58 50 88 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2"/>'
        + '<path d="M34 30 C26 32 24 44 30 52" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" opacity="0.6"/></g>';
    },
    // رأسُ تنّينٍ حقيقيٍّ: قرنانِ مسحوبانِ للخلفِ + خطمٌ + عينٌ متوهّجةٌ + شعلةٌ من الفم
    badge_dragon: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M64 34 Q74 16 90 14 Q80 24 78 40 Z" fill="' + t[1] + '"/>'
        + '<path d="M56 40 Q64 24 78 22 Q70 32 68 46 Z" fill="' + t[1] + '"/>'
        + '<path d="M20 54 Q30 44 46 46 Q52 38 62 40 Q60 30 70 30 Q78 34 74 44 Q84 48 78 58 Q82 68 72 70 Q66 66 60 68 Q54 74 44 70 Q34 72 30 64 Q22 64 20 54 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.8" stroke-linejoin="round"/>'
        + '<path d="M20 54 L30 52 L26 58 Z M32 62 L40 60 L36 66 Z M46 66 L54 64 L50 70 Z" fill="#fff" opacity="0.85"/>'
        + '<ellipse cx="26" cy="52" rx="2.4" ry="1.6" fill="' + t[1] + '"/>'
        + '<path d="M40 48 L54 46 L47 55 Z" fill="#1a0d08"/><circle cx="46" cy="50" r="2.4" fill="#ffe14a"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.8s" repeatCount="indefinite"/></circle>'
        + '<path d="M20 54 C10 52 6 56 2 54 C8 58 8 62 14 60 C10 66 14 70 18 66 C18 60 16 58 20 54 Z" fill="#ff5a1e"><animate attributeName="opacity" values="0.6;1;0.6" dur="0.8s" repeatCount="indefinite"/></path></g>';
    },
    // عنقاءٌ ناهضةٌ: جناحانِ مفرودانِ للأعلى + جسدٌ ورأسٌ + ذيلٌ من لهب
    badge_phoenix: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M50 48 C34 34 20 32 8 42 C22 42 30 48 34 58 C24 56 16 62 12 72 C28 66 40 66 50 60 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.4" stroke-linejoin="round"/>'
        + '<path d="M50 48 C66 34 80 32 92 42 C78 42 70 48 66 58 C76 56 84 62 88 72 C72 66 60 66 50 60 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.4" stroke-linejoin="round"/>'
        + '<path d="M50 40 C55 46 55 62 50 78 C45 62 45 46 50 40 Z" fill="' + t[1] + '"/>'
        + '<circle cx="50" cy="34" r="6" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1"/><path d="M50 30 L58 27 L50 24 Z" fill="' + t[2] + '"/>'
        + '<path d="M50 74 C46 82 46 90 50 96 C54 90 54 82 50 74 Z M40 72 C34 80 33 88 36 94 C42 86 44 80 44 72 Z M60 72 C66 80 67 88 64 94 C58 86 56 80 56 72 Z" fill="' + t[2] + '"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.1s" repeatCount="indefinite"/></path></g>';
    },
    // لانهايةٌ متدفّقةٌ بضوءٍ يجري في مسارها
    badge_infinity: function (t, g, f) {
      var p = 'M50 50 C40 32 14 32 14 50 C14 68 40 68 50 50 C60 32 86 32 86 50 C86 68 60 68 50 50 Z';
      return '<g filter="url(#' + f + ')">'
        + '<path d="' + p + '" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2"/>'
        + '<path d="' + p + '" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="20 200" opacity="0.85"><animate attributeName="stroke-dashoffset" values="0;-220" dur="2.6s" repeatCount="indefinite"/></path></g>';
    },
    // كأسُ بطولةٍ بمقبضَينِ ونجمةٍ وقاعدة
    badge_trophy: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M30 24 H22 C18 30 22 40 30 44 Z M70 24 H78 C82 30 78 40 70 44 Z" fill="' + t[1] + '" opacity="0.6"/>'
        + '<path d="M30 14 H70 V22 C82 22 88 32 82 42 C78 50 70 52 66 52 C63 60 56 64 54 65 V74 H66 V82 H34 V74 H46 V65 C44 64 37 60 34 52 C30 52 22 50 18 42 C12 32 18 22 30 22 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2"/>'
        + '<path d="M50 26 l3.4 7.2 7.8 0.6 -6 5.2 1.9 7.6 -7.1 -4.2 -7.1 4.2 1.9 -7.6 -6 -5.2 7.8 -0.6 Z" fill="' + t[2] + '"><animate attributeName="opacity" values="0.5;1;0.5" dur="2.2s" repeatCount="indefinite"/></path>'
        + '<rect x="30" y="82" width="40" height="9" rx="2.5" fill="' + t[1] + '"/></g>';
    },
    // زهرةُ لوتسٍ بطبقاتِ بتلاتٍ متداخلة
    badge_lotus: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M50 88 C30 80 16 60 22 40 C34 52 42 56 50 44 C58 56 66 52 78 40 C84 60 70 80 50 88 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.4"/>'
        + '<path d="M50 86 C40 78 30 64 34 48 C42 58 46 60 50 50 C54 60 58 58 66 48 C70 64 60 78 50 86 Z" fill="' + t[2] + '" opacity="0.75"/>'
        + '<path d="M50 84 C46 74 40 60 46 46 C48 56 50 58 50 50 C50 58 52 56 54 46 C60 60 54 74 50 84 Z" fill="#fff" opacity="0.6"/>'
        + '<ellipse cx="50" cy="62" rx="4" ry="6" fill="' + t[2] + '"/></g>';
    },
    // عينٌ سحريّةٌ بقزحيّةٍ وبؤبؤٍ وحلقةٍ نابضة
    badge_eye: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M8 50 Q50 14 92 50 Q50 86 8 50 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2"/>'
        + '<path d="M8 50 Q50 14 92 50 Q50 86 8 50 Z" fill="#0a0618" opacity="0.35"/>'
        + '<circle cx="50" cy="50" r="15" fill="' + t[1] + '"/><circle cx="50" cy="50" r="9" fill="#0a0410"/>'
        + '<circle cx="50" cy="50" r="15" fill="none" stroke="' + t[2] + '" stroke-width="2"><animate attributeName="r" values="15;13;15" dur="3s" repeatCount="indefinite"/></circle>'
        + '<circle cx="46" cy="46" r="3" fill="#fff"/>'
        + '<path d="M8 50 Q50 14 92 50" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.4"/></g>';
    },
    // مرساةٌ بحلقةٍ وذراعَينِ ونجفةٍ معدنيّة
    badge_anchor: function (t, g, f) {
      return '<g filter="url(#' + f + ')"><g><animateTransform attributeName="transform" type="rotate" values="-5 50 50;5 50 50;-5 50 50" dur="4s" repeatCount="indefinite"/>'
        + '<circle cx="50" cy="16" r="8" fill="none" stroke="url(#' + g + ')" stroke-width="5"/>'
        + '<rect x="46" y="22" width="8" height="52" rx="2" fill="url(#' + g + ')"/>'
        + '<rect x="30" y="34" width="40" height="7" rx="3" fill="url(#' + g + ')"/>'
        + '<path d="M50 74 C30 72 16 56 14 40 L26 40 C28 56 38 66 50 68 Z M50 74 C70 72 84 56 86 40 L74 40 C72 56 62 66 50 68 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1"/>'
        + '<path d="M14 40 l-6 -10 12 0 Z M86 40 l6 -10 -12 0 Z" fill="' + t[2] + '"/></g></g>';
    },
    // ورقةٌ خضراءُ بعروقٍ وبريقٍ وتمايلٍ خفيف
    badge_leaf: function (t, g, f) {
      return '<g filter="url(#' + f + ')"><g><animateTransform attributeName="transform" type="rotate" values="-4 50 60;4 50 60;-4 50 60" dur="3.6s" repeatCount="indefinite"/>'
        + '<path d="M50 6 C76 22 88 48 74 70 C64 86 42 92 28 82 C12 72 12 46 26 26 C34 15 42 10 50 6 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.4"/>'
        + '<path d="M50 12 C48 42 42 66 30 84" fill="none" stroke="' + t[1] + '" stroke-width="3" stroke-linecap="round"/>'
        + '<path d="M47 30 l16 5 M45 46 l17 3 M42 60 l15 0" fill="none" stroke="' + t[1] + '" stroke-width="2" opacity="0.6"/>'
        + '<ellipse cx="60" cy="26" rx="11" ry="8" fill="#fff" opacity="0.22"/></g></g>';
    },
    // سيفٌ بنصلٍ لمّاعٍ ومقبضٍ وجوهرةٍ في الحاجز
    badge_sword: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M50 4 L58 22 V54 H42 V22 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.4"/>'
        + '<path d="M50 6 V52" stroke="#fff" stroke-width="1.6" opacity="0.6"/>'
        + '<path d="M44 10 L50 6 L50 22 Z" fill="#fff" opacity="0.5"><animate attributeName="opacity" values="0.2;0.75;0.2" dur="2.4s" repeatCount="indefinite"/></path>'
        + '<rect x="24" y="54" width="52" height="8" rx="3" fill="' + t[1] + '"/>'
        + '<circle cx="50" cy="58" r="4.5" fill="#ffd54a"/>'
        + '<rect x="46" y="62" width="8" height="22" rx="2" fill="' + t[1] + '"/>'
        + '<circle cx="50" cy="88" r="6" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1"/></g>';
    },
    // طابيةُ شطرنجٍ (قلعة) بشرفاتٍ وطبقاتٍ واضحة
    badge_rook: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M24 16 H33 V25 H42 V16 H58 V25 H67 V16 H76 V38 L68 46 V64 L78 88 H22 L32 64 V46 L24 38 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2" stroke-linejoin="round"/>'
        + '<path d="M32 46 H68 M30 64 H70" stroke="' + t[1] + '" stroke-width="2.6" opacity="0.55"/>'
        + '<rect x="42" y="50" width="16" height="12" rx="2" fill="' + t[1] + '" opacity="0.4"/>'
        + '<path d="M30 22 H70" stroke="' + t[2] + '" stroke-width="2" opacity="0.5"/></g>';
    },
    // فارسُ شطرنجٍ (رأسُ حصان) على قاعدةٍ — بعينٍ وعُرفٍ وخطم
    badge_knight: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<rect x="22" y="84" width="56" height="9" rx="2.5" fill="' + t[1] + '"/>'
        + '<rect x="30" y="76" width="40" height="9" rx="2.5" fill="' + t[1] + '" opacity="0.85"/>'
        + '<path d="M32 80 C30 68 34 62 36 56 C25 54 20 44 26 34 C28 30 31 29 31 29 L27 33 C25 27 31 22 37 21 L35 15 C41 17 44 20 46 21 C49 12 58 9 66 15 C77 23 76 42 72 56 C70 64 68 70 68 80 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2" stroke-linejoin="round"/>'
        + '<circle cx="57" cy="30" r="3.2" fill="#1a1420"/>'
        + '<path d="M60 20 C69 26 71 40 68 54" fill="none" stroke="' + t[1] + '" stroke-width="2.4" opacity="0.55"/>'
        + '<path d="M34 40 L42 42" stroke="' + t[1] + '" stroke-width="2.2" opacity="0.5" stroke-linecap="round"/>'
        + '<path d="M40 26 L48 28" stroke="#fff" stroke-width="1.6" opacity="0.4"/></g>';
    },
    // حجرُ رونٍ بنقشٍ متوهّجٍ يسطع
    badge_rune: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M50 6 L86 26 V72 L50 94 L14 72 V26 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="2"/>'
        + '<path d="M50 6 L86 26 V72 L50 94 L14 72 V26 Z" fill="none" stroke="' + t[2] + '" stroke-width="1.4" opacity="0.6"/>'
        + '<path d="M38 26 V74 M38 30 L62 48 M38 52 L62 34 M38 74 H60" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" repeatCount="indefinite"/></path></g>';
    },
    // جناحٌ مريّشٌ بصفوفِ ريشٍ وحافّةٍ لامعة
    badge_wing: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<path d="M8 80 C16 50 34 26 60 12 C54 26 50 36 50 46 C62 34 76 28 92 28 C78 42 68 54 62 64 C72 62 82 62 92 66 C74 72 58 80 46 92 C34 84 20 82 8 80 Z" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.4"/>'
        + '<path d="M24 74 C36 62 50 50 66 40 M20 78 C32 68 44 58 58 50 M30 82 C42 72 54 64 68 58" fill="none" stroke="' + t[1] + '" stroke-width="2" opacity="0.5" stroke-linecap="round"/>'
        + '<path d="M8 80 C16 50 34 26 60 12" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.4"/></g>';
    },
    // شمسٌ بأشعّةٍ دوّارةٍ ونواةٍ نابضة
    badge_sun: function (t, g, f) {
      return '<g filter="url(#' + f + ')">'
        + '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="16s" repeatCount="indefinite"/>'
        + '<path d="M50 2 L55 22 45 22Z M50 98 L55 78 45 78Z M2 50 L22 45 22 55Z M98 50 L78 45 78 55Z M15 15 L31 27 27 31Z M85 15 L69 27 73 31Z M15 85 L31 73 27 69Z M85 85 L69 73 73 69Z" fill="' + t[0] + '"/></g>'
        + '<circle cx="50" cy="50" r="24" fill="url(#' + g + ')" stroke="' + t[1] + '" stroke-width="1.6"/>'
        + '<circle cx="50" cy="50" r="16" fill="' + t[2] + '" opacity="0.6"><animate attributeName="r" values="14;18;14" dur="2.8s" repeatCount="indefinite"/></circle></g>';
    },
  };

  // خلفيات: تدرّجات تتحرّك ببطء (background-position)
  var BG = {
    bg_aurora:    'linear-gradient(135deg,#0b2f2a,#1d6b5a,#3a2d6b,#1d6b5a)',
    bg_nebula:    'linear-gradient(135deg,#3a1d6b,#0b1030,#6a2d8f,#0b1030)',
    bg_sunset:    'linear-gradient(160deg,#ff7e5f,#feb47b,#6b2d5f,#ff7e5f)',
    bg_forest:    'linear-gradient(160deg,#123d1f,#2e7d32,#0c2a15,#2e7d32)',
    bg_royal:     'linear-gradient(135deg,#3a1d6b,#c9a84c,#241246,#c9a84c)',
    bg_ocean_deep:'linear-gradient(180deg,#022a4a,#0a6ea0,#012036,#0a6ea0)',
    bg_volcano:   'linear-gradient(160deg,#3a0a0a,#ff4500,#6b1500,#ff4500)',
    bg_galaxy:    'linear-gradient(135deg,#140a3a,#5a2da0,#2233aa,#140a3a)',
    bg_matrix:    'linear-gradient(180deg,#001a00,#00b140,#003300,#00b140)',
    bg_cherry:    'linear-gradient(135deg,#5f2d4a,#ff9fc4,#ffd6e6,#ff9fc4)',
    // ═══ Mythic ═══
    bg_dragon_lair: 'radial-gradient(circle at 50% 120%,#ff5a1e,#7a1500,#1a0505,#3a0a0a)',
    bg_cosmos:      'radial-gradient(circle at 30% 30%,#7a4fd0,#2a1a6a,#0a0620,#140a3a)',
    bg_inferno:     'linear-gradient(0deg,#ff3d00,#7a1500,#2a0505,#ff8a1e)',
    bg_void:        'radial-gradient(circle at 50% 50%,#b06bff,#3a1d6b,#050310,#0a0618)',
    bg_thunderstorm:'linear-gradient(160deg,#2a2d6a,#4a4f9a,#0a0a1a,#ffe14a)',
    bg_prism:       'linear-gradient(120deg,#5affc0,#8fd4ff,#ff6ad5,#ffe14a,#5affc0)',
    /* ═══ توسعةُ البناء ٦٢ — خلفيّاتٌ نادرةٌ وملحميّة ═══ */
    bg_steel:       'linear-gradient(135deg,#2a3242,#6b7a90,#1a2028,#8fa0b4)',
    bg_meadow:      'linear-gradient(180deg,#8fd0ff,#bfe89a,#3f8a3a,#2a6a28)',
    bg_desert:      'linear-gradient(180deg,#ffd48a,#e8a94a,#a8702a,#6a4415)',
    bg_rain:        'linear-gradient(180deg,#1a2233,#2f4256,#101822,#3a5570)',
    bg_temple:      'linear-gradient(180deg,#2a1d3f,#6a4f9a,#1a1228,#c9a84c)',
    bg_arcane:      'radial-gradient(circle at 50% 50%,#c07aff,#4a1a8a,#160a28,#2a0a4a)',
    bg_reef:        'linear-gradient(180deg,#0a6ea0,#1fb8c8,#ff9f6a,#0a4a6a)',
    bg_eclipse:     'radial-gradient(circle at 50% 42%,#0a0a12,#2a1a3a,#ffb02f,#0a0612)',
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_-]/g, ''); }

  /* عدّادٌ يضمنُ تفرّدَ مُعرِّفاتِ التدرّجِ عبرَ كلِّ نُسخةٍ (متجرٌ + أفاتاراتٌ حيّةٌ
     كثيرةٌ في نفسِ الصفحةِ) فلا تتصادمُ مراجعُ url(#id). */
  var _uid = 0;
  /* الطبقةُ الداخليّةُ للإطارِ (viewBox 100، طوقٌ عندَ r≈45) — مصدرُ الحقيقةِ
     الوحيدُ يستعملُها الأفاتارُ الحيُّ والمعاينةُ في المتجر/المخزونِ معًا. */
  function _frameInner(fid) {
    var t = FRAME[fid] || FRAME.frame_gold;
    var gid = 'cf_' + esc(fid) + '_' + (++_uid);
    var special = FRAME_SPECIAL[fid];
    var inner = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="' + t[0] + '"/>'
      + '<stop offset="0.5" stop-color="' + t[2] + '"/>'
      + '<stop offset="1" stop-color="' + t[1] + '"/>'
      + '</linearGradient></defs>';
    if (special) {
      inner += special(t, gid);
    } else {
      inner += '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="6s" repeatCount="indefinite"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + gid + ')" stroke-width="6" stroke-linecap="round" stroke-dasharray="60 22"/>'
        + '</g>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="1.4" opacity="0.45"/>';
    }
    return inner;
  }
  function frameHTML(cos) {
    if (!cos || !cos.frame) return '';
    var id = esc(cos.frame);
    return '<span class="cos-frame cos-frame--' + id + '"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + _frameInner(cos.frame) + '</svg></span>';
  }

  /* الطبقةُ الداخليّةُ للشارةِ (viewBox 100) — مشتركةٌ بينَ الشارةِ الحيّةِ بجانبِ
     الاسمِ ومعاينةِ المتجرِ/المخزونِ فتتطابقان تمامًا. */
  function _badgeInner(bid) {
    /* المصدرُ الفاخر: تدرّجٌ شعاعيٌّ + مرشّحُ توهّجٍ يُعرَّفانِ لكلِّ نسخةٍ بمعرِّفٍ
       فريدٍ (تفادي تصادمِ url(#id) مع أفاتاراتٍ كثيرةٍ في الصفحة)، ثمّ رسمٌ
       بطبقاتٍ يطابقُ الاسم. لو الشارةُ غيرُ مُرقّاةٍ نرجعُ للرسمِ المسطّحِ القديم. */
    var pal = BADGE_ART[bid];
    var special = BADGE_SPECIAL[bid];
    if (pal && special) {
      var uid = ++_uid;
      var gid = 'bg_' + esc(bid) + '_' + uid;
      var glow = 'bh_' + esc(bid) + '_' + uid;
      var defs = '<defs>'
        + '<radialGradient id="' + gid + '" cx="0.4" cy="0.32" r="0.85">'
        + '<stop offset="0" stop-color="' + pal[2] + '"/>'
        + '<stop offset="0.55" stop-color="' + pal[0] + '"/>'
        + '<stop offset="1" stop-color="' + pal[1] + '"/>'
        + '</radialGradient>'
        + '<filter id="' + glow + '" x="-40%" y="-40%" width="180%" height="180%">'
        + '<feGaussianBlur stdDeviation="2" result="b"/>'
        + '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>'
        + '</filter>'
        + '</defs>';
      return defs + special(pal, gid, glow);
    }
    var b = BADGE[bid];
    if (!b) return '';
    /* b[2]: إمّا 1 (عينا جمجمةٍ) أو نصُّ SVG إضافيٌّ يُركَّبُ فوقَ الشكلِ
       (بؤبؤٌ للعينِ، بتلاتٌ داخليّةٌ للّوتس…) — يرفعُ ثراءَ الشاراتِ النادرة. */
    var extra = b[2] === 1
      ? '<circle cx="41" cy="48" r="4.5" fill="#20242e"/><circle cx="59" cy="48" r="4.5" fill="#20242e"/>'
      : (typeof b[2] === 'string' ? b[2] : '');
    return '<path d="' + b[1] + '" fill="' + b[0] + '"><animate attributeName="opacity" values="1;0.55;1" dur="2.4s" repeatCount="indefinite"/></path>' + extra;
  }
  function badgeHTML(cos) {
    if (!cos || !cos.badge) return '';
    var id = esc(cos.badge);
    var inner = _badgeInner(cos.badge);
    if (!inner) return '';
    return '<span class="cos-badge cos-badge--' + id + '" aria-hidden="true"><svg viewBox="0 0 100 100">' + inner + '</svg></span>';
  }

  function bgHTML(cos) {
    if (!cos || !cos.background) return '';
    var g = BG[cos.background];
    if (!g) return '';
    return '<span class="cos-bg cos-bg--' + esc(cos.background) + '" style="background-image:' + g + '"></span>';
  }

  /* أجزاء تُدسّ داخل صندوق أفاتار (خلفية أسفل + إطار أعلى). */
  function avatarLayers(cos) { return bgHTML(cos) + frameHTML(cos); }

  /* رسم على عنصر DOM قائم (updatePlayerImages/الرئيسية): يزيل القديم ثم يضيف. */
  function paint(el, cos) {
    if (!el) return;
    var old = el.querySelectorAll(':scope > .cos-frame, :scope > .cos-bg');
    for (var i = 0; i < old.length; i++) old[i].remove();
    if (cos && (cos.frame || cos.background)) {
      el.classList.add('cos-host');
      var html = avatarLayers(cos);
      if (html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        // الخلفية أوّل عنصر (خلف)، الإطار آخر عنصر (أمام)
        var bg = tmp.querySelector('.cos-bg'); if (bg) el.insertBefore(bg, el.firstChild);
        var fr = tmp.querySelector('.cos-frame'); if (fr) el.appendChild(fr);
      }
    }
  }

  /* رسم شارة بجانب اسم في عنصر DOM قائم. */
  function paintName(el, cos) {
    if (!el) return;
    var old = el.querySelector(':scope > .cos-badge'); if (old) old.remove();
    if (cos && cos.badge) {
      var tmp = document.createElement('div');
      tmp.innerHTML = badgeHTML(cos);
      var b = tmp.firstChild; if (b) el.appendChild(b);
    }
  }

  /* لافتةُ الخلفيّةِ العريضةُ خلفَ الاسمِ والأفاتارِ في بطاقةِ الملفِّ (طلبُ جوجو:
     الخلفيّةُ تظهرُ لافتةً فاخرةً في الأعلى + هالةً حولَ الأفاتارِ في الأماكنِ
     الصغيرة). تدرّجُ BG نفسُه + بريقٌ مائلٌ عابرٌ + ذرّاتٌ عائمةٌ + تعتيمٌ حافظٌ
     لوضوحِ النصّ. كلُّه CSS خفيفٌ يحترمُ prefers-reduced-motion. */
  function bannerHTML(cos) {
    if (!cos || !cos.background) return '';
    var g = BG[cos.background];
    if (!g) return '';
    return '<span class="cos-banner cos-banner--' + esc(cos.background) + '" aria-hidden="true" style="background-image:' + g + '">'
      + '<span class="cos-banner__motes"></span><span class="cos-banner__sheen"></span></span>';
  }
  /* رسمُ اللافتةِ على بطاقةٍ قائمةٍ (بطاقةُ الملفِّ/هويّةُ الرئيسيّة). */
  function paintBanner(el, cos) {
    if (!el) return;
    var old = el.querySelector(':scope > .cos-banner'); if (old) old.remove();
    el.classList.remove('cos-bannered');
    if (cos && cos.background && BG[cos.background]) {
      el.classList.add('cos-bannered');
      var tmp = document.createElement('div');
      tmp.innerHTML = bannerHTML(cos);
      var b = tmp.firstChild; if (b) el.insertBefore(b, el.firstChild);
    }
  }

  function self() {
    try { return (window.amkhEconomy && window.amkhEconomy.state && window.amkhEconomy.state.equipped) || null; }
    catch (e) { return null; }
  }

  /* ══ تشغيلُ احتفالِ الفوزِ / مؤثّرِ المات مِلءَ الشاشة ══
     تُبنى الجُسيماتُ في DOM مع CSS keyframes (transform/opacity)، ثمّ تُزال
     بعدَ ٤ ثوانٍ. لا تعترضُ اللمسَ ولا تمسّ اللوح. الاختيارُ من المُجهَّز. */
  function _rnd(a, b) { return a + Math.random() * (b - a); }
  var _CELCOL = ['#ff5da2', '#5ad1ff', '#ffd24a', '#6fffa8', '#c17bff', '#ff8a3a'];
  var _NEON = ['#00eaff', '#ff2fd0', '#7cff5a', '#ffd24a'];
  function _mk(cls, styles, inner) {
    var d = document.createElement('div'); d.className = cls;
    if (styles) for (var k in styles) { if (k.indexOf('--') === 0) d.style.setProperty(k, styles[k]); else d.style[k] = styles[k]; }
    if (inner != null) d.innerHTML = inner;
    return d;
  }
  function _fall(layer, n, cls, colorFn, drift) {
    for (var i = 0; i < n; i++) {
      var st = { left: _rnd(0, 100) + 'vw', animationDelay: _rnd(0, 1.0).toFixed(2) + 's', animationDuration: _rnd(2.0, 3.4).toFixed(2) + 's', '--spin': Math.round(_rnd(360, 900)) + 'deg' };
      if (drift) st['--sway'] = _rnd(2, 7).toFixed(1) + 'vw';
      var el = _mk((drift ? 'cosfx-drift ' : 'cosfx-fall ') + cls, st);
      var c = colorFn ? colorFn(i) : null; if (c) el.style.background = c;
      layer.appendChild(el);
    }
  }
  function _meteors(layer, n) {
    for (var i = 0; i < n; i++) layer.appendChild(_mk('cosfx-meteor', { left: _rnd(-10, 90) + 'vw', top: _rnd(-10, 40) + 'vh', animationDelay: _rnd(0, 1.4).toFixed(2) + 's', animationDuration: _rnd(0.9, 1.6).toFixed(2) + 's' }));
  }
  function _rise(layer, n, cls, colorFn) {
    for (var i = 0; i < n; i++) {
      var st = { left: _rnd(2, 96) + 'vw', animationDelay: _rnd(0, 1.2).toFixed(2) + 's', animationDuration: _rnd(2.6, 4.2).toFixed(2) + 's', '--tilt': _rnd(-12, 12).toFixed(0) + 'deg' };
      var el = _mk('cosfx-rise ' + cls, st);
      var c = colorFn ? colorFn(i) : null; if (c) el.style.background = c;
      layer.appendChild(el);
    }
  }
  function _burst(layer, origins, perOrigin, colors) {
    origins.forEach(function (o) {
      for (var i = 0; i < perOrigin; i++) {
        var ang = _rnd(0, Math.PI * 2), dist = _rnd(16, 44), c = colors[i % colors.length];
        var el = _mk('cosfx-spark', { left: o[0] + 'vw', top: o[1] + 'vh', animationDelay: o[2] + 's', animationDuration: _rnd(0.8, 1.4).toFixed(2) + 's', '--dx': (Math.cos(ang) * dist).toFixed(1) + 'vh', '--dy': (Math.sin(ang) * dist).toFixed(1) + 'vh' });
        el.style.background = c; el.style.boxShadow = '0 0 8px ' + c;
        layer.appendChild(el);
      }
    });
  }
  function _beams(layer, colors) {
    [-40, -18, 6, 26, 44].forEach(function (a, i) {
      var c = colors[i % colors.length];
      var el = _mk('cosfx-beam', { '--a': a + 'deg', animationDelay: (i * 0.12).toFixed(2) + 's', animationDuration: '1.6s' });
      el.style.background = 'linear-gradient(180deg,' + c + ',transparent)'; el.style.boxShadow = '0 0 14px ' + c;
      layer.appendChild(el);
    });
  }
  function _flash(layer, bg) { var el = _mk('cosfx-flash', { animationDuration: '1.1s' }); el.style.background = bg; layer.appendChild(el); }
  function _glitch(layer) {
    var cols = ['#ff004d', '#00eaff', '#ffffff'];
    for (var i = 0; i < 10; i++) layer.appendChild(_mk('cosfx-glitchbar', { top: _rnd(0, 100) + 'vh', height: _rnd(6, 20).toFixed(0) + 'px', background: cols[i % cols.length], animationDelay: _rnd(0, 0.6).toFixed(2) + 's', animationDuration: _rnd(0.5, 1.0).toFixed(2) + 's' }));
    _flash(layer, 'linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,234,255,.12))');
  }
  function _crack(layer, color) {
    var lines = '';
    for (var i = 0; i < 9; i++) lines += '<line x1="' + _rnd(30, 70).toFixed(0) + '" y1="' + _rnd(30, 70).toFixed(0) + '" x2="' + _rnd(0, 100).toFixed(0) + '" y2="' + _rnd(0, 100).toFixed(0) + '" stroke="' + color + '" stroke-width="' + _rnd(0.4, 1.4).toFixed(2) + '"/>';
    layer.appendChild(_mk('cosfx-crack', { animationDuration: '1.2s' }, '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="filter:drop-shadow(0 0 4px ' + color + ')">' + lines + '</svg>'));
  }
  /* حلقاتُ صدمةٍ تتّسعُ من المركز (رعد/منشور/انفجار). */
  function _shock(layer, colors) {
    colors.forEach(function (c, i) {
      var el = _mk('cosfx-shock', { animationDelay: (i * 0.18).toFixed(2) + 's', animationDuration: '1.4s' });
      el.style.borderColor = c; el.style.boxShadow = '0 0 22px ' + c + ',inset 0 0 22px ' + c;
      layer.appendChild(el);
    });
  }
  /* جُسيماتٌ تُبتلَعُ نحوَ المركز (الثقبُ الأسود). */
  function _implode(layer, n, colors) {
    for (var i = 0; i < n; i++) {
      var ang = _rnd(0, Math.PI * 2), dist = _rnd(34, 62), c = colors[i % colors.length];
      var el = _mk('cosfx-implode', { animationDelay: _rnd(0, 0.9).toFixed(2) + 's', animationDuration: _rnd(0.9, 1.5).toFixed(2) + 's', '--dx': (Math.cos(ang) * dist).toFixed(1) + 'vh', '--dy': (Math.sin(ang) * dist).toFixed(1) + 'vh' });
      el.style.background = c; el.style.boxShadow = '0 0 9px ' + c;
      layer.appendChild(el);
    }
  }
  /* قرصُ ثقبٍ أسودَ دوّارٌ في المركز. */
  function _vortex(layer, color) {
    layer.appendChild(_mk('cosfx-vortex', { animationDuration: '1.8s' },
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="18" fill="#050310"/><circle cx="50" cy="50" r="27" fill="none" stroke="' + color + '" stroke-width="4" stroke-dasharray="12 9" stroke-linecap="round"/><circle cx="50" cy="50" r="34" fill="none" stroke="' + color + '" stroke-width="2" stroke-dasharray="4 12" opacity="0.6"/></svg>'));
  }
  /* FX_DISPATCH_PLACEHOLDER */
  function _playOne(layer, id) {
    switch (id) {
      case 'cel_confetti': _fall(layer, 54, 'cosfx-confetti', function (i) { return _CELCOL[i % _CELCOL.length]; }, false); break;
      case 'cel_petals': _fall(layer, 40, 'cosfx-petal', function () { return ['#ffc2dd', '#ff8fb8', '#ffe0ec'][Math.floor(Math.random() * 3)]; }, true); break;
      case 'cel_coins': _fall(layer, 40, 'cosfx-coin', null, false); break;
      case 'cel_stars': _fall(layer, 44, 'cosfx-star', function (i) { return i % 2 ? '#fff2b0' : '#ffd24a'; }, true); break;
      case 'cel_balloons': _rise(layer, 22, 'cosfx-balloon', function (i) { return _CELCOL[i % _CELCOL.length]; }); break;
      case 'cel_fireworks': _burst(layer, [[25, 30, 0], [60, 22, 0.4], [45, 42, 0.8], [75, 38, 1.1]], 16, _CELCOL); break;
      case 'cel_lasers': _beams(layer, _NEON); _flash(layer, 'radial-gradient(circle at 50% 60%,rgba(0,234,255,.12),transparent 60%)'); break;
      case 'cel_meteor': _meteors(layer, 18); break;
      case 'fx_goldrain': _fall(layer, 46, 'cosfx-goldrain', null, false); break;
      case 'fx_seasonal_snow': _fall(layer, 50, 'cosfx-snow', null, true); break;
      case 'fx_shatter': _crack(layer, '#eaf2ff'); _flash(layer, 'radial-gradient(circle at 50% 45%,rgba(255,255,255,.5),transparent 55%)'); break;
      case 'fx_lightning': _flash(layer, 'linear-gradient(180deg,rgba(180,220,255,.5),rgba(120,160,255,.1))'); _burst(layer, [[50, 20, 0]], 14, ['#dff0ff', '#8ab6ff']); break;
      case 'fx_flames': _rise(layer, 26, 'cosfx-flame', null); break;
      case 'fx_supernova': _burst(layer, [[50, 44, 0]], 40, ['#ffffff', '#ffd24a', '#ff8a3a', '#5ad1ff']); _flash(layer, 'radial-gradient(circle at 50% 44%,rgba(255,240,200,.6),transparent 55%)'); break;
      case 'fx_ink': _burst(layer, [[50, 45, 0]], 16, ['#0a0a12', '#20203a']); _flash(layer, 'radial-gradient(circle at 50% 50%,rgba(8,8,18,.55),transparent 60%)'); break;
      case 'fx_glitch': _glitch(layer); break;
      case 'fx_frostbreak': _crack(layer, '#bfefff'); _flash(layer, 'radial-gradient(circle at 50% 45%,rgba(180,240,255,.4),transparent 55%)'); break;
      /* ═══ Mythic — احتفالاتٌ ومؤثّراتٌ مِلءَ الشاشةِ الأفخم ═══ */
      case 'cel_dragon': _flash(layer, 'radial-gradient(circle at 50% 100%,rgba(255,90,30,.6),rgba(122,21,0,.22),transparent 72%)'); _rise(layer, 36, 'cosfx-flame', function (i) { return i % 2 ? '#ff5a1e' : '#ffb347'; }); _burst(layer, [[50, 72, 0], [30, 82, 0.3], [70, 80, 0.6]], 14, ['#ff5a1e', '#ffd27a', '#ff8a1e']); break;
      case 'cel_galaxy': _burst(layer, [[50, 40, 0], [28, 32, 0.3], [72, 34, 0.6], [40, 56, 0.9], [62, 52, 1.1]], 20, ['#b48bff', '#8fd4ff', '#ffffff', '#ff6ad5']); _shock(layer, ['#b48bff', '#8fd4ff', '#ff6ad5']); _flash(layer, 'radial-gradient(circle at 50% 44%,rgba(140,120,255,.42),transparent 62%)'); _meteors(layer, 12); break;
      case 'cel_phoenix': _rise(layer, 32, 'cosfx-flame', function () { return ['#ff8a3a', '#ffd27a', '#ff3d00'][Math.floor(Math.random() * 3)]; }); _flash(layer, 'radial-gradient(circle at 50% 72%,rgba(255,138,58,.5),transparent 66%)'); _burst(layer, [[50, 52, 0.2]], 26, ['#ffd27a', '#ff5a1e', '#ffffff']); break;
      case 'cel_goldstorm': _fall(layer, 60, 'cosfx-coin', null, false); _fall(layer, 30, 'cosfx-goldrain', null, false); _flash(layer, 'radial-gradient(circle at 50% 28%,rgba(255,210,74,.42),transparent 62%)'); break;
      case 'fx_dragonfire': _flash(layer, 'radial-gradient(circle at 50% 60%,rgba(255,60,0,.62),rgba(122,21,0,.26),transparent 70%)'); _rise(layer, 30, 'cosfx-flame', function (i) { return i % 2 ? '#ff3d00' : '#ff8a1e'; }); _crack(layer, '#ff7a2f'); break;
      case 'fx_blackhole': _vortex(layer, '#c48bff'); _implode(layer, 34, ['#b06bff', '#e0c8ff', '#7a4fd0']); _flash(layer, 'radial-gradient(circle at 50% 50%,rgba(10,6,24,.72),rgba(122,60,180,.22),transparent 60%)'); break;
      case 'fx_thunderstrike': _flash(layer, 'linear-gradient(180deg,rgba(220,235,255,.72),rgba(120,140,255,.18))'); _burst(layer, [[50, 18, 0], [50, 18, 0.35], [50, 18, 0.7]], 16, ['#ffffff', '#8fd4ff', '#ffe14a']); _shock(layer, ['#ffffff', '#8fd4ff']); break;
      case 'fx_prismburst': _burst(layer, [[50, 46, 0]], 40, ['#5affc0', '#8fd4ff', '#ff6ad5', '#ffe14a', '#ffffff']); _beams(layer, ['#5affc0', '#8fd4ff', '#ff6ad5', '#ffe14a']); _shock(layer, ['#8fd4ff', '#ff6ad5', '#5affc0']); _flash(layer, 'radial-gradient(circle at 50% 46%,rgba(255,255,255,.55),transparent 56%)'); break;

      /* ═══ توسعةُ البناء ٦٢ — احتفالاتٌ ومؤثّراتٌ نادرةٌ وملحميّة ═══ */
      case 'cel_ribbons': _fall(layer, 44, 'cosfx-ribbon', function (i) { return _CELCOL[i % _CELCOL.length]; }, true); _flash(layer, 'radial-gradient(circle at 50% 18%,rgba(255,255,255,.18),transparent 62%)'); break;
      case 'cel_bubbles': _rise(layer, 30, 'cosfx-bubble', null); _flash(layer, 'radial-gradient(circle at 50% 80%,rgba(90,209,255,.22),transparent 66%)'); break;
      case 'cel_leaves': _fall(layer, 40, 'cosfx-leaf', function (i) { return ['#6fcf5a', '#bfe89a', '#e8c37a', '#3f8a3a'][i % 4]; }, true); break;
      case 'cel_sparks': _burst(layer, [[30, 40, 0], [56, 26, 0.32], [72, 46, 0.62], [42, 58, 0.9]], 18, ['#ffffff', '#ffd24a', '#ff8a3a']); _shock(layer, ['#ffd24a', '#ff8a3a']); _flash(layer, 'radial-gradient(circle at 50% 42%,rgba(255,210,120,.3),transparent 60%)'); break;
      case 'cel_aurora': _beams(layer, ['#5affc0', '#8a5cff', '#8fd4ff', '#c8ffe6']); _fall(layer, 22, 'cosfx-star', function (i) { return i % 2 ? '#c8ffe6' : '#ffffff'; }, true); _flash(layer, 'linear-gradient(180deg,rgba(90,255,192,.2),rgba(138,92,255,.12),transparent 72%)'); break;
      case 'cel_crowns': _fall(layer, 26, 'cosfx-crown', null, true); _fall(layer, 20, 'cosfx-coin', null, false); _flash(layer, 'radial-gradient(circle at 50% 24%,rgba(255,210,74,.34),transparent 62%)'); break;
      case 'cel_sunburst': _beams(layer, ['#ffd24a', '#fff0b0', '#ffb02f', '#ffffff']); _burst(layer, [[50, 42, 0]], 32, ['#ffffff', '#ffd24a', '#ffb02f']); _shock(layer, ['#fff0b0', '#ffd24a', '#ffb02f']); _flash(layer, 'radial-gradient(circle at 50% 42%,rgba(255,240,180,.6),rgba(255,176,47,.2),transparent 60%)'); break;
      case 'fx_sandstorm': _fall(layer, 62, 'cosfx-sand', null, true); _flash(layer, 'linear-gradient(120deg,rgba(232,195,122,.34),rgba(138,96,32,.2),transparent 74%)'); break;
      case 'fx_ripple': _shock(layer, ['#cceeff', '#4ad6ff', '#8fd4ff', '#0a4a7a']); _rise(layer, 14, 'cosfx-bubble', null); _flash(layer, 'radial-gradient(circle at 50% 50%,rgba(74,214,255,.32),transparent 58%)'); break;
      case 'fx_leafstorm': _fall(layer, 46, 'cosfx-leaf', function (i) { return ['#6fcf5a', '#3f8a3a', '#bfe89a'][i % 3]; }, true); _shock(layer, ['#6fcf5a', '#bfe89a']); _flash(layer, 'radial-gradient(circle at 50% 54%,rgba(111,207,90,.26),transparent 62%)'); break;
      case 'fx_venom': _rise(layer, 26, 'cosfx-bubble', function () { return 'radial-gradient(circle at 34% 28%,rgba(224,255,176,.95),rgba(159,255,47,.3) 58%,rgba(159,255,47,0) 72%)'; }); _crack(layer, '#9fff2f'); _flash(layer, 'radial-gradient(circle at 50% 62%,rgba(159,255,47,.32),rgba(37,82,8,.22),transparent 66%)'); break;
      case 'fx_quake': _crack(layer, '#e8c37a'); _shock(layer, ['#e8c37a', '#8a6020']); _fall(layer, 30, 'cosfx-sand', null, true); _flash(layer, 'linear-gradient(180deg,rgba(138,96,32,.28),rgba(232,195,122,.16),transparent 70%)'); break;
      case 'fx_eclipse': _vortex(layer, '#ffb02f'); _implode(layer, 26, ['#ffb02f', '#fff0b0', '#c9a84c']); _flash(layer, 'radial-gradient(circle at 50% 46%,rgba(10,10,18,.7),rgba(255,176,47,.24),transparent 60%)'); break;
      case 'fx_solarflare': _beams(layer, ['#ffb02f', '#fff0b0', '#ffd24a']); _burst(layer, [[50, 40, 0], [50, 40, 0.4]], 26, ['#ffffff', '#ffd24a', '#ffb02f']); _shock(layer, ['#fff0b0', '#ffb02f']); _flash(layer, 'radial-gradient(circle at 50% 40%,rgba(255,240,180,.62),rgba(160,58,0,.2),transparent 62%)'); break;
      default: return false;
    }
    return true;
  }
  var _fxBusy = false;
  function celebrate(cos) {
    try {
      if (_fxBusy) return;
      cos = cos || self();
      if (!cos) return;
      var ids = []; if (cos.celebration) ids.push(cos.celebration); if (cos.mate_fx) ids.push(cos.mate_fx);
      if (!ids.length) return;
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      _fxBusy = true;
      var ov = document.createElement('div'); ov.className = 'cos-fx-ov';
      document.body.appendChild(ov);
      var any = false; ids.forEach(function (id) { if (_playOne(ov, id)) any = true; });
      if (!any) { ov.remove(); _fxBusy = false; return; }
      setTimeout(function () { try { ov.remove(); } catch (e) {} _fxBusy = false; }, 4200);
    } catch (e) { _fxBusy = false; }
  }

  /* ══ المعاينةُ الموحّدةُ للمتجرِ/المخزونِ (thumb) ══
     تمثالُ أفاتارٍ وهميٌّ (100-box) تحيطُه نفسُ طبقةِ الإطارِ الحيّةِ بالضبطِ،
     أو الشارةُ مكبّرةً — فيُصبِحُ ما يراه اللاعبُ في المتجرِ مطابقًا لِما سيظهرُ
     حولَ أفاتارِه. يقضي هذا على تناقضِ الصقيعِ ويرفعُ فنَّ المتجرِ لمستوى الأفاتار. */
  var _AV = '<circle cx="50" cy="53" r="30" fill="#140b26"/><circle cx="50" cy="42" r="10" fill="#3a2b55"/><path d="M32 70a18 16 0 0 1 36 0z" fill="#3a2b55"/>';
  function thumb(it) {
    if (!it || !it.type) return '';
    if (it.type === 'frame') {
      return '<svg viewBox="0 0 100 100" class="st-svg">' + _AV + _frameInner(it.id) + '</svg>';
    }
    if (it.type === 'badge') {
      var inner = _badgeInner(it.id);
      if (!inner) return '';
      /* تكبيرٌ طفيفٌ حولَ المركزِ ليملأَ البطاقةَ مع هامشٍ آمن */
      return '<svg viewBox="0 0 100 100" class="st-svg"><g transform="translate(50 50) scale(0.94) translate(-50 -50)">' + inner + '</g></svg>';
    }
    /* الخلفياتُ والاحتفالاتُ ومؤثّراتُ المات: مشاهدُها الغنيّةُ تُرسَمُ في
       store-client (لا تناقضَ لأنّ الحيَّ خلفيّةٌ متدرّجةٌ/جُسيماتٌ DOM). */
    return '';
  }

  /* ══ قرصُ العملةِ الموحّد (AK) ══
     نفسُ عملةِ الرئيسيّةِ بالضبط: طوقٌ داكنٌ + قرصٌ متدرّجٌ + حلقةٌ داخليّةٌ + AK.
     معرّفُ التدرّجِ فريدٌ لكلِّ نسخةٍ (يظهرُ عشراتٍ في المتجرِ/الجوائزِ معًا)،
     وبلا SMIL حفاظًا على الأداءِ عندَ تعدّدِ النسخ. يوحّدُ شكلَ العملةِ في كلِّ مكان. */
  function coin(px) {
    var u = ++_uid, g = 'ac' + u;
    var sz = px ? (' style="width:' + px + 'px;height:' + px + 'px"') : '';
    return '<svg class="amkh-coin-svg" viewBox="0 0 40 40"' + sz + ' aria-hidden="true">'
      + '<defs><radialGradient id="' + g + '" cx="38%" cy="30%" r="75%">'
      + '<stop offset="0" stop-color="#fff6cf"/><stop offset=".48" stop-color="#f5c451"/><stop offset="1" stop-color="#b9800f"/>'
      + '</radialGradient></defs>'
      + '<circle cx="20" cy="20" r="18.5" fill="#7f5307"/>'
      + '<circle cx="20" cy="20" r="17" fill="url(#' + g + ')"/>'
      + '<circle cx="20" cy="20" r="14" fill="none" stroke="#fff2c0" stroke-width="1" opacity=".55"/>'
      + '<text x="20" y="20.5" text-anchor="middle" dominant-baseline="central" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="13" letter-spacing="-.6" fill="#7a4e08">AK</text>'
      + '</svg>';
  }

  /* ══ احتفالُ الترقّي ══
     يُستدعى من rewards-client عندَ ارتفاعِ المستوى (نصّان مترجمان يأتيان جاهزَين
     فتبقى هذه الوحدةُ خاليةً من اللغة). ملءُ الشاشةِ بذوقِ جوجو، محترمٌ لتقليلِ الحركة. */
  function levelUp(level, title, sub) {
    try {
      if (_fxBusy) return;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      _fxBusy = true;
      var ov = document.createElement('div'); ov.className = 'cos-fx-ov cos-fx-ov--keep';
      document.body.appendChild(ov);
      if (!reduce) {
        _flash(ov, 'radial-gradient(circle at 50% 46%,rgba(255,210,74,.5),transparent 60%)');
        _burst(ov, [[50, 46, 0], [32, 40, 0.25], [68, 42, 0.5]], 22, ['#ffd24a', '#fff2b0', '#ffae3a', '#ffffff']);
        _fall(ov, 26, 'cosfx-star', function (i) { return i % 2 ? '#fff2b0' : '#ffd24a'; }, true);
      }
      var lg = 'lug' + (++_uid);
      var card = document.createElement('div');
      card.className = 'cos-levelup' + (reduce ? ' cos-levelup--still' : '');
      card.innerHTML =
        '<span class="cos-levelup__ring"><svg viewBox="0 0 120 120">'
        + '<defs><linearGradient id="' + lg + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset="1" stop-color="#e8a41e"/></linearGradient></defs>'
        + '<circle cx="60" cy="60" r="52" fill="none" stroke="#7a5207" stroke-width="9"/>'
        + '<circle cx="60" cy="60" r="52" fill="none" stroke="url(#' + lg + ')" stroke-width="6"/>'
        + '<text x="60" y="63" text-anchor="middle" dominant-baseline="central" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="46" fill="#ffe08a">' + (Number(level) || 1) + '</text>'
        + '</svg></span>'
        + '<span class="cos-levelup__ttl">' + (title || '') + '</span>'
        + '<span class="cos-levelup__sub">' + (sub || '') + '</span>';
      ov.appendChild(card);
      setTimeout(function () { try { ov.remove(); } catch (e) {} _fxBusy = false; }, reduce ? 2200 : 3600);
    } catch (e) { _fxBusy = false; }
  }

  window.amkhCos = {
    frameHTML: frameHTML,
    badgeHTML: badgeHTML,
    bgHTML: bgHTML,
    avatarLayers: avatarLayers,
    paint: paint,
    paintName: paintName,
    bannerHTML: bannerHTML,
    paintBanner: paintBanner,
    self: self,
    celebrate: celebrate,
    thumb: thumb,
    coin: coin,
    levelUp: levelUp,
    FRAME: FRAME, BADGE: BADGE, BG: BG,
  };
})();
