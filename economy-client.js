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
