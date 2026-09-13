/* ═══════════════════════════════════════════════════════════════════
   i18n.js — طبقة التعريب/الترجمة للتطبيق.

   الفكرة: التطبيق مكتوب بالعربية أصلًا، والنصوص العربية هي «المفاتيح».
   الترجمة تتم على مستويين:
     ١) T('نص')  — تُستدعى من الجافاسكربت وقت بناء أي نص.
     ٢) مسح الـDOM — يترجم ما يصل إلى الشاشة من الترميز الثابت ومن أي
        عنصر يُضاف لاحقًا (MutationObserver).

   تبديل اللغة يعيد تحميل التطبيق عمدًا: أبسط وأضمن من محاولة إرجاع كل
   نص إلى أصله، ويضمن أن النصوص المولَّدة سلفًا (تعليق نور مثلًا) تُبنى
   من جديد باللغة الجديدة.

   ما لا يُترجم: أي عنصر عليه data-no-i18n أو داخل عنصر عليه — وهي
   محتوى المستخدم (أسماء، رسائل الشات) وترميز الشطرنج والأرقام.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var KEY = 'amkh_lang';
  var AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

  var lang = 'ar';
  try { if (localStorage.getItem(KEY) === 'en') lang = 'en'; } catch (e) {}

  /* القاموس: نص عربي → إنجليزي. يُملأ من DICT_EN في آخر الملف. */
  var DICT = Object.create(null);
  /* أنماط للنصوص التي تحوي أجزاء متغيّرة لا تُختزل بالأرقام وحدها. */
  var PATS = [];

  /* ── أدوات ── */
  var NUM = /[0-9٠-٩]+(?:[.,:٫][0-9٠-٩]+)*/g;

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

  /* يستبدل الأرقام بعلامات {0},{1}… ليصير للنص مفتاح واحد مهما تغيّرت. */
  function abstractNums(s) {
    var nums = [];
    var key = s.replace(NUM, function (m) { nums.push(m); return '{' + (nums.length - 1) + '}'; });
    return { key: key, nums: nums };
  }
  function fillNums(tpl, nums) {
    return tpl.replace(/\{(\d+)\}/g, function (m, i) {
      return nums[+i] !== undefined ? nums[+i] : m;
    });
  }

  /* النصوص التي عُجز عن ترجمتها — يقرأها هارنس الفحص. */
  var missing = Object.create(null);
  function note(s) { if (!missing[s]) missing[s] = 0; missing[s]++; }

  /* ترجمة نصّ خام مع الحفاظ على المسافات الطرفية. */
  function translate(raw) {
    if (lang !== 'en' || typeof raw !== 'string' || !raw) return raw;
    if (!AR.test(raw)) return raw;

    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
    var lead = m[1], body = norm(m[2]), tail = m[3];
    if (!body) return raw;

    var hit = DICT[body];
    if (hit !== undefined) return lead + hit + tail;

    /* المحاولة الثانية: تجريد الأرقام. */
    var ab = abstractNums(body);
    if (ab.nums.length) {
      hit = DICT[ab.key];
      if (hit !== undefined) return lead + fillNums(hit, ab.nums) + tail;
    }

    /* المحاولة الثالثة: الأنماط. */
    for (var i = 0; i < PATS.length; i++) {
      var p = PATS[i];
      p.re.lastIndex = 0;
      if (p.re.test(body)) {
        p.re.lastIndex = 0;
        return lead + body.replace(p.re, p.en) + tail;
      }
    }

    note(body);
    return raw;
  }

  /* ── القوالب المُركَّبة ──────────────────────────────────────────
     مسح الـDOM يعجز عن أي جملة فيها قيمة متغيّرة في وسطها: «أنهيتَ
     المرحلة أمام نور.» لا تساوي أي مفتاح لأن الاسم جزء من النصّ.
     الحلّ وسم قالب: tt`${ن}أنهيتَ ${س} أمام ${خ}.` — الوسم يبني المفتاح
     «{0}أنهيتَ {1} أمام {2}.» (نفس شكل الحصّاد)، يترجمه، ثم يملأ الفراغات.
     في العربية يرجع النصّ كما هو بلا أي تكلفة تُذكر. */
  function fill(tpl, vals) {
    return tpl.replace(/\{(\d+)\}/g, function (m, i) {
      return vals[+i] !== undefined && vals[+i] !== null ? String(vals[+i]) : '';
    });
  }
  function tt(strings, _v) {
    var vals = Array.prototype.slice.call(arguments, 1);
    var key = '';
    for (var i = 0; i < strings.length; i++) {
      key += strings[i];
      if (i < vals.length) key += '{' + i + '}';
    }
    if (lang !== 'en') return fill(key, vals);
    /* المسافات الطرفية جزء من النصّ لا من المفتاح: القالب «يا {0}، » يُخزَّن
       مقلَّمًا في القاموس، ولو أرجعناه مقلَّمًا لالتصق بما بعده. */
    var mm = /^(\s*)([\s\S]*?)(\s*)$/.exec(key);
    var lead = mm[1], body = norm(mm[2]), tail = mm[3];
    var hit = DICT[body];
    if (hit === undefined) {
      for (var j = 0; j < PATS.length; j++) {
        PATS[j].re.lastIndex = 0;
        if (PATS[j].re.test(body)) { PATS[j].re.lastIndex = 0; hit = body.replace(PATS[j].re, PATS[j].en); break; }
      }
    }
    if (hit === undefined) { if (AR.test(body)) note(body); return fill(key, vals); }
    var out = fill(lead + hit + tail, vals);
    /* العربية لا تعرف حرفًا كبيرًا، فقوالبها تبدأ بفعل صغير بعد الترجمة
       («you finished…»). نرفع أوّل حرف حقيقي ما لم يسبقه نصّ آخر. */
    var k = out.search(/\S/);
    if (k >= 0 && /[a-z]/.test(out.charAt(k))) out = out.slice(0, k) + out.charAt(k).toUpperCase() + out.slice(k + 1);
    return out;
  }

  /* ── طبقة الـDOM ── */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'aria-placeholder', 'data-label', 'data-tip'];
  var busy = false;

  /* محتوى المستخدم بالصنف لا بالسمة: أسماء اللاعبين ونصوص الرسائل
     تُبنى من عشرات المواضع، فوسم كل موضع بـdata-no-i18n كان سيُنسى في
     أحدها يومًا — والنتيجة اسمٌ مترجَم. القائمة هنا نقطة واحدة. */
  var NOI = {
    'ch-bubble__body': 1, 'ch-bubble__from': 1, 'ch-inbox__name': 1,
    'ch-inbox__prev': 1, 'ch-conv__name': 1, 'ch-ment__name': 1,
    'ch-ment-tag': 1, 'ch-reply__name': 1, 'ch-reply__preview': 1,
    'ch-gtoast__name': 1, 'ch-gtoast__body': 1, 'grp-pick__name': 1,
    'lb-row__name': 1, 'pc__name': 1, 'ch-time': 1, 'chat-msg': 1,
    'mem-row__name': 1, 'settings-headline': 1,
    'rv-card-notation': 1, 'rv-chip': 1, 'hist-mv': 1, 'pb-name': 1,
  };
  function noiClass(el) {
    var c = el.className;
    if (!c || typeof c !== 'string') return false;
    var parts = c.split(/\s+/);
    for (var i = 0; i < parts.length; i++) if (NOI[parts[i]]) return true;
    return false;
  }

  function skipEl(el) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      var t = el.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT' || t === 'TEXTAREA') return true;
      if (el.hasAttribute('data-no-i18n')) return true;
      if (noiClass(el)) return true;
    }
    return false;
  }

  function doText(node) {
    var v = node.nodeValue;
    if (!v || !AR.test(v)) return;
    if (skipEl(node.parentElement)) return;
    var out = translate(v);
    if (out !== v) node.nodeValue = out;
  }

  function doAttrs(el) {
    if (skipEl(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var v = el.getAttribute(a);
      if (!v || !AR.test(v)) continue;
      var out = translate(v);
      if (out !== v) el.setAttribute(a, out);
    }
    /* input[type=button|submit] قيمته نصّ ظاهر */
    if (el.tagName === 'INPUT') {
      var ty = (el.getAttribute('type') || '').toLowerCase();
      if ((ty === 'button' || ty === 'submit' || ty === 'reset') && el.value && AR.test(el.value)) {
        var o = translate(el.value);
        if (o !== el.value) el.value = o;
      }
    }
  }

  function sweep(root) {
    if (lang !== 'en' || !root) return;
    busy = true;
    try {
      if (root.nodeType === 3) { doText(root); return; }
      if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
      if (root.nodeType === 1) doAttrs(root);
      var w = document.createTreeWalker(root, 1 | 4 /* ELEMENT|TEXT */, null);
      var n;
      while ((n = w.nextNode())) {
        if (n.nodeType === 3) doText(n);
        else doAttrs(n);
      }
    } finally { busy = false; }
  }

  /* ── المراقب: يترجم كل ما يُضاف أو يتغيّر بعد التحميل ── */
  var queue = [];
  var scheduled = false;
  function flush() {
    scheduled = false;
    var q = queue; queue = [];
    for (var i = 0; i < q.length; i++) {
      var n = q[i];
      if (!n || !n.isConnected) continue;
      sweep(n);
    }
  }
  function enqueue(n) {
    queue.push(n);
    if (!scheduled) { scheduled = true; (global.requestAnimationFrame || setTimeout)(flush, 0); }
  }

  var observer = null;
  function observe() {
    if (lang !== 'en' || observer || !global.MutationObserver) return;
    observer = new MutationObserver(function (recs) {
      if (busy) return;
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'childList') {
          for (var j = 0; j < r.addedNodes.length; j++) enqueue(r.addedNodes[j]);
        } else if (r.type === 'characterData') {
          enqueue(r.target);
        } else if (r.type === 'attributes') {
          enqueue(r.target);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
  }

  /* ── اتّجاه الصفحة: يُضبط فورًا قبل أول رسم ── */
  function applyDir() {
    var h = document.documentElement;
    if (!h) return;
    h.setAttribute('lang', lang === 'en' ? 'en' : 'ar');
    h.setAttribute('dir', lang === 'en' ? 'ltr' : 'rtl');
    h.classList.toggle('lang-en', lang === 'en');
    h.classList.toggle('lang-ar', lang !== 'en');
  }
  applyDir();

  /* ── الواجهة العامّة ── */
  var I18N = {
    get lang() { return lang; },
    KEY: KEY,
    /* هل اختار المستخدم لغة صراحةً من قبل؟ */
    chosen: function () { try { return localStorage.getItem(KEY) != null; } catch (e) { return false; } },
    t: translate,
    tt: tt,
    /* اختيار بين نصّين حسب اللغة — للحالات التي لا يكفي فيها القاموس
       (توجيهات نور لنموذج اللغة مثلًا: نصّ عربي كامل مقابل نصّ إنجليزي). */
    pick: function (ar, en) { return lang === 'en' ? en : ar; },
    /* ترجمة إلى لغة بعينها بصرف النظر عن لغة الواجهة. يحتاجها نور حين
       يردّ بلغة الرسالة المكتوبة إليه لا بلغة التطبيق: من يكاتبه عربيًّا
       والواجهة إنجليزية يجب أن يجد ردًّا عربيًّا. translate متزامنة ولا
       تحتفظ بحالة، فتبديل المتغيّر حولها وإرجاعه آمن. */
    tin: function (l, s) {
      if (l !== 'en') return s;
      var prev = lang; lang = 'en';
      try { return translate(s); } finally { lang = prev; }
    },
    /* تسجيل مدخلات إضافية (تستعملها ملفات العميل الأخرى) */
    add: function (map) { for (var k in map) DICT[norm(k)] = map[k]; },
    addPattern: function (re, en) { PATS.push({ re: re, en: en }); },
    apply: sweep,
    /* يضبط اللغة ويعيد التحميل — أضمن من محاولة عكس الترجمة حيًّا. */
    set: function (l, opts) {
      l = (l === 'en') ? 'en' : 'ar';
      var same = (l === lang);
      try { localStorage.setItem(KEY, l); } catch (e) {}
      if (same) return false;
      if (!opts || opts.reload !== false) global.location.reload();
      return true;
    },
    /* يثبّت اللغة بلا إعادة تحميل — لشاشة الترحيب قبل بناء الواجهة. */
    prime: function (l) {
      l = (l === 'en') ? 'en' : 'ar';
      try { localStorage.setItem(KEY, l); } catch (e) {}
      lang = l; applyDir();
      if (lang === 'en') { observe(); sweep(document.documentElement); }
      /* الكنس يطال ما في الـDOM فقط. أما النصوص التي بناها الجافاسكربت
         بلغته قبل الاختيار — تحدّيات اليوم مثلًا تُكتب بـLP وقت التوليد —
         فلا مفتاح لها في القاموس ولا تتبدّل بالكنس. لذلك نعلن الحدث،
         وتعيد الشاشات المعنيّة بناء محتواها باللغة الجديدة. */
      try { global.dispatchEvent(new CustomEvent('amkh:lang', { detail: { lang: lang } })); } catch (e) {}
      return lang;
    },
    /* للفحص الآليّ: النصوص التي لم يجد لها القاموس ترجمة. */
    missing: function () { return Object.assign({}, missing); },
    /* للفحص الآليّ: كل نصّ عربيّ ما زال ظاهرًا فعلًا على الشاشة.
       all=true يتجاهل شرط الظهور فيشمل النوافذ المطويّة كذلك — بها
       يغطّي الفحص كلّ الترميز الثابت دفعةً واحدة بلا فتحه يدويًّا. */
    scanArabic: function (root, all) {
      var out = [];
      var w = document.createTreeWalker(root || document.body, 1 | 4, null);
      var n;
      function visible(el) {
        if (all) return true;
        for (; el && el.nodeType === 1; el = el.parentElement) {
          var s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        }
        return true;
      }
      while ((n = w.nextNode())) {
        if (n.nodeType === 3) {
          var v = norm(n.nodeValue || '');
          if (v && AR.test(v) && !skipEl(n.parentElement) && visible(n.parentElement))
            out.push({ kind: 'text', text: v, where: path(n.parentElement) });
        } else {
          if (skipEl(n)) continue;
          for (var i = 0; i < ATTRS.length; i++) {
            var a = ATTRS[i];
            if (!n.hasAttribute(a)) continue;
            var av = norm(n.getAttribute(a) || '');
            if (av && AR.test(av)) out.push({ kind: a, text: av, where: path(n) });
          }
        }
      }
      return out;
      function path(el) {
        var p = [];
        for (var e = el; e && e.nodeType === 1 && p.length < 4; e = e.parentElement)
          p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '')));
        return p.join('>');
      }
    },
  };

  global.I18N = I18N;
  /* T() المختصرة — المستعملة في كل أنحاء التطبيق. */
  global.T = translate;
  /* tt`` وسم القوالب، وLP() للاختيار بين نصّين حسب اللغة. */
  global.tt = tt;
  global.LP = I18N.pick;

  function boot() {
    if (lang !== 'en') return;
    observe();
    sweep(document.documentElement);
    if (document.title && AR.test(document.title)) document.title = translate(document.title);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
    /* ونبدأ المراقبة فورًا كي لا يفوتنا ما يُبنى أثناء التحليل. */
    observe();
  } else boot();

  /* ═══════════ القاموس ═══════════ */
  I18N.add({
    /* — بطاقة المراجعة وتصنيف النقلات — */
    'حركة': 'Move',
    'أبيض': 'White',
    'أسود': 'Black',
    'تقييم': 'Eval',
  });

})(typeof window !== 'undefined' ? window : this);
