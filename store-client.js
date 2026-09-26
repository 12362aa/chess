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

  /* أنواعُ العناصرِ: اسمٌ للنوعِ + وصفٌ لِما يفعلُه وأينَ يظهرُ — ثنائيُّ اللغة.
     يُستعملُ في رقاقاتِ التصفيةِ وفي بطاقةِ تفاصيلِ العنصرِ عندَ الضغط. */
  var TYPE = {
    frame:       { ar: 'إطارات',   en: 'Frames',       one: { ar: 'إطار',     en: 'Frame' },
      desc: { ar: 'طوقٌ متحرّكٌ يحيطُ بصورتِك، ويراه كلُّ اللاعبين حولَك في الصدارةِ والدردشةِ والمباريات.',
              en: 'An animated ring around your avatar that every player sees — on the leaderboard, in chat and in games.' } },
    background:  { ar: 'خلفيّات',  en: 'Backgrounds',  one: { ar: 'خلفيّة',   en: 'Background' },
      desc: { ar: 'مشهدٌ حيٌّ خلفَ صورتِك يظهرُ للجميعِ أينما ظهرَ اسمُك.',
              en: 'A living scene behind your avatar, shown to everyone wherever your name appears.' } },
    badge:       { ar: 'شارات',    en: 'Badges',       one: { ar: 'شارة',     en: 'Badge' },
      desc: { ar: 'رمزٌ صغيرٌ يلمعُ بجانبِ اسمِك في كلِّ مكان.',
              en: 'A small emblem that shines next to your name everywhere.' } },
    celebration: { ar: 'احتفالات', en: 'Celebrations', one: { ar: 'احتفال',   en: 'Celebration' },
      desc: { ar: 'مشهدُ فرحٍ ينفجرُ على الشاشةِ لحظةَ فوزِك بالمباراة.',
              en: 'A burst of joy across the screen the moment you win a game.' } },
    mate_fx:     { ar: 'مؤثّرات',  en: 'Effects',      one: { ar: 'مؤثّر',    en: 'Effect' },
      desc: { ar: 'مؤثّرٌ مذهلٌ ينطلقُ عندَ إعلانِ كش-مات على خصمِك.',
              en: 'A striking effect that fires when you deliver checkmate.' } }
  };
  var TYPE_ORDER = ['frame', 'background', 'badge', 'celebration', 'mate_fx'];

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
      /* ═══ إطاراتٌ جديدةٌ بأشكالٍ مميّزةٍ (لا نسخٌ ملوّنةٌ من بعضها) ═══ */
      case 'frame_shadow': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9b8ff"/><stop offset="1" stop-color="#2a1348"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="5.5"/><g fill="#7a5fc0"><circle cx="40" cy="14" r="4"><animate attributeName="r" values="4;6.5;4" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".5;.95;.5" dur="2s" repeatCount="indefinite"/></circle><circle cx="66" cy="52" r="3"><animate attributeName="r" values="3;5;3" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;.4;.9" dur="2.4s" repeatCount="indefinite"/></circle><circle cx="15" cy="47" r="3"><animate attributeName="r" values="3;5;3" dur="1.8s" repeatCount="indefinite"/></circle></g><circle cx="40" cy="40" r="26" fill="none" stroke="#d8caff" stroke-width="1.6" stroke-dasharray="3 9" opacity=".6"><animateTransform attributeName="transform" type="rotate" from="360 40 40" to="0 40 40" dur="5s" repeatCount="indefinite"/></circle>' + AV);
      case 'frame_emerald': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b6ffd6"/><stop offset=".5" stop-color="#2fd07a"/><stop offset="1" stop-color="#0a7a44"/></linearGradient></defs><polygon points="40,11 57,21 67,40 57,59 40,69 23,59 13,40 23,21" fill="none" stroke="url(#g' + I + ')" stroke-width="5.5" stroke-linejoin="round"/><polygon points="40,19 51,26 57,40 51,54 40,61 29,54 23,40 29,26" fill="none" stroke="#e8fff2" stroke-width="1.3" opacity=".65"/><polygon points="40,11 57,21 67,40 57,59 40,69 23,59 13,40 23,21" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-dasharray="9 190" stroke-linecap="round" opacity=".95"><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="3s" repeatCount="indefinite"/></polygon>' + AV);
      case 'frame_galaxy': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b48bff"/><stop offset=".5" stop-color="#4a5cff"/><stop offset="1" stop-color="#1a2a8f"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="5"/><g><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="4.5s" repeatCount="indefinite"/><circle cx="40" cy="14" r="3.6" fill="#fff"/><circle cx="66" cy="46" r="2.6" fill="#c9b8ff"/><circle cx="18" cy="52" r="2.2" fill="#8fd4ff"/></g><g fill="#fff"><circle cx="30" cy="24" r="1"><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="54" cy="28" r="1.1"><animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite"/></circle><circle cx="52" cy="56" r="1"><animate attributeName="opacity" values=".3;1;.3" dur="1.8s" repeatCount="indefinite"/></circle></g>' + AV);
      case 'frame_phoenix': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff2d00"/><stop offset=".5" stop-color="#ff8a1e"/><stop offset="1" stop-color="#ffd24a"/></linearGradient></defs><circle cx="40" cy="40" r="23" fill="none" stroke="url(#g' + I + ')" stroke-width="4.5"/><g fill="url(#g' + I + ')"><path d="M17 42 Q4 31 8 15 Q19 24 24 35 Q20 39 17 42Z"><animate attributeName="opacity" values=".7;1;.7" dur="1.1s" repeatCount="indefinite"/></path><path d="M63 42 Q76 31 72 15 Q61 24 56 35 Q60 39 63 42Z"><animate attributeName="opacity" values="1;.7;1" dur="1.1s" repeatCount="indefinite"/></path></g><g fill="#ffd98a"><circle cx="34" cy="70" r="1.6"><animate attributeName="cy" values="72;52" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.4s" repeatCount="indefinite"/></circle><circle cx="47" cy="70" r="1.3"><animate attributeName="cy" values="74;50" dur="1.9s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.9s" repeatCount="indefinite"/></circle></g>' + AV);
      case 'frame_sakura': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd6ea"/><stop offset="1" stop-color="#ff5fa2"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="4.5"/><g fill="#ff9ec4"><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="8s" repeatCount="indefinite"/><ellipse cx="40" cy="14" rx="3.4" ry="5.2"/><ellipse cx="62" cy="27" rx="3.4" ry="5.2" transform="rotate(60 62 27)"/><ellipse cx="62" cy="53" rx="3.4" ry="5.2" transform="rotate(120 62 53)"/><ellipse cx="40" cy="66" rx="3.4" ry="5.2"/><ellipse cx="18" cy="53" rx="3.4" ry="5.2" transform="rotate(60 18 53)"/><ellipse cx="18" cy="27" rx="3.4" ry="5.2" transform="rotate(120 18 27)"/></g><g fill="#ffc2dd"><ellipse cx="28" cy="6" rx="2.4" ry="3.6"><animate attributeName="cy" values="4;74" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="3s" repeatCount="indefinite"/></ellipse><ellipse cx="54" cy="0" rx="2" ry="3"><animate attributeName="cy" values="-2;74" dur="3.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="3.6s" repeatCount="indefinite"/></ellipse></g>' + AV);
      /* ═══ شاراتٌ جديدة ═══ */
      case 'badge_diamond': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cff9ff"/><stop offset="1" stop-color="#2fb6d8"/></linearGradient></defs><g><animate attributeName="opacity" values="1;.72;1" dur="2s" repeatCount="indefinite"/><path fill="url(#g' + I + ')" d="M40 12 L60 32 L40 68 L20 32 Z"/><path fill="#eafcff" opacity=".5" d="M40 12 L60 32 L40 32 Z"/><path stroke="#eafcff" stroke-width="1.2" opacity=".7" fill="none" d="M20 32h40M40 12v56M28 22 40 32 52 22"/></g>');
      case 'badge_skull': return A('<g fill="#e6e9f2"><path d="M24 36a16 16 0 0 1 32 0v13a8 8 0 0 1-8 8h-1v6h-4v-6h-6v6h-4v-6h-1a8 8 0 0 1-8-8Z"/></g><g fill="#1a1f2b"><circle cx="33" cy="41" r="4.6"><animate attributeName="r" values="4.6;3;4.6" dur="2.6s" repeatCount="indefinite"/></circle><circle cx="47" cy="41" r="4.6"><animate attributeName="r" values="4.6;3;4.6" dur="2.6s" repeatCount="indefinite"/></circle><path d="M40 48l3.4 8h-6.8z"/></g>');
      case 'badge_moon': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eaf1ff"/><stop offset="1" stop-color="#9fb4e0"/></linearGradient></defs><path fill="url(#g' + I + ')" d="M54 14a28 28 0 1 0 0 52 22 22 0 0 1 0-52Z"/><g fill="#fff"><circle cx="30" cy="24" r="1.5"><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="24" cy="42" r="1.2"><animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite"/></circle><circle cx="34" cy="56" r="1"><animate attributeName="opacity" values=".2;1;.2" dur="1.8s" repeatCount="indefinite"/></circle></g>');
      case 'badge_gem': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5b8ff"/><stop offset="1" stop-color="#8a2be2"/></linearGradient></defs><g><animate attributeName="opacity" values="1;.7;1" dur="1.8s" repeatCount="indefinite"/><polygon fill="url(#g' + I + ')" points="26,20 54,20 68,40 54,60 26,60 12,40"/><polygon fill="#fbeaff" opacity=".45" points="26,20 54,20 40,40"/><path stroke="#fbeaff" stroke-width="1.2" fill="none" opacity=".7" d="M12 40h56M26 20 40 40 54 20M26 60 40 40 54 60"/></g>');
      case 'badge_heart': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8fb0"/><stop offset="1" stop-color="#ff2d6b"/></linearGradient></defs><path fill="url(#g' + I + ')" d="M40 64C15 47 17 24 34 24c5 0 6 6 6 6s1-6 6-6c17 0 19 23-6 40Z"><animate attributeName="opacity" values="1;.7;1" dur="1.1s" repeatCount="indefinite"/></path>');
      /* ═══ خلفيّاتٌ جديدة (مشهدٌ داخلَ مستطيلٍ مستدير) ═══ */
      case 'bg_ocean_deep': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a6ea0"/><stop offset="1" stop-color="#012036"/></linearGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#g' + I + ')"/><g fill="#bfeaff"><circle cx="26" cy="60" r="2"><animate attributeName="cy" values="66;10" dur="3.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.8;0" dur="3.4s" repeatCount="indefinite"/></circle><circle cx="46" cy="60" r="1.4"><animate attributeName="cy" values="70;12" dur="4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.7;0" dur="4s" repeatCount="indefinite"/></circle><circle cx="58" cy="60" r="1.8"><animate attributeName="cy" values="68;14" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.9;0" dur="3s" repeatCount="indefinite"/></circle></g><path fill="#9fe0ff" opacity=".14" d="M8 20 L40 8 L34 30 Z"/></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-opacity=".12"/>');
      case 'bg_volcano': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0a0a"/><stop offset="1" stop-color="#1a0505"/></linearGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#g' + I + ')"/><path fill="#2a0808" d="M8 56 L28 34 L40 46 L52 30 L72 56 Z"/><path fill="#ff5a1e" opacity=".9" d="M8 60 L26 46 L40 54 L54 42 L72 60 Z"><animate attributeName="opacity" values=".7;1;.7" dur="1.6s" repeatCount="indefinite"/></path><g fill="#ffb347"><circle cx="30" cy="40" r="1.4"><animate attributeName="cy" values="42;14" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2.2s" repeatCount="indefinite"/></circle><circle cx="52" cy="38" r="1.2"><animate attributeName="cy" values="40;12" dur="2.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2.6s" repeatCount="indefinite"/></circle></g></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#ff6a2a" stroke-opacity=".3"/>');
      case 'bg_galaxy': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><radialGradient id="g' + I + '" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#7a4fd0"/><stop offset=".6" stop-color="#2a1a6a"/><stop offset="1" stop-color="#0a0620"/></radialGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#g' + I + ')"/><g><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="9s" repeatCount="indefinite"/><path fill="none" stroke="#b48bff" stroke-width="2.4" opacity=".55" d="M40 40 Q56 30 58 44 Q60 60 40 58"/><path fill="none" stroke="#8fd4ff" stroke-width="2.4" opacity=".55" d="M40 40 Q24 50 22 36 Q20 20 40 22"/></g><g fill="#fff"><circle cx="24" cy="24" r="1"><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="56" cy="26" r="1.1"><animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite"/></circle><circle cx="52" cy="56" r="1"><animate attributeName="opacity" values=".3;1;.3" dur="1.8s" repeatCount="indefinite"/></circle></g></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-opacity=".12"/>');
      case 'bg_matrix': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="#001200"/><g fill="#00e676" font-family="monospace" font-size="7" opacity=".9"><text x="18" y="20">1<animate attributeName="y" values="6;74" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2.2s" repeatCount="indefinite"/></text><text x="30" y="20">0<animate attributeName="y" values="0;74" dur="2.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2.8s" repeatCount="indefinite"/></text><text x="42" y="20">1<animate attributeName="y" values="10;74" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite"/></text><text x="54" y="20">0<animate attributeName="y" values="-4;74" dur="2.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2.5s" repeatCount="indefinite"/></text></g></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#00e676" stroke-opacity=".3"/>');
      case 'bg_cherry': return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd6e6"/><stop offset="1" stop-color="#ff7fa8"/></linearGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#g' + I + ')"/><g fill="#fff" opacity=".85"><ellipse cx="24" cy="16" rx="2.4" ry="3.6"><animateTransform attributeName="transform" type="translate" values="0 -12;6 68" dur="3.4s" repeatCount="indefinite"/></ellipse><ellipse cx="44" cy="10" rx="2" ry="3"><animateTransform attributeName="transform" type="translate" values="0 -8;-6 72" dur="4s" repeatCount="indefinite"/></ellipse><ellipse cx="58" cy="14" rx="2.2" ry="3.3"><animateTransform attributeName="transform" type="translate" values="0 -14;4 70" dur="3s" repeatCount="indefinite"/></ellipse></g></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-opacity=".2"/>');
      /* ═══ احتفالاتٌ جديدة ═══ */
      case 'cel_coins': return A('<g>' + [ [22,'#ffd24a',2.2], [34,'#ffe08a',2.8], [46,'#f5c451',2],[58,'#ffd24a',2.5] ].map(function (a) { return '<circle cx="' + a[0] + '" r="5" fill="' + a[1] + '" stroke="#b8860b" stroke-width="1.2"><animate attributeName="cy" values="-8;74" dur="' + a[2] + 's" repeatCount="indefinite"/></circle>'; }).join('') + '</g>');
      case 'cel_balloons': return A('<g>' + [ [22,'#ff5da2',2.6], [40,'#5ad1ff',3.2], [58,'#ffd24a',2.9] ].map(function (a) { return '<g><animateTransform attributeName="transform" type="translate" values="0 78;0 -20" dur="' + a[2] + 's" repeatCount="indefinite"/><ellipse cx="' + a[0] + '" cy="20" rx="7" ry="9" fill="' + a[1] + '"/><path d="M' + a[0] + ' 29 v10" stroke="#fff" stroke-width="1" opacity=".6"/></g>'; }).join('') + '</g>');
      case 'cel_lasers': return A('<g stroke-linecap="round"><g transform="translate(40 40)"><animateTransform attributeName="transform" type="rotate" values="0 40 40;360 40 40" dur="3s" repeatCount="indefinite" additive="sum"/><line x1="0" y1="0" x2="0" y2="-40" stroke="#ff2d6b" stroke-width="3"/><line x1="0" y1="0" x2="34" y2="20" stroke="#38e0ff" stroke-width="3"/><line x1="0" y1="0" x2="-34" y2="20" stroke="#7cff5a" stroke-width="3"/></g><circle cx="40" cy="40" r="4" fill="#fff"/></g>');
      case 'cel_meteor': return A('<g stroke-linecap="round">' + [ [12,10,2.2,'#ffb347'], [30,0,2.8,'#ff7a2f'], [50,6,2,'#ffd24a'] ].map(function (a) { return '<g><animateTransform attributeName="transform" type="translate" values="-20 -20;70 70" dur="' + a[2] + 's" repeatCount="indefinite"/><line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + (a[0] - 14) + '" y2="' + (a[1] - 14) + '" stroke="' + a[3] + '" stroke-width="3" opacity=".8"/><circle cx="' + a[0] + '" cy="' + a[1] + '" r="2.6" fill="#fff"/></g>'; }).join('') + '</g>');
      /* ═══ مؤثّراتُ كش-ماتٍ جديدة ═══ */
      case 'fx_flames': return A('<defs><linearGradient id="g' + I + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff2d00"/><stop offset=".6" stop-color="#ff8a1e"/><stop offset="1" stop-color="#ffd24a"/></linearGradient></defs><g fill="url(#g' + I + ')"><path d="M40 12c12 14 18 22 18 34a18 18 0 0 1-36 0c0-7 4-12 7-16 2 5 5 6 7 6-2-9 0-18-3-24z"><animate attributeName="opacity" values=".8;1;.8" dur=".8s" repeatCount="indefinite"/></path></g><path fill="#ffe9a8" d="M40 40c4 5 6 10 6 14a6 6 0 0 1-12 0c0-4 2-7 6-14z"><animate attributeName="opacity" values="1;.5;1" dur=".7s" repeatCount="indefinite"/></path>');
      case 'fx_supernova': return A('<g transform="translate(40 40)"><circle r="6" fill="#fff"><animate attributeName="r" values="4;9;4" dur="1.4s" repeatCount="indefinite"/></circle><g><circle r="14" fill="none" stroke="#ffd24a" stroke-width="3"><animate attributeName="r" values="6;34" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="indefinite"/></circle><circle r="14" fill="none" stroke="#ff7a2f" stroke-width="2"><animate attributeName="r" values="6;34" dur="1.6s" begin=".5s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.6s" begin=".5s" repeatCount="indefinite"/></circle></g></g>');
      case 'fx_ink': return A('<g fill="#1a1a24"><g><animateTransform attributeName="transform" type="scale" values=".2;1" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;.2" dur="1.8s" repeatCount="indefinite"/><path d="M40 40 q-14 -8 -20 -2 q6 4 6 10 q-10 2 -8 12 q10 -2 14 4 q4 -10 14 -8 q-2 -12 6 -16 q-10 -4 -12 -12z" transform="translate(-40 -40)"/></g></g>');
      case 'fx_glitch': return A('<g><rect x="8" y="30" width="64" height="6" fill="#ff2d6b" opacity=".85"><animate attributeName="x" values="8;20;2;8" dur=".5s" repeatCount="indefinite"/></rect><rect x="8" y="40" width="64" height="5" fill="#38e0ff" opacity=".85"><animate attributeName="x" values="8;-6;14;8" dur=".4s" repeatCount="indefinite"/></rect><rect x="8" y="48" width="64" height="4" fill="#7cff5a" opacity=".7"><animate attributeName="x" values="8;16;0;8" dur=".6s" repeatCount="indefinite"/></rect></g>');
      case 'fx_frostbreak': return A('<g stroke="#bfe6ff" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M40 40 L18 16M40 40 L64 18M40 40 L14 58M40 40 L60 62M40 40 L40 12"><animate attributeName="opacity" values=".4;1;.4" dur="1.1s" repeatCount="indefinite"/></path></g><g fill="#eaf7ff"><path d="M40 40l-8-10-2 10z"><animate attributeName="opacity" values=".5;1;.5" dur="1s" repeatCount="indefinite"/></path><path d="M40 40l10-4 2 8z"><animate attributeName="opacity" values="1;.4;1" dur="1.2s" repeatCount="indefinite"/></path></g><circle cx="40" cy="40" r="3.4" fill="#fff"/>');
    }
    /* ── معايناتٌ عامّةٌ متحرّكةٌ لأيّ عنصرٍ جديد: لونٌ حتميٌّ مشتقٌّ من المُعرِّف
       فيبدو كلُّ عنصرٍ نابضًا ومميّزًا بلا رسمٍ يدويٍّ لكلِّ واحد. ── */
    var hh = 0; for (var k = 0; k < I.length; k++) hh = (hh * 31 + I.charCodeAt(k)) % 360;
    var c1 = 'hsl(' + hh + ',85%,62%)', c2 = 'hsl(' + ((hh + 45) % 360) + ',85%,54%)', c3 = 'hsl(' + ((hh + 200) % 360) + ',85%,60%)';
    if (it.type === 'frame') return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs><circle cx="40" cy="40" r="26" fill="none" stroke="url(#g' + I + ')" stroke-width="5"/><circle cx="40" cy="40" r="26" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="14 200" opacity=".9"><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="2.8s" repeatCount="indefinite"/></circle>' + AV);
    if (it.type === 'background') return A('<defs><clipPath id="c' + I + '"><rect x="8" y="8" width="64" height="64" rx="14"/></clipPath><linearGradient id="g' + I + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset=".5" stop-color="' + c3 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs><g clip-path="url(#c' + I + ')"><rect x="8" y="8" width="64" height="64" fill="url(#g' + I + ')"/><g fill="#fff"><circle cx="24" cy="24" r="1.2"><animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></circle><circle cx="54" cy="30" r="1"><animate attributeName="opacity" values="1;0;1" dur="2.4s" repeatCount="indefinite"/></circle><circle cx="44" cy="54" r="1.1"><animate attributeName="opacity" values=".3;1;.3" dur="1.8s" repeatCount="indefinite"/></circle></g><rect x="8" y="8" width="26" height="64" fill="#fff" opacity=".08"><animate attributeName="x" values="-26;72" dur="3.2s" repeatCount="indefinite"/></rect></g><rect x="8" y="8" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-opacity=".14"/>');
    if (it.type === 'badge') return A('<defs><linearGradient id="g' + I + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs><g transform="translate(40 40)"><path fill="url(#g' + I + ')" d="M0 -24l7 15 16 2-12 11 4 16-15-8-15 8 4-16-12-11 16-2z"><animateTransform attributeName="transform" type="scale" values="1;1.1;1" dur="1.8s" repeatCount="indefinite"/></path></g>');
    if (it.type === 'celebration') return A('<g><rect x="20" y="10" width="5" height="8" rx="1" fill="' + c1 + '"><animate attributeName="y" values="-8;72" dur="2.2s" repeatCount="indefinite"/></rect><rect x="38" y="0" width="5" height="8" rx="1" fill="' + c3 + '"><animate attributeName="y" values="-14;72" dur="2.6s" repeatCount="indefinite"/></rect><rect x="54" y="6" width="5" height="8" rx="1" fill="' + c2 + '"><animate attributeName="y" values="-10;72" dur="2s" repeatCount="indefinite"/></rect><rect x="30" y="4" width="5" height="8" rx="1" fill="' + c1 + '"><animate attributeName="y" values="-20;72" dur="2.8s" repeatCount="indefinite"/></rect><rect x="46" y="12" width="5" height="8" rx="1" fill="' + c3 + '"><animate attributeName="y" values="-6;72" dur="2.4s" repeatCount="indefinite"/></rect></g>');
    return A('<defs><filter id="b' + I + '"><feGaussianBlur stdDeviation="2"/></filter></defs><path filter="url(#b' + I + ')" fill="' + c1 + '" d="M46 6L20 42h14l-6 32 30-44H42z"><animate attributeName="opacity" values=".25;.9;.25" dur="1.2s" repeatCount="indefinite"/></path><path fill="#fff" d="M46 6L20 42h14l-6 32 30-44H42z"><animate attributeName="opacity" values="1;.5;1" dur="1.2s" repeatCount="indefinite"/></path>');
  }

  var STORE = {
    _cur: null, _timer: 0, _open: false, _filter: null,

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
      this.closeDetail();
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
      this._renderFilters(data);
      var grid = document.getElementById('store-grid'); if (!grid) return;
      var owned = (window.amkhEconomy && amkhEconomy.state && amkhEconomy.state.owned) || [];
      var self = this;
      var items = data.items.filter(function (it) { return !self._filter || it.type === self._filter; });
      if (!items.length) {
        grid.innerHTML = '<p class="store-empty">' + esc(L('لا عناصرَ من هذا النوعِ في هذه النافذة.', 'No items of this kind in this window.')) + '</p>';
      } else {
        grid.innerHTML = items.map(function (it) { return self._card(it, owned.indexOf(it.id) >= 0); }).join('');
      }
      grid.querySelectorAll('.store-card').forEach(function (c) {
        c.onclick = function (e) { if (e.target.closest('[data-buy],[data-equip]')) return; STORE.openDetail(c.getAttribute('data-id')); };
      });
      grid.querySelectorAll('[data-buy]').forEach(function (b) {
        b.onclick = function (e) { e.stopPropagation(); try { if (window.SFX) SFX.btn(); } catch (er) {} STORE.buy(b.getAttribute('data-buy')); };
      });
      grid.querySelectorAll('[data-equip]').forEach(function (b) {
        b.onclick = function (e) { e.stopPropagation(); STORE.equip(b.getAttribute('data-equip'), b.getAttribute('data-type')); };
      });
      this._startCountdown(data.serverNow, data.endsAt);
    },

    /* رقاقاتُ تصفيةٍ حسبَ النوعِ (الكلّ/إطارات/خلفيّات/…) — ثنائيّةُ اللغة. */
    _renderFilters: function (data) {
      var wrap = document.getElementById('store-filters'); if (!wrap) return;
      var present = {}; data.items.forEach(function (it) { present[it.type] = 1; });
      var self = this;
      var chips = ['<button class="store-chip' + (self._filter ? '' : ' is-on') + '" data-filter="">' + esc(L('الكلّ', 'All')) + '</button>'];
      TYPE_ORDER.forEach(function (t) {
        if (!present[t]) return;
        chips.push('<button class="store-chip' + (self._filter === t ? ' is-on' : '') + '" data-filter="' + t + '">' + esc(L(TYPE[t].ar, TYPE[t].en)) + '</button>');
      });
      wrap.innerHTML = chips.join('');
      wrap.querySelectorAll('[data-filter]').forEach(function (b) {
        b.onclick = function () { try { if (window.SFX) SFX.btn(); } catch (e) {} self._filter = b.getAttribute('data-filter') || null; if (self._cur) self._render(self._cur); };
      });
    },

    _card: function (it, owned) {
      var r = RARITY[it.rarity] || RARITY.common;
      var name = L(it.ar, it.en);
      var have = owned || it.owned;
      var canAfford = (window.amkhEconomy ? amkhEconomy.coins() : 0) >= it.price;
      var action;
      if (have) {
        var eq = (window.amkhEconomy && amkhEconomy.state && amkhEconomy.state.equipped) || {};
        var isEq = eq[it.type] === it.id;
        action = '<button class="store-equip' + (isEq ? ' is-on' : '') + '" data-equip="' + esc(it.id) + '" data-type="' + esc(it.type) + '">'
          + esc(isEq ? L('مُجهَّز', 'Equipped') : L('تجهيز', 'Equip')) + '</button>';
      } else {
        action = '<button class="store-buy' + (canAfford ? '' : ' is-locked') + '" data-buy="' + esc(it.id) + '"><span class="store-buy__coin" aria-hidden="true"></span>' + it.price + '</button>';
      }
      return '<div class="store-card store-card--' + esc(it.rarity) + (have ? ' is-owned' : '') + '" data-id="' + esc(it.id) + '" role="button" tabindex="0">'
        + '<span class="store-card__rar">' + esc(L(r.ar, r.en)) + '</span>'
        + '<span class="store-card__info" aria-hidden="true">i</span>'
        + '<div class="store-card__art store-art--' + esc(it.type) + '">' + art(it) + '</div>'
        + '<div class="store-card__nm">' + esc(name) + '</div>'
        + '<div class="store-card__foot">' + action + '</div>'
        + '</div>';
    },

    /* بطاقةُ تفاصيلِ العنصرِ: معاينةٌ كبيرةٌ + النوعُ والندرةُ والوصفُ والسعرُ
       أو زرُّ التجهيز. تُفتحُ بالضغطِ على أيِّ بطاقةٍ في الشبكة. ثنائيّةُ اللغة. */
    openDetail: function (id) {
      var data = this._cur; if (!data) return;
      var it = null; for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) { it = data.items[i]; break; }
      if (!it) return;
      var sheet = document.getElementById('store-detail'); if (!sheet) return;
      var owned = (window.amkhEconomy && amkhEconomy.state && amkhEconomy.state.owned) || [];
      var have = owned.indexOf(it.id) >= 0 || it.owned;
      var r = RARITY[it.rarity] || RARITY.common;
      var tp = TYPE[it.type] || {};
      var canAfford = (window.amkhEconomy ? amkhEconomy.coins() : 0) >= it.price;
      var action;
      if (have) {
        var eq = (window.amkhEconomy && amkhEconomy.state && amkhEconomy.state.equipped) || {};
        var isEq = eq[it.type] === it.id;
        action = '<button class="store-equip store-detail__act' + (isEq ? ' is-on' : '') + '" data-equip="' + esc(it.id) + '" data-type="' + esc(it.type) + '">'
          + esc(isEq ? L('مُجهَّز — اضغط للإلغاء', 'Equipped — tap to remove') : L('تجهيز', 'Equip')) + '</button>';
      } else {
        action = '<button class="store-buy store-detail__act' + (canAfford ? '' : ' is-locked') + '" data-buy="' + esc(it.id) + '"><span class="store-buy__coin" aria-hidden="true"></span>'
          + it.price + '  ' + esc(L('شراء', 'Buy')) + '</button>'
          + (canAfford ? '' : '<div class="store-detail__hint">' + esc(L('عملاتُك لا تكفي بعد.', 'Not enough coins yet.')) + '</div>');
      }
      var body = document.getElementById('store-detail-body');
      body.innerHTML =
        '<div class="store-detail__art store-art--' + esc(it.type) + ' store-card--' + esc(it.rarity) + '">' + art(it) + '</div>'
        + '<div class="store-detail__rar" style="--rc:' + this._rc(it.rarity) + '">' + esc(L(r.ar, r.en)) + ' · ' + esc(L(tp.one ? tp.one.ar : '', tp.one ? tp.one.en : '')) + '</div>'
        + '<h3 class="store-detail__nm">' + esc(L(it.ar, it.en)) + '</h3>'
        + '<p class="store-detail__desc">' + esc(tp.desc ? L(tp.desc.ar, tp.desc.en) : '') + '</p>'
        + (have ? '<div class="store-detail__badge">' + esc(L('مملوكٌ — محفوظٌ في حسابِك للأبد.', 'Owned — saved to your account forever.')) + '</div>' : '')
        + '<div class="store-detail__foot">' + action + '</div>';
      body.querySelectorAll('[data-buy]').forEach(function (b) {
        b.onclick = function () { try { if (window.SFX) SFX.btn(); } catch (e) {} STORE.buy(b.getAttribute('data-buy')); STORE.closeDetail(); };
      });
      body.querySelectorAll('[data-equip]').forEach(function (b) {
        b.onclick = function () { STORE.equip(b.getAttribute('data-equip'), b.getAttribute('data-type')); STORE.openDetail(id); };
      });
      sheet.classList.add('open');
      try { if (window.SFX) SFX.btn(); } catch (e) {}
    },
    closeDetail: function () {
      var sheet = document.getElementById('store-detail'); if (sheet) sheet.classList.remove('open');
    },
    _rc: function (rar) {
      return ({ common: '#9fb0c0', rare: '#4aa3ff', epic: '#b46bff', legendary: '#ffb64a', seasonal: '#38e0c0' })[rar] || '#9fb0c0';
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

    /* تجهيز/إلغاء عنصر مملوك — الخادم يضبط العمود، والمزامنة تُظهره للجميع. */
    equip: function (itemId, type) {
      var tok = token(); if (!tok) return;
      var self = this;
      var eq = (window.amkhEconomy && amkhEconomy.state && amkhEconomy.state.equipped) || {};
      var body = (eq[type] === itemId) ? { itemId: '', type: type } : { itemId: itemId };
      fetch(api() + '/economy/equip', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(body)
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          if (!res) return;
          try { if (window.SFX) SFX.btn(); } catch (e) {}
          if (window.amkhEconomy) amkhEconomy.apply(res);
          if (self._cur) self._render(self._cur);
          try { window.dispatchEvent(new Event('amkh:cosmetics')); } catch (e) {}
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
  /* كشفُ أدواتِ الرسمِ والوصفِ لوحدةِ الجوائز (المخزون) كي تعرضَ العناصرَ
     بنفسِ الشكلِ تمامًا دونَ ازدواجِ الكود. */
  STORE.art = art;
  STORE.TYPE = TYPE;
  STORE.RARITY = RARITY;
  STORE.rarityColor = function (r) { return STORE._rc(r); };
  STORE.L = L;
  try { window.addEventListener('amkh:lang', function () { if (STORE._open && STORE._cur) STORE._render(STORE._cur); }); } catch (e) {}
})();
