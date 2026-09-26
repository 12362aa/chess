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
      if (fill) {
        var lo = Number(s.thisLevelXp) || 0, hi = Number(s.nextLevelXp) || (lo + 1);
        var xp = Number(s.xp) || 0;
        var pct = hi > lo ? Math.max(0, Math.min(100, ((xp - lo) / (hi - lo)) * 100)) : 100;
        if (s.level >= (s.maxLevel || 50)) pct = 100;
        fill.style.width = pct.toFixed(1) + '%';
      }
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
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_-]/g, ''); }

  function frameHTML(cos) {
    if (!cos || !cos.frame) return '';
    var id = esc(cos.frame);
    var t = FRAME[cos.frame] || FRAME.frame_gold;
    var gid = 'cf_' + id;
    var glow = FRAME_GLOW[cos.frame];
    var special = FRAME_SPECIAL[cos.frame];
    var inner = ''
      + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="' + t[0] + '"/>'
      + '<stop offset="0.5" stop-color="' + t[2] + '"/>'
      + '<stop offset="1" stop-color="' + t[1] + '"/>'
      + '</linearGradient></defs>';
    if (special) {
      inner += special(t, gid);
    } else if (glow) {
      inner += '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + gid + ')" stroke-width="6">'
        + '<animate attributeName="stroke-width" values="4;7;4" dur="1.6s" repeatCount="indefinite"/>'
        + '<animate attributeName="opacity" values="0.75;1;0.75" dur="1.6s" repeatCount="indefinite"/>'
        + '</circle>';
    } else {
      inner += '<g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="6s" repeatCount="indefinite"/>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + gid + ')" stroke-width="6" stroke-linecap="round" stroke-dasharray="60 22"/>'
        + '</g>'
        + '<circle cx="50" cy="50" r="45" fill="none" stroke="' + t[2] + '" stroke-width="1.4" opacity="0.45"/>';
    }
    return '<span class="cos-frame cos-frame--' + id + '"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + inner + '</svg></span>';
  }

  function badgeHTML(cos) {
    if (!cos || !cos.badge) return '';
    var id = esc(cos.badge);
    var b = BADGE[cos.badge];
    if (!b) return '';
    var eyes = b[2]
      ? '<circle cx="41" cy="48" r="4.5" fill="#20242e"/><circle cx="59" cy="48" r="4.5" fill="#20242e"/>'
      : '';
    return '<span class="cos-badge cos-badge--' + id + '" aria-hidden="true"><svg viewBox="0 0 100 100">'
      + '<path d="' + b[1] + '" fill="' + b[0] + '"><animate attributeName="opacity" values="1;0.55;1" dur="2.4s" repeatCount="indefinite"/></path>'
      + eyes + '</svg></span>';
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

  window.amkhCos = {
    frameHTML: frameHTML,
    badgeHTML: badgeHTML,
    bgHTML: bgHTML,
    avatarLayers: avatarLayers,
    paint: paint,
    paintName: paintName,
    self: self,
    celebrate: celebrate,
    FRAME: FRAME, BADGE: BADGE, BG: BG,
  };
})();
