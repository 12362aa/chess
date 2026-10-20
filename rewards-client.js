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

  /* ══════════════════════════════════════════════════════════════════
     مجموعةُ أيقوناتِ الجوائزِ المرسومة (بلاغا جوجو ١ و٢)
     ────────────────────────────────────────────────────────────────
     كانتِ الأيقوناتُ خطوطًا رفيعةً بلونٍ واحدٍ فتبدو فقيرةً ومتشابهةً. أُعيدَ
     بناؤها كلُّها: تدرّجاتٌ لونيّةٌ متعدّدةُ المحطّاتِ + هالةٌ خلفيّةٌ + لمعةٌ
     علويّةٌ + تفاصيلُ داخليّةٌ + حركةٌ خفيفةٌ لبعضِها — بنفسِ مستوى أيقوناتِ
     الرئيسيّةِ (home-ic). التدرّجاتُ تُعرَّفُ **مرّةً واحدةً** في مِلفٍّ خفيٍّ
     (sprite) فلا تُكرَّرُ مع كلِّ بطاقةٍ: أوفرُ للذاكرةِ والطلاءِ معًا. */
  var ICON_SPRITE_ID = 'rw-icon-defs';
  function ensureIconDefs() {
    if (document.getElementById(ICON_SPRITE_ID)) return;
    var g = function (id, a, b, c) {
      return '<linearGradient id="' + id + '" x1="0" y1="0" x2=".85" y2="1">'
        + '<stop offset="0" stop-color="' + a + '"/><stop offset=".5" stop-color="' + b + '"/>'
        + '<stop offset="1" stop-color="' + c + '"/></linearGradient>';
    };
    var r = function (id, a, b) {
      return '<radialGradient id="' + id + '" cx="50%" cy="46%" r="54%">'
        + '<stop offset="0" stop-color="' + a + '" stop-opacity=".55"/>'
        + '<stop offset="1" stop-color="' + b + '" stop-opacity="0"/></radialGradient>';
    };
    var d = document.createElement('div');
    d.id = ICON_SPRITE_ID;
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    d.innerHTML = '<svg width="0" height="0"><defs>'
      + g('icGold',   '#fff8dc', '#f5c451', '#a9710a')
      + g('icBlue',   '#d8ecff', '#4aa3ff', '#0d4f9e')
      + g('icEmber',  '#ffe2cf', '#ff6b4a', '#a01c0c')
      + g('icGreen',  '#dcffee', '#34d399', '#07795a')
      + g('icPurple', '#efe3ff', '#a97bff', '#4e21b0')
      + g('icCyan',   '#ddfdff', '#22d3ee', '#0a6f85')
      + g('icOrange', '#ffe8c2', '#ff9638', '#b43f05')
      + g('icPink',   '#ffdcf2', '#ff79c6', '#a51d74')
      + g('icSilver', '#ffffff', '#cfd8e3', '#73808f')
      + g('icBronze', '#ffdcba', '#d08b4a', '#7d4414')
      + g('icSteel',  '#aec6e0', '#415a74', '#111c28')
      + g('icRose',   '#ffd6dc', '#ff5577', '#9c0b2c')
      + r('icAuraGold',   '#ffd873', '#ffd873')
      + r('icAuraBlue',   '#7cc0ff', '#7cc0ff')
      + r('icAuraEmber',  '#ff8a6a', '#ff8a6a')
      + r('icAuraGreen',  '#4ade80', '#4ade80')
      + r('icAuraPurple', '#c4a0ff', '#c4a0ff')
      + r('icAuraCyan',   '#5de4f5', '#5de4f5')
      + r('icAuraOrange', '#ffab5e', '#ffab5e')
      + r('icAuraPink',   '#ff9ad6', '#ff9ad6')
      + r('icAuraSilver', '#e6eef7', '#e6eef7')
      + r('icAuraRose',   '#ff7d96', '#ff7d96')
      + '</defs></svg>';
    (document.body || document.documentElement).appendChild(d);
  }

  /* غلافُ الأيقونة: هالةٌ ملوّنةٌ خلفَ الرسمِ ثمّ الرسمُ نفسُه. cls يُمرَّرُ
     لتفعيلِ حركةٍ خاصّةٍ من screens.css (تُحترَمُ تفضيلاتُ تقليلِ الحركة). */
  function _icon(body, aura, cls) {
    ensureIconDefs();
    return '<svg class="rw-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">'
      + (aura ? '<circle class="rw-ic__aura" cx="12" cy="11" r="11" fill="url(#icAura' + aura + ')"/>' : '')
      + body + '</svg>';
  }

  /* قاموسُ الرسومِ — كلُّ رمزٍ بتدرّجِه وتفاصيلِه. */
  var ICON_ART = {
    /* ── سيفٌ ذهبيٌّ بنصلٍ فضّيٍّ ومقبضٍ ذهبيّ ── */
    sword: ['<path d="M16.6 3.2 H20.8 V7.4 L12.3 15.9 L8.1 11.7 Z" fill="url(#icSilver)"/>'
      + '<path d="M16.6 3.2 H20.8 V7.4 L12.3 15.9 L8.1 11.7 Z" fill="none" stroke="#8fa3b8" stroke-width=".7" opacity=".7"/>'
      + '<path d="M18.9 4 L19.9 5" stroke="#ffffff" stroke-width="1" opacity=".9" stroke-linecap="round"/>'
      + '<path d="M8.1 11.7 L4.6 15.2 L8.8 19.4 L12.3 15.9 Z" fill="url(#icGold)"/>'
      + '<path d="M6.1 16.6 L2.6 20.1" stroke="url(#icGold)" stroke-width="2" stroke-linecap="round"/>', 'Silver', 'rw-ic--shine'],
    /* ── رقعةٌ بمربّعاتٍ متباينةٍ فعليّة ── */
    board: ['<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.2" fill="url(#icSteel)"/>'
      + '<g fill="url(#icSilver)" opacity=".92">'
      + '<rect x="5.1" y="5.1" width="3.9" height="3.9"/><rect x="12.9" y="5.1" width="3.9" height="3.9"/>'
      + '<rect x="9" y="9" width="3.9" height="3.9"/><rect x="16.8" y="9" width="3.8" height="3.9"/>'
      + '<rect x="5.1" y="12.9" width="3.9" height="3.9"/><rect x="12.9" y="12.9" width="3.9" height="3.9"/>'
      + '<rect x="9" y="16.8" width="3.9" height="3.8"/></g>'
      + '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.2" fill="none" stroke="url(#icGold)" stroke-width="1.2"/>', 'Blue', ''],
    /* ── كأسٌ ذهبيٌّ بلمعةٍ تجري ── */
    trophy: ['<path d="M7.2 3.6 H16.8 V8.4 A4.8 4.8 0 0 1 7.2 8.4 Z" fill="url(#icGold)"/>'
      + '<path d="M7.2 5.4 H4.5 A2.7 2.7 0 0 0 7.6 8.8" fill="none" stroke="url(#icGold)" stroke-width="1.5" stroke-linecap="round"/>'
      + '<path d="M16.8 5.4 H19.5 A2.7 2.7 0 0 1 16.4 8.8" fill="none" stroke="url(#icGold)" stroke-width="1.5" stroke-linecap="round"/>'
      + '<path d="M12 13 V15.8" stroke="url(#icGold)" stroke-width="1.8"/>'
      + '<path d="M8.6 16.2 H15.4 L16.7 20.4 H7.3 Z" fill="url(#icGold)"/>'
      + '<path d="M9.6 5 L10.4 7.4" stroke="#fffdf0" stroke-width="1" opacity=".8" stroke-linecap="round"/>', 'Gold', 'rw-ic--shine'],
    /* ── تاجٌ بجواهرَ ملوّنة ── */
    crown: ['<path d="M3.6 18 L5.7 7.4 L9.6 12.4 L12 5.4 L14.4 12.4 L18.3 7.4 L20.4 18 Z" fill="url(#icGold)"/>'
      + '<path d="M3.6 18 H20.4 V20.2 H3.6 Z" fill="url(#icBronze)"/>'
      + '<circle cx="12" cy="4.9" r="1.35" fill="url(#icRose)"/>'
      + '<circle cx="5.7" cy="7" r="1.05" fill="url(#icCyan)"/>'
      + '<circle cx="18.3" cy="7" r="1.05" fill="url(#icCyan)"/>'
      + '<circle cx="9" cy="16" r=".85" fill="url(#icGreen)"/><circle cx="15" cy="16" r=".85" fill="url(#icBlue)"/>', 'Gold', 'rw-ic--gem'],
    /* ── لمبةٌ متوهّجةٌ بخيطٍ ذهبيّ ── */
    bulb: ['<path d="M8.4 14.6 A5.6 5.6 0 1 1 15.6 14.6 L14.6 17.6 H9.4 Z" fill="url(#icGold)"/>'
      + '<path d="M8.4 14.6 A5.6 5.6 0 1 1 15.6 14.6" fill="none" stroke="#fffbe6" stroke-width=".8" opacity=".55"/>'
      + '<path d="M10.2 13.6 Q12 10.6 13.8 13.6" fill="none" stroke="#b8730a" stroke-width=".9" stroke-linecap="round"/>'
      + '<rect x="9.4" y="17.8" width="5.2" height="1.5" rx=".7" fill="url(#icSilver)"/>'
      + '<rect x="10" y="19.9" width="4" height="1.3" rx=".65" fill="url(#icBronze)"/>', 'Gold', 'rw-ic--glow'],
    /* ── نجمةٌ ذهبيّةٌ تتلألأُ ── */
    star: ['<path d="M12 2.8 L14.5 9.1 L21.2 9.6 L16.1 14 L17.6 20.6 L12 17 L6.4 20.6 L7.9 14 L2.8 9.6 L9.5 9.1 Z" fill="url(#icGold)"/>'
      + '<path d="M12 5.6 L13.6 10 L18.2 10.4" fill="none" stroke="#fffdf2" stroke-width=".9" opacity=".75" stroke-linecap="round"/>', 'Gold', 'rw-ic--twinkle'],
    /* ── درعٌ أزرقُ بعلامةِ صحّ ── */
    shield: ['<path d="M12 2.8 L20.2 5.9 V12 C20.2 16.3 16.6 19.5 12 21.2 C7.4 19.5 3.8 16.3 3.8 12 V5.9 Z" fill="url(#icBlue)"/>'
      + '<path d="M12 4.6 L18.4 7 V12 C18.4 15.3 15.6 17.9 12 19.3 V4.6 Z" fill="#ffffff" opacity=".13"/>'
      + '<path d="M8.6 12 L11 14.4 L15.6 9.6" fill="none" stroke="#f0fbff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 'Blue', ''],
    /* ── شعلةٌ بقلبٍ ساطعٍ ترتجف ── */
    flame: ['<path d="M12 2.6 C15.4 7 17.4 8.9 17.4 12.3 A5.4 5.4 0 0 1 6.6 12.3 C6.6 10.1 7.7 8.6 9.4 6.9 C9.8 8.7 10.7 9.4 11.6 9.8 C11 7.5 11.3 5.2 12 2.6 Z" fill="url(#icOrange)"/>'
      + '<path d="M12 9.4 C13.5 11.6 14.4 12.6 14.4 14.1 A2.4 2.4 0 0 1 9.6 14.1 C9.6 12.9 10.5 11.8 12 9.4 Z" fill="url(#icGold)"/>', 'Orange', 'rw-ic--flicker'],
    /* ── شرائطُ صعودٍ (مستوى) ── */
    level: ['<rect x="3.4" y="14.6" width="4.4" height="6.2" rx="1.1" fill="url(#icPurple)"/>'
      + '<rect x="9.8" y="10.2" width="4.4" height="10.6" rx="1.1" fill="url(#icPurple)"/>'
      + '<rect x="16.2" y="5.4" width="4.4" height="15.4" rx="1.1" fill="url(#icGold)"/>'
      + '<path d="M5.6 13.4 L12 8.4 L18.4 3.6" fill="none" stroke="#fff2c4" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>', 'Purple', ''],
    /* ── دماغٌ وردِيٌّ بنبضاتٍ ── */
    brain: ['<path d="M11.4 5 A3 3 0 0 0 5.6 5.8 A2.7 2.7 0 0 0 4 10.7 A2.9 2.9 0 0 0 5.4 15.2 A2.8 2.8 0 0 0 9.9 18.5 A2.5 2.5 0 0 0 11.4 19.4 Z" fill="url(#icPink)"/>'
      + '<path d="M12.6 5 A3 3 0 0 1 18.4 5.8 A2.7 2.7 0 0 1 20 10.7 A2.9 2.9 0 0 1 18.6 15.2 A2.8 2.8 0 0 1 14.1 18.5 A2.5 2.5 0 0 1 12.6 19.4 Z" fill="url(#icPurple)"/>'
      + '<path d="M8.4 8.2 Q10.2 9.6 8.8 11.4 Q10.4 13 8.6 14.6" fill="none" stroke="#fff0fa" stroke-width=".85" opacity=".7" stroke-linecap="round"/>'
      + '<path d="M15.6 8.2 Q13.8 9.6 15.2 11.4 Q13.6 13 15.4 14.6" fill="none" stroke="#f3eaff" stroke-width=".85" opacity=".7" stroke-linecap="round"/>', 'Pink', 'rw-ic--pulse'],
    /* ── جوهرةٌ بأوجهٍ لامعة ── */
    gem: ['<path d="M8 3.8 H16 L20.4 9 L12 20.6 L3.6 9 Z" fill="url(#icCyan)"/>'
      + '<path d="M8 3.8 L9.8 9 L12 20.6 L3.6 9 Z" fill="#ffffff" opacity=".18"/>'
      + '<path d="M3.6 9 H20.4" stroke="#eafeff" stroke-width=".8" opacity=".6"/>'
      + '<path d="M9.8 9 L12 3.8 L14.2 9" fill="none" stroke="#eafeff" stroke-width=".8" opacity=".55"/>', 'Cyan', 'rw-ic--gem'],
    /* ── تنّينٌ قرمزيّ ── */
    dragon: ['<path d="M3.6 15 C3.6 11 6.8 7.8 10.8 7.8 H13.8 L17 4.6 L18.2 8.8 L21.4 10 L18.2 12.2 V15 C18.2 18.2 15 20.4 10.8 20.4 H6.6 Z" fill="url(#icRose)"/>'
      + '<path d="M17 4.6 L18.2 8.8 L21.4 10 L18.2 12.2" fill="none" stroke="#ffd7de" stroke-width=".8" opacity=".65"/>'
      + '<circle cx="14.2" cy="11.2" r="1.15" fill="#fff3f5"/><circle cx="14.2" cy="11.2" r=".5" fill="#7a0a1f"/>'
      + '<path d="M8.4 20.4 L7.4 22.2 M12.8 20.4 L11.8 22.2" stroke="url(#icRose)" stroke-width="1.3" stroke-linecap="round"/>', 'Rose', 'rw-ic--pulse'],
    /* ── دربٌ متعرّجٌ أخضرُ بعلَمٍ ── */
    path: ['<path d="M5.4 20.4 C10.4 17.4 7.4 12.4 11.4 10.9 C15.4 9.4 13 5.4 17.4 4.6" fill="none" stroke="url(#icGreen)" stroke-width="2.3" stroke-linecap="round"/>'
      + '<circle cx="5.4" cy="20.4" r="1.7" fill="url(#icGreen)"/>'
      + '<path d="M17.4 3.4 V8.6" stroke="url(#icSilver)" stroke-width="1.2" stroke-linecap="round"/>'
      + '<path d="M17.4 3.6 L21 4.8 L17.4 6 Z" fill="url(#icGold)"/>', 'Green', ''],
    /* ── جبلٌ مثلّجُ القمّة ── */
    mountain: ['<path d="M2.8 19.6 L9 8.4 L12.6 14.2 L15.6 9.2 L21.2 19.6 Z" fill="url(#icBlue)"/>'
      + '<path d="M7.1 11.9 L9 8.4 L10.9 11.9 Q9 13 7.1 11.9 Z" fill="#ffffff" opacity=".85"/>'
      + '<path d="M14.1 11.8 L15.6 9.2 L17.1 11.8 Q15.6 12.7 14.1 11.8 Z" fill="#ffffff" opacity=".7"/>'
      + '<path d="M2.8 19.6 H21.2" stroke="url(#icSilver)" stroke-width=".9" opacity=".5"/>', 'Blue', ''],
    /* ── ثلاثُ نجماتٍ (الكمال) ── */
    star3: ['<path d="M12 3.4 L13.7 7.7 L18.2 8 L14.7 10.9 L15.9 15.3 L12 12.8 L8.1 15.3 L9.3 10.9 L5.8 8 L10.3 7.7 Z" fill="url(#icGold)"/>'
      + '<path d="M5.2 16.4 L6.1 18.4 L8.2 18.6 L6.6 20 L7.1 22.1 L5.2 21 L3.3 22.1 L3.8 20 L2.2 18.6 L4.3 18.4 Z" fill="url(#icGold)" opacity=".92"/>'
      + '<path d="M18.8 16.4 L19.7 18.4 L21.8 18.6 L20.2 20 L20.7 22.1 L18.8 21 L16.9 22.1 L17.4 20 L15.8 18.6 L17.9 18.4 Z" fill="url(#icGold)" opacity=".92"/>', 'Gold', 'rw-ic--twinkle'],
    /* ── رقاقةُ معالجٍ سماويّة ── */
    cpu: ['<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="1.9" fill="url(#icSteel)"/>'
      + '<rect x="9.4" y="9.4" width="5.2" height="5.2" rx=".8" fill="url(#icCyan)"/>'
      + '<g stroke="url(#icGold)" stroke-width="1.35" stroke-linecap="round">'
      + '<path d="M9.4 3.4 V6.4 M14.6 3.4 V6.4 M9.4 17.6 V20.6 M14.6 17.6 V20.6"/>'
      + '<path d="M3.4 9.4 H6.4 M3.4 14.6 H6.4 M17.6 9.4 H20.6 M17.6 14.6 H20.6"/></g>'
      + '<path d="M7.6 7.4 H16.4" stroke="#cfe6f5" stroke-width=".65" opacity=".4" stroke-linecap="round"/>', 'Cyan', 'rw-ic--pulse'],
    /* ── آليٌّ لطيف ── */
    robot: ['<rect x="5.2" y="7.6" width="13.6" height="10.8" rx="2.4" fill="url(#icBlue)"/>'
      + '<path d="M12 4.2 V7.6" stroke="url(#icSilver)" stroke-width="1.2" stroke-linecap="round"/>'
      + '<circle cx="12" cy="3.3" r="1.25" fill="url(#icCyan)"/>'
      + '<circle cx="9.5" cy="12.2" r="1.3" fill="#eaf7ff"/><circle cx="14.5" cy="12.2" r="1.3" fill="#eaf7ff"/>'
      + '<path d="M9.8 15.6 H14.2" stroke="#eaf7ff" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>'
      + '<rect x="3.2" y="10.6" width="1.8" height="4.4" rx=".9" fill="url(#icSilver)"/>'
      + '<rect x="19" y="10.6" width="1.8" height="4.4" rx=".9" fill="url(#icSilver)"/>', 'Blue', 'rw-ic--pulse'],
    /* ── هدفٌ بحلقاتٍ متباينةٍ وسهمٍ غائرٍ في المركز ── */
    target: ['<circle cx="12" cy="12" r="8.6" fill="url(#icEmber)"/>'
      + '<circle cx="12" cy="12" r="6.3" fill="#fff6f2" opacity=".92"/>'
      + '<circle cx="12" cy="12" r="4.1" fill="url(#icEmber)"/>'
      + '<circle cx="12" cy="12" r="2" fill="url(#icGold)"/>'
      + '<path d="M18.6 5.4 L13.2 10.8" stroke="url(#icSilver)" stroke-width="1.5" stroke-linecap="round"/>'
      + '<path d="M19.8 4.2 L17.5 5 L18.9 6.4 Z" fill="url(#icGreen)"/>', 'Ember', 'rw-ic--pulse'],
    /* ── ميداليّةٌ بشريطٍ ── */
    medal: ['<path d="M8.4 2.8 L11 8.6 H13 L15.6 2.8" fill="none" stroke="url(#icBlue)" stroke-width="2.1" stroke-linecap="round"/>'
      + '<circle cx="12" cy="14.6" r="5.9" fill="url(#icGold)"/>'
      + '<circle cx="12" cy="14.6" r="3.9" fill="#ffffff" opacity=".2"/>'
      + '<path d="M12 11.8 L12.9 13.7 L15 14 L13.5 15.4 L13.9 17.5 L12 16.5 L10.1 17.5 L10.5 15.4 L9 14 L11.1 13.7 Z" fill="#fff8dc"/>', 'Gold', 'rw-ic--shine'],

    /* ══ مقاييسُ المهامّ ══ */
    games: null,     /* = board */
    wins: null,      /* = trophy */
    /* قطعةُ أُحجيةٍ خضراءُ (اللمبةُ لا تعبّرُ عن الألغاز — بلاغُ جوجو) */
    puzzles: ['<path d="M4.6 4.6 H10.2 V6.9 A1.95 1.95 0 1 0 13.8 6.9 V4.6 H19.4 V10.2 H17.1 A1.95 1.95 0 1 0 17.1 13.8 H19.4 V19.4 H13.8 V17.1 A1.95 1.95 0 1 1 10.2 17.1 V19.4 H4.6 Z" fill="url(#icGreen)"/>'
      + '<path d="M4.6 4.6 H10.2 V6.9 A1.95 1.95 0 1 0 13.8 6.9 V4.6 H19.4 V10.2 H17.1 A1.95 1.95 0 1 0 17.1 13.8 H19.4 V19.4 H13.8 V17.1 A1.95 1.95 0 1 1 10.2 17.1 V19.4 H4.6 Z" fill="none" stroke="#e8fff5" stroke-width=".75" opacity=".55"/>'
      + '<path d="M6.4 6.4 H8.8" stroke="#ffffff" stroke-width=".9" opacity=".6" stroke-linecap="round"/>', 'Green', 'rw-ic--gem'],
    /* كِش-مات: ملكٌ ساقطٌ بعلامةٍ حمراء */
    checkmate: ['<path d="M12 2.6 V5.4 M10.5 4 H13.5" stroke="url(#icGold)" stroke-width="1.5" stroke-linecap="round"/>'
      + '<path d="M7.6 20 L16.4 20 L17.4 11.6 L14.2 13.8 L12 8.2 L9.8 13.8 L6.6 11.6 Z" fill="url(#icGold)"/>'
      + '<path d="M6.9 20.6 H17.1" stroke="url(#icBronze)" stroke-width="1.6" stroke-linecap="round"/>'
      + '<path d="M3.6 20.8 L20.4 4.2" stroke="url(#icRose)" stroke-width="2.3" stroke-linecap="round"/>', 'Rose', ''],
    streak: null,    /* = flame */
    /* نور: شعاعُ نورٍ بنفسجيٌّ-ذهبيٌّ (لا آليٌّ — نورٌ فتًى لا روبوت) */
    nour: ['<circle cx="12" cy="12" r="4.6" fill="url(#icGold)"/>'
      + '<circle cx="12" cy="12" r="2.6" fill="#fffdf0" opacity=".85"/>'
      + '<g stroke="url(#icPurple)" stroke-width="1.7" stroke-linecap="round">'
      + '<path d="M12 1.8 V5 M12 19 V22.2 M1.8 12 H5 M19 12 H22.2"/></g>'
      + '<g stroke="url(#icPurple)" stroke-width="1.35" stroke-linecap="round" opacity=".85">'
      + '<path d="M4.8 4.8 L7 7 M17 17 L19.2 19.2 M19.2 4.8 L17 7 M7 17 L4.8 19.2"/></g>', 'Purple', 'rw-ic--glow'],
    /* تعادل: ميزانٌ متوازن */
    draws: ['<path d="M12 4 V19.6" stroke="url(#icSilver)" stroke-width="1.6" stroke-linecap="round"/>'
      + '<circle cx="12" cy="3.4" r="1.4" fill="url(#icGold)"/>'
      + '<path d="M5.2 7.6 H18.8" stroke="url(#icSilver)" stroke-width="1.6" stroke-linecap="round"/>'
      + '<path d="M2.6 8 H7.8 L5.2 13.2 Z" fill="url(#icBlue)"/>'
      + '<path d="M16.2 8 H21.4 L18.8 13.2 Z" fill="url(#icBlue)"/>'
      + '<path d="M8.4 20.4 H15.6" stroke="url(#icBronze)" stroke-width="1.8" stroke-linecap="round"/>', 'Silver', ''],
    engine: null,    /* = cpu */
    /* إنفاق: كيسُ متجرٍ ورديٌّ بعملةٍ ذهبيّة */
    spend: ['<path d="M5.4 8.4 H18.6 L17.6 20.4 H6.4 Z" fill="url(#icPink)"/>'
      + '<path d="M8.8 8.4 V6.4 A3.2 3.2 0 0 1 15.2 6.4 V8.4" fill="none" stroke="url(#icSilver)" stroke-width="1.5" stroke-linecap="round"/>'
      + '<circle cx="12" cy="14.6" r="3.1" fill="url(#icGold)"/>'
      + '<path d="M12 12.6 V16.6 M10.6 13.6 H13.4" stroke="#8a5c05" stroke-width="1" stroke-linecap="round"/>', 'Pink', 'rw-ic--gem'],
  };
  /* مرادفاتٌ (نفسُ الرسمِ لمفتاحَين) */
  ICON_ART.games = ICON_ART.board;
  ICON_ART.wins = ICON_ART.trophy;
  ICON_ART.streak = ICON_ART.flame;
  ICON_ART.engine = ICON_ART.cpu;

  /* أيقوناتُ ألسنةِ شاشةِ الجوائز (مهامّ/إنجازات/مخزون) — SVG مرسومٌ ملوّنٌ
     يعبّرُ عن كلِّ لسانٍ (نفسُ نسقِ أيقوناتِ الرئيسيّة). أُعيدَ تعريفُه هنا بعدَ
     أن سقطَ سهوًا في إعادةِ بناءِ الأيقونات (بلاغُ جوجو: الشاشةُ فرغتْ لأنّ
     ‎tabIcon‎ كان مُستدعًى بلا تعريفٍ فانهارَ ‎_renderHead‎). */
  function tabIcon(k) {
    var p = {
      missions:
        '<defs><linearGradient id="tiM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#0e9f6e"/></linearGradient></defs>'
        + '<rect x="5" y="4" width="14" height="18" rx="2.6" fill="url(#tiM)" stroke="#0b7a54" stroke-width="1"/>'
        + '<rect x="8.6" y="2.3" width="6.8" height="3.6" rx="1.3" fill="#a7f3d0" stroke="#0b7a54" stroke-width=".7"/>'
        + '<path d="M7.8 12.4 L10.4 15 L15.6 9.4" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M8 18.2 H15" stroke="#d1fae5" stroke-width="1.7" stroke-linecap="round"/>',
      achievements:
        '<defs><linearGradient id="tiAr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a3a"/><stop offset="1" stop-color="#e11d48"/></linearGradient>'
        + '<radialGradient id="tiAd" cx=".4" cy=".34" r=".85"><stop offset="0" stop-color="#fff2c4"/><stop offset=".5" stop-color="#ffc65a"/><stop offset="1" stop-color="#dd8412"/></radialGradient></defs>'
        + '<path d="M7.6 3 L11.4 3 L10 11 L5.6 8 Z" fill="url(#tiAr)"/>'
        + '<path d="M16.4 3 L12.6 3 L14 11 L18.4 8 Z" fill="url(#tiAr)"/>'
        + '<circle cx="12" cy="15" r="6.3" fill="url(#tiAd)" stroke="#a9670c" stroke-width="1"/>'
        + '<path d="M12 11.1 L13.15 13.5 L15.8 13.85 L13.87 15.7 L14.35 18.3 L12 17.05 L9.65 18.3 L10.13 15.7 L8.2 13.85 L10.85 13.5 Z" fill="#fff7dc" stroke="#a9670c" stroke-width=".5"/>',
      inventory:
        '<defs><linearGradient id="tiIb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#6d28d9"/></linearGradient>'
        + '<linearGradient id="tiIl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9b8ff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>'
        + '<path d="M4 11 C4 7.7 20 7.7 20 11 L20 12 L4 12 Z" fill="url(#tiIl)" stroke="#3f1d84" stroke-width="1"/>'
        + '<rect x="4" y="11.5" width="16" height="8.4" rx="1.6" fill="url(#tiIb)" stroke="#3f1d84" stroke-width="1"/>'
        + '<rect x="3.3" y="13.4" width="17.4" height="2.8" rx="1" fill="#f5c451" stroke="#9a6410" stroke-width=".7"/>'
        + '<circle cx="12" cy="14.8" r="1.6" fill="#ffe79a" stroke="#9a6410" stroke-width=".7"/>',
    };
    return '<svg class="rw-tab__ic" viewBox="0 0 24 24" aria-hidden="true">' + (p[k] || p.missions) + '</svg>';
  }

  function drawIcon(id) {
    var a = ICON_ART[id] || ICON_ART.medal;
    return _icon(a[0], a[1], a[2]);
  }

  /* أيقونةُ الإنجاز (الأسماءُ مطابقةٌ لحقلِ icon في ACHIEVEMENTS). */
  function achIcon(id) { return drawIcon(id); }

  /* أيقونةُ المهمّةِ حسبَ مقياسِها (metric من لقطةِ الخادم). */
  function misIcon(metric) { return drawIcon(metric); }


  /* ══ RewardsWash: بوّابةُ "قاعةِ الشرف" — شروقٌ ذهبيٌّ كاملُ الشاشةِ بأشعّةٍ
     دوّارةٍ ونجومٍ صاعدةٍ وإكليلِ غارٍ ينفتحُ من المركز. مختلفةٌ كليًّا عن بوّابةِ
     المتجر (خزنةٌ + عملاتٌ منهمرة): هنا احتفاءٌ بالتتويجِ لا كنزٌ يُفتَح.
     كلُّه transform/canvas — يتوقّفُ ذاتيًّا، ويحترمُ prefers-reduced-motion. */
  var RewardsWash={play:function(){if(window.AMKHPerf)AMKHPerf.portal(document.getElementById('rw-wash'),'rewards');},stop:function(){const h=document.getElementById('rw-wash');if(h){h.classList.remove('play');h.textContent='';}}};

  var REWARDS = {
    _cat: null, _tab: 'missions', _open: false, _bound: false, _invFilter: null,

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
      /* أداءٌ (بند جوجو ٦): مُبدِّلُ is-scrolling على مُمرِّرِ الورقةِ لكلِّ
         الألسنةِ (لا المخزونَ وحدَه) — يُفعِّلُ تبسيطَ الطلاءِ أثناءَ التمريرِ
         في screens.css فيختفي اللاجُ والسوادُ في المهامِّ والإنجازاتِ أيضًا. */
      try {
        var ov = document.getElementById('rewards-ov');
        var sc = ov && ov.querySelector('.store-scroll');
        if (sc && !sc._amkhScrollPerf) {
          sc._amkhScrollPerf = true;
          var idle = 0;
          sc.addEventListener('scroll', function () {
            if (!sc.classList.contains('is-scrolling')) sc.classList.add('is-scrolling');
            clearTimeout(idle);
            idle = setTimeout(function () { sc.classList.remove('is-scrolling'); }, 140);
          }, { passive: true });
        }
      } catch (e) {}
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
        /* أزرارُ تصنيفِ المخزون (بلاغُ جوجو ٤): تُصفّي العرضَ فورًا بلا تمرير */
        var inv = ev.target.closest ? ev.target.closest('[data-invfilter]') : null;
        if (inv) {
          try { if (window.SFX) SFX.btn(); } catch (e) {}
          self._invFilter = inv.getAttribute('data-invfilter') || null;
          self._render();
          return;
        }
        if (claim) { self._claim(claim.getAttribute('data-claim')); return; }
        if (equip) { self._equip(equip.getAttribute('data-equip'), equip.getAttribute('data-type')); return; }
        /* تحدّي نور الأسبوعيّ: استلامُ المكافأةِ أو بدءُ التحدّي (بند جوجو ٢) */
        var cw = ev.target.closest ? ev.target.closest('[data-claim-weekly]') : null;
        if (cw) { self._claimWeekly(); return; }
        var ws = ev.target.closest ? ev.target.closest('[data-wc-start]') : null;
        if (ws) { self._startWeekly(ws.getAttribute('data-wc-start')); return; }
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
      if (this._tab === 'achievements') { body.innerHTML = this._achievementsHTML(); }
      else if (this._tab === 'inventory') { body.innerHTML = this._inventoryHTML(); this._mountInvArt(); }
      else { body.innerHTML = this._missionsHTML(); }
      if (this._tab !== 'inventory' && this._invObs) { try { this._invObs.disconnect(); } catch (e) {} this._invObs = null; }
    },

    /* تركيبُ رسومِ المخزونِ على الطلب + التجهيزُ الموضعيُّ — نفسُ علاجِ
       المتجر: مُراقِبُ تقاطعٍ يرسمُ ما يُرى فقط، وتجهيزٌ يحدّثُ بطاقةً دونَ
       إعادةِ بناءِ التبويبِ كلِّه (أداءُ البند ١). */
    _mountInvArt: function () {
      var body = document.getElementById('rw-body'); if (!body) return;
      if (this._invObs) { try { this._invObs.disconnect(); } catch (e) {} this._invObs = null; }
      var meta = this._itemMeta || {};
      var hosts = body.querySelectorAll('[data-invart]');
      if (!hosts.length) return;
      var reduce = false; try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
      var paint = function (h) {
        if (h.getAttribute('data-on') === '1') return;
        var m = meta[h.getAttribute('data-invart')]; if (!m) return;
        var svg = (window.STORE && STORE.art) ? STORE.art(m) : '';
        if (window.AMKHPerf) svg = AMKHPerf.preview(svg);
        h.innerHTML = svg; h.setAttribute('data-on', '1');
      };
      var wipe = function (h) { if (h.getAttribute('data-on') !== '1') return; h.innerHTML = ''; h.removeAttribute('data-on'); };
      if (!window.IntersectionObserver) { for (var i = 0; i < hosts.length; i++) paint(hosts[i]); return; }
      var ov = document.getElementById('rewards-ov');
      var root = (ov && ov.querySelector('.store-scroll')) || null;
      this._invObs = new IntersectionObserver(function (ents) {
        for (var k = 0; k < ents.length; k++) { if (ents[k].isIntersecting) paint(ents[k].target); else wipe(ents[k].target); }
      }, { root: root, rootMargin: '50px 0px', threshold: 0 });
      for (var j = 0; j < hosts.length; j++) this._invObs.observe(hosts[j]);
      this._wireInvScrollPause(body, root);
    },

    /* إيقافُ حركةِ SMIL أثناءَ التمريرِ في المخزونِ — نفسُ علاجِ المتجرِ
       (بلاغُ جوجو ٣): تجميدٌ لحظةَ التمريرِ، استئنافٌ عندَ السكون، بلا أيِّ
       تغييرٍ في الشكلِ الساكن. */
    _wireInvScrollPause: function (body, root) {
      var sc = root || (function () { var ov = document.getElementById('rewards-ov'); return ov && ov.querySelector('.store-scroll'); })();
      if (!sc) return;
      if (this._invScrollH && this._invScSc) { try { this._invScSc.removeEventListener('scroll', this._invScrollH); } catch (e) {} }
      var paused = false, idle = 0;
      var svgs = function () { return body.querySelectorAll('.rw-inv__art svg, [data-invart] svg'); };
      var pause = function () { if (paused) return; paused = true; sc.classList.add('is-scrolling'); var l = svgs(); for (var i = 0; i < l.length; i++) { try { l[i].pauseAnimations(); } catch (e) {} } };
      var resume = function () { if (!paused) return; paused = false; sc.classList.remove('is-scrolling'); var l = svgs(); for (var i = 0; i < l.length; i++) { try { l[i].unpauseAnimations(); } catch (e) {} } };
      this._invScrollH = function () { pause(); clearTimeout(idle); idle = setTimeout(resume, 140); };
      this._invScSc = sc;
      sc.addEventListener('scroll', this._invScrollH, { passive: true });
    },

    /* تحديثٌ موضعيٌّ لحالةِ التجهيزِ في المخزونِ دونَ لمسِ الرسوم. */
    _syncInv: function () {
      var body = document.getElementById('rw-body'); if (!body) return;
      var s = state() || {}, eq = s.equipped || {};
      body.querySelectorAll('.rw-inv').forEach(function (card) {
        var btn = card.querySelector('[data-equip]'); if (!btn) return;
        var host = card.querySelector('[data-invart]'); if (!host) return;
        var id = host.getAttribute('data-invart');
        var type = btn.getAttribute('data-type');
        var isEq = eq[type] === id;
        card.classList.toggle('is-eq', isEq);
        btn.classList.toggle('is-on', isEq);
        btn.setAttribute('data-equip', isEq ? '' : id);
        btn.textContent = isEq ? L('مُجهَّز — إلغاء', 'Equipped — remove') : L('تجهيز', 'Equip');
      });
    },

    _renderHead: function () {
      var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
      set('rw-kicker', L('AM-KH · التقدّم', 'AM-KH · Progress'));
      set('rw-title', L('جوائزُك وتقدّمُك', 'Your Rewards & Progress'));
      set('rw-sub', L('أكمِلِ المهامَّ، افتحِ الإنجازات، وجهِّزْ زينتَك.', 'Complete missions, unlock achievements, and equip your cosmetics.'));
      var tl = { missions: L('المهام', 'Missions'), achievements: L('الإنجازات', 'Achievements'), inventory: L('المخزون', 'Inventory') };
      var tabs = document.querySelectorAll('#rw-tabs .rw-tab');
      for (var i = 0; i < tabs.length; i++) { var k = tabs[i].getAttribute('data-tab'); tabs[i].innerHTML = tabIcon(k) + '<span class="rw-tab__lb">' + (tl[k] || k) + '</span>'; }
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
      var html = this._weeklyHTML(s.weeklyChallenge);
      if (!defs.length) return html + '<div class="rw-empty">' + esc(L('لا مهامَّ الآن.', 'No missions right now.')) + '</div>';
      var groups = [
        { p: 'daily',  t: L('مهامُّ اليوم', 'Today’s Missions'),  k: 'rw-grp--day',  sub: L('تتبدّلُ كلَّ يوم', 'Refreshes daily') },
        { p: 'weekly', t: L('مهامُّ الأسبوع', 'Weekly Missions'), k: 'rw-grp--week', sub: L('تتبدّلُ كلَّ أسبوع', 'Refreshes weekly') }
      ];
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

    /* ══ بطاقةُ تحدّي نور الأسبوعيِّ (بند جوجو ٢) ══
       تحدٍّ واحدٌ مميَّزٌ أعلى المهامّ: شارةُ نورٍ + إيموجي + عنوانٌ ووصفٌ
       ثنائيَّا اللغةِ من الخادم + شريطُ تقدّمٍ + زرُّ «ابدأ» يوجّهُ للوضعِ
       المناسبِ، وزرُّ «استلِمْ» عندَ الإكمال. */
    _weeklyHTML: function (wc) {
      if (!wc || !wc.id) return '';
      var prog = Math.min(wc.target, Number(wc.progress) || 0);
      var pct = wc.target ? Math.round(prog / wc.target * 100) : 0;
      var done = !!wc.completed || prog >= wc.target, claimed = !!wc.claimed;
      /* أيقونةٌ مرسومةٌ ملوّنةٌ حسبَ نوعِ التحدّي (لا إيموجي — ممنوعٌ في
         الواجهة، بلاغُ جوجو). wc.icon من الخادمِ (sword/cpu/bulb/path/…) ونفسُ
         رمّازِ الإنجازاتِ يرسمُها بلونِها المميّز. */
      var icon = achIcon(wc.icon || 'star');
      var side = claimed
        ? '<span class="rw-claimed">' + esc(L('مُستلَمة', 'Claimed')) + '</span>'
        : done
          ? '<button class="rw-claim rw-claim--wc" type="button" data-claim-weekly="1">' + esc(L('استلِمِ المكافأة', 'Claim reward')) + '</button>'
          : '<button class="rw-wc__go" type="button" data-wc-start="' + esc(wc.type || '') + '">' + esc(L('ابدأِ التحدّي', 'Start')) + '</button>';
      return '<div class="rw-sec rw-sec--wc"><div class="rw-sec__hd">'
        + '<span class="rw-sec__ttl">' + esc(L('تحدّي نور الأسبوعيّ', 'Nour’s Weekly Challenge')) + '</span>'
        + '<span class="rw-sec__sub">' + esc(L('يتبدّلُ كلَّ أسبوع', 'New every week')) + '</span>'
        + (done && !claimed ? '<span class="rw-sec__rdy">' + esc(L('جاهزٌ للاستلام', 'Ready')) + '</span>' : '')
        + '</div>'
        + '<div class="rw-wc' + (done ? ' is-done' : '') + (claimed ? ' is-claimed' : '') + '">'
        + '<i class="rw-wc__plate" aria-hidden="true"></i>'
        + '<div class="rw-wc__ic" aria-hidden="true">' + icon + '</div>'
        + '<div class="rw-wc__main">'
        + '<div class="rw-wc__name">' + esc(L(wc.ar, wc.en)) + '</div>'
        + '<div class="rw-wc__desc">' + esc(L(wc.descAr, wc.descEn)) + '</div>'
        + '<div class="rw-wc__bar"><span style="width:' + pct + '%"></span></div>'
        + '<div class="rw-wc__foot">'
        + '<span class="rw-wc__prog">' + prog + ' / ' + wc.target + '</span>'
        + '<span class="rw-reward"><span class="rw-reward__coin" aria-hidden="true">' + coinIc() + '</span>' + fmt(wc.coins) + '</span>'
        + (wc.xp ? '<span class="rw-xp-chip">+' + fmt(wc.xp) + ' XP</span>' : '')
        + '</div></div>'
        + '<div class="rw-wc__side">' + side + '</div>'
        + '</div></div>';
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
        { k: 'nour',    ar: 'درب نور',   en: 'Nour’s Path' },
        { k: 'engine',  ar: 'المحرّك',    en: 'Engine' },
        { k: 'collect', ar: 'المجموعة',  en: 'Collection' },
        { k: 'dedication', ar: 'المثابرة', en: 'Dedication' },
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
      var ic = function (t) { try { return (window.amkhCos && amkhCos.catIcon) ? amkhCos.catIcon(t) : ''; } catch (e) { return ''; } };
      /* ══ أزرارُ التصنيفِ (بلاغُ جوجو ٤) ══
         «في المخزونِ اعملْ أزرارًا تخلّيني لما أضغطَ على كلِّ زرٍّ أقدرَ أوصلَ
         لمقتنياتي» — بدلَ التمريرِ الطويلِ عبرَ كلِّ الأقسام. لكلِّ زرٍّ أيقونةٌ
         ملوّنةٌ مرسومةٌ (نفسُ أيقوناتِ أزرارِ المتجرِ) وعددُ ما تملكُه منه. */
      var present = order.filter(function (tp) { return byType[tp] && byType[tp].length; });
      if (this._invFilter && present.indexOf(this._invFilter) < 0) this._invFilter = null;
      var f = this._invFilter || null;
      var chips = '<div class="rw-chips" id="rw-inv-chips">'
        + '<button class="rw-chip' + (f ? '' : ' is-on') + '" type="button" data-invfilter="">'
        + '<span class="rw-chip__ic" aria-hidden="true">' + ic('all') + '</span>'
        + '<span class="rw-chip__tx">' + esc(L('الكلّ', 'All')) + '</span>'
        + '<span class="rw-chip__n">' + owned.length + '</span></button>';
      present.forEach(function (tp) {
        var tn = T[tp] ? L(T[tp].ar, T[tp].en) : tp;
        chips += '<button class="rw-chip' + (f === tp ? ' is-on' : '') + '" type="button" data-invfilter="' + esc(tp) + '">'
          + '<span class="rw-chip__ic" aria-hidden="true">' + ic(tp) + '</span>'
          + '<span class="rw-chip__tx">' + esc(tn) + '</span>'
          + '<span class="rw-chip__n">' + byType[tp].length + '</span></button>';
      });
      chips += '</div>';
      var html = chips;
      var shown = f ? [f] : order;
      shown.forEach(function (tp) {
        var list = byType[tp]; if (!list || !list.length) return;
        list = list.slice().sort(function (a, b) { return (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0); });
        var tn = T[tp] ? L(T[tp].ar, T[tp].en) : tp;
        var cic = ic(tp);
        html += '<div class="rw-sec"><div class="rw-sec__hd"><span class="rw-sec__ic" aria-hidden="true">' + cic + '</span><span class="rw-sec__ttl">' + esc(tn) + '</span>'
          + '<span class="rw-sec__sub">' + list.length + '</span></div><div class="rw-inv-grid">';
        list.forEach(function (m) {
          var isEq = eq[tp] === m.id;
          var rar = m.rarity || 'common';
          var rn = R[rar] ? L(R[rar].ar, R[rar].en) : rar;
          /* مضيفُ الرسمِ يُولَدُ فارغًا ويُركَّبُ عند دخولِه الرؤيةَ (أداءُ
             البند ١) — تمامًا كالمتجر، فلا تعملُ ٦٨ حركةَ SMIL دفعةً واحدة. */
          html += '<div class="rw-inv rw-inv--' + esc(rar) + (isEq ? ' is-eq' : '') + '">'
            + '<i class="rw-plate" aria-hidden="true"></i>'
            + '<span class="rw-inv__rar">' + esc(rn) + '</span>'
            + '<div class="rw-inv__art" data-invart="' + esc(m.id) + '"></div>'
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
    /* استلامُ مكافأةِ تحدّي الأسبوعِ — صوتُ احتفالٍ مميّزٌ لو توفّر (بند جوجو ٢). */
    _claimWeekly: function () {
      try { if (window.SFX) (SFX.weeklyClaim ? SFX.weeklyClaim() : (SFX.levelDone ? SFX.levelDone() : SFX.btn())); } catch (e) {}
      var self = this; this._post('/economy/claim-weekly', {}, function () { self._render(); });
    },
    /* بدءُ تحدّي الأسبوعِ: نُغلِقُ شاشةَ الجوائزِ ونوجّهُ للوضعِ المناسبِ حسبَ
       نوعِ التحدّي عبرَ Nav الموجود. */
    _startWeekly: function (type) {
      try { if (window.SFX) SFX.btn(); } catch (e) {}
      /* Nav معرَّفٌ كـ const في index.html فلا يظهرُ على window تلقائيًّا؛
         كان الحارسُ `if(!window.Nav)return` يُجهِضُ التوجيهَ فيبقى اللاعبُ على
         الرئيسيّة (بلاغُ جوجو ٢). نأخذُه من window (أُصبِحَ معروضًا) أو من
         النطاقِ العامِّ المشترَكِ بين السكربتات. ونوجّهُ أوّلًا ثمّ نُغلِقُ
         النافذةَ بعدَ نبضةٍ كي يثبُتَ التنقّل. */
      var N = (window.Nav) || (typeof Nav !== 'undefined' ? Nav : null);
      var go = function () {
        if (!N) return;
        try {
          if (type === 'puzzles') N.puzzles();
          else if (type === 'engine') { if (N.engine) N.engine(); else if (N.local) N.local(); else N.menu(); }
          else N.levels();   /* beat_nour / swift / streak / wins → درب نور */
        } catch (e) {}
      };
      var self = this;
      go();
      setTimeout(function () { try { self.close(); } catch (e) {} }, 60);
    },
    _equip: function (itemId, type) { try { if (window.SFX) SFX.btn(); } catch (e) {} var self = this; this._post('/economy/equip', { itemId: itemId || '', type: type || '' }, function () { if (self._tab === 'inventory') self._syncInv(); else self._render(); }); }
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
  try { window.addEventListener('amkh:cosmetics', function () {
    _watchLevel();
    if (!REWARDS._open) return;
    /* الرصيدُ/المستوى يُحدَّثان دائمًا (رخيص)، أمّا جسمُ التبويبِ: المخزونُ
       تحديثٌ موضعيٌّ لحالةِ التجهيزِ فقط (لا إعادةَ رسمٍ ثقيلة)، وغيرُه
       إعادةُ بناءٍ كاملةٌ لأنّ محتواه قد يتغيّر (أداءُ البند ١). */
    try { REWARDS._renderBar(); } catch (e) {}
    if (REWARDS._tab === 'inventory') { try { REWARDS._syncInv(); } catch (e) {} }
    else REWARDS._render();
  }); } catch (e) {}
  try { window.addEventListener('amkh:lang', function () { if (REWARDS._open) REWARDS._render(); }); } catch (e) {}
})();
