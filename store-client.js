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
    _bg: function (ctx, W, H, a) {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(28,15,48,' + a + ')'); g.addColorStop(0.5, 'rgba(18,9,34,' + a + ')');
      g.addColorStop(1, 'rgba(7,3,16,' + a + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
    _coin: function (ctx, x, y, r, rot, a) {
      ctx.save(); ctx.translate(x, y);
      var flat = Math.max(0.14, Math.abs(Math.cos(rot)));           /* دورانُ عملةٍ حول محورها */
      ctx.rotate(Math.sin(rot) * 0.25); ctx.scale(flat, 1);
      var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,247,205,' + a + ')'); g.addColorStop(0.5, 'rgba(245,196,81,' + a + ')');
      g.addColorStop(1, 'rgba(170,116,38,' + a + ')');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.14); ctx.strokeStyle = 'rgba(120,78,20,' + (a * 0.7) + ')'; ctx.stroke();
      ctx.restore();
    },
    _door: function (ctx, x, w, H, gapRight) {
      if (w <= 0) return;
      var g = ctx.createLinearGradient(x, 0, x + w, 0);
      if (gapRight) { g.addColorStop(0, '#0c0620'); g.addColorStop(0.8, '#20132f'); g.addColorStop(1, '#301d46'); }
      else { g.addColorStop(0, '#301d46'); g.addColorStop(0.2, '#20132f'); g.addColorStop(1, '#0c0620'); }
      ctx.fillStyle = g; ctx.fillRect(x, 0, w, H);
      var sx = gapRight ? x + w : x, lw = Math.max(4, w * 0.06);       /* لُحمةٌ ذهبيّةٌ متوهّجةٌ عندَ فتحةِ الخزنة */
      var eg = ctx.createLinearGradient(sx - lw, 0, sx + lw, 0);
      eg.addColorStop(0, 'rgba(245,196,81,0)'); eg.addColorStop(0.5, 'rgba(255,230,155,0.6)'); eg.addColorStop(1, 'rgba(245,196,81,0)');
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = eg; ctx.fillRect(sx - lw, 0, lw * 2, H); ctx.restore();
    },
    play: function () {
      if (!this._prep()) return;
      var ctx = this._ctx, cv = this._cv, self = this;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      cancelAnimationFrame(this._raf);
      var W = cv.width, H = cv.height, cx = W / 2, cy = H * 0.46, R = Math.hypot(W, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      this._bg(ctx, W, H, 1);
      var coins = []; for (var i = 0; i < (reduce ? 0 : 24); i++) {
        coins.push({ a: -1.5708 + (Math.random() - 0.5) * 4.6, d: 0.42 + Math.random() * 0.5,
          r: R * (0.012 + Math.random() * 0.02), rot: Math.random() * 6.28, vr: 8 + Math.random() * 22, t: Math.random() * 0.22 });
      }
      if (reduce) { var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
        rg.addColorStop(0, 'rgba(255,220,120,0.55)'); rg.addColorStop(1, 'rgba(255,220,120,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); return; }
      var DUR = 2400, t0 = performance.now(), ease = function (x) { return 1 - Math.pow(1 - x, 3); };
      var step = function (now) {
        var p = Math.min(1, (now - t0) / DUR);
        self._bg(ctx, W, H, 1);
        var open = ease(Math.min(1, Math.max(0, (p - 0.08) / 0.5))), gap = open * (W * 0.64);
        var lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.26 + 0.4 * open)), la = 0.14 + 0.86 * open;
        lg.addColorStop(0, 'rgba(255,249,214,' + la + ')'); lg.addColorStop(0.35, 'rgba(255,209,110,' + (la * 0.85) + ')');
        lg.addColorStop(0.7, 'rgba(214,146,48,' + (la * 0.4) + ')'); lg.addColorStop(1, 'rgba(110,64,18,0)');
        ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.translate(cx, cy); ctx.rotate((now - t0) * 0.00035);
        for (var k = 0; k < 12; k++) { ctx.rotate(0.5236); ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.lineTo(R * 0.62, -R * 0.018); ctx.lineTo(R * 0.62, R * 0.018); ctx.closePath();
          ctx.fillStyle = 'rgba(255,226,142,' + (0.06 * open) + ')'; ctx.fill(); }
        ctx.restore();
        var dw = (W - gap) / 2; self._door(ctx, 0, dw, H, true); self._door(ctx, W - dw, dw, H, false);
        for (var c = 0; c < coins.length; c++) { var o = coins[c], tp = (p - 0.14 - o.t) / (0.86 - o.t);
          if (tp <= 0) continue; tp = Math.min(1, tp);
          var dist = R * o.d * ease(tp), x = cx + Math.cos(o.a) * dist, y = cy + Math.sin(o.a) * dist + R * 0.2 * tp * tp;
          self._coin(ctx, x, y, o.r, o.rot + tp * o.vr, tp < 0.82 ? 1 : (1 - (tp - 0.82) / 0.18)); }
        ctx.globalCompositeOperation = 'screen';
        for (var s = 0; s < 10; s++) { var sa = Math.random() * 6.2832, sr = R * (0.04 + Math.random() * 0.42) * open;
          ctx.fillStyle = 'rgba(255,246,205,' + (0.3 + Math.random() * 0.45) + ')';
          ctx.beginPath(); ctx.arc(cx + Math.cos(sa) * sr, cy + Math.sin(sa) * sr * 0.95, R * (0.004 + Math.random() * 0.01), 0, 6.2832); ctx.fill(); }
        ctx.globalCompositeOperation = 'source-over';
        if (p < 1) self._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    },
    stop: function () { cancelAnimationFrame(this._raf); this._raf = 0; }
  };

  /* معايناتٌ حيّةٌ مرسومةٌ (SVG متحرّكٌ بلا إيموجي) — لكلِّ عنصرٍ هُويّتُه الخاصّة،
     ونفسُها ستُركَّبُ حولَ الأفاتارِ في المرحلةِ ٣. viewBox موحّد 0 0 80 80. */
  function art(it) {
    var I = esc(it.id);
    function A(inner) { return '<svg viewBox="0 0 80 80" class="st-svg">' + inner + '</svg>'; }
    var AV = '<circle cx="40" cy="41" r="16" fill="#140b26"/><circle cx="40" cy="33" r="5.4" fill="#3a2b55"/><path d="M28 52a12 11 0 0 1 24 0z" fill="#3a2b55"/>';
    switch (it.id) {
      /* ═══ الإطارات (حلقةٌ حولَ الأفاتار) ═══ */
      case 'frame_gold': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#f5c451"/><stop offset="1" stop-color="#a9741f"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="5"/><circle cx="40" cy="40" r="26" fill="none" stroke="#fff8dc" stroke-width="5" stroke-linecap="round" stroke-dasharray="16 200"><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="2.8s" repeatCount="indefinite"/></circle>' + AV);
      case 'frame_neon': return A('<defs><filter id="b' + I + '" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter></defs><circle cx="40" cy="40" r="26" fill="none" stroke="#26f0ff" stroke-width="5" filter="url(#b' + I + ')" opacity=".7"><animate attributeName="stroke" values="#26f0ff;#c14bff;#26f0ff" dur="2.6s" repeatCount="indefinite"/></circle><circle cx="40" cy="40" r="26" fill="none" stroke="#8ff7ff" stroke-width="2.4" stroke-dasharray="7 9" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="0" to="32" dur="1.1s" repeatCount="indefinite"/><animate attributeName="stroke" values="#8ff7ff;#e4a6ff;#8ff7ff" dur="2.6s" repeatCount="indefinite"/></circle>' + AV);
      case 'frame_flame': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d2e"/><stop offset=".55" stop-color="#ff8a1e"/><stop offset="1" stop-color="#ffd24a"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="5"/><g fill="#ffcf5a"><path d="M40 6l3 8-3 3-3-3z"><animate attributeName="opacity" values=".4;1;.4" dur=".8s" repeatCount="indefinite"/></path><path d="M63 22l2 7-4 1-1-4z"><animate attributeName="opacity" values="1;.4;1" dur=".7s" repeatCount="indefinite"/></path><path d="M17 22l3 5-2 3-3-3z"><animate attributeName="opacity" values=".5;1;.5" dur=".9s" repeatCount="indefinite"/></path></g>' + AV);
      case 'frame_frost': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dff6ff"/><stop offset=".5" stop-color="#7fd4ff"/><stop offset="1" stop-color="#3a7fd0"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="5"/><g stroke="#eaf9ff" stroke-width="1.6" stroke-linecap="round"><path d="M40 12v6M37 15h6M62 26l-4 3M18 26l4 3"/></g><circle cx="40" cy="40" r="26" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="4 210" stroke-linecap="round" opacity=".9"><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="3.4s" repeatCount="indefinite"/></circle>' + AV);
      case 'frame_royal': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#c9922f"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="5.5"/><g fill="#b46bff"><circle cx="40" cy="14" r="3"/><circle cx="66" cy="40" r="3"/><circle cx="40" cy="66" r="3"/><circle cx="14" cy="40" r="3"/></g><g fill="#fff"><circle cx="40" cy="14" r="1"><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="66" cy="40" r="1"><animate attributeName="opacity" values="0;1;0" dur="1.6s" begin=".5s" repeatCount="indefinite"/></circle></g>' + AV);
      case 'frame_ocean': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ff0d8"/><stop offset="1" stop-color="#1f8fb0"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="5"/><circle cx="40" cy="40" r="26" fill="none" stroke="#d6fff6" stroke-width="2" stroke-dasharray="5 7"><animate attributeName="stroke-dashoffset" from="24" to="0" dur="2s" repeatCount="indefinite"/></circle><circle cx="40" cy="40" r="20" fill="none" stroke="#8ff0e0" stroke-width="1"><animate attributeName="r" values="20;26;20" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".55;0;.55" dur="2.4s" repeatCount="indefinite"/></circle>' + AV);
      case 'frame_aurora': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5effc8"><animate attributeName="stop-color" values="#5effc8;#7c5cff;#ff6ad5;#5effc8" dur="4s" repeatCount="indefinite"/></stop><stop offset="1" stop-color="#7c5cff"><animate attributeName="stop-color" values="#7c5cff;#ff6ad5;#5effc8;#7c5cff" dur="4s" repeatCount="indefinite"/></stop></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="6"/><circle cx="40" cy="40" r="26" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="10 210" stroke-linecap="round" opacity=".8"><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="3s" repeatCount="indefinite"/></circle>' + AV);
      /* ═══ الخلفيّات (مشهدٌ داخلَ مستطيلٍ مستدير) ═══ */
      case 'bg_aurora': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><linearGradient id="a' + I + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1fd6a6"/><stop offset=".5" stop-color="#5b8cff"/><stop offset="1" stop-color="#b25bff"/></linearGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="#0b1226"/><g fill="#eaf2ff"><circle cx="20" cy="20" r="1"/><circle cx="58" cy="18" r="1.2"/><circle cx="40" cy="26" r=".9"/><circle cx="64" cy="34" r="1"/></g><path fill="url(#a' + I + ')" opacity=".85" d="M8 44 Q28 30 44 42 T72 40 V72 H8 Z"><animate attributeName="d" values="M8 44 Q28 30 44 42 T72 40 V72 H8 Z;M8 40 Q28 46 44 36 T72 44 V72 H8 Z;M8 44 Q28 30 44 42 T72 40 V72 H8 Z" dur="4s" repeatCount="indefinite"/></path></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-opacity=".12"/>');
      case 'bg_nebula': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><radialGradient id="n' + I + '" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#c56bff"/><stop offset=".5" stop-color="#5b2a9e"/><stop offset="1" stop-color="#120826"/></radialGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#n' + I + ')"/><g fill="#fff"><circle cx="24" cy="24" r="1"><animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></circle><circle cx="54" cy="30" r="1.2"><animate attributeName="opacity" values="1;0;1" dur="2.4s" repeatCount="indefinite"/></circle><circle cx="46" cy="52" r=".9"><animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite"/></circle><circle cx="30" cy="50" r="1"><animate attributeName="opacity" values=".3;1;.3" dur="2.2s" repeatCount="indefinite"/></circle></g></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-opacity=".12"/>');
      case 'bg_sunset': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><linearGradient id="s' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9d5c"/><stop offset=".5" stop-color="#ff6b9d"/><stop offset="1" stop-color="#6a3d8f"/></linearGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#s' + I + ')"/><circle cx="40" cy="50" r="12" fill="#fff3c4"><animate attributeName="cy" values="52;46;52" dur="4s" repeatCount="indefinite"/></circle><rect x="8" y="58" width="64" height="14" fill="#3a1f4d" opacity=".55"/></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-opacity=".14"/>');
      case 'bg_forest': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><linearGradient id="f' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3c0"/><stop offset="1" stop-color="#3f7d55"/></linearGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#f' + I + ')"/><g fill="#265c3e"><path d="M22 60l6-18 6 18z"/><path d="M40 62l7-22 7 22z"/><path d="M14 62l5-14 5 14z"/></g><rect x="8" y="58" width="64" height="14" fill="#1f4a33"/></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-opacity=".12"/>');
      case 'bg_royal': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><linearGradient id="r' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a1d6e"/><stop offset="1" stop-color="#1a0b34"/></linearGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#r' + I + ')"/><g fill="none" stroke="#e9c46a" stroke-width="1.4" opacity=".8"><circle cx="40" cy="40" r="16"/><path d="M40 24v32M24 40h32"/><circle cx="40" cy="40" r="6"/></g><rect x="8" y="8" width="30" height="64" fill="#fff" opacity=".06"><animate attributeName="x" values="-30;72" dur="3.5s" repeatCount="indefinite"/></rect></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#e9c46a" stroke-opacity=".4"/>');
      /* ═══ الشارات ═══ */
      case 'badge_star': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset="1" stop-color="#f5c451"/></linearGradient></defs><g transform="translate(40 40)"><path fill="url(#g' + I + ')" d="M0 -22l6.5 15 16.5 1.8-12 11 3.6 16.4L0 24l-14.6 8.2L-7 16.8l-12-11 16.5-1.8z"><animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="1.8s" repeatCount="indefinite"/></path></g>');
      case 'badge_crown': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#c9922f"/></linearGradient></defs><path fill="url(#g' + I + ')" d="M16 54l-4-28 14 12 10-18 10 18 14-12-4 28z"/><rect x="16" y="54" width="48" height="7" rx="2" fill="url(#g' + I + ')"/><g fill="#ff5da2"><circle cx="26" cy="46" r="2"/><circle cx="40" cy="42" r="2.4"/><circle cx="54" cy="46" r="2"/></g><circle cx="40" cy="42" r="1" fill="#fff"><animate attributeName="opacity" values="0;1;0" dur="1.4s" repeatCount="indefinite"/></circle>');
      case 'badge_bolt': return A('<defs><filter id="b' + I + '"><feGaussianBlur stdDeviation="1.6"/></filter></defs><path fill="#ffe14a" filter="url(#b' + I + ')" d="M44 8L22 44h14l-6 28 28-40H44z"><animate attributeName="opacity" values=".3;.85;.3" dur=".9s" repeatCount="indefinite"/></path><path fill="#fff7c4" d="M44 8L22 44h14l-6 28 28-40H44z"/>');
      case 'badge_shield': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fb4ff"/><stop offset="1" stop-color="#3b57c7"/></linearGradient><clipPath id="c' + I + '"><path d="M40 10l24 8v20c0 16-12 26-24 32-12-6-24-16-24-32V18z"/></clipPath></defs><path fill="url(#g' + I + ')" d="M40 10l24 8v20c0 16-12 26-24 32-12-6-24-16-24-32V18z"/><g clip-path="url(#c' + I + ')"><rect x="0" y="0" width="24" height="80" fill="#fff" opacity=".25"><animate attributeName="x" values="-24;80" dur="2.6s" repeatCount="indefinite"/></rect></g><path d="M40 26v26M28 36h24" stroke="#eaf1ff" stroke-width="2.4" stroke-linecap="round"/>');
      case 'badge_flame': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d2e"/><stop offset=".6" stop-color="#ff8a1e"/><stop offset="1" stop-color="#ffd24a"/></linearGradient></defs><path fill="url(#g' + I + ')" d="M40 10c10 12 16 20 16 30a16 16 0 0 1-32 0c0-6 3-10 6-14 2 4 4 5 6 5-2-8 0-16-2-21z"><animate attributeName="opacity" values=".85;1;.85" dur=".9s" repeatCount="indefinite"/></path><path fill="#ffe9a8" d="M40 34c4 5 6 9 6 13a6 6 0 0 1-12 0c0-3 2-6 6-13z"><animate attributeName="opacity" values="1;.6;1" dur=".7s" repeatCount="indefinite"/></path>');
      /* ═══ احتفالات الفوز ═══ */
      case 'cel_confetti': return A('<g><rect x="20" y="10" width="5" height="8" rx="1" fill="#ff5da2" transform="rotate(20 22 14)"><animate attributeName="y" values="-8;72" dur="2.2s" repeatCount="indefinite"/></rect><rect x="38" y="0" width="5" height="8" rx="1" fill="#5ad1ff"><animate attributeName="y" values="-14;72" dur="2.6s" repeatCount="indefinite"/></rect><rect x="54" y="6" width="5" height="8" rx="1" fill="#ffd24a" transform="rotate(-15 56 10)"><animate attributeName="y" values="-10;72" dur="2s" repeatCount="indefinite"/></rect><rect x="30" y="4" width="5" height="8" rx="1" fill="#6fffa8"><animate attributeName="y" values="-20;72" dur="2.8s" repeatCount="indefinite"/></rect><rect x="46" y="12" width="5" height="8" rx="1" fill="#c17bff"><animate attributeName="y" values="-6;72" dur="2.4s" repeatCount="indefinite"/></rect></g>');
      case 'cel_fireworks': return A('<g transform="translate(40 40)"><g><animateTransform attributeName="transform" type="scale" values="0.2;1.1" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="indefinite"/><g stroke="#ffd24a" stroke-width="2.4" stroke-linecap="round"><path d="M0 0V-24"/><path d="M0 0h24"/><path d="M0 0v24"/><path d="M0 0h-24"/><path d="M0 0l17-17"/><path d="M0 0l-17 17"/><path d="M0 0l17 17"/><path d="M0 0l-17-17"/></g></g></g>');
      case 'cel_petals': return A('<g fill="#ff9ec4"><g><animateTransform attributeName="transform" type="translate" values="0 -12;0 72" dur="3s" repeatCount="indefinite"/><ellipse cx="26" cy="0" rx="4" ry="6" transform="rotate(20 26 0)"/></g><g><animateTransform attributeName="transform" type="translate" values="0 -24;0 72" dur="3.6s" repeatCount="indefinite"/><ellipse cx="44" cy="0" rx="4" ry="6" transform="rotate(-15 44 0)"/></g><g><animateTransform attributeName="transform" type="translate" values="0 -6;0 72" dur="2.8s" repeatCount="indefinite"/><ellipse cx="58" cy="0" rx="4" ry="6"/></g></g>');
      case 'cel_stars': return A('<g><g><animateTransform attributeName="transform" type="translate" values="-20 -20;70 70" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite"/><path d="M20 20l14-6-6 14z" fill="#fff3b0"/><line x1="20" y1="20" x2="8" y2="8" stroke="#fff3b0" stroke-width="2"/></g><g fill="#fff"><circle cx="54" cy="24" r="1.4"><animate attributeName="opacity" values="0;1;0" dur="1.4s" repeatCount="indefinite"/></circle><circle cx="30" cy="52" r="1.2"><animate attributeName="opacity" values="1;0;1" dur="1.6s" repeatCount="indefinite"/></circle></g></g>');
      /* ═══ مؤثّرات كش-مات ═══ */
      case 'fx_shatter': return A('<g stroke="#bfe6ff" stroke-width="2" fill="none"><path d="M40 40L16 12M40 40l28-6M40 40l-8 30M40 40l24 24M40 40l-26 8"/></g><g fill="#dff1ff"><path d="M40 40l-10-12-2 12z"><animate attributeName="opacity" values=".4;.9;.4" dur="1s" repeatCount="indefinite"/></path><path d="M40 40l12-6 2 10z"><animate attributeName="opacity" values=".9;.4;.9" dur="1.2s" repeatCount="indefinite"/></path></g><circle cx="40" cy="40" r="4" fill="#fff"/>');
      case 'fx_lightning': return A('<defs><filter id="b' + I + '"><feGaussianBlur stdDeviation="2"/></filter></defs><path filter="url(#b' + I + ')" fill="#8fd4ff" d="M46 6L20 42h14l-6 32 30-44H42z"><animate attributeName="opacity" values=".2;.9;.2;.7;.2" dur="1.3s" repeatCount="indefinite"/></path><path fill="#fff" d="M46 6L20 42h14l-6 32 30-44H42z"><animate attributeName="opacity" values="1;.4;1;.6;1" dur="1.3s" repeatCount="indefinite"/></path>');
      case 'fx_goldrain': return A('<g stroke="#ffd24a" stroke-width="3" stroke-linecap="round"><line x1="20" x2="20" y1="0" y2="10"><animate attributeName="y1" values="-12;72" dur="1.2s" repeatCount="indefinite"/><animate attributeName="y2" values="-2;82" dur="1.2s" repeatCount="indefinite"/></line><line x1="32" x2="32" y1="0" y2="10"><animate attributeName="y1" values="-24;72" dur="1.5s" repeatCount="indefinite"/><animate attributeName="y2" values="-14;82" dur="1.5s" repeatCount="indefinite"/></line><line x1="44" x2="44" y1="0" y2="10"><animate attributeName="y1" values="-6;72" dur="1s" repeatCount="indefinite"/><animate attributeName="y2" values="4;82" dur="1s" repeatCount="indefinite"/></line><line x1="54" x2="54" y1="0" y2="10"><animate attributeName="y1" values="-18;72" dur="1.4s" repeatCount="indefinite"/><animate attributeName="y2" values="-8;82" dur="1.4s" repeatCount="indefinite"/></line><line x1="62" x2="62" y1="0" y2="10"><animate attributeName="y1" values="-10;72" dur="1.3s" repeatCount="indefinite"/><animate attributeName="y2" values="0;82" dur="1.3s" repeatCount="indefinite"/></line></g>');
      case 'fx_seasonal_snow': return A('<g stroke="#eaf6ff" stroke-width="1.4" stroke-linecap="round" fill="none"><g><animateTransform attributeName="transform" type="translate" values="0 -14;0 74" dur="3s" repeatCount="indefinite"/><path d="M24 -6v12M18 0h12M20 -4l8 8M28 -4l-8 8"/></g><g><animateTransform attributeName="transform" type="translate" values="0 -28;0 74" dur="3.6s" repeatCount="indefinite"/><path d="M44 -6v12M38 0h12M40 -4l8 8M48 -4l-8 8"/></g><g><animateTransform attributeName="transform" type="translate" values="0 -6;0 74" dur="2.8s" repeatCount="indefinite"/><path d="M58 -6v12M52 0h12M54 -4l8 8M62 -4l-8 8"/></g></g>');
    }
    if (it.type === 'frame') return A('<circle cx="40" cy="40" r="26" fill="none" stroke="currentColor" stroke-width="5"/>' + AV);
    if (it.type === 'background') return A('<rect x="8" y="8" width="64" height="64" rx="14" fill="currentColor" opacity=".85"/>');
    if (it.type === 'badge') return A('<path fill="currentColor" d="M40 8l8 17 18 2-13 13 3 18-16-8-16 8 3-18L14 27l18-2z"/>');
    if (it.type === 'celebration') return A('<g stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M40 40L22 18"/><path d="M40 40l22-16"/><path d="M40 40l18 24"/><path d="M40 40L18 58"/></g>');
    return A('<path fill="currentColor" d="M45 8L20 44h15l-8 28 30-40H42z"/>');
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
