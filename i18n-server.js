/* ═══════════════════════════════════════════════════════════════════
   i18n-server.js — ترجمة نصوص الإشعارات على السيرفر.

   الإشعار بيتصاغ على السيرفر وبيتبعت جاهزًا لِـFCM. طبقة الترجمة اللي
   في العميل (i18n.js) بتكنس الـDOM، والإشعار مابيمرّش بالـDOM أصلًا —
   يعني مافيش أي فرصة لترجمته بعد ما يخرج من هنا. فلازم يتولد بلغة صاحبه.

   بدل ما نكتب قاموسًا تانيًا للسيرفر (ويفترقوا مع أول تعديل)، بنحمّل
   ملفّ القاموس نفسه اللي بيستعمله العميل: i18n-en.js بيتحقّق من وجود
   window.I18N ثم بينده add/addPattern وبس، فبنركّب له window مزيّفًا
   ونلقط المدخلات. نفس المفاتيح، نفس النصوص، مصدر واحد.

   منطق البحث نسخة مطابقة لِـtranslate في i18n.js: مطابقة حرفية، ثم
   تجريد الأرقام إلى {0}/{1}، ثم الأنماط.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const DICT = Object.create(null);
const PATS = [];

const AR = /[ء-ي٠-٩ﭐ-﷿ﹰ-﻿]/;
const NUM = /[0-9٠-٩]+(?:[.,:٫][0-9٠-٩]+)*/g;

function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

function abstractNums(s) {
  const nums = [];
  const key = s.replace(NUM, m => { nums.push(m); return '{' + (nums.length - 1) + '}'; });
  return { key, nums };
}
function fillNums(tpl, nums) {
  return tpl.replace(/\{(\d+)\}/g, (m, i) => (nums[+i] !== undefined ? nums[+i] : m));
}

/* النصوص اللي القاموس مالهاش ترجمة — بيقراها فحص التسريب. */
const _missing = Object.create(null);

function toEn(raw) {
  if (typeof raw !== 'string' || !raw) return raw;
  if (!AR.test(raw)) return raw;

  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
  const lead = m[1], body = norm(m[2]), tail = m[3];
  if (!body) return raw;

  let hit = DICT[body];
  if (hit !== undefined) return lead + hit + tail;

  const ab = abstractNums(body);
  if (ab.nums.length) {
    hit = DICT[ab.key];
    if (hit !== undefined) return lead + fillNums(hit, ab.nums) + tail;
  }

  for (let i = 0; i < PATS.length; i++) {
    const p = PATS[i];
    p.re.lastIndex = 0;
    if (p.re.test(body)) { p.re.lastIndex = 0; return lead + body.replace(p.re, p.en) + tail; }
  }

  _missing[body] = (_missing[body] || 0) + 1;
  return raw;
}

/* تحميل القاموس المشترك: نصب window.I18N مؤقّتًا ثم نرجّع ما كان. */
(function loadDict() {
  const had = Object.prototype.hasOwnProperty.call(global, 'window');
  const prev = global.window;
  global.window = {
    I18N: {
      add(map) { for (const k in map) DICT[norm(k)] = map[k]; },
      addPattern(re, en) { PATS.push({ re, en }); },
      t: toEn,
    },
  };
  try { require('./i18n-en.js'); }
  catch (e) { console.error('[i18n-server] تعذّر تحميل القاموس:', e && e.message); }
  finally { if (had) global.window = prev; else delete global.window; }
})();

/* T(نص، لغة) — العربية ترجع كما هي، والإنجليزية تمرّ بالقاموس. */
function T(s, lang) { return (lang === 'en') ? toEn(s) : s; }
/* LP(لغة، عربي، إنجليزي) — للنصوص المركّبة اللي مالهاش مفتاح ثابت. */
function LP(lang, ar, en) { return (lang === 'en') ? en : ar; }

module.exports = {
  T, LP, toEn,
  size: () => Object.keys(DICT).length,
  missing: () => Object.assign({}, _missing),
};
