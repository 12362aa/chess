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

  /* ── وسمُ صاحبِ اللقطةِ المخبّأة (بلاغُ جوجو «أهمُّ خطأ») ──
     السيناريو: حسابٌ فيه إطارٌ وخلفيّةٌ، خروجٌ منه، ثمّ دخولٌ بحسابٍ لا
     يملكُهما — فيظلّانِ ظاهرَينِ في الشاشةِ الرئيسيّةِ شكلًا لا حقيقة.
     السببُ الجذريّ: اللقطةُ كانت تُخبَّأُ في localStorage بلا صاحبٍ، و
     init() تستعيدُها لأيِّ حسابٍ يفتحُ التطبيقَ بعدَها، فيرجعُ
     state.equipped الخاصُّ بالحسابِ السابق. القاعدةُ الصارمة: التجميلُ
     يخصُّ الحسابَ لا الجهاز — فاللقطةُ تُوسَمُ بصاحبِها، ولا تُستعادُ
     إلّا له بعينِه، وتُمسَحُ كليًّا عندَ الخروج. */
  function ownerUid() {
    try {
      if (window.amkhAuth && window.amkhAuth.user && window.amkhAuth.user.id != null)
        return String(window.amkhAuth.user.id);
      var raw = localStorage.getItem('amkh_user');
      if (raw) { var u = JSON.parse(raw); if (u && u.id != null) return String(u.id); }
    } catch (e) {}
    return '';
  }

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
      /* بلا توكِن = زائرٌ أو خارجٌ للتوّ: لا رصيدَ ولا تجميلَ ظاهرٌ إطلاقًا. */
      if (!tok) { if (this.state) this.clear(); else this._renderHidden(); return Promise.resolve(null); }
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
      /* تُخزَّنُ موسومةً بصاحبِها — لا لقطةَ بلا صاحبٍ بعدَ اليوم. */
      try { localStorage.setItem(LS_KEY, JSON.stringify({ uid: ownerUid(), snap: snap })); } catch (e) {}
      this._render();
      try { window.dispatchEvent(new Event('amkh:cosmetics')); } catch (e) {}
    },

    /* مسحُ كلِّ أثرِ الحسابِ من طبقةِ الاقتصادِ والتجميل: يُنادى من
       amkhAuth.logout() ومن تبديلِ الحساباتِ على نفسِ الجهاز. بعدَه
       amkhCos.self() تُرجِعُ null فتُزيلُ paint/paintName/paintBanner
       الإطارَ والشارةَ واللافتةَ فورًا من الرئيسيّةِ وكلِّ مكان. */
    clear: function () {
      this.state = null;
      this._inflight = false;
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      this._renderHidden();
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

    /* أبلغ الخادم بنتيجةِ مباراةٍ محليّة (نور/المحرّك) لتقديمِ المهامِّ فقط
       (بلاغ جوجو #9). mode:'nour'|'engine'، outcome:'win'|'draw'|'loss'،
       reason مثل 'checkmate'. لا عملةَ مباراةٍ هنا — سقفٌ يوميٌّ خادميّ. */
    notifyLocalResult: function (mode, outcome, reason) {
      var tok = this._token(); if (!tok) return;
      if (mode !== 'nour' && mode !== 'engine') return;
      var self = this;
      fetch(this._api() + '/economy/local-result', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ mode: mode, outcome: outcome || 'loss', reason: reason || '' })
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
      /* اعرض النسخة المخبّأة فورًا (تجربة أسرع) ثم حدّث من الخادم — لكن
         لصاحبِها وحدَه. أيُّ لقطةٍ لحسابٍ آخرَ (أو بالصيغةِ القديمةِ بلا
         وسمِ صاحبٍ) تُمسَحُ ولا تُعرَضُ إطلاقًا، فلا يرثُ حسابٌ إطارَ
         حسابٍ آخرَ ولا خلفيّتَه ولا رصيدَه (بلاغُ جوجو «أهمُّ خطأ»). */
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (raw) {
          var box = JSON.parse(raw);
          var me = ownerUid();
          if (box && box.snap && box.uid && me && String(box.uid) === me) {
            this.state = box.snap; this._render();
          } else {
            localStorage.removeItem(LS_KEY);
            this._renderHidden();
          }
        }
      } catch (e) { try { localStorage.removeItem(LS_KEY); } catch (e2) {} }
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
        + '<circle cx="50" cy="50" r="2.4" fill="' + t[2] + '" opacity="0.5"><animate attributeName="r" values="1.6;3;1.6" dur="2.2s" repeatCount="indefinite"/></circle>';
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
      return '<circle cx="50" cy="50" r="40" fill="none" stroke="' + t[1] + '" stroke-width="3" opacity="0.5"><animate attributeName="opacity" values="0.25;0.7;0.25" dur="1.2s" repeatCount="indefinite"/></circle>'
        + '<circle cx="50" cy="50" r="42" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<g>' + ring + '</g>'
        + '<circle cx="50" cy="50" r="42" fill="none" stroke="' + t[2] + '" stroke-width="1.6" stroke-dasharray="6 10"><animate attributeName="stroke-dashoffset" from="0" to="32" dur="0.8s" repeatCount="indefinite"/></circle>';
    },
    // الفراغ: دوّامةٌ سوداءُ + حلقتان بنفسجيّتان تنكمشان نحوَ المركزِ + جسيماتٌ تُبتَلَع
    frame_void: function (t, g) {
      return '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + g + ')" stroke-width="6"/>'
        + '<circle cx="50" cy="50" r="30" fill="none" stroke="' + t[1] + '" stroke-width="2.2" opacity="0.55"/>'
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
        + '<path d="M50 50 L50 3 L60 6 Z" fill="' + t[1] + '" opacity="0.32"/><path d="M50 50 L94 40 L92 52 Z" fill="' + t[2] + '" opacity="0.32"/><path d="M50 50 L58 96 L46 94 Z" fill="#ffe14a" opacity="0.32"/><path d="M50 50 L8 60 L10 47 Z" fill="' + t[0] + '" opacity="0.32"/></g>'
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
      return '<polygon points="' + oct + '" fill="none" stroke="url(#' + g + ')" stroke-width="5" stroke-linejoin="round"/>'
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

  /* ══════════════════════════════════════════════════════════════════════
     BG_SCENE — مشاهدُ الخلفيّاتِ المرسومةُ (بلاغُ جوجو ٨: «أكبرُ مشكلة»)
     ──────────────────────────────────────────────────────────────────────
     الحالةُ قبلَ هذا: الخلفيّةُ كانت **سلسلةَ تدرّجٍ نصّيّةً** وحدَها في BG
     فوقَها طبقتانِ عامّتانِ (motes/sheen) — فلا شكلَ ولا مشهدَ ولا تأثير.
     ولأنّ التمييزَ كلَّه كان في لوحةِ الألوانِ فقط، تشابهَتْ مجموعاتٌ
     كاملةٌ تشابهًا يُقرأُ تكرارًا: وكرُ التنّينِ ≈ الجحيمُ (نفسُ الأحمرِ
     البرتقاليِّ)، والسديمُ ≈ المجرّةُ ≈ الكونُ ≈ الفراغُ (نفسُ البنفسجيِّ
     والأزرقِ الغامق) — وهو ما رصدَه جوجو بالحرف. وأسوأُ منه: الاسمُ لم
     يكنْ يصفُ شيئًا، فـ«خلفيّةُ العاصفة» بلا برقٍ ولا مطرٍ و«خلفيّةُ
     الكون» بلا مجرّةٍ ولا كوكب.
     وفوقَ ذلك كان للخلفيّةِ **مُصيّرانِ منفصلان**: مشهدٌ بسيطٌ في
     store-client للمعاينةِ، وتدرّجٌ للحيِّ — فما يُشترى غيرُ ما يُطبَّق،
     وأربعَ عشرةَ خلفيّةً بلا مشهدٍ أصلًا تسقطُ للمولّدِ العامّ.
     الحلُّ هو نفسُ الحلِّ الذي أنهى تناقضَ الصقيعِ في الإطارات: مصدرُ
     حقيقةٍ **واحدٌ** هنا يرسمُ مشهدًا حقيقيًّا لكلِّ خلفيّةٍ من الأربعِ
     والعشرين، يقرأُ منه المتجرُ والمخزونُ واللافتةُ الحيّةُ معًا.
     قواعدُ التصميمِ الملتزَمة:
     • **الاسمُ هو المشهد**: العاصفةُ فيها صاعقةٌ متفرّعةٌ ومطرٌ، والكونُ
       مجرّةٌ حلزونيّةٌ مواجهةٌ وكوكبٌ بحلقةٍ، ووكرُ التنّينِ رأسُ تنّينٍ
       بعينَينِ وكنوزٌ، والفراغُ ثقبٌ أسودُ بقرصِ تراكمٍ… إلخ.
     • **لا تشابهَ بنيويًّا**: المجرّةُ قرصٌ جانبيٌّ (edge-on) والكونُ
       حلزونٌ مواجهٌ (face-on) والسديمُ أعمدةُ غازٍ والفراغُ ثقبٌ أسود —
       أربعةُ أشكالٍ مختلفةٍ لا أربعُ لوحاتٍ لونيّةٍ لشكلٍ واحد. ومثلُها
       الجحيمُ (أعمدةُ لهبٍ صاعدةٌ من شقوقِ أرضٍ) ضدَّ وكرِ التنّينِ
       (كهفٌ مغلقٌ وكائنٌ وكنوز) ضدَّ البركانِ (مخروطٌ وثورةٌ ودخان).
     • **viewBox موحّدٌ 200×100 بـslice**: اللافتةُ عريضةٌ فتقصُّ أعلى
       وأسفلَ، والمعاينةُ مربّعةٌ فتقصُّ الجانبَين — فكلُّ عنصرِ هويّةٍ
       يُوضَعُ داخلَ المنطقةِ الآمنةِ المشتركةِ x∈[50,150] y∈[25,75]،
       والزخرفةُ وحدَها تمتدُّ خارجَها.
     • **تقليلُ الحركة**: المشهدُ يُولَدُ بلا أيِّ <animate> أصلًا عندَ
       تفعيلِ الإعداد (المساعدُ _an يرجعُ فراغًا) — لا حركةَ تفلتُ، ولا
       عنصرَ يتجمّدُ في منتصفِ مسارِه.
     ══════════════════════════════════════════════════════════════════════ */

  function _bgStill() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  /* حركةُ سمةٍ — ترجعُ فراغًا عندَ تقليلِ الحركةِ فلا يُولَدُ العنصرُ إطلاقًا */
  function _an(attr, values, dur, extra) {
    if (_bgStill()) return '';
    return '<animate attributeName="' + attr + '" values="' + values + '" dur="' + dur
      + 's" repeatCount="indefinite"' + (extra || '') + '/>';
  }
  function _rot(cx, cy, dur, rev) {
    if (_bgStill()) return '';
    return '<animateTransform attributeName="transform" type="rotate" from="' + (rev ? 360 : 0) + ' ' + cx + ' ' + cy
      + '" to="' + (rev ? 0 : 360) + ' ' + cx + ' ' + cy + '" dur="' + dur + 's" repeatCount="indefinite"/>';
  }
  function _mv(values, dur, extra) {
    if (_bgStill()) return '';
    return '<animateTransform attributeName="transform" type="translate" values="' + values
      + '" dur="' + dur + 's" repeatCount="indefinite"' + (extra || '') + '/>';
  }
  /* حقلُ نجومٍ ثابتٌ بوميضٍ متفاوتٍ — [x,y,r] وبعضُها يخفقُ */
  function _stars(pts, col) {
    var out = '<g fill="' + (col || '#ffffff') + '">';
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], tw = (i % 3 === 0);
      out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '"'
        + (tw ? '>' + _an('opacity', '.25;1;.25', 2 + (i % 4) * .6) + '</circle>' : ' opacity=".85"/>');
    }
    return out + '</g>';
  }

  var BG_SCENE = {

    /* ١ الشفق — أشرطةُ ضوءٍ متموّجةٌ في سماءٍ قطبيّةٍ فوقَ أفقٍ ثلجيّ */
    bg_aurora: function (u) {
      var w1 = 'M-6 56 Q34 24 70 46 Q108 68 142 34 Q174 6 206 28 L206 76 Q172 54 142 74 Q108 96 70 76 Q34 58 -6 82 Z';
      var w2 = 'M-6 46 Q34 40 70 32 Q108 24 142 48 Q174 68 206 42 L206 88 Q172 68 142 60 Q108 52 70 84 Q34 94 -6 70 Z';
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02030c"/><stop offset=".55" stop-color="#06182c"/><stop offset="1" stop-color="#0c3243"/></linearGradient>'
        + '<linearGradient id="' + u + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5affc0" stop-opacity="0"/><stop offset=".45" stop-color="#3ff0a8" stop-opacity=".9"/><stop offset="1" stop-color="#7c5cff" stop-opacity="0"/></linearGradient>'
        + '<linearGradient id="' + u + 'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd4ff" stop-opacity="0"/><stop offset=".5" stop-color="#4fd0ff" stop-opacity=".72"/><stop offset="1" stop-color="#b06bff" stop-opacity="0"/></linearGradient>'
        + '<filter id="' + u + 'g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.4"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + _stars([[18,14,.9],[44,9,1.2],[72,20,.8],[104,11,1.1],[131,17,.9],[158,8,1.2],[182,22,.8],[90,30,.7],[148,31,.9]])
        + '<g filter="url(#' + u + 'g)">'
        + '<path fill="url(#' + u + 'a)" d="' + w1 + '">' + _an('d', w1 + ';' + w2 + ';' + w1, 9) + '</path>'
        + '<path fill="url(#' + u + 'b)" opacity=".7" d="' + w2 + '">' + _an('d', w2 + ';' + w1 + ';' + w2, 12) + '</path>'
        + '</g>'
        + '<path fill="#081c2b" d="M-6 82 L34 72 L70 80 L112 68 L152 78 L206 70 V106 H-6 Z"/>'
        + '<path fill="#e8f6ff" opacity=".92" d="M-6 87 L34 77 L70 85 L112 73 L152 83 L206 75 V106 H-6 Z"/>'
        + '<path fill="#9fd8f0" opacity=".3" d="M-6 93 L60 89 L120 95 L206 89 V106 H-6 Z"/>';
    },

    /* ٢ السديم — أعمدةُ غازٍ كثيفةٌ ونجومٌ وليدةٌ في قلبِها (لا حلزونَ ولا ثقب) */
    bg_nebula: function (u) {
      return '<defs>'
        + '<radialGradient id="' + u + 'k" cx=".5" cy=".5" r=".78"><stop offset="0" stop-color="#2a0f4a"/><stop offset=".6" stop-color="#120730"/><stop offset="1" stop-color="#04020f"/></radialGradient>'
        + '<radialGradient id="' + u + 'c" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff9ed8" stop-opacity=".95"/><stop offset=".5" stop-color="#b44ad0" stop-opacity=".5"/><stop offset="1" stop-color="#b44ad0" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="' + u + 'd" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7fe8ff" stop-opacity=".8"/><stop offset="1" stop-color="#2a6ad0" stop-opacity="0"/></radialGradient>'
        + '<filter id="' + u + 'g" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="5"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + '<g filter="url(#' + u + 'g)">'
        + '<ellipse cx="76" cy="44" rx="46" ry="30" fill="url(#' + u + 'c)"/>'
        + '<ellipse cx="136" cy="62" rx="38" ry="26" fill="url(#' + u + 'd)"/>'
        + '</g>'
        /* أعمدةُ الخلقِ — الشكلُ الذي يُعرَفُ به السديمُ دونَ غيرِه.
           قُصِّرَتْ ورُفِعَتْ إلى y∈[36,76]: في النسخةِ الأولى كانت تنزلُ
           إلى y=100 فلم يظهرْ منها في اللافتةِ إلّا أطرافٌ مبتورة. */
        + '<g fill="#3d1358" opacity=".92">'
        + '<path d="M84 76 C80 62 90 54 86 40 C96 43 100 34 106 38 C104 50 110 62 106 76 Z"/>'
        + '<path d="M112 76 C110 65 118 58 116 48 C124 51 126 45 130 50 C128 60 132 69 130 76 Z"/>'
        + '<path d="M64 76 C62 66 68 60 66 52 C72 54 74 50 77 54 C76 62 79 69 78 76 Z"/>'
        + '<path d="M146 76 C144 67 150 61 148 53 C154 55 156 51 159 55 C158 63 161 70 160 76 Z"/>'
        + '</g>'
        + '<g fill="#5b2280" opacity=".55">'
        + '<path d="M86 76 C84 61 92 53 89 42 C95 45 98 38 102 42 C100 52 105 64 102 76 Z"/>'
        + '</g>'
        + _stars([[24,20,1],[52,12,.8],[112,18,1.1],[168,26,.9],[188,52,.8],[36,66,.9],[158,82,1],[16,44,.7],[128,30,1.2]])
        /* نجومٌ وليدةٌ لامعةٌ عندَ قممِ الأعمدة */
        + '<g fill="#fff6ff">'
        + '<circle cx="106" cy="37" r="2.1">' + _an('r', '1.4;2.6;1.4', 2.6) + '</circle>'
        + '<circle cx="130" cy="49" r="1.6">' + _an('r', '1;2;1', 3.2) + '</circle>'
        + '<circle cx="77" cy="53" r="1.4">' + _an('r', '.9;1.8;.9', 2.2) + '</circle>'
        + '<circle cx="159" cy="54" r="1.3">' + _an('r', '.8;1.7;.8', 2.9) + '</circle>'
        + '</g>';
    },

    /* ٣ الغروب — قرصُ شمسٍ يغيبُ عندَ أفقِ بحرٍ بانعكاسٍ عموديٍّ وسُحُبٍ أفقيّة */
    bg_sunset: function (u) {
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1152"/><stop offset=".34" stop-color="#b8386a"/><stop offset=".6" stop-color="#ff7e4a"/><stop offset=".68" stop-color="#ffc46a"/><stop offset="1" stop-color="#5a1d46"/></linearGradient>'
        + '<radialGradient id="' + u + 's" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe8"/><stop offset=".6" stop-color="#ffd166"/><stop offset="1" stop-color="#ff8a3a"/></radialGradient>'
        + '<linearGradient id="' + u + 'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb35c"/><stop offset="1" stop-color="#4a1236"/></linearGradient>'
        + '<clipPath id="' + u + 'c"><rect y="68" width="200" height="32"/></clipPath>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + '<circle cx="100" cy="62" r="20" fill="url(#' + u + 's)">' + _an('cy', '64;58;64', 8) + '</circle>'
        /* سُحُبٌ أفقيّةٌ رقيقةٌ تعبرُ قرصَ الشمس */
        + '<g fill="#5a1d46" opacity=".55">'
        + '<rect x="58" y="50" width="86" height="3.4" rx="1.7">' + _mv('-8 0;10 0;-8 0', 14) + '</rect>'
        + '<rect x="72" y="59" width="70" height="2.8" rx="1.4">' + _mv('8 0;-10 0;8 0', 17) + '</rect>'
        + '<rect x="48" y="40" width="54" height="2.4" rx="1.2" opacity=".7"/>'
        + '</g>'
        + '<rect y="68" width="200" height="32" fill="url(#' + u + 'w)"/>'
        /* الانعكاسُ العموديُّ على الماء — علامةُ الغروبِ البحريّ */
        + '<g clip-path="url(#' + u + 'c)" fill="#ffd9a0">'
        + '<rect x="96" y="68" width="8" height="32" opacity=".5"/>'
        + '<g opacity=".72">'
        + '<rect x="86" y="72" width="28" height="1.6" rx=".8">' + _an('x', '86;90;86', 3.4) + '</rect>'
        + '<rect x="80" y="78" width="40" height="1.6" rx=".8">' + _an('x', '82;76;82', 4.2) + '</rect>'
        + '<rect x="74" y="85" width="52" height="1.8" rx=".9">' + _an('x', '72;78;72', 5) + '</rect>'
        + '<rect x="68" y="93" width="64" height="1.8" rx=".9">' + _an('x', '70;64;70', 5.8) + '</rect>'
        + '</g></g>'
        + '<rect y="67" width="200" height="1.6" fill="#ffe7bd" opacity=".8"/>';
    },

    /* ٤ الغابة — جذوعٌ وصنوبرٌ طبقاتٌ وأشعّةُ شمسٍ مائلةٌ تتخلّلُها */
    bg_forest: function (u) {
      var tree = function (x, y, w, h, f) {
        return '<path fill="' + f + '" d="M' + x + ' ' + y + ' L' + (x - w) + ' ' + (y + h) + ' H' + (x + w) + ' Z"/>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe8d0"/><stop offset=".4" stop-color="#5aa87a"/><stop offset="1" stop-color="#0d3a22"/></linearGradient>'
        + '<linearGradient id="' + u + 'r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe0" stop-opacity=".5"/><stop offset="1" stop-color="#fffbe0" stop-opacity="0"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* الطبقةُ البعيدةُ باهتةٌ ثمّ الوسطى ثمّ القريبةُ داكنةٌ — عمقُ غابةٍ */
        + '<g opacity=".45">' + tree(26,42,12,44,'#2f6b4a') + tree(60,36,13,50,'#2f6b4a') + tree(96,40,12,46,'#2f6b4a') + tree(134,34,14,52,'#2f6b4a') + tree(172,42,12,44,'#2f6b4a') + '</g>'
        + '<g>' + tree(14,52,14,40,'#1d5235') + tree(48,46,16,46,'#1d5235') + tree(86,50,15,42,'#1d5235') + tree(122,44,17,48,'#1d5235') + tree(160,48,15,44,'#1d5235') + tree(192,52,14,40,'#1d5235') + '</g>'
        /* جذعانِ قريبانِ يُثبّتانِ المقدّمة */
        + '<g fill="#3b2412">'
        + '<rect x="66" y="58" width="7" height="42" rx="1.4"/>'
        + '<rect x="138" y="54" width="8" height="46" rx="1.6"/>'
        + '</g>'
        + '<g>' + tree(69.5,30,20,34,'#123f27') + tree(142,24,22,38,'#123f27') + '</g>'
        /* أشعّةٌ مائلةٌ — تأثيرُ ضوءٍ حقيقيٌّ لا مجرّدُ تدرّج */
        + '<g fill="url(#' + u + 'r)">'
        + '<path d="M40 -8 L58 -8 L18 108 L0 108 Z">' + _an('opacity', '.45;.9;.45', 7) + '</path>'
        + '<path d="M104 -8 L116 -8 L82 108 L70 108 Z">' + _an('opacity', '.8;.35;.8', 9) + '</path>'
        + '<path d="M178 -8 L192 -8 L156 108 L142 108 Z">' + _an('opacity', '.4;.8;.4', 8) + '</path>'
        + '</g>'
        + '<path fill="#0b2e1b" d="M-4 90 Q50 82 100 90 Q150 98 204 88 V106 H-4 Z"/>';
    },

    /* ٥ ملكيّة — تاجٌ ذهبيٌّ وسطَ ستائرَ أرجوانيّةٍ ونقشٍ دمشقيٍّ متناظر */
    bg_royal: function (u) {
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1a72"/><stop offset=".5" stop-color="#26104c"/><stop offset="1" stop-color="#150827"/></linearGradient>'
        + '<linearGradient id="' + u + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#f5c451"/><stop offset="1" stop-color="#a9741f"/></linearGradient>'
        + '<linearGradient id="' + u + 'v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a2fb0"/><stop offset="1" stop-color="#2a0f52"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* ستائرُ الجانبَينِ بطيّاتٍ */
        + '<g fill="url(#' + u + 'v)">'
        + '<path d="M-4 -4 H54 Q40 34 46 66 Q30 58 14 70 Q6 36 -4 -4 Z"/>'
        + '<path d="M204 -4 H146 Q160 34 154 66 Q170 58 186 70 Q194 36 204 -4 Z"/>'
        + '</g>'
        + '<g fill="none" stroke="#c9a84c" stroke-width="1.1" opacity=".38">'
        + '<path d="M18 16 Q28 26 18 36 Q8 26 18 16 Z M182 16 Q192 26 182 36 Q172 26 182 16 Z"/>'
        + '<path d="M34 54 Q42 62 34 70 Q26 62 34 54 Z M166 54 Q174 62 166 70 Q158 62 166 54 Z"/>'
        + '</g>'
        /* التاجُ في قلبِ المنطقةِ الآمنة */
        + '<path fill="url(#' + u + 'g)" stroke="#6b4406" stroke-width="1.2" d="M74 62 L69 30 L86 43 L100 22 L114 43 L131 30 L126 62 Z"/>'
        + '<rect x="72" y="62" width="56" height="9" rx="2.6" fill="url(#' + u + 'g)" stroke="#6b4406" stroke-width="1.2"/>'
        + '<g fill="#ff5da2"><circle cx="86" cy="52" r="2.6"/><circle cx="100" cy="46" r="3.2"/><circle cx="114" cy="52" r="2.6"/></g>'
        + '<g fill="#fffdf2">'
        + '<circle cx="100" cy="46" r="1.2">' + _an('opacity', '.2;1;.2', 2.4) + '</circle>'
        + '<circle cx="69" cy="30" r="1.6">' + _an('opacity', '1;.3;1', 3) + '</circle>'
        + '<circle cx="131" cy="30" r="1.6">' + _an('opacity', '.3;1;.3', 3.4) + '</circle>'
        + '</g>'
        + '<rect x="72" y="74" width="56" height="2" rx="1" fill="#c9a84c" opacity=".5"/>';
    },

    /* ٦ الأعماق — أعمدةُ ضوءٍ غاطسةٌ وفقاعاتٌ صاعدةٌ وقاعٌ مظلمٌ (لا شِعابَ ولا سطح).
       ملاحظةُ التخطيط: نافذةُ اللافتةِ تُظهِرُ y∈[32,68] فقط، فالقاعُ والفقاعاتُ
       والنباتاتُ رُفِعَتْ كلُّها إلى الشريطِ المركزيِّ — في النسخةِ الأولى كانت
       عندَ y≈78-100 فخرجَتِ اللافتةُ فارغةً تمامًا. */
    bg_ocean_deep: function (u) {
      var bub = function (x, y, r, d) {
        /* opacity الابتدائيّةُ مرئيّةٌ عن قصد: عندَ تقليلِ الحركةِ لا يُولَدُ
           <animate> أصلًا، فتبقى فقاعاتٌ ساكنةٌ في الماءِ — منظرٌ سليمٌ
           بدلَ عناصرَ مختفيةٍ تمامًا. */
        return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" opacity=".6">'
          + _an('cy', y + ';22', d) + _an('opacity', '0;.85;0', d) + '</circle>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a7ab0"/><stop offset=".34" stop-color="#044a74"/><stop offset=".66" stop-color="#01253c"/><stop offset="1" stop-color="#000d18"/></linearGradient>'
        + '<linearGradient id="' + u + 'r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfeaff" stop-opacity=".58"/><stop offset="1" stop-color="#bfeaff" stop-opacity="0"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* أعمدةُ الضوءِ الغاطسةُ — تتّسعُ نزولًا كما في الماءِ فعلًا */
        + '<g fill="url(#' + u + 'r)">'
        + '<path d="M56 -6 L68 -6 L84 64 L40 64 Z">' + _an('opacity', '.5;1;.5', 6) + '</path>'
        + '<path d="M112 -6 L120 -6 L134 60 L98 60 Z">' + _an('opacity', '1;.45;1', 7.5) + '</path>'
        + '<path d="M164 -6 L174 -6 L188 56 L152 56 Z">' + _an('opacity', '.6;.95;.6', 9) + '</path>'
        + '</g>'
        + '<g fill="#bfeaff">' + bub(74, 58, 2.4, 6) + bub(104, 62, 1.6, 7.4) + bub(128, 60, 2, 5.4) + bub(52, 64, 1.4, 8) + bub(150, 66, 1.8, 6.6) + '</g>'
        /* قاعٌ صخريٌّ مظلمٌ + نباتاتٌ تتمايل — مرفوعةٌ إلى داخلِ النافذة */
        + '<path fill="#001420" d="M-4 70 Q30 58 62 66 Q96 74 128 62 Q164 52 204 64 V104 H-4 Z"/>'
        + '<g fill="none" stroke="#04617a" stroke-width="2.6" stroke-linecap="round" opacity=".85">'
        + '<path d="M68 72 Q64 58 70 46">' + _an('d', 'M68 72 Q64 58 70 46;M68 72 Q74 58 66 48;M68 72 Q64 58 70 46', 5) + '</path>'
        + '<path d="M138 68 Q144 54 136 42">' + _an('d', 'M138 68 Q144 54 136 42;M138 68 Q132 54 142 44;M138 68 Q144 54 136 42', 6.2) + '</path>'
        + '<path d="M100 74 Q96 62 102 52">' + _an('d', 'M100 74 Q96 62 102 52;M100 74 Q105 62 97 54;M100 74 Q96 62 102 52', 5.6) + '</path>'
        + '</g>'
        /* أسماكٌ ظلّيّةٌ بعيدةٌ تُعطي عُمقًا وحياةً في قلبِ النافذة */
        + '<g fill="#0a3a52" opacity=".85">'
        + '<path d="M36 44 Q44 39 53 44 Q44 49 36 44 Z M36 44 L30 40 L30 48 Z"/>'
        + '<path d="M156 50 Q164 45 173 50 Q164 55 156 50 Z M156 50 L150 46 L150 54 Z"/>'
        + '</g>';
    },

    /* ٧ البركان — مخروطٌ واحدٌ وفوّهةٌ تثورُ وقذائفُ جمرٍ ودخانٌ (الشكلُ مخروطٌ
       مفتوحٌ للسماء — يميّزُه عن كهفِ التنّينِ وعن شقوقِ الجحيم) */
    bg_volcano: function (u) {
      var ember = function (x, y, r, d, dx) {
        return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" opacity=".85">'
          + _mv('0 0;' + dx + ' -' + (y + 14), d) + _an('opacity', '1;0', d) + '</circle>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b0710"/><stop offset=".45" stop-color="#43100c"/><stop offset="1" stop-color="#7a1c06"/></linearGradient>'
        + '<linearGradient id="' + u + 'l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".35" stop-color="#ff9b21"/><stop offset="1" stop-color="#d42a06"/></linearGradient>'
        + '<filter id="' + u + 'g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* سُحُبُ دخانٍ كثيفةٌ فوقَ الفوّهة */
        + '<g fill="#2a1512" opacity=".8">'
        + '<ellipse cx="100" cy="16" rx="34" ry="12">' + _an('rx', '30;40;30', 11) + '</ellipse>'
        + '<ellipse cx="74" cy="10" rx="22" ry="9" opacity=".7"/>'
        + '<ellipse cx="130" cy="9" rx="26" ry="8" opacity=".6"/>'
        + '</g>'
        + '<ellipse cx="100" cy="34" rx="30" ry="16" fill="#ff7a1e" opacity=".22" filter="url(#' + u + 'g)"/>'
        /* المخروطُ — قمّةٌ مفتوحةٌ في المنتصفِ تمامًا */
        + '<path fill="#24100c" d="M-4 100 L58 44 L84 32 L116 32 L142 44 L204 100 Z"/>'
        + '<path fill="#150807" d="M116 32 L142 44 L204 100 H128 Z" opacity=".6"/>'
        /* الحممُ تفيضُ من الفوّهةِ وتسيلُ مجريَين */
        + '<path fill="url(#' + u + 'l)" d="M84 32 H116 L120 40 Q108 46 96 40 Z">' + _an('opacity', '.85;1;.85', 1.8) + '</path>'
        + '<path fill="url(#' + u + 'l)" d="M96 40 Q92 60 82 74 Q76 86 70 100 H86 Q90 84 96 70 Q102 56 104 42 Z">' + _an('opacity', '.75;1;.75', 2.6) + '</path>'
        + '<path fill="url(#' + u + 'l)" opacity=".8" d="M110 42 Q116 58 126 70 Q134 82 138 100 H126 Q120 84 112 70 Q106 56 104 44 Z"/>'
        + '<g fill="#ffd98a">' + ember(96, 30, 1.8, 2.6, -14) + ember(104, 28, 1.4, 3.2, 12) + ember(100, 32, 1.2, 2.1, 2) + ember(90, 34, 1.1, 3.6, -22) + ember(112, 33, 1.3, 2.9, 20) + '</g>';
    },

    /* ٨ المجرّة — قرصٌ **جانبيٌّ** (edge-on) بانتفاخٍ مركزيٍّ وحارةِ غبارٍ قاتمةٍ
       تشقُّه طولًا. مائلٌ لا أفقيٌّ. يختلفُ بنيويًّا عن حلزونِ «الكون» المواجه. */
    bg_galaxy: function (u) {
      return '<defs>'
        + '<radialGradient id="' + u + 'k" cx=".5" cy=".5" r=".8"><stop offset="0" stop-color="#171043"/><stop offset=".6" stop-color="#090522"/><stop offset="1" stop-color="#03010c"/></radialGradient>'
        + '<linearGradient id="' + u + 'd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a6bff" stop-opacity="0"/><stop offset=".22" stop-color="#8fa8ff" stop-opacity=".7"/><stop offset=".5" stop-color="#fff6e0" stop-opacity=".95"/><stop offset=".78" stop-color="#c58fff" stop-opacity=".7"/><stop offset="1" stop-color="#6a3fd6" stop-opacity="0"/></linearGradient>'
        + '<radialGradient id="' + u + 'c" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffdf0"/><stop offset=".45" stop-color="#ffd98a" stop-opacity=".85"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>'
        + '<filter id="' + u + 'g" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="2.6"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + _stars([[16,18,1],[42,74,.9],[68,12,.8],[158,22,1.1],[184,70,.9],[126,86,.8],[30,52,.7],[176,44,1],[92,8,.9],[110,92,.8]])
        + '<g transform="rotate(-14 100 50)">'
        /* القرصُ: بيضاويٌّ شديدُ التفلطحِ = مَنظرٌ جانبيّ */
        + '<ellipse cx="100" cy="50" rx="92" ry="11" fill="url(#' + u + 'd)" filter="url(#' + u + 'g)"/>'
        + '<ellipse cx="100" cy="50" rx="86" ry="5.2" fill="url(#' + u + 'd)"/>'
        /* حارةُ الغبارِ القاتمةُ تشقُّ القرصَ — العلامةُ المميِّزةُ للمَنظرِ الجانبيّ */
        + '<ellipse cx="100" cy="51.4" rx="80" ry="1.5" fill="#160b2e" opacity=".85"/>'
        /* الانتفاخُ المركزيُّ */
        + '<ellipse cx="100" cy="50" rx="22" ry="13" fill="url(#' + u + 'c)"/>'
        + '<circle cx="100" cy="50" r="5.4" fill="#fffef6">' + _an('r', '4.6;6.2;4.6', 4) + '</circle>'
        + '</g>';
    },

    /* ٩ الشيفرة — أعمدةُ رموزٍ خضراءَ متساقطةٌ على أسودَ، ورأسُ كلِّ عمودٍ أشدُّ
       بياضًا (نمطُ «المطرِ الرقميّ» المعروف) */
    bg_matrix: function (u) {
      var glyphs = '01101001110100101101';
      var col = '';
      var xs = [10, 24, 38, 52, 66, 80, 94, 108, 122, 136, 150, 164, 178, 192];
      for (var i = 0; i < xs.length; i++) {
        var dur = 2.4 + ((i * 7) % 11) * .32;
        var start = -((i * 13) % 40) - 10;
        var txt = '';
        for (var r = 0; r < 7; r++) {
          txt += '<text x="0" y="' + (r * 13) + '" opacity="' + (0.24 + r * 0.1).toFixed(2) + '">'
            + glyphs.charAt((i * 3 + r) % glyphs.length) + '</text>';
        }
        txt += '<text x="0" y="' + (7 * 13) + '" fill="#d9ffe8">' + glyphs.charAt((i * 5) % glyphs.length) + '</text>';
        col += '<g transform="translate(' + xs[i] + ' ' + start + ')">'
          + _mv('0 ' + start + ';0 ' + (start + 190), dur)
          + txt + '</g>';
      }
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000c04"/><stop offset=".5" stop-color="#001a08"/><stop offset="1" stop-color="#000802"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + '<g font-family="monospace" font-size="11" font-weight="700" fill="#22e06a">' + col + '</g>'
        + '<rect width="200" height="100" fill="none" stroke="#22e06a" stroke-opacity=".16" stroke-width="2"/>';
    },

    /* ١٠ الكرز — فرعُ ساكورا حقيقيٌّ بأزهارٍ خمسيّةِ البتلاتِ وبتلاتٌ متساقطةٌ
       تدورُ وهي تهبط */
    bg_cherry: function (u) {
      var blossom = function (x, y, s) {
        var p = '';
        for (var k = 0; k < 5; k++) {
          p += '<ellipse cx="0" cy="-3.4" rx="2.1" ry="3.4" transform="rotate(' + (k * 72) + ')"/>';
        }
        return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="#ffc2dd">' + p
          + '<circle r="1.25" fill="#fff6bd"/></g>';
      };
      var petal = function (x, d, dx, rot) {
        return '<g>' + _mv(x + ' -10;' + (x + dx) + ' 110', d)
          + '<g>' + (_bgStill() ? '' : '<animateTransform attributeName="transform" type="rotate" from="0" to="' + rot + '" dur="' + d + 's" repeatCount="indefinite"/>')
          + '<ellipse rx="2.6" ry="4" fill="#ffd6e8" opacity=".95"/></g></g>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1030"/><stop offset=".45" stop-color="#7a2a58"/><stop offset="1" stop-color="#d8608f"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + '<circle cx="164" cy="40" r="13" fill="#fff4dc" opacity=".55"/>'
        /* الفرعُ يدخلُ من اليسارِ ويتشعّبُ — هويّةُ «الكرز».
           أُنزِلَ إلى قلبِ النافذةِ (y≈32-64): في النسخةِ الأولى كان عندَ
           y≈6-20 فوقَ نافذةِ اللافتةِ فظهرَتْ ورديّةً شبهَ فارغة. */
        + '<g fill="none" stroke="#3a1f18" stroke-linecap="round">'
        + '<path d="M-6 30 Q34 40 62 34 Q92 28 124 42" stroke-width="4.2"/>'
        + '<path d="M62 34 Q70 48 66 62" stroke-width="2.6"/>'
        + '<path d="M100 36 Q108 50 122 56" stroke-width="2.4"/>'
        + '<path d="M28 37 Q34 50 30 60" stroke-width="2.2"/>'
        + '<path d="M140 44 Q150 52 148 64" stroke-width="2.2"/>'
        + '</g>'
        + blossom(58, 32, 1.15) + blossom(76, 36, .95) + blossom(30, 34, 1) + blossom(66, 63, 1.05)
        + blossom(104, 38, 1.1) + blossom(123, 56, 1) + blossom(140, 44, .9) + blossom(12, 32, .85)
        + blossom(148, 65, .95) + blossom(90, 33, .85)
        + '<g>' + petal(46, 5.2, 16, 220) + petal(88, 6.4, -14, -190) + petal(132, 4.6, 10, 260) + petal(168, 7, -18, 180) + petal(108, 5.8, 22, -240) + '</g>';
    },

    /* ١١ وكرُ التنّين — كهفٌ مغلقٌ ورأسُ تنّينٍ بقرنَينِ وعينَينِ متوهّجتَينِ
       وكومةُ كنوزٍ ذهبيّةٍ وبِركةُ حممٍ أسفل. كائنٌ + كهفٌ + كنزٌ: لا يشبهُ
       الجحيمَ (شقوقُ أرضٍ مفتوحةٌ بلا كائن) ولا البركانَ (مخروطٌ ودخان). */
    bg_dragon_lair: function (u) {
      /* بلاغُ جوجو ٣: الوجهُ الأماميُّ كان يُقرأُ ضفدعًا لا تنّينًا، وبلا
         تأثير. أُعيدَ بناؤه رأسًا جانبيًّا (بروفايل) يزفرُ نارًا — وهو
         الصورةُ الذهنيّةُ التي لا تُخطئُها عينٌ للتنّين: خطمٌ طويلٌ مدبّبٌ،
         فكٌّ مفتوحٌ بأنيابٍ، قرونٌ مكتسحةٌ للخلف، عينٌ شرِسةٌ بحدقةٍ شقّيّة،
         وزفيرُ نارٍ مخروطيٌّ باضطرابٍ وتوهّجٍ يملأُ يمينَ اللافتة، فوقَ
         كنوزٍ في كهفٍ أحمر. */
      return '<defs>'
        + '<radialGradient id="' + u + 'k" cx=".32" cy=".5" r=".95"><stop offset="0" stop-color="#7a2205"/><stop offset=".44" stop-color="#3a0d05"/><stop offset="1" stop-color="#0e0303"/></radialGradient>'
        + '<linearGradient id="' + u + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#b9800f"/></linearGradient>'
        + '<linearGradient id="' + u + 's" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f7a2e"/><stop offset=".5" stop-color="#2a4418"/><stop offset="1" stop-color="#11200a"/></linearGradient>'
        + '<linearGradient id="' + u + 'f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff3a8"/><stop offset=".4" stop-color="#ff9b21"/><stop offset=".8" stop-color="#e8300a" stop-opacity=".85"/><stop offset="1" stop-color="#e8300a" stop-opacity="0"/></linearGradient>'
        + '<filter id="' + u + 'e" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2"/></filter>'
        + '<filter id="' + u + 'fb" x="-20%" y="-60%" width="150%" height="220%"><feGaussianBlur stdDeviation="3.2"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* قوسُ الكهفِ — صخورٌ مدلّاةٌ من أعلى */
        + '<path fill="#180504" d="M-4 -4 H204 V16 Q188 18 180 28 Q172 16 158 24 Q148 12 134 22 Q120 10 106 22 Q92 10 78 22 Q64 12 50 24 Q38 14 26 26 Q14 18 -4 22 Z"/>'
        /* ══ زفيرُ النار — مخروطٌ من الفمِ نحوَ اليمين ══ */
        + '<g filter="url(#' + u + 'fb)">'
        + '<path fill="url(#' + u + 'f)" d="M108 54 Q150 40 196 32 Q176 54 196 76 Q150 70 108 58 Z">'
        + _an('d', 'M108 54 Q150 40 196 32 Q176 54 196 76 Q150 70 108 58 Z;'
          + 'M108 54 Q150 46 196 30 Q172 54 196 80 Q150 64 108 58 Z;'
          + 'M108 54 Q150 40 196 32 Q176 54 196 76 Q150 70 108 58 Z', 1.8) + '</path>'
        + '</g>'
        + '<path fill="#fff3c4" opacity=".9" d="M110 55 Q142 48 176 44 Q160 56 176 68 Q142 64 110 57 Z">'
        + _an('opacity', '.7;1;.7', 1.3) + '</path>'
        /* جمراتٌ متطايرةٌ مع النار */
        + '<g fill="#ffd98a">'
        + '<circle cx="150" cy="48" r="1.6">' + _mv('0 0;46 -8', 2.2) + _an('opacity', '1;0', 2.2) + '</circle>'
        + '<circle cx="150" cy="60" r="1.3">' + _mv('0 0;46 10', 2.8) + _an('opacity', '1;0', 2.8) + '</circle>'
        + '<circle cx="140" cy="54" r="1.1">' + _mv('0 0;52 2', 2.5) + _an('opacity', '1;0', 2.5) + '</circle>'
        + '</g>'
        /* ══ رأسُ التنّينِ الجانبيّ ══ */
        + '<g>'
        /* قرونٌ مكتسحةٌ للخلف (نحو اليسار) */
        + '<path fill="#d8c08a" d="M52 30 Q34 22 22 8 Q40 16 56 26 Z"/>'
        + '<path fill="#c0a870" d="M58 28 Q44 16 38 2 Q54 14 64 26 Z"/>'
        /* أشواكُ الرقبةِ على القفا */
        + '<g fill="#355c22"><path d="M44 44 L30 40 L42 50 Z"/><path d="M46 52 L31 52 L44 58 Z"/><path d="M50 60 L37 64 L52 64 Z"/></g>'
        /* الجمجمةُ والخطمُ الطويلُ المدبّبُ نحوَ اليمين (فكٌّ علويّ) */
        + '<path fill="url(#' + u + 's)" stroke="#0d1a04" stroke-width="1" stroke-linejoin="round" d="M46 40 Q52 30 66 31 Q82 33 96 42 Q108 47 116 52 L104 55 Q92 53 82 54 Q64 55 52 58 Q44 52 46 40 Z"/>'
        /* فكٌّ سفليٌّ مفتوحٌ (الفمُ يزفرُ) */
        + '<path fill="url(#' + u + 's)" stroke="#0d1a04" stroke-width="1" stroke-linejoin="round" d="M60 60 Q78 64 100 62 L112 59 Q104 68 90 70 Q74 71 62 67 Q57 63 60 60 Z"/>'
        /* أنيابٌ بارزةٌ من الفكَّين */
        + '<g fill="#f6efdc">'
        + '<path d="M104 55 L106 62 L109 55 Z"/><path d="M96 55 L97.6 61 L100 55 Z"/>'
        + '<path d="M100 62 L101.6 56 L104 62 Z"/><path d="M90 63 L91.4 58 L94 63 Z"/>'
        + '</g>'
        /* حراشفُ الخطم */
        + '<g fill="#0a1405" opacity=".2"><ellipse cx="74" cy="44" rx="5" ry="2.6"/><ellipse cx="88" cy="47" rx="4.4" ry="2.3"/><ellipse cx="62" cy="46" rx="4.6" ry="2.4"/></g>'
        /* فتحةُ أنفٍ عندَ طرفِ الخطم */
        + '<ellipse cx="109" cy="50.5" rx="1.5" ry="1" fill="#0d1a04"/>'
        /* العينُ الشرِسةُ بحدقةٍ شقّيّةٍ متوهّجةٍ + حاجبٌ ناتئ */
        + '<path fill="#1a2e0d" d="M56 40 Q64 36 72 40 Q64 41 56 40 Z"/>'
        + '<g fill="#ff8a1e" filter="url(#' + u + 'e)"><ellipse cx="64" cy="44" rx="6.5" ry="4.6"/></g>'
        + '<ellipse cx="64" cy="44" rx="4" ry="3.1" fill="#ffe14a"/>'
        + '<ellipse cx="64" cy="44" rx="1.3" ry="2.9" fill="#2a0a02">' + _an('ry', '2.9;1.2;2.9', 5) + '</ellipse>'
        + '</g>'
        /* كومةُ الكنوزِ أسفل */
        + '<path fill="#5a3c0a" d="M-4 100 Q28 84 62 90 Q100 97 138 88 Q172 80 204 92 V104 H-4 Z"/>'
        + '<g fill="url(#' + u + 'g)" stroke="#7a5307" stroke-width=".7">'
        + '<circle cx="30" cy="92" r="4"/><circle cx="42" cy="96" r="3.4"/><circle cx="20" cy="96" r="3"/>'
        + '<circle cx="120" cy="92" r="4"/><circle cx="134" cy="96" r="3.2"/><circle cx="150" cy="93" r="3.6"/>'
        + '<circle cx="168" cy="95" r="3"/><circle cx="100" cy="95" r="3"/><circle cx="182" cy="92" r="3.4"/>'
        + '</g>'
        + '<g fill="#ffd98a">'
        + '<circle cx="30" cy="92" r="1.1">' + _an('opacity', '.2;1;.2', 3) + '</circle>'
        + '<circle cx="150" cy="93" r="1.1">' + _an('opacity', '1;.2;1', 3.6) + '</circle>'
        + '</g>';
    },

    /* ١٢ الكون — مجرّةٌ حلزونيّةٌ **مواجهةٌ** (face-on) بذراعَينِ تدورانِ، ومعَها
       كوكبٌ بحلقةٍ ونجومٌ بعيدة. البنيةُ حلزونٌ دوّارٌ — لا قرصٌ جانبيٌّ
       (المجرّة) ولا أعمدةُ غازٍ (السديم) ولا ثقبٌ أسودُ (الفراغ). */
    bg_cosmos: function (u) {
      /* بلاغُ جوجو ٣: «فين الكون؟» — النسخةُ الأولى كانت نواةً باهتةً
         وذراعَين خفيفَين ونجومًا قليلةً، وفي قصِّ اللافتةِ لم يبقَ إلّا
         النواة. الآن: حقلُ نجومٍ كثيفٌ + سُحُبُ سديمٍ ملوّنةٌ (بنفسجيّ/
         ورديّ/أزرق) تملأُ العرضَ + مجرّةٌ حلزونيّةٌ لامعةٌ بذراعَينِ
         واضحتَينِ تدورُ + كوكبٌ بحلقةٍ + شهابٌ يعبرُ — كونٌ مكتظٌّ حيٌّ. */
      return '<defs>'
        + '<radialGradient id="' + u + 'k" cx=".42" cy=".5" r=".9"><stop offset="0" stop-color="#2a1560"/><stop offset=".5" stop-color="#0e0738"/><stop offset="1" stop-color="#030110"/></radialGradient>'
        + '<radialGradient id="' + u + 'n1" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#c56bff" stop-opacity=".8"/><stop offset="1" stop-color="#c56bff" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="' + u + 'n2" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#4fb8ff" stop-opacity=".72"/><stop offset="1" stop-color="#4fb8ff" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="' + u + 'n3" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff6ab0" stop-opacity=".6"/><stop offset="1" stop-color="#ff6ab0" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="' + u + 'c" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffdf4"/><stop offset=".38" stop-color="#ffe6a8" stop-opacity=".95"/><stop offset="1" stop-color="#ff9ed8" stop-opacity="0"/></radialGradient>'
        + '<linearGradient id="' + u + 'p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd4ff"/><stop offset=".55" stop-color="#3a6ad0"/><stop offset="1" stop-color="#14265e"/></linearGradient>'
        + '<filter id="' + u + 'g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>'
        + '<filter id="' + u + 'gb" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* سُحُبُ السديمِ الملوّنةُ — تملأُ العرضَ وتُعطي الإحساسَ بالعمق */
        + '<g filter="url(#' + u + 'gb)">'
        + '<ellipse cx="40" cy="42" rx="46" ry="30" fill="url(#' + u + 'n1)"/>'
        + '<ellipse cx="150" cy="58" rx="52" ry="32" fill="url(#' + u + 'n2)"/>'
        + '<ellipse cx="100" cy="38" rx="40" ry="24" fill="url(#' + u + 'n3)"/>'
        + '</g>'
        /* حقلُ نجومٍ كثيفٌ */
        + _stars([[10,14,1],[26,30,.8],[18,54,.9],[34,74,1.1],[48,20,.7],[58,46,1],[70,12,.9],
          [8,40,.8],[44,62,.8],[62,78,1],[80,30,.7],[122,16,1],[134,40,.8],[150,24,1.1],
          [168,12,.9],[182,30,.8],[192,52,1],[176,70,.9],[160,84,.8],[138,74,1],[116,88,.9],
          [196,40,.7],[88,70,.8],[108,58,.7],[128,62,.9]])
        /* المجرّةُ الحلزونيّةُ اللامعةُ — ذراعانِ واضحتانِ تدورانِ حولَ نواة */
        + '<g transform="translate(72 50)">' + _rot(0, 0, 50)
        + '<g fill="none" stroke-linecap="round" filter="url(#' + u + 'g)">'
        + '<path stroke="#c9a8ff" stroke-width="4.6" opacity=".9" d="M0 0 C14 -5 26 2 29 14 C33 28 22 38 7 38 C-12 38 -26 24 -26 7"/>'
        + '<path stroke="#8fd8ff" stroke-width="4.6" opacity=".9" d="M0 0 C-14 5 -26 -2 -29 -14 C-33 -28 -22 -38 -7 -38 C12 -38 26 -24 26 -7"/>'
        + '<path stroke="#ff9ed8" stroke-width="2.4" opacity=".7" d="M0 0 C10 -4 19 1 22 11 C25 22 16 30 4 30"/>'
        + '</g>'
        + '<g fill="#f0e6ff"><circle cx="26" cy="12" r="1.3"/><circle cx="-26" cy="-12" r="1.3"/><circle cx="10" cy="30" r="1"/><circle cx="-10" cy="-30" r="1"/><circle cx="22" cy="22" r=".9"/></g>'
        + '</g>'
        + '<ellipse cx="72" cy="50" rx="17" ry="16" fill="url(#' + u + 'c)"/>'
        + '<circle cx="72" cy="50" r="4.4" fill="#fffef8">' + _an('r', '3.6;5.2;3.6', 4.4) + '</circle>'
        /* كوكبٌ بحلقةٍ في المنطقةِ الآمنةِ (y≈50) */
        + '<g transform="translate(162 52)">'
        + '<ellipse rx="18" ry="5" fill="none" stroke="#cbb08a" stroke-width="2.2" opacity=".8" transform="rotate(-20)"/>'
        + '<circle r="10" fill="url(#' + u + 'p)"/>'
        + '<path d="M-10 0 A10 10 0 0 0 10 0 Z" fill="#0b1633" opacity=".42"/>'
        + '<ellipse rx="18" ry="5" fill="none" stroke="#e8d3ad" stroke-width="1.2" opacity=".9" transform="rotate(-20)" stroke-dasharray="22 64"/>'
        + '</g>'
        /* شهابٌ يعبرُ أعلى اليمينِ نحوَ أسفلِ اليسار */
        + '<g stroke="#fffdf2" stroke-linecap="round">'
        + '<line x1="150" y1="18" x2="128" y2="34" stroke-width="1.6" opacity=".9">'
        + _mv('0 0;-150 110', 4.5) + _an('opacity', '0;.95;0', 4.5) + '</line>'
        + '</g>';
    },

    /* ١٣ الجحيم — أرضٌ متشقّقةٌ **مفتوحةٌ للأعلى** تصعدُ منها أعمدةُ لهبٍ
       وجمراتٌ. لا كهفَ ولا كائنَ (وكرُ التنّين) ولا مخروطَ ودخانَ (البركان):
       الهويّةُ هنا شقوقٌ ونيرانٌ عموديّةٌ تملأُ العرضَ. */
    bg_inferno: function (u) {
      var flame = function (x, h, w, d, o) {
        var a = 'M' + x + ' 100 Q' + (x - w) + ' ' + (100 - h * .55) + ' ' + x + ' ' + (100 - h) + ' Q' + (x + w) + ' ' + (100 - h * .55) + ' ' + x + ' 100 Z';
        var b = 'M' + x + ' 100 Q' + (x - w * .6) + ' ' + (100 - h * .6) + ' ' + (x + 2) + ' ' + (100 - h * 1.22) + ' Q' + (x + w * 1.1) + ' ' + (100 - h * .5) + ' ' + x + ' 100 Z';
        return '<path opacity="' + o + '" d="' + a + '">' + _an('d', a + ';' + b + ';' + a, d) + '</path>';
      };
      var spark = function (x, r, d, dx) {
        return '<circle cx="' + x + '" cy="88" r="' + r + '" opacity=".9">'
          + _mv('0 0;' + dx + ' -96', d) + _an('opacity', '1;0', d) + '</circle>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#180303"/><stop offset=".5" stop-color="#4a0c04"/><stop offset="1" stop-color="#160202"/></linearGradient>'
        + '<linearGradient id="' + u + 'f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe98a"/><stop offset=".3" stop-color="#ff9b21"/><stop offset=".72" stop-color="#e82f06"/><stop offset="1" stop-color="#e82f06" stop-opacity="0"/></linearGradient>'
        + '<linearGradient id="' + u + 'c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd24a"/><stop offset="1" stop-color="#8a1500"/></linearGradient>'
        + '<filter id="' + u + 'g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.4"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* الأرضُ المتشقّقةُ: بلاطاتٌ سوداءُ بينها شقوقٌ متوهّجة */
        + '<g fill="#0d0202">'
        + '<path d="M-4 62 H204 V104 H-4 Z"/>'
        + '</g>'
        + '<g stroke="url(#' + u + 'c)" stroke-linecap="round" fill="none" filter="url(#' + u + 'g)" opacity=".9">'
        + '<path stroke-width="3.4" d="M-4 74 L26 70 L52 78 L86 72 L120 80 L154 73 L204 79"/>'
        + '<path stroke-width="2.6" d="M14 104 L22 86 L16 74"/>'
        + '<path stroke-width="2.6" d="M68 104 L74 88 L66 76"/>'
        + '<path stroke-width="2.6" d="M124 104 L118 88 L128 78"/>'
        + '<path stroke-width="2.6" d="M178 104 L184 86 L176 76"/>'
        + '</g>'
        /* أعمدةُ اللهبِ الصاعدةُ من الشقوق */
        + '<g fill="url(#' + u + 'f)">'
        + flame(24, 52, 13, 2.2, '.9') + flame(58, 38, 10, 2.8, '.8') + flame(100, 64, 16, 2.4, '.95')
        + flame(142, 42, 12, 3.1, '.82') + flame(178, 50, 13, 2.6, '.88')
        + '</g>'
        + '<g fill="#ffe08a">' + spark(30, 1.6, 3.2, -10) + spark(96, 1.4, 2.6, 8) + spark(104, 1.2, 3.6, -6) + spark(150, 1.5, 2.9, 12) + spark(184, 1.3, 3.4, -14) + '</g>';
    },

    /* ١٤ الفراغ — ثقبٌ أسودُ: كرةٌ سوداءُ مصمتةٌ، حلقةُ فوتونٍ رقيقةٌ حولَها،
       وقرصُ تراكمٍ مائلٌ يدورُ. البنيةُ «مركزٌ أسودُ يبتلعُ الضوءَ» — عكسُ
       نواةِ «الكون» المضيئةِ تمامًا فلا يلتبسانِ أبدًا. */
    bg_void: function (u) {
      return '<defs>'
        + '<radialGradient id="' + u + 'k" cx=".5" cy=".5" r=".85"><stop offset="0" stop-color="#1a0b38"/><stop offset=".45" stop-color="#0a0420"/><stop offset="1" stop-color="#020008"/></radialGradient>'
        + '<linearGradient id="' + u + 'd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b06bff" stop-opacity="0"/><stop offset=".2" stop-color="#d8a0ff" stop-opacity=".9"/><stop offset=".5" stop-color="#fff4ff"/><stop offset=".8" stop-color="#8fd4ff" stop-opacity=".9"/><stop offset="1" stop-color="#4a6bff" stop-opacity="0"/></linearGradient>'
        + '<filter id="' + u + 'g" x="-50%" y="-120%" width="200%" height="340%"><feGaussianBlur stdDeviation="2.8"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + _stars([[16,14,.9],[40,84,.8],[176,18,1],[192,74,.9],[28,54,.7],[184,44,.8],[62,92,.8]])
        /* قرصُ التراكمِ: بيضاويٌّ مائلٌ يدورُ حولَ الكرة، نصفُه الخلفيُّ يعبرُ فوقها */
        + '<g transform="translate(100 50)">'
        + '<g transform="rotate(-18)">'
        + '<ellipse rx="66" ry="14" fill="none" stroke="url(#' + u + 'd)" stroke-width="9" filter="url(#' + u + 'g)" opacity=".65"/>'
        + '<ellipse rx="66" ry="14" fill="none" stroke="url(#' + u + 'd)" stroke-width="3.2"/>'
        + '<ellipse rx="66" ry="14" fill="none" stroke="#ffffff" stroke-width="1.4" opacity=".85" stroke-dasharray="18 96">'
        + (_bgStill() ? '' : '<animate attributeName="stroke-dashoffset" from="114" to="0" dur="4.4s" repeatCount="indefinite"/>')
        + '</ellipse>'
        + '</g>'
        /* حلقةُ الفوتونِ ثمّ أفقُ الحدثِ الأسودُ المصمت */
        + '<circle r="23" fill="none" stroke="#ffe9c4" stroke-width="1.8" opacity=".9">' + _an('opacity', '.65;1;.65', 5) + '</circle>'
        + '<circle r="21.4" fill="#000000"/>'
        + '<circle r="21.4" fill="none" stroke="#000000" stroke-width="6" opacity=".9"/>'
        + '</g>';
    },

    /* ١٥ العاصفة — سُحُبٌ داكنةٌ كثيفةٌ، **صاعقةٌ متفرّعةٌ** تضربُ بوميضٍ يُضيءُ
       السماءَ كلَّها، ومطرٌ مائلٌ متّصل. بلاغُ جوجو: «فين العاصفة في الموضوع؟» */
    bg_thunderstorm: function (u) {
      var bolt = 'M104 16 L92 44 L103 44 L88 78 L112 42 L101 42 L114 16 Z';
      var bolt2 = 'M96 44 L84 62 L92 61 L82 82 L100 58 L91 58 Z';
      var rain = '';
      for (var i = 0; i < 30; i++) {
        var rx = (i * 17 + (i % 5) * 6) % 210 - 6;
        /* البدايةُ موزَّعةٌ عبرَ الارتفاعِ لا من فوقِ الكادرِ كلِّه: مع تقليلِ
           الحركةِ لا يُولَدُ <animate> فتبقى القَطراتُ حيثُ رُسِمَتْ — ولو
           بدأَتْ كلُّها عندَ y=-10 لخرجَتِ اللافتةُ بلا مطرٍ إطلاقًا. */
        var ry = -8 + ((i * 13) % 62);
        var rd = 0.62 + ((i * 3) % 5) * .1;
        rain += '<line x1="' + rx + '" y1="' + ry + '" x2="' + (rx - 7) + '" y2="' + (ry + 14) + '" >'
          + _mv('0 0;-30 60', rd) + '</line>';
      }
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1020"/><stop offset=".5" stop-color="#1c2740"/><stop offset="1" stop-color="#070b15"/></linearGradient>'
        + '<filter id="' + u + 'g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.6"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* وميضُ العاصفةِ: يُضيءُ الكادرَ كلَّه لحظاتٍ ثمّ يخبو */
        + '<rect width="200" height="100" fill="#cfe4ff" opacity="0">'
        + _an('opacity', '0;0;.34;0;.2;0;0;0', 5.2) + '</rect>'
        /* سُحُبٌ داكنةٌ متراكبةٌ في الأعلى */
        + '<g fill="#111a2c">'
        + '<ellipse cx="46" cy="16" rx="52" ry="18"/><ellipse cx="116" cy="10" rx="58" ry="17"/>'
        + '<ellipse cx="178" cy="18" rx="44" ry="15"/><ellipse cx="82" cy="24" rx="40" ry="13"/>'
        + '</g>'
        + '<g fill="#1e2b44" opacity=".85">'
        + '<ellipse cx="60" cy="10" rx="34" ry="11"/><ellipse cx="140" cy="16" rx="36" ry="11"/>'
        + '</g>'
        /* الصاعقةُ المتفرّعةُ — العنصرُ الذي كان غائبًا تمامًا */
        + '<g fill="#eaf4ff" filter="url(#' + u + 'g)" opacity=".85"><path d="' + bolt + '"/></g>'
        + '<g fill="#ffffff"><path d="' + bolt + '">' + _an('opacity', '.15;1;.2;.85;.15;.15', 5.2) + '</path></g>'
        + '<g fill="#dceaff"><path d="' + bolt2 + '">' + _an('opacity', '0;.9;0;.5;0;0', 5.2) + '</path></g>'
        + '<g stroke="#9fc4e8" stroke-width="1.2" stroke-linecap="round" opacity=".55">' + rain + '</g>';
    },

    /* ١٦ المنشور — منشورٌ ثلاثيٌّ زجاجيٌّ يدخلُه شعاعٌ أبيضُ ويخرجُ مشقوقًا
       طيفًا كاملًا (سبعةُ أشعّةٍ متباينة) */
    bg_prism: function (u) {
      var cols = ['#ff3b3b', '#ff9b21', '#ffe14a', '#5affc0', '#4fd0ff', '#6a5cff', '#c07aff'];
      var rays = '';
      for (var i = 0; i < cols.length; i++) {
        var y2 = 34 + i * 7.2;
        rays += '<path d="M110 50 L206 ' + y2.toFixed(1) + ' L206 ' + (y2 + 6.4).toFixed(1) + ' Z" fill="' + cols[i] + '" opacity=".72">'
          + _an('opacity', '.45;.92;.45', 3.4 + i * .28) + '</path>';
      }
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a0a18"/><stop offset=".5" stop-color="#141430"/><stop offset="1" stop-color="#07070f"/></linearGradient>'
        + '<linearGradient id="' + u + 'p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".42"/><stop offset=".5" stop-color="#bfe8ff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity=".5"/></linearGradient>'
        + '<filter id="' + u + 'g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* الشعاعُ الأبيضُ الداخلُ من اليسار */
        + '<path d="M-6 47 L92 47 L92 53 L-6 53 Z" fill="#ffffff" opacity=".9" filter="url(#' + u + 'g)"/>'
        + '<path d="M-6 48.6 L92 48.6 L92 51.4 L-6 51.4 Z" fill="#ffffff"/>'
        /* الطيفُ الخارجُ متفرّقًا */
        + '<g>' + rays + '</g>'
        /* المنشورُ نفسُه: مثلّثٌ زجاجيٌّ بحدٍّ لامعٍ وانعكاسٍ داخليّ */
        + '<path d="M100 22 L126 68 L74 68 Z" fill="url(#' + u + 'p)" stroke="#dff2ff" stroke-width="1.6" stroke-linejoin="round"/>'
        + '<path d="M100 30 L118 64 L100 64 Z" fill="#ffffff" opacity=".16"/>'
        + '<path d="M100 22 L126 68" stroke="#ffffff" stroke-width="1.1" opacity=".7"/>';
    },

    /* ١٧ فولاذيّة — صفائحُ معدنيّةٌ مبرشمةٌ بحزوزٍ قُطريّةٍ وانعكاسٌ يعبرُها */
    bg_steel: function (u) {
      var rivets = '';
      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 9; c++) {
          rivets += '<circle cx="' + (14 + c * 22) + '" cy="' + (14 + r * 24) + '" r="2.4"/>';
        }
      }
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b5a70"/><stop offset=".3" stop-color="#2a3242"/><stop offset=".62" stop-color="#5a6a80"/><stop offset="1" stop-color="#1a2028"/></linearGradient>'
        + '<linearGradient id="' + u + 'r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8f2ff"/><stop offset=".5" stop-color="#8fa0b4"/><stop offset="1" stop-color="#3a4656"/></linearGradient>'
        + '<clipPath id="' + u + 'c"><rect width="200" height="100"/></clipPath>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* حزوزٌ قُطريّةٌ (لوحُ مانعُ انزلاقٍ) */
        + '<g stroke="#69798f" stroke-width="2.2" opacity=".32">'
        + '<path d="M-20 20 L40 -40 M-20 60 L80 -40 M20 100 L120 0 M60 100 L160 0 M100 100 L200 0 M140 100 L220 20 M180 100 L240 60"/>'
        + '</g>'
        /* خطوطُ فصلِ الصفائح */
        + '<g stroke="#121820" stroke-width="2.4" opacity=".8"><path d="M0 50 H200 M66 0 V100 M134 0 V100"/></g>'
        + '<g stroke="#8fa0b4" stroke-width=".9" opacity=".45"><path d="M0 51.6 H200 M67.6 0 V100 M135.6 0 V100"/></g>'
        + '<g fill="url(#' + u + 'r)" stroke="#161d26" stroke-width=".7">' + rivets + '</g>'
        /* انعكاسٌ فولاذيٌّ يعبرُ اللوحَ — تأثيرُ معدنٍ حقيقيٍّ لا تدرّجٌ ساكن */
        + '<g clip-path="url(#' + u + 'c)">'
        + '<rect x="-70" y="-30" width="34" height="170" fill="#ffffff" opacity=".16" transform="skewX(-22)">'
        + _an('x', '-70;240', 6.5) + '</rect>'
        + '</g>';
    },

    /* ١٨ المرج — تلالٌ خضراءُ متتابعةٌ وزهورٌ وشمسٌ وسماءٌ صافيةٌ بسحابتَين */
    bg_meadow: function (u) {
      var flower = function (x, y, c) {
        var p = '';
        for (var k = 0; k < 5; k++) p += '<circle cx="0" cy="-2.6" r="1.5" transform="rotate(' + (k * 72) + ')"/>';
        return '<g transform="translate(' + x + ' ' + y + ')" fill="' + c + '">' + p
          + '<circle r="1.1" fill="#fff0a8"/></g>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ab4f0"/><stop offset=".55" stop-color="#b8e4ff"/><stop offset="1" stop-color="#e8f6d8"/></linearGradient>'
        + '<linearGradient id="' + u + 'h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ec85a"/><stop offset="1" stop-color="#2f7a34"/></linearGradient>'
        + '<linearGradient id="' + u + 'j" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8dd72"/><stop offset="1" stop-color="#4f9a3e"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + '<circle cx="168" cy="20" r="12" fill="#fff6c4"/>'
        + '<circle cx="168" cy="20" r="18" fill="#fff6c4" opacity=".28">' + _an('r', '16;21;16', 6) + '</circle>'
        + '<g fill="#ffffff" opacity=".9">'
        + '<g>' + _mv('0 0;26 0;0 0', 22) + '<ellipse cx="44" cy="20" rx="15" ry="6.4"/><ellipse cx="54" cy="17" rx="11" ry="5.4"/><ellipse cx="34" cy="18" rx="9" ry="4.6"/></g>'
        + '<g opacity=".8">' + _mv('0 0;-20 0;0 0', 28) + '<ellipse cx="110" cy="13" rx="12" ry="5"/><ellipse cx="118" cy="11" rx="8" ry="4"/></g>'
        + '</g>'
        /* تلالٌ بثلاثِ طبقاتٍ = عمقُ مرجٍ مفتوح */
        + '<path fill="#9bd47a" opacity=".85" d="M-4 62 Q40 44 92 58 Q144 72 204 52 V104 H-4 Z"/>'
        + '<path fill="url(#' + u + 'j)" d="M-4 74 Q46 58 100 72 Q152 86 204 66 V104 H-4 Z"/>'
        + '<path fill="url(#' + u + 'h)" d="M-4 86 Q52 76 104 86 Q156 96 204 82 V104 H-4 Z"/>'
        /* أعشابٌ تتمايلُ في المقدّمة */
        + '<g stroke="#2a6b2c" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".9">'
        + '<path d="M30 100 Q28 92 33 86">' + _an('d', 'M30 100 Q28 92 33 86;M30 100 Q34 92 28 87;M30 100 Q28 92 33 86', 4.4) + '</path>'
        + '<path d="M128 100 Q132 92 126 85">' + _an('d', 'M128 100 Q132 92 126 85;M128 100 Q124 92 131 86;M128 100 Q132 92 126 85', 5.2) + '</path>'
        + '<path d="M176 100 Q174 93 180 88">' + _an('d', 'M176 100 Q174 93 180 88;M176 100 Q180 93 173 89;M176 100 Q174 93 180 88', 4.8) + '</path>'
        + '</g>'
        + flower(62, 88, '#ff8fb0') + flower(98, 94, '#fff0a8') + flower(146, 90, '#c78fff') + flower(22, 93, '#ffb36a') + flower(184, 95, '#ff8fb0');
    },

    /* ١٩ الصحراء — كثبانٌ رمليّةٌ متتابعةٌ بحرفٍ مُضاءٍ وشمسٌ حارّةٌ ونخلةٌ
       وقافلةٌ بعيدةٌ على الأفق */
    bg_desert: function (u) {
      var frond = function (a) {
        return '<path d="M0 0 Q' + (14 * Math.cos(a)) .toFixed(1) + ' ' + (14 * Math.sin(a) - 4).toFixed(1)
          + ' ' + (26 * Math.cos(a)).toFixed(1) + ' ' + (26 * Math.sin(a)).toFixed(1) + '" />';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7a94a"/><stop offset=".34" stop-color="#ffd48a"/><stop offset=".52" stop-color="#ffe9b8"/><stop offset="1" stop-color="#8a5a1e"/></linearGradient>'
        + '<linearGradient id="' + u + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b8"/><stop offset="1" stop-color="#d89a44"/></linearGradient>'
        + '<linearGradient id="' + u + 'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8b264"/><stop offset="1" stop-color="#9a6526"/></linearGradient>'
        + '<linearGradient id="' + u + 'c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4822e"/><stop offset="1" stop-color="#5e3a10"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + '<circle cx="132" cy="30" r="13" fill="#fffbe0" opacity=".95"/>'
        + '<circle cx="132" cy="30" r="21" fill="#fff0b8" opacity=".3">' + _an('r', '19;24;19', 7) + '</circle>'
        /* قافلةٌ بعيدةٌ صغيرةٌ على الأفق — تمنحُ المشهدَ مقياسًا */
        + '<g fill="#8a5a1e" opacity=".55">'
        + '<path d="M40 52 q2-3 4 0 l1 4 h-6 z"/><path d="M48 52.6 q1.6-2.6 3.4 0 l.9 3.4 h-5.2 z"/>'
        + '</g>'
        /* ثلاثُ طبقاتِ كثبانٍ، كلُّ حرفٍ بخطٍّ مُضاءٍ يفصلُه عمّا وراءه */
        + '<path fill="url(#' + u + 'a)" d="M-4 54 Q34 40 74 52 Q118 64 160 48 Q184 40 204 46 V104 H-4 Z"/>'
        + '<path fill="url(#' + u + 'b)" d="M-4 68 Q40 54 86 66 Q132 78 204 62 V104 H-4 Z"/>'
        + '<path fill="url(#' + u + 'c)" d="M-4 84 Q52 72 108 84 Q156 94 204 80 V104 H-4 Z"/>'
        + '<g stroke="#fff3cc" stroke-width="1" fill="none" opacity=".5">'
        + '<path d="M-4 68 Q40 54 86 66 Q132 78 204 62"/><path d="M-4 84 Q52 72 108 84 Q156 94 204 80"/>'
        + '</g>'
        /* نخلةٌ في المنطقةِ الآمنة */
        + '<g>'
        + '<path d="M96 96 Q92 78 95 58" fill="none" stroke="#5e3a10" stroke-width="3.6" stroke-linecap="round"/>'
        + '<g transform="translate(95 57)" fill="none" stroke="#2f7a34" stroke-width="2.6" stroke-linecap="round">'
        + frond(-2.9) + frond(-2.2) + frond(-1.5) + frond(-0.8) + frond(-0.15) + frond(3.05)
        + '</g>'
        + '<g fill="#8a4a10"><circle cx="97" cy="60" r="1.6"/><circle cx="92" cy="61" r="1.4"/></g>'
        + '</g>';
    },

    /* ٢٠ المطر — مطرٌ هادئٌ متّصلٌ وبِرَكٌ على أرضٍ عاكسةٍ تتوسّعُ فيها دوائرُ
       القَطر. سماءٌ رماديّةٌ فاتحةٌ بلا برقٍ ولا وميضٍ — فلا تُشبهُ العاصفةَ.
       تخطيطًا: خطُّ الأرضِ والبِرَكُ رُفِعَتْ إلى y≈56 (كانت ٧٢-٩٢ فخرجَتِ
       اللافتةُ فارغةً)، وكلُّ قَطرةٍ تبدأُ من موضعٍ موزَّعٍ عبرَ الارتفاعِ
       لا من فوقِ الكادرِ — فتُرى ساكنةً أيضًا عندَ تقليلِ الحركة. */
    bg_rain: function (u) {
      var drops = '';
      for (var i = 0; i < 34; i++) {
        var rx = (i * 19 + (i % 7) * 5) % 214 - 8;
        var ry = -10 + ((i * 11) % 60);
        var rd = 0.8 + ((i * 3) % 6) * .09;
        drops += '<line x1="' + rx + '" y1="' + ry + '" x2="' + (rx - 4) + '" y2="' + (ry + 12) + '">'
          + _mv('0 0;-22 64', rd) + '</line>';
      }
      var ripple = function (x, y, d) {
        return '<ellipse cx="' + x + '" cy="' + y + '" rx="3" ry="1" opacity=".75">'
          + _an('rx', '1.5;11', d) + _an('ry', '.5;3.4', d) + _an('opacity', '.85;0', d) + '</ellipse>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d7f96"/><stop offset=".4" stop-color="#4a5a70"/><stop offset=".58" stop-color="#2b3a50"/><stop offset="1" stop-color="#101820"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* سُحُبٌ رماديّةٌ فاتحةٌ منخفضةُ التباينِ داخلَ النافذة */
        + '<g fill="#7d8ea6" opacity=".62">'
        + '<ellipse cx="40" cy="20" rx="42" ry="11"/><ellipse cx="118" cy="16" rx="48" ry="10"/><ellipse cx="184" cy="21" rx="36" ry="9"/>'
        + '</g>'
        /* أرضٌ مبلّلةٌ عاكسةٌ + بِرَكٌ في قلبِ النافذة */
        + '<rect y="56" width="200" height="44" fill="#1a2430"/>'
        + '<rect y="55" width="200" height="1.6" fill="#8fa8c0" opacity=".5"/>'
        + '<g fill="#38536e" opacity=".9">'
        + '<ellipse cx="54" cy="64" rx="28" ry="4.6"/><ellipse cx="126" cy="70" rx="34" ry="5"/><ellipse cx="184" cy="61" rx="20" ry="3.8"/>'
        + '</g>'
        /* انعكاسٌ باهتٌ على الماءِ يُعطي إحساسَ البلل */
        + '<g fill="#8fa8c0" opacity=".14">'
        + '<rect x="30" y="56" width="48" height="16"/><rect x="100" y="56" width="52" height="20"/>'
        + '</g>'
        + '<g fill="none" stroke="#bfd8ef" stroke-width="1.1">'
        + ripple(54, 64, 2.4) + ripple(126, 70, 3) + ripple(184, 61, 2.1) + ripple(96, 66, 2.7) + ripple(28, 62, 3.3)
        + '</g>'
        + '<g stroke="#cfe0f2" stroke-width="1.1" stroke-linecap="round" opacity=".62">' + drops + '</g>';
    },

    /* ٢١ المعبد — صفُّ أعمدةٍ حجريّةٍ مخدّدةٍ بقوسٍ مركزيٍّ ومشعلانِ يرتجفان،
       وأشعّةٌ تنزلُ من فتحةٍ عُلويّة */
    bg_temple: function (u) {
      var col = function (x, w) {
        return '<g>'
          + '<rect x="' + (x - w / 2 - 2.4) + '" y="30" width="' + (w + 4.8) + '" height="5" rx="1.2" fill="#b9a077"/>'
          + '<rect x="' + (x - w / 2) + '" y="35" width="' + w + '" height="52" fill="url(#' + u + 'p)"/>'
          + '<g stroke="#7d6a4a" stroke-width=".8" opacity=".6"><path d="M' + (x - w / 4) + ' 36 V86 M' + (x + w / 4) + ' 36 V86"/></g>'
          + '<rect x="' + (x - w / 2 - 3) + '" y="87" width="' + (w + 6) + '" height="6" rx="1.4" fill="#a68d64"/>'
          + '</g>';
      };
      var torch = function (x) {
        return '<g transform="translate(' + x + ' 52)">'
          + '<rect x="-1.6" y="0" width="3.2" height="16" rx="1.2" fill="#4a3318"/>'
          + '<path d="M0 -14 Q-6 -5 0 2 Q6 -5 0 -14 Z" fill="#ff9b21">' + _an('d', 'M0 -14 Q-6 -5 0 2 Q6 -5 0 -14 Z;M0 -18 Q-5 -6 1 2 Q7 -6 0 -18 Z;M0 -14 Q-6 -5 0 2 Q6 -5 0 -14 Z', 1.6) + '</path>'
          + '<path d="M0 -7 Q-3 -2 0 1 Q3 -2 0 -7 Z" fill="#fff0a8">' + _an('opacity', '1;.6;1', 1.2) + '</path>'
          + '</g>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1028"/><stop offset=".55" stop-color="#2e1f42"/><stop offset="1" stop-color="#120b1c"/></linearGradient>'
        + '<linearGradient id="' + u + 'p" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d5c40"/><stop offset=".38" stop-color="#d4bc90"/><stop offset="1" stop-color="#5a4a30"/></linearGradient>'
        + '<linearGradient id="' + u + 'r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b8" stop-opacity=".45"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* أشعّةٌ نازلةٌ من فتحةِ السقف */
        + '<g fill="url(#' + u + 'r)">'
        + '<path d="M88 -4 L112 -4 L128 100 L72 100 Z">' + _an('opacity', '.6;1;.6', 8) + '</path>'
        + '</g>'
        /* سقفٌ وقوسٌ مركزيّ */
        + '<rect x="-4" y="20" width="208" height="10" fill="#9c8358"/>'
        + '<rect x="-4" y="14" width="208" height="6" fill="#c0a877"/>'
        + '<path d="M78 92 V60 A22 22 0 0 1 122 60 V92 Z" fill="#150d20"/>'
        + '<path d="M78 92 V60 A22 22 0 0 1 122 60 V92" fill="none" stroke="#b9a077" stroke-width="3.4"/>'
        + col(22, 15) + col(52, 13) + col(148, 13) + col(178, 15)
        + torch(40) + torch(160)
        + '<rect y="93" width="200" height="7" fill="#3a2d1e"/>'
        + '<g stroke="#5a4a30" stroke-width=".8" opacity=".7"><path d="M24 93 V100 M68 93 V100 M112 93 V100 M156 93 V100"/></g>';
    },

    /* ٢٢ الطلاسم — دائرةٌ سِحريّةٌ ثلاثيّةُ الحلقاتِ تدورُ حلقاتُها في اتّجاهَينِ
       متعاكسَينِ، برموزٍ ونجمةٍ خمسيّةٍ مرسومةٍ بخطٍّ متوهّج */
    bg_arcane: function (u) {
      var glyphRing = function (r, n, dur, rev) {
        var g = '';
        for (var i = 0; i < n; i++) {
          var a = (i / n) * Math.PI * 2;
          var x = (r * Math.cos(a)).toFixed(1), y = (r * Math.sin(a)).toFixed(1);
          g += '<path d="M' + x + ' ' + y + ' l3.4 0 M' + x + ' ' + y + ' l-1.7 3" stroke-width="1.5"/>';
        }
        return '<g stroke="#e0b8ff" fill="none" stroke-linecap="round" opacity=".9">' + _rot(0, 0, dur, rev) + g + '</g>';
      };
      var star = '';
      for (var i = 0; i < 5; i++) {
        var a1 = (i / 5) * Math.PI * 2 - Math.PI / 2;
        var a2 = (((i + 2) % 5) / 5) * Math.PI * 2 - Math.PI / 2;
        star += (i === 0 ? 'M' : 'L') + (26 * Math.cos(a1)).toFixed(1) + ' ' + (26 * Math.sin(a1)).toFixed(1)
          + ' L' + (26 * Math.cos(a2)).toFixed(1) + ' ' + (26 * Math.sin(a2)).toFixed(1);
      }
      return '<defs>'
        + '<radialGradient id="' + u + 'k" cx=".5" cy=".5" r=".8"><stop offset="0" stop-color="#3c1470"/><stop offset=".6" stop-color="#1a0836"/><stop offset="1" stop-color="#0a0318"/></radialGradient>'
        + '<filter id="' + u + 'g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + _stars([[18,20,.8],[176,24,.9],[34,80,.8],[186,76,.7],[8,52,.7]], '#d8b8ff')
        + '<g transform="translate(100 50)">'
        + '<g filter="url(#' + u + 'g)" opacity=".62">'
        + '<circle r="38" fill="none" stroke="#c07aff" stroke-width="3"/>'
        + '<path d="' + star + ' Z" fill="none" stroke="#c07aff" stroke-width="3"/>'
        + '</g>'
        + '<circle r="38" fill="none" stroke="#e8ccff" stroke-width="1.3" opacity=".85">' + _rot(0, 0, 30) + '</circle>'
        + '<circle r="30" fill="none" stroke="#b06bff" stroke-width="1" opacity=".6" stroke-dasharray="6 5">' + _rot(0, 0, 18, true) + '</circle>'
        + '<path d="' + star + ' Z" fill="none" stroke="#f4e4ff" stroke-width="1.5" stroke-linejoin="round">' + _an('opacity', '.6;1;.6', 4.4) + '</path>'
        + glyphRing(44, 12, 26) + glyphRing(23, 8, 14, true)
        + '<circle r="5" fill="#f4e4ff">' + _an('r', '4;6.4;4', 3.4) + '</circle>'
        + '</g>';
    },

    /* ٢٣ الشِّعاب — ماءٌ ضحلٌ **مضيءٌ** بمرجانٍ متفرّعٍ ملوّنٍ وأسماكٍ تسبحُ
       وتموّجاتِ ضوءٍ على القاع. مضيئةٌ وملوّنةٌ — عكسُ «الأعماق» المظلمةِ تمامًا. */
    bg_reef: function (u) {
      var fish = function (x, y, s, c, d, dir) {
        return '<g>' + _mv(dir > 0 ? '-40 0;220 0' : '220 0;-40 0', d)
          + '<g transform="translate(' + x + ' ' + y + ') scale(' + (dir > 0 ? s : -s) + ' ' + s + ')" fill="' + c + '">'
          + '<path d="M0 0 Q7 -5 15 0 Q7 5 0 0 Z"/><path d="M0 0 L-5 -4 L-5 4 Z"/>'
          + '<circle cx="11" cy="-1.2" r=".8" fill="#0b1a2a"/></g></g>';
      };
      var coral = function (x, y, c) {
        return '<g transform="translate(' + x + ' ' + y + ')" fill="none" stroke="' + c + '" stroke-width="3.2" stroke-linecap="round">'
          + '<path d="M0 0 V-14"/><path d="M0 -7 Q-6 -12 -8 -20"/><path d="M0 -9 Q6 -14 9 -22"/><path d="M0 -13 Q-3 -20 -2 -26"/></g>';
      };
      return '<defs>'
        + '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fe8e0"/><stop offset=".38" stop-color="#1fa8c8"/><stop offset="1" stop-color="#0a5a80"/></linearGradient>'
        + '<linearGradient id="' + u + 'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe0a8"/><stop offset="1" stop-color="#c99a5a"/></linearGradient>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        /* ضوءُ السطحِ فوقَ الماء */
        + '<g fill="#e8fffb" opacity=".35">'
        + '<ellipse cx="60" cy="4" rx="44" ry="6"/><ellipse cx="150" cy="6" rx="38" ry="5"/>'
        + '</g>'
        /* تموّجاتُ ضوءٍ تزحفُ على القاعِ — بصمةُ الماءِ الضحل */
        + '<g fill="none" stroke="#c8fff4" stroke-width="1.4" opacity=".45">'
        + '<path d="M-10 40 Q20 34 50 40 Q80 46 110 40 Q140 34 210 40">' + _mv('0 0;24 0;0 0', 7) + '</path>'
        + '<path d="M-10 54 Q24 48 58 54 Q92 60 126 54 Q160 48 210 54">' + _mv('0 0;-20 0;0 0', 9) + '</path>'
        + '</g>'
        /* القاعُ الرمليُّ ثمّ المرجانُ متفرّعًا ملوّنًا */
        + '<path fill="url(#' + u + 'b)" d="M-4 84 Q40 74 84 82 Q130 90 204 78 V104 H-4 Z"/>'
        + coral(30, 86, '#ff7a9e') + coral(76, 84, '#ffb84a') + coral(118, 88, '#a86bff') + coral(166, 82, '#5affc0')
        + '<g fill="#ff9ec4" opacity=".9">'
        + '<circle cx="96" cy="78" r="3.4"/><circle cx="102" cy="82" r="2.6"/><circle cx="90" cy="82" r="2.4"/>'
        + '</g>'
        + fish(0, 46, 1.25, '#ffd24a', 12, 1) + fish(0, 62, 1, '#ff6a9e', 15, -1)
        + fish(0, 34, .85, '#5affc0', 18, 1) + fish(0, 70, .9, '#8fd4ff', 21, -1);
    },

    /* ٢٤ الخسوف — قرصٌ أسودُ يحجبُ الشمسَ وهالةُ كورونا حولَه بخيوطٍ شعاعيّةٍ
       وحلقةُ ماسٍ لحظيّةٍ على الحافّة */
    bg_eclipse: function (u) {
      var rays = '';
      for (var i = 0; i < 28; i++) {
        var a = (i / 28) * 360;
        var len = 34 + ((i * 7) % 5) * 5;
        rays += '<path d="M0 -25 V-' + len + '" transform="rotate(' + a.toFixed(1) + ')" stroke-width="' + (i % 3 === 0 ? 2 : 1.1) + '"/>';
      }
      return '<defs>'
        + '<radialGradient id="' + u + 'k" cx=".5" cy=".46" r=".78"><stop offset="0" stop-color="#3a2a1a"/><stop offset=".42" stop-color="#170f1e"/><stop offset="1" stop-color="#05040a"/></radialGradient>'
        + '<radialGradient id="' + u + 'c" cx=".5" cy=".5" r=".5"><stop offset=".52" stop-color="#ffd98a" stop-opacity="0"/><stop offset=".62" stop-color="#ffe9b8" stop-opacity=".9"/><stop offset=".78" stop-color="#ff9b45" stop-opacity=".42"/><stop offset="1" stop-color="#ff7a2f" stop-opacity="0"/></radialGradient>'
        + '<filter id="' + u + 'g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2"/></filter>'
        + '</defs>'
        + '<rect width="200" height="100" fill="url(#' + u + 'k)"/>'
        + _stars([[20,16,.9],[44,78,.8],[168,20,1],[188,68,.8],[30,50,.7],[180,44,.9],[72,88,.8],[136,92,.7]])
        + '<g transform="translate(100 46)">'
        /* الكورونا: خيوطٌ شعاعيّةٌ تنبضُ خفيفًا */
        + '<g stroke="#ffd9a0" fill="none" stroke-linecap="round" opacity=".55" filter="url(#' + u + 'g)">'
        + '<g>' + _an('opacity', '.4;.8;.4', 6) + rays + '</g>'
        + '</g>'
        + '<circle r="46" fill="url(#' + u + 'c)"/>'
        /* القرصُ الأسودُ المصمتُ يحجبُ الشمسَ */
        + '<circle r="24" fill="#05040a"/>'
        + '<circle r="24.8" fill="none" stroke="#ffeec4" stroke-width="1.5" opacity=".95"/>'
        /* حلقةُ الماسِ: بريقٌ يظهرُ لحظةً على الحافّةِ ثمّ يدورُ */
        + '<g>' + _rot(0, 0, 18)
        + '<circle cx="0" cy="-24.8" r="3.4" fill="#fffdf2">' + _an('r', '2;4.4;2', 3) + '</circle>'
        + '</g>'
        + '</g>';
    },
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

  /* ══ المشهدُ المرسومُ للخلفيّةِ — المُصيّرُ الواحد ══
     يقرأُ منه ثلاثةُ مواضعَ: اللافتةُ الحيّةُ (bannerHTML) والهالةُ حولَ
     صناديقَ صغيرةٍ (bgHTML) ومعاينةُ المتجرِ/المخزونِ (thumb) — فما يراه
     اللاعبُ قبلَ الشراءِ هو نفسُه ما يُطبَّقُ بالحرف.
     معرّفاتُ التدرّجاتِ والمرشّحاتِ تُولَدُ فريدةً لكلِّ نسخةٍ لأنّ عشراتَ
     البطاقاتِ تُعرَضُ في الصفحةِ معًا، وتكرارُ id يجعلُ كلَّ مراجعِ
     url(#id) تشدُّ من أوّلِ نسخةٍ فتتلوّنُ المشاهدُ كلُّها غلط.
     preserveAspectRatio="xMidYMid slice" يُغطّي الصندوقَ دونَ تشويهٍ:
     يقصُّ الفائضَ بدلَ أن يمطَّ الأشكال. */
  function bgSceneInner(bid) {
    var fn = BG_SCENE[bid];
    if (typeof fn !== 'function') return '';
    try { return fn('bs' + esc(bid) + '_' + (++_uid)); } catch (e) { return ''; }
  }
  /* نافذةُ العرضِ تتبعُ نسبةَ الصندوق، والرسمُ واحدٌ لا يتغيّر:
     • 'thumb' (بطاقةُ المتجرِ/المخزونِ، مربّعةٌ تقريبًا) → المشهدُ كاملًا
       ‎0 0 200 100‎؛ مع slice تُقصُّ الجوانبُ فتظهرُ منطقةُ الهويّةِ الوسطى.
     • 'banner' (لافتةُ البطاقةِ، نسبتُها ≈٥٫٥:١) → نافذةٌ أعرضُ
       ‎0 30 200 40‎ (٥:١). بالنافذةِ الكاملةِ ‎200×100‎ كان المرئيُّ
       ‎200/5.5 ≈ 36‎ وحدةً من مئةٍ — أي إخفاءُ ٦٤٪ من المشهدِ وقطعُ
       الصاعقةِ ورأسِ التنّينِ في منتصفِهما. بنافذةِ الأربعينَ يصيرُ
       المرئيُّ ٣٦ من ٤٠ = ٩٠٪ منها، **بلا أيِّ تشويهٍ** لأنّ slice
       يُحافظُ على النسبةِ (وpreserveAspectRatio="none" كان سيمطُّ
       الأشكالَ ضِعفًا فتصيرُ الدوائرُ بيضاويّةً). */
  function bgSceneSVG(bid, cls, mode) {
    var inner = bgSceneInner(bid);
    if (!inner) return '';
    var vb = (mode === 'banner') ? '0 30 200 40' : '0 0 200 100';
    return '<svg class="' + (cls || 'cos-scene') + '" viewBox="' + vb + '"'
      + ' preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + inner + '</svg>';
  }

  function bgHTML(cos) {
    if (!cos || !cos.background) return '';
    var g = BG[cos.background];
    if (!g) return '';
    /* التدرّجُ يبقى أساسًا لونيًّا تحتَ المشهدِ — يظهرُ وحدَه فقط لو تعذّرَ
       المشهدُ (خلفيّةٌ جديدةٌ من الخادمِ لا يعرفُها هذا البناء) فلا يُترَكُ
       الصندوقُ فارغًا. */
    return '<span class="cos-bg cos-bg--' + esc(cos.background) + '" style="background-image:' + g + '">'
    /* الهالةُ حولَ صناديقَ صغيرةٍ قريبةٌ من المربّعِ لا عريضةٌ كاللافتة،
       فتأخذُ المشهدَ كاملًا لا نافذةَ اللافتةِ العريضة. */
      + bgSceneSVG(cos.background, 'cos-bg__art') + '</span>';
  }

  /* أجزاء تُدسّ داخل صندوق أفاتار: الإطارُ فقط (طوقٌ حولَ الصورة).
     ملاحظةٌ مهمّة (طلبُ جوجو): الخلفيّةُ لا تُرسمُ أبدًا خلفَ الصورةِ نفسِها —
     فهي تُشوّشُ الصورةَ ويراها الآخرون مشوَّشةً. الخلفيّةُ تظهرُ لافتةً عريضةً
     في مناطقِ البطاقاتِ عبرَ paintBanner فقط، لا حولَ الأفاتار. */
  function avatarLayers(cos) { return frameHTML(cos); }

  /* رسم على عنصر DOM قائم (updatePlayerImages/الرئيسية): يزيل القديم ثم يضيف.
     الإطارُ فقط يُدسُّ داخلَ الأفاتار؛ الخلفيّةُ لافتةٌ منفصلةٌ (paintBanner). */
  function paint(el, cos) {
    if (!el) return;
    /* نزيلُ أيّ خلفيّةٍ قديمةٍ كانت تُرسَمُ خلفَ الصورةِ في بناءاتٍ سابقة. */
    var old = el.querySelectorAll(':scope > .cos-frame, :scope > .cos-bg');
    for (var i = 0; i < old.length; i++) old[i].remove();
    if (cos && cos.frame) {
      el.classList.add('cos-host');
      var html = frameHTML(cos);
      if (html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
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
     الصغيرة).
     البناءُ ٦٨: **المشهدُ المرسومُ** هو الطبقةُ الأساسيّةُ الآن، والتدرّجُ صارَ
     أساسًا لونيًّا تحتَه وحدَه (بلاغُ جوجو ٨: «كلُّ الخلفيّاتِ مجرّدُ بكسلاتٍ
     بلا تأثيراتٍ حقيقيّة»). الذرّاتُ والبريقُ العامّانِ بقيا طبقةً أخيرةً
     رقيقةً فوقَ المشهدِ، وتعتيمُ النصِّ في CSS كما هو. */
  function bannerHTML(cos) {
    if (!cos || !cos.background) return '';
    var g = BG[cos.background];
    var scene = bgSceneSVG(cos.background, 'cos-banner__art', 'banner');
    if (!g && !scene) return '';
    return '<span class="cos-banner cos-banner--' + esc(cos.background) + '" aria-hidden="true"'
      + (g ? ' style="background-image:' + g + '"' : '') + '>'
      + scene
      + '<span class="cos-banner__motes"></span><span class="cos-banner__sheen"></span></span>';
  }
  /* رسمُ اللافتةِ على بطاقةٍ قائمةٍ (بطاقةُ الملفِّ/هويّةُ الرئيسيّة). */
  function paintBanner(el, cos) {
    if (!el) return;
    var old = el.querySelector(':scope > .cos-banner'); if (old) old.remove();
    el.classList.remove('cos-bannered');
    if (cos && cos.background && (BG[cos.background] || BG_SCENE[cos.background])) {
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
  /* ══ مخلوقٌ ملحميٌّ مرسومٌ يعبرُ الشاشة (بلاغ جوجو #8) ══
     svg = جسمُ الرسم، rise=true للعنقاءِ الصاعدةِ رأسيًّا. معرّفُ التدرّجِ
     فريدٌ لكلِّ نسخة. glow = لونُ الهالةِ خلفَ المخلوق. */
  function _creature(layer, svg, opt) {
    opt = opt || {};
    var el = _mk('cosfx-creature' + (opt.rise ? ' cosfx-creature--rise' : ''),
      { animationDuration: (opt.dur || 2.6) + 's' }, svg);
    el.style.filter = 'drop-shadow(0 0 22px ' + (opt.glow || 'rgba(255,90,20,.85)') + ')';
    layer.appendChild(el);
  }
  /* تنّينٌ بجناحٍ خفّاقٍ وفكٍّ مفتوحٍ وذيلٍ مسنّن — تدرّجٌ نارِيّ. */
  function _dragonSVG() {
    var g = 'dg' + (++_uid);
    return '<svg viewBox="0 0 100 100">'
      + '<defs><linearGradient id="' + g + '" x1="0" y1="1" x2="1" y2="0">'
      + '<stop offset="0" stop-color="#7a1500"/><stop offset=".45" stop-color="#ff5a1e"/><stop offset="1" stop-color="#ffd27a"/>'
      + '</linearGradient></defs>'
      + '<g fill="url(#' + g + ')">'
      + '<path d="M14 78 C24 74 26 66 34 62 C44 57 52 60 60 54 C68 48 72 42 80 38 C74 46 70 52 62 58 C54 64 44 64 36 68 C28 72 24 76 14 78 Z"/>'
      + '<path d="M76 40 C82 36 84 30 90 26 C88 32 90 34 94 34 C90 36 90 40 86 42 C90 42 92 44 90 46 L83 45 C80 45 77 44 76 40 Z"/>'
      + '<path d="M88 28 L92 20 L90 29 Z"/>'
      + '<path d="M14 78 L5 85 L12 74 L11 83 Z"/>'
      + '</g>'
      + '<g class="cfx-wing"><path d="M50 54 C40 40 34 28 40 14 C44 26 52 30 58 34 C52 30 50 36 56 40 C50 40 48 46 54 50 C50 50 50 54 50 54 Z" fill="url(#' + g + ')" opacity=".94"/></g>'
      + '<circle cx="86" cy="37" r="1.7" fill="#fff2b0"/>'
      + '</svg>';
  }
  /* عنقاءٌ بجناحَين مفرودَين وذيلٍ ريشيٍّ — تصعدُ ملتهبة. */
  function _phoenixSVG() {
    var g = 'ph' + (++_uid);
    return '<svg viewBox="0 0 100 100">'
      + '<defs><linearGradient id="' + g + '" x1="0" y1="1" x2="0" y2="0">'
      + '<stop offset="0" stop-color="#ff3d00"/><stop offset=".5" stop-color="#ff8a3a"/><stop offset="1" stop-color="#ffe08a"/>'
      + '</linearGradient></defs>'
      + '<g fill="url(#' + g + ')">'
      + '<path d="M50 30 C46 32 45 40 47 52 C49 62 50 70 50 80 C50 70 51 62 53 52 C55 40 54 32 50 30 Z"/>'
      + '<path d="M50 84 C45 90 42 95 46 99 C49 93 49 89 50 85 C51 89 51 93 54 99 C58 95 55 90 50 84 Z"/>'
      + '<circle cx="50" cy="26" r="5.4"/>'
      + '<path d="M55 24 L61 22 L55 27 Z"/>'
      + '</g>'
      + '<g class="cfx-wing"><path d="M48 42 C34 30 18 30 6 40 C20 38 24 45 33 49 C22 49 18 56 29 60 C38 55 44 50 48 44 Z" fill="url(#' + g + ')"/></g>'
      + '<g class="cfx-wing"><path d="M52 42 C66 30 82 30 94 40 C80 38 76 45 67 49 C78 49 82 56 71 60 C62 55 56 50 52 44 Z" fill="url(#' + g + ')"/></g>'
      + '</svg>';
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
      /* حبرٌ **مضيء**: نواةٌ بيضاءُ وأطرافٌ نيليّةٌ لامعةٌ + حلقةُ صدمةٍ فاتحة.
         (كانَ أسودَ على واجهةٍ سوداءَ فلا يُرى — بلاغُ جوجو ١.) */
      case 'fx_ink': _burst(layer, [[50, 45, 0]], 22, ['#ffffff', '#9ec2ff', '#5a63d8', '#2a2a5e']); _shock(layer, ['#ffffff', '#9ec2ff', '#5a63d8']); _flash(layer, 'radial-gradient(circle at 50% 48%,rgba(255,255,255,.34),rgba(120,140,255,.3) 22%,rgba(14,12,40,.5) 46%,transparent 64%)'); break;
      case 'fx_glitch': _glitch(layer); break;
      case 'fx_frostbreak': _crack(layer, '#bfefff'); _flash(layer, 'radial-gradient(circle at 50% 45%,rgba(180,240,255,.4),transparent 55%)'); break;
      /* ═══ Mythic — احتفالاتٌ ومؤثّراتٌ مِلءَ الشاشةِ الأفخم ═══ */
      case 'cel_dragon': _flash(layer, 'radial-gradient(circle at 50% 100%,rgba(255,90,30,.6),rgba(122,21,0,.22),transparent 72%)'); _creature(layer, _dragonSVG(), { dur: 2.7, glow: 'rgba(255,90,20,.9)' }); _rise(layer, 30, 'cosfx-flame', function (i) { return i % 2 ? '#ff5a1e' : '#ffb347'; }); _burst(layer, [[50, 72, 0.9], [30, 82, 1.2], [70, 80, 1.4]], 12, ['#ff5a1e', '#ffd27a', '#ff8a1e']); break;
      case 'cel_galaxy': _burst(layer, [[50, 40, 0], [28, 32, 0.3], [72, 34, 0.6], [40, 56, 0.9], [62, 52, 1.1]], 20, ['#b48bff', '#8fd4ff', '#ffffff', '#ff6ad5']); _shock(layer, ['#b48bff', '#8fd4ff', '#ff6ad5']); _flash(layer, 'radial-gradient(circle at 50% 44%,rgba(140,120,255,.42),transparent 62%)'); _meteors(layer, 12); break;
      case 'cel_phoenix': _creature(layer, _phoenixSVG(), { rise: true, dur: 2.7, glow: 'rgba(255,138,58,.9)' }); _rise(layer, 28, 'cosfx-flame', function () { return ['#ff8a3a', '#ffd27a', '#ff3d00'][Math.floor(Math.random() * 3)]; }); _flash(layer, 'radial-gradient(circle at 50% 72%,rgba(255,138,58,.5),transparent 66%)'); _burst(layer, [[50, 52, 1.1]], 22, ['#ffd27a', '#ff5a1e', '#ffffff']); break;
      case 'cel_goldstorm': _fall(layer, 60, 'cosfx-coin', null, false); _fall(layer, 30, 'cosfx-goldrain', null, false); _flash(layer, 'radial-gradient(circle at 50% 28%,rgba(255,210,74,.42),transparent 62%)'); break;
      case 'fx_dragonfire': _flash(layer, 'radial-gradient(circle at 50% 60%,rgba(255,60,0,.62),rgba(122,21,0,.26),transparent 70%)'); _creature(layer, _dragonSVG(), { dur: 2.4, glow: 'rgba(255,60,0,.92)' }); _rise(layer, 26, 'cosfx-flame', function (i) { return i % 2 ? '#ff3d00' : '#ff8a1e'; }); _crack(layer, '#ff7a2f'); break;
      /* ثقبٌ أسودُ **يُرى**: قرصُ تنامٍ بنفسجيٌّ ساطعٌ وحلقاتُ صدمةٍ وأشعّةٌ حولَ
         نواةٍ داكنةٍ صغيرةٍ — لا عتمةٌ تغطّي الشاشةَ (بلاغُ جوجو ١). */
      case 'fx_blackhole': _vortex(layer, '#d8a8ff'); _implode(layer, 40, ['#ffffff', '#e0c8ff', '#b06bff', '#7a4fd0']); _shock(layer, ['#ffffff', '#d8a8ff', '#8f5cff']); _beams(layer, ['#c48bff', '#ffffff', '#8f5cff']); _flash(layer, 'radial-gradient(circle at 50% 50%,rgba(20,6,44,.66) 0,rgba(196,139,255,.5) 26%,rgba(255,255,255,.3) 34%,rgba(122,60,180,.18) 48%,transparent 66%)'); break;
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
      /* كسوفٌ: هالةٌ ذهبيّةٌ ساطعةٌ (إكليلٌ) حولَ قرصٍ داكنٍ صغيرٍ + أشعّةٌ
         وحلقاتٌ — الذهبُ هو البطلُ لا السواد (بلاغُ جوجو ١). */
      case 'fx_eclipse': _vortex(layer, '#ffd98a'); _implode(layer, 32, ['#ffffff', '#fff0b0', '#ffb02f', '#c9a84c']); _beams(layer, ['#ffd24a', '#fff0b0', '#ffb02f']); _shock(layer, ['#ffffff', '#fff0b0', '#ffb02f']); _flash(layer, 'radial-gradient(circle at 50% 46%,rgba(12,10,20,.6) 0,rgba(255,216,120,.58) 24%,rgba(255,255,255,.34) 32%,rgba(255,176,47,.16) 48%,transparent 66%)'); break;
      case 'fx_solarflare': _beams(layer, ['#ffb02f', '#fff0b0', '#ffd24a']); _burst(layer, [[50, 40, 0], [50, 40, 0.4]], 26, ['#ffffff', '#ffd24a', '#ffb02f']); _shock(layer, ['#fff0b0', '#ffb02f']); _flash(layer, 'radial-gradient(circle at 50% 40%,rgba(255,240,180,.62),rgba(160,58,0,.2),transparent 62%)'); break;
      default: return false;
    }
    return true;
  }
  /* ══ لونُ هويّةِ كلِّ مؤثّرٍ ══
     يُستعملُ في «الوضعِ الهادئ» (تقليلُ الحركة) لرسمِ وميضِ لونٍ ثابتٍ مكانَ
     الجُسيمات: لا حركةَ لكن المؤثّرَ **يُرى** (قبلًا كانَ يُلغى تمامًا). */
  var _FXTINT = {
    cel_confetti: '#ff4d6d', cel_petals: '#ff8fb8', cel_coins: '#ffd24a', cel_stars: '#ffd24a',
    cel_balloons: '#5ad1ff', cel_fireworks: '#ff6ad5', cel_lasers: '#00eaff', cel_meteor: '#8fd4ff',
    cel_dragon: '#ff5a1e', cel_galaxy: '#b48bff', cel_phoenix: '#ff8a3a', cel_goldstorm: '#ffd24a',
    cel_ribbons: '#ff4d6d', cel_bubbles: '#5ad1ff', cel_leaves: '#6fcf5a', cel_sparks: '#ffd24a',
    cel_aurora: '#5affc0', cel_crowns: '#ffd24a', cel_sunburst: '#ffb02f',
    fx_goldrain: '#ffd24a', fx_seasonal_snow: '#dff2ff', fx_shatter: '#eaf2ff', fx_lightning: '#8ab6ff',
    fx_flames: '#ff8a1e', fx_supernova: '#ffd24a', fx_ink: '#9ec2ff', fx_glitch: '#00eaff',
    fx_frostbreak: '#bfefff', fx_dragonfire: '#ff3d00', fx_blackhole: '#c48bff',
    fx_thunderstrike: '#8fd4ff', fx_prismburst: '#8fd4ff', fx_sandstorm: '#e8c37a',
    fx_ripple: '#4ad6ff', fx_leafstorm: '#6fcf5a', fx_venom: '#9fff2f', fx_quake: '#e8c37a',
    fx_eclipse: '#ffb02f', fx_solarflare: '#ffd24a'
  };
  /* الوضعُ الهادئ: وميضُ لونٍ + حلقتان ساكنتان (تغيّرُ شفافيّةٍ فقط، بلا حركة). */
  function _playLite(layer, ids) {
    var tint = null;
    for (var i = 0; i < ids.length; i++) { if (ids[i] && _FXTINT[ids[i]]) { tint = _FXTINT[ids[i]]; break; } }
    if (!tint) return false;
    layer.classList.add('cos-fx-ov--lite');
    layer.appendChild(_mk('cosfx-lite__wash', { background: 'radial-gradient(circle at 50% 46%,' + tint + '55,transparent 62%)' }));
    layer.appendChild(_mk('cosfx-lite__ring', { borderColor: tint, color: tint }));
    return true;
  }
  var _fxBusy = false, _fxQueue = [], _pendingLv = null;
  /* مُشغِّلٌ عامٌّ لطبقةِ المؤثّراتِ مِلءَ الشاشة. dur = عمرُ الطبقةِ بالمللي.
     • تقليلُ الحركة: لا نُلغي المؤثّرَ بل نعرضُه هادئًا (بلاغُ جوجو ١: «ولا وضع
       بيشتغل فيه» — الإلغاءُ التامُّ كانَ أحدَ الأسباب).
     • ازدحامٌ: نُصَفُّ الطلبَ بدلَ إسقاطِه، فاحتفالُ الفوزِ يأتي بعدَ مؤثّرِ المات. */
  function _playFx(ids, dur) {
    try {
      if (!ids || !ids.length) return;
      if (_fxBusy) {
        if (_fxQueue.length < 2) _fxQueue.push({ ids: ids, dur: dur });
        return;
      }
      var lite = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      _fxBusy = true;
      var ov = document.createElement('div'); ov.className = 'cos-fx-ov';
      document.body.appendChild(ov);
      var any = false;
      if (lite) { any = _playLite(ov, ids); }
      else { ids.forEach(function (id) { if (id && _playOne(ov, id)) any = true; }); }
      if (!any) { ov.remove(); _fxBusy = false; _drainFx(); return; }
      setTimeout(function () {
        try { ov.remove(); } catch (e) {}
        _fxBusy = false; _drainFx();
      }, lite ? 1600 : (dur || 4200));
    } catch (e) { _fxBusy = false; }
  }
  /* تصريفُ الطابور. نافذةُ الترقّي لها الأولويّةُ المطلقةُ على أيِّ مؤثّرٍ
     مصفوف: لحظةُ الترقّي أهمُّ من رشّةِ احتفالٍ، ولا يجوزُ أن تُبتلَعَ لأنّ
     مؤثّرَ الماتِ كانَ شغّالًا (بلاغُ جوجو ٧: «النافذةُ سيّئةٌ» — وأسوأُ منها
     ألّا تظهرَ أصلًا). */
  function _drainFx() {
    if (_fxBusy) return;
    if (_pendingLv) {
      var p = _pendingLv; _pendingLv = null;
      setTimeout(function () { levelUp(p[0], p[1], p[2]); }, 160);
      return;
    }
    if (!_fxQueue.length) return;
    var n = _fxQueue.shift();
    setTimeout(function () { _playFx(n.ids, n.dur); }, 120);
  }
  /* احتفالُ الفوزِ (شاشةُ النهاية): مؤثّرُ الاحتفالِ المُجهَّزُ فقط. */
  function celebrate(cos) {
    cos = cos || self();
    if (!cos || !cos.celebration) return;
    _playFx([cos.celebration]);
  }
  /* مؤثّرُ الكشِ ماتِ (لحظةَ إنهاءِ المباراةِ بكشِ مات): مؤثّرُ المات المُجهَّزُ
     فقط — يُطلَقُ فورَ المات لا على شاشةِ النهاية (بلاغ جوجو: التأثيرُ لم يعمل).
     يُعيدُ عمرَ المؤثّرِ بالمللي (أو 0 إن لا مؤثّرَ) كي يُؤخّرَ نداءُ اللعبةِ
     فتحَ شاشةِ النهايةِ فلا تحجبَ المؤثّرَ قبلَ أن يُرى (بلاغ جوجو ١). */
  function mateFx(cos) {
    cos = cos || self();
    if (!cos || !cos.mate_fx) return 0;
    var lite = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var dur = lite ? 1600 : 3000;
    _playFx([cos.mate_fx], dur);
    return dur;
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
    /* الخلفيّاتُ (البناءُ ٦٨): صارَتْ تُرسَمُ من نفسِ BG_SCENE الذي يرسمُ
       اللافتةَ الحيّةَ — فالمعاينةُ في المتجرِ والمخزونِ مطابقةٌ بالبكسلِ
       لِما سيُطبَّقُ على البطاقة. قبلَ ذلك كان للخلفيّةِ مُصيّرانِ منفصلان
       (مشهدٌ بسيطٌ في store-client وتدرّجٌ للحيّ) فيتباعدان، وهي نفسُ علّةِ
       تناقضِ الصقيعِ التي انتهَتْ في الإطارات. */
    if (it.type === 'background') {
      return bgSceneSVG(it.id, 'st-svg st-svg--scene');
    }
    /* الاحتفالاتُ ومؤثّراتُ المات: مشاهدُها الغنيّةُ تُرسَمُ في store-client
       (لا تناقضَ لأنّ الحيَّ جُسيماتُ DOM كاملةُ الشاشةِ لا صورةٌ ثابتة). */
    return '';
  }

  /* ══ قرصُ العملةِ الموحّد (AK) ══
     مطابقٌ حرفيًّا لعملةِ الشاشةِ الرئيسيّة (بلاغُ جوجو ٥: «العملةُ في المتجرِ
     والمخزونِ والجوائزِ والمهامِّ مش بنفسِ الشكلِ الأنيميشن اللامعِ اللي في
     الرئيسيّة»): طوقٌ داكنٌ + قرصٌ متدرّجٌ + حلقةٌ داخليّةٌ + نقشُ AK + **لمعةٌ
     تعبرُ القرصَ** داخلَ قناعٍ دائريّ. معرّفا التدرّجِ والقناعِ فريدان لكلِّ
     نسخةٍ (تظهرُ عشراتٌ معًا فلا تتصادمُ المعرّفات). النبضةُ من CSS على
     .amkh-coin-svg وتهدأُ مع تقليلِ الحركة. */
  function coin(px) {
    var u = ++_uid, g = 'ac' + u, cp = 'acc' + u;
    var sz = px ? (' style="width:' + px + 'px;height:' + px + 'px"') : '';
    /* نسخٌ تُنشَأُ بعدَ مسحةِ SMIL (بطاقاتُ المتجر/المخزونِ/المهامّ) فتُولَدُ
       بلا <animate> أصلًا عندَ تقليلِ الحركة — لا لمعةً تفلتُ من القاعدة. */
    var still = false;
    try { still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    return '<svg class="amkh-coin-svg" viewBox="0 0 40 40"' + sz + ' aria-hidden="true">'
      + '<defs><radialGradient id="' + g + '" cx="38%" cy="30%" r="75%">'
      + '<stop offset="0" stop-color="#fff6cf"/><stop offset=".48" stop-color="#f5c451"/><stop offset="1" stop-color="#b9800f"/>'
      + '</radialGradient>'
      + '<clipPath id="' + cp + '"><circle cx="20" cy="20" r="17"/></clipPath></defs>'
      + '<circle cx="20" cy="20" r="18.5" fill="#7f5307"/>'
      + '<circle cx="20" cy="20" r="17" fill="url(#' + g + ')"/>'
      + '<circle cx="20" cy="20" r="14" fill="none" stroke="#fff2c0" stroke-width="1" opacity=".55"/>'
      + '<text x="20" y="20.5" text-anchor="middle" dominant-baseline="central" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="13" letter-spacing="-.6" fill="#7a4e08">AK</text>'
      + (still ? '' : '<g clip-path="url(#' + cp + ')">'
        + '<rect x="-16" y="-8" width="8" height="56" fill="#fffdf2" opacity=".5" transform="rotate(20 20 20)">'
        + '<animate attributeName="x" values="-16;46" dur="2.8s" repeatCount="indefinite"/></rect></g>')
      + '</svg>';
  }

  /* ══ أيقوناتُ فئاتِ العناصرِ الملوّنة (المتجر/المخزون — بلاغ جوجو #2/#6) ══
     أيقونةٌ فاخرةٌ ملوّنةٌ لكلِّ نوع (إطار/خلفيّة/شارة/احتفال/مؤثّر مات) بمعرّفاتِ
     تدرّجٍ فريدةٍ لكلِّ نسخة، فتتكرّرُ بلا تصادمِ id. بلا إيموجي — SVG خالص. */
  function catIcon(type) {
    var u = ++_uid;
    function G(id, stops, a) {
      a = a || {};
      var attrs = ' x1="' + (a.x1 || 0) + '" y1="' + (a.y1 || 0) + '" x2="' + (a.x2 || 1) + '" y2="' + (a.y2 || 1) + '"';
      return '<linearGradient id="' + id + '"' + attrs + '>' + stops + '</linearGradient>';
    }
    var s = '<svg class="cat-ic" viewBox="0 0 24 24" aria-hidden="true">';
    switch (type) {
      case 'frame':
        s += '<defs>' + G('ci' + u, '<stop offset="0" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#f5c451"/><stop offset="1" stop-color="#b9800f"/>') + '</defs>'
          + '<circle cx="12" cy="12" r="9" fill="none" stroke="url(#ci' + u + ')" stroke-width="3.2"/>'
          + '<circle cx="12" cy="12" r="9" fill="none" stroke="#fff6cf" stroke-width=".7" opacity=".7"/>'
          + '<circle cx="12" cy="3.4" r="1.9" fill="#fff6cf"/><circle cx="12" cy="20.6" r="1.5" fill="#f5c451"/>'
          + '<circle cx="3.4" cy="12" r="1.5" fill="#f5c451"/><circle cx="20.6" cy="12" r="1.5" fill="#f5c451"/>';
        break;
      case 'background':
        s += '<defs>' + G('ci' + u, '<stop offset="0" stop-color="#8b5cf6"/><stop offset=".5" stop-color="#6366f1"/><stop offset="1" stop-color="#22d3ee"/>', { x2: 0, y2: 1 }) + '</defs>'
          + '<rect x="3" y="4.5" width="18" height="15" rx="3" fill="url(#ci' + u + ')" stroke="#3730a3" stroke-width="1"/>'
          + '<circle cx="8" cy="9" r="2.2" fill="#fff6cf"/>'
          + '<path d="M3.4 17 L9 12 L13 15 L16.5 11.5 L20.6 16 V17 Z" fill="#1e1b4b" opacity=".55"/>'
          + '<path d="M3.4 19.5 H20.6" stroke="#c7d2fe" stroke-width=".7" opacity=".5"/>';
        break;
      case 'badge':
        s += '<defs>' + G('ci' + u, '<stop offset="0" stop-color="#5eead4"/><stop offset=".5" stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/>') + '</defs>'
          + '<path d="M12 2.4 L14.9 8.3 L21.4 9.2 L16.7 13.8 L17.8 20.3 L12 17.2 L6.2 20.3 L7.3 13.8 L2.6 9.2 L9.1 8.3 Z" fill="url(#ci' + u + ')" stroke="#1e3a8a" stroke-width=".8" stroke-linejoin="round"/>'
          + '<path d="M12 6.2 L13.6 9.6 L17.2 10.1 L14.6 12.7 L15.2 16.3 L12 14.6 Z" fill="#eaf4ff" opacity=".55"/>';
        break;
      case 'celebration':
        s += '<defs>' + G('ci' + u, '<stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f97316"/>') + '</defs>'
          + '<path d="M4 20 L9.5 8.5 L15.5 14.5 Z" fill="url(#ci' + u + ')" stroke="#b45309" stroke-width=".8" stroke-linejoin="round"/>'
          + '<rect x="15" y="3.5" width="2.4" height="2.4" rx=".5" fill="#ec4899" transform="rotate(20 16.2 4.7)"/>'
          + '<circle cx="19.5" cy="8" r="1.5" fill="#22d3ee"/><circle cx="12.5" cy="4.5" r="1.3" fill="#a3e635"/>'
          + '<path d="M18.4 12.6 l.5 1.3 1.3 .5 -1.3 .5 -.5 1.3 -.5-1.3 -1.3-.5 1.3-.5 Z" fill="#fff6cf"/>';
        break;
      case 'mate_fx':
        s += '<defs>' + G('ci' + u, '<stop offset="0" stop-color="#c4b5fd"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#4c1d95"/>', { x2: 0, y2: 1 }) + '</defs>'
          + '<circle cx="12" cy="12" r="9" fill="url(#ci' + u + ')" stroke="#2e1065" stroke-width="1"/>'
          + '<circle cx="12" cy="12" r="3.2" fill="#0b0616"/>'
          + '<path d="M13 4 L11 11 L15 11 L10 20 L12 13 L8 13 Z" fill="#fde047" stroke="#b45309" stroke-width=".5" stroke-linejoin="round"/>';
        break;
      /* «الكلّ» — أربعُ مربّعاتٍ بأربعةِ ألوانِ الفئاتِ (زرُّ التصنيفِ الأوّل) */
      case 'all':
        s += '<rect x="3.2" y="3.2" width="7.6" height="7.6" rx="2" fill="#f5c451" stroke="#8a5f08" stroke-width=".8"/>'
          + '<rect x="13.2" y="3.2" width="7.6" height="7.6" rx="2" fill="#6366f1" stroke="#312e81" stroke-width=".8"/>'
          + '<rect x="3.2" y="13.2" width="7.6" height="7.6" rx="2" fill="#3b82f6" stroke="#1e3a8a" stroke-width=".8"/>'
          + '<rect x="13.2" y="13.2" width="7.6" height="7.6" rx="2" fill="#f97316" stroke="#9a3412" stroke-width=".8"/>'
          + '<circle cx="7" cy="7" r="1.5" fill="#fff6cf" opacity=".85"/><circle cx="17" cy="17" r="1.5" fill="#ffe0bd" opacity=".8"/>';
        break;
      default:
        s += '<circle cx="12" cy="12" r="8" fill="#64748b"/>';
    }
    return s + '</svg>';
  }

  /* ══ احتفالُ الترقّي — إعادةُ صناعةٍ كاملة (بلاغُ جوجو ٧) ══
     كانَ «سيّئًا جدًّا» وبلا صوت. الآن: خلفيّةٌ معتمةٌ تُبرِزُ البطاقةَ، مروحةُ
     أشعّةٍ دوّارةٌ، إكليلُ غارٍ مرسومٌ حولَ وسامٍ مُذهَّبٍ بحلقةِ أسنانٍ ونواةٍ
     داكنةٍ ورقمِ المستوى، ثمّ شريطُ خبرةٍ يمتلئُ، ولمعةٌ تعبرُ البطاقة — ومعَها
     **مؤثّرٌ صوتيٌّ حقيقيٌّ** (levelup.mp3، رخصةُ Mixkit المجانيّةِ للمؤثّرات).
     النصّان يأتيان مترجمَين من rewards-client فتبقى الوحدةُ خاليةً من اللغة. */
  function levelUp(level, title, sub) {
    try {
      if (_fxBusy) { _pendingLv = [level, title, sub]; return; }
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      _fxBusy = true;
      try { if (window.SFX && typeof SFX.levelUp === 'function') SFX.levelUp(); } catch (e) {}
      var ov = document.createElement('div'); ov.className = 'cos-fx-ov cos-fx-ov--keep';
      document.body.appendChild(ov);
      ov.appendChild(_mk('cos-lvbd', {}));
      if (!reduce) {
        _flash(ov, 'radial-gradient(circle at 50% 44%,rgba(255,210,74,.46),rgba(255,138,26,.14),transparent 62%)');
        _burst(ov, [[50, 44, 0], [30, 38, 0.28], [70, 40, 0.54]], 20, ['#ffd24a', '#fff2b0', '#ffae3a', '#ffffff']);
        _fall(ov, 24, 'cosfx-star', function (i) { return i % 2 ? '#fff2b0' : '#ffd24a'; }, true);
        _rise(ov, 14, 'cosfx-goldrain', null);
      }
      var u = ++_uid, gR = 'lvr' + u, gI = 'lvi' + u, gL = 'lvl' + u, gH = 'lvh' + u;
      /* حلقةُ أسنانٍ دقيقةٍ داخلَ الطوقِ الذهبيّ */
      var ticks = '';
      for (var t = 0; t < 24; t++) {
        ticks += '<rect x="69.1" y="27" width="1.8" height="' + (t % 2 ? 4 : 6.5) + '" rx=".9" fill="#ffe7a8" opacity="'
          + (t % 2 ? '.3' : '.62') + '" transform="rotate(' + (t * 15) + ' 70 70)"/>';
      }
      /* مروحةُ أشعّةٍ (١٢ مثلّثًا) تدورُ ببطءٍ خلفَ الوسام */
      var rays = '';
      for (var r = 0; r < 12; r++) {
        rays += '<path d="M70 70 L63 4 L77 4 Z" fill="#ffd24a" opacity="' + (r % 2 ? '.12' : '.2') + '" transform="rotate(' + (r * 30) + ' 70 70)"/>';
      }
      /* إكليلُ غارٍ: ستُّ ورقاتٍ يمينًا وستٌّ يسارًا حولَ الوسام */
      var leaf = function (a) {
        return '<g transform="rotate(' + a + ' 70 70)"><ellipse cx="70" cy="12" rx="4.4" ry="9.2" fill="url(#' + gL
          + ')" transform="rotate(-20 70 12)"/><path d="M70 21 C70 17 70 14 70 11" stroke="#8a6a12" stroke-width="1" fill="none" opacity=".7"/></g>';
      };
      var wreath = '';
      for (var k = 0; k < 6; k++) { wreath += leaf(196 + k * 12) + leaf(164 - k * 12); }

      var card = document.createElement('div');
      card.className = 'cos-levelup' + (reduce ? ' cos-levelup--still' : '');
      card.innerHTML =
        '<span class="cos-levelup__art"><svg viewBox="0 0 140 140" aria-hidden="true">'
        + '<defs>'
        + '<linearGradient id="' + gR + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d0"/><stop offset=".45" stop-color="#f0bb3c"/><stop offset="1" stop-color="#a5720c"/></linearGradient>'
        + '<radialGradient id="' + gI + '" cx="50%" cy="34%" r="72%"><stop offset="0" stop-color="#3a2a55"/><stop offset="1" stop-color="#140b26"/></radialGradient>'
        + '<linearGradient id="' + gL + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#c08f18"/></linearGradient>'
        + '<radialGradient id="' + gH + '" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#ffd24a" stop-opacity=".45"/><stop offset="1" stop-color="#ffd24a" stop-opacity="0"/></radialGradient>'
        + '</defs>'
        + '<g class="cos-lv__rays">' + rays + '</g>'
        + '<circle cx="70" cy="70" r="62" fill="url(#' + gH + ')"/>'
        + wreath
        + '<circle cx="70" cy="70" r="48" fill="none" stroke="#6d4705" stroke-width="10"/>'
        + '<circle cx="70" cy="70" r="48" fill="none" stroke="url(#' + gR + ')" stroke-width="5.5"/>'
        + '<circle cx="70" cy="70" r="43" fill="none" stroke="#2a1b0a" stroke-width="2" opacity=".65"/>'
        + '<circle cx="70" cy="70" r="36" fill="url(#' + gI + ')"/>'
        + ticks
        + '<text x="70" y="57" text-anchor="middle" dominant-baseline="central" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="12" letter-spacing="3" fill="#e0b85a">LV</text>'
        + '<text x="70" y="82" text-anchor="middle" dominant-baseline="central" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="36" fill="#ffe8a0">' + (Number(level) || 1) + '</text>'
        + '<path d="M70 96 l2.4 5 5.6 .8 -4 4 1 5.6 -5-2.7 -5 2.7 1-5.6 -4-4 5.6-.8 Z" fill="#ffd24a" opacity=".9"/>'
        + '</svg></span>'
        + '<span class="cos-levelup__ttl">' + (title || '') + '</span>'
        + '<span class="cos-levelup__bar"><i></i></span>'
        + '<span class="cos-levelup__sub">' + (sub || '') + '</span>'
        + '<span class="cos-levelup__sheen"></span>';
      ov.appendChild(card);
      setTimeout(function () { try { ov.remove(); } catch (e) {} _fxBusy = false; _drainFx(); }, reduce ? 2400 : 4000);
    } catch (e) { _fxBusy = false; }
  }

  /* ══ إسكاتُ SMIL عندَ تقليلِ الحركة ══
     الأيقوناتُ الجديدةُ في الرئيسيّةِ تتحرّكُ بـCSS فتُوقفُها قاعدةُ
     prefers-reduced-motion. أمّا ما بقيَ من <animate> (أيقونةُ التحدّياتِ ولمعةُ
     العملةِ الثابتة) فلا يستجيبُ لـCSS إطلاقًا — يُوقَفُ برمجيًّا فقط. نقصرُ
     المسحَ على الشاشةِ الرئيسيّةِ لتبقى رخيصةً، ونعيدُها إن رفعَ المستخدمُ
     الإعدادَ من دونِ إعادةِ تحميل. */
  function _smilSweep() {
    try {
      var mq = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
      var on = !!(mq && mq.matches);
      var nodes = document.querySelectorAll('#home-econ svg, .home-daily__chal, .amkh-coin-svg');
      Array.prototype.forEach.call(nodes, function (s) {
        try { if (on) s.pauseAnimations(); else s.unpauseAnimations(); } catch (e) {}
      });
    } catch (e) {}
  }
  try {
    var _mqRM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
    if (_mqRM) {
      var _onRM = function () { _smilSweep(); setTimeout(_smilSweep, 600); };
      if (_mqRM.addEventListener) _mqRM.addEventListener('change', _onRM);
      else if (_mqRM.addListener) _mqRM.addListener(_onRM);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(_smilSweep, 120); });
    else setTimeout(_smilSweep, 120);
  } catch (e) {}

  window.amkhCos = {
    frameHTML: frameHTML,
    badgeHTML: badgeHTML,
    bgHTML: bgHTML,
    bgSceneSVG: bgSceneSVG,
    avatarLayers: avatarLayers,
    paint: paint,
    paintName: paintName,
    bannerHTML: bannerHTML,
    paintBanner: paintBanner,
    self: self,
    celebrate: celebrate,
    mateFx: mateFx,
    thumb: thumb,
    coin: coin,
    catIcon: catIcon,
    levelUp: levelUp,
    smilSweep: _smilSweep,
    FRAME: FRAME, BADGE: BADGE, BG: BG, BG_SCENE: BG_SCENE,
  };
})();
