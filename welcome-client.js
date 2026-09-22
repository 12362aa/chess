// welcome-client.js
// شاشة الترحيب — أول تشغيل للتطبيق.
/* ──────────────────────────────────────────────────────────────
   المشكلة اللي بتتصلّح هنا: التطبيق كان بيفتح على قائمة الأنماط
   مباشرة، وزر الحساب أيقونة صغيرة في الشريط العلوي. النتيجة إن معظم
   الناس مايعرفوش أصلًا إن فيه حساب: مافيش أصدقاء، ولا تقييم محفوظ،
   ولا رسايل، والتقدّم كله بيتبخّر مع أول إعادة تثبيت — وهو مايعرفش
   إن ده كان اختياريًا.

   الحلّ: شاشة كاملة تظهر مرّة واحدة قبل أي حاجة، بتعرض القيمة (إيه
   اللي الحساب بيفتحه) وبتطلب قرارًا صريحًا. مالهاش خروج ضمني — لا
   نقرة على الحاشية ولا Escape (opts.persistent) — عشان القرار
   يكون مقصودًا، لكن «المتابعة بدون حساب» موجودة وواضحة: التطبيق
   بيشتغل كامل ضد الكمبيوتر بلا حساب، فحجزه ورا تسجيل إجباري كان
   هيخسّرنا مستخدمين لا هيكسبنا حسابات.

   الراية amkh_welcomed بتتكتب عند الخروج من الشاشة بأي طريق —
   حتى «بدون حساب» — فمابتزنّش. ولو المستخدم قفل التطبيق وهو عليها
   بلا قرار، بتظهر تاني في التشغيل الجاي.
────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const KEY = 'amkh_welcomed';

  /* ══ غطاء الإقلاع ══
     الغطاء بيتحطّ من سكربت متزامن في أول <body> (شوف index.html) عشان
     الرئيسية ماتبانش لجزء من الثانية قبل شاشة الترحيب. مين ما يقرّر إن
     الشاشة مش هتظهر — أو الشاشة نفسها بعد ما تخلّص دخولها — بيرفعه. */
  const unveil = () => {
    try { document.documentElement.classList.remove('amkh-preboot'); } catch (e) {}
  };

  /* ══════════════════════════════════════════════════════════════
     الفارس الدائر — بطل شاشة الترحيب
     ──────────────────────────────────────────────────────────────
     اللوح الصغير اللي كان بيلعب «المات المخنوق» كان أصغر من إنه يبان
     بطلًا لشاشة، وشكله بيقرّب من شاشة المنافس (بلاغ أحمد). البديل من
     صناعتنا وحدنا: فارسٌ واحد كبير يدور دورة مغلقة.

     الفكرة رياضية لا زخرفية: أربع نقلات فارس مجموع متّجهاتها صفر
         (1,2) + (2,−1) + (−1,−2) + (−2,1) = (0,0)
     فالفارس يعود لمربّعه الأوّل ثم يبدأ من جديد بلا «قطع» ولا إعادة
     ضبط مرئية — دورة لا نهائية حقيقية، وهي أصغر دورة فارس مغلقة
     ممكنة. مع كل نقلة يُرسَم مسار الـL نفسه بخطٍّ متقطّع يُكتب أمام
     العين، وهو الشكل اللي أي لاعب شطرنج بيعرفه فورًا.

     الحركة كلها transform وopacity (ودالّة رسم SVG واحدة) — مافيش
     left/top ولا width: نفس درس ومضة الـWebView (#140).
  ══════════════════════════════════════════════════════════════ */
  const KN_IMG = 'pieces/neo/wn.png';
  /* مربّعات الدورة على شبكة ٤×٤ — c العمود وr الصفّ (الصفر فوق) */
  const KN_PATH = [{ c: 0, r: 1 }, { c: 1, r: 3 }, { c: 3, r: 2 }, { c: 2, r: 0 }];
  const KN_MS = 1250;

  function makeKnight() {
    const box = document.createElement('div');
    box.className = 'wl-knight';
    box.setAttribute('aria-hidden', 'true');

    let sq = '';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        sq += '<i class="wl-kn__sq wl-kn__sq--' + ((c + r) % 2 ? 'd' : 'l') + '"></i>';
      }
    }
    box.innerHTML =
      '<div class="wl-kn__grid">' + sq + '</div>'
      + '<svg class="wl-kn__svg" viewBox="0 0 4 4" preserveAspectRatio="none">'
      + '<polyline class="wl-kn__trail" pathLength="1" fill="none" points=""/></svg>'
      + '<span class="wl-kn__ring"></span>'
      + '<span class="wl-kn__pc"><span class="wl-kn__hop">'
      + '<img class="wl-kn__img" src="' + KN_IMG + '" alt=""></span></span>';

    const grid = box.querySelector('.wl-kn__grid');
    const cells = box.querySelectorAll('.wl-kn__sq');
    const trail = box.querySelector('.wl-kn__trail');
    const ring = box.querySelector('.wl-kn__ring');
    const pcs = box.querySelector('.wl-kn__pc');
    const hop = box.querySelector('.wl-kn__hop');

    const put = (el, p) => {
      el.style.setProperty('--c', p.c);
      el.style.setProperty('--r', p.r);
    };

    /* مسار الـL: نقطتان وسيطتان — نتحرّك في المحور الأطول أوّلًا ثم
       الأقصر، وهي الطريقة اللي أي لاعب بيرسم بيها نقلة الفارس بإصبعه */
    const drawTrail = (a, b) => {
      if (!trail) return;
      const mid = (Math.abs(b.c - a.c) === 2) ? { c: b.c, r: a.r } : { c: a.c, r: b.r };
      const pt = p => (p.c + 0.5) + ',' + (p.r + 0.5);
      trail.setAttribute('points', pt(a) + ' ' + pt(mid) + ' ' + pt(b));
      trail.classList.remove('is-draw');
      /* إعادة تشغيل الرسم: قراءة تُجبر إعادة الحساب قبل إضافة الصنف */
      void trail.getBoundingClientRect();
      trail.classList.add('is-draw');
    };

    const lightUp = p => {
      cells.forEach(c => c.classList.remove('is-on'));
      const el = cells[p.r * 4 + p.c];
      if (el) el.classList.add('is-on');
    };

    let i = 0;
    put(pcs, KN_PATH[0]);
    put(ring, KN_PATH[0]);
    lightUp(KN_PATH[0]);

    let reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    if (reduced) {
      drawTrail(KN_PATH[0], KN_PATH[1]);
      return { el: box, stop: () => {} };
    }

    let timer = null, dead = false;
    const step = () => {
      if (dead) return;
      const from = KN_PATH[i];
      i = (i + 1) % KN_PATH.length;
      const to = KN_PATH[i];
      drawTrail(from, to);
      /* القفزة: الصنف يتشال ويترجع في الإطار التالي عشان الحركة تعيد
         التشغيل من أوّلها بدل ما تتجاهَل لأنها «شغّالة أصلًا» */
      hop.classList.remove('is-hop');
      requestAnimationFrame(() => {
        if (dead) return;
        hop.classList.add('is-hop');
        put(pcs, to);
        put(ring, to);
      });
      setTimeout(() => { if (!dead) lightUp(to); }, 320);
      timer = setTimeout(step, KN_MS);
    };
    timer = setTimeout(step, 700);
    /* لازم يتوقّف مع إغلاق الشاشة — مؤقّت شارد على شاشة مرمية بيفضل
       يشغّل transitions على عناصر مالهاش وجود على الشاشة */
    return { el: box, stop: () => { dead = true; if (timer) clearTimeout(timer); if (grid) grid.textContent = grid.textContent; } };
  }

  const amkhWelcome = {
    _ov: null,
    _board: null,

    seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
    markSeen() { try { localStorage.setItem(KEY, '1'); } catch (e) {} },

    shouldShow() {
      if (this.seen()) return false;
      try { if (window.amkhAuth && window.amkhAuth.token) return false; } catch (e) {}
      return true;
    },

    maybeShow() {
      if (!this.shouldShow()) { unveil(); return; }   /* مش هتظهر → مانسيبش الغطاء */
      /* ── اللغة الافتراضية إنجليزية ──
         أول تشغيل بيفتح على الإنجليزية لا العربية (قرار أحمد): الحزمة
         موجّهة لمتجر عالمي، والعربي بيلاقي زرّ «عربية» قدّامه في نفس
         الشاشة فالتكلفة عليه نقرة واحدة. الضبط هنا — قبل mount — عشان
         الشاشة تتبني بالإنجليزية من أوّل إطار بدل ما تتقلب قدام العين،
         والغطاء (amkh-preboot) لسّه نازل فمافيش ومضة.
         ‎I18N.chosen()‎ بيحمي مين اختار قبل كده: مافيش قرار بيتلغى. */
      try {
        if (window.I18N && typeof window.I18N.chosen === 'function'
            && !window.I18N.chosen() && window.I18N.lang !== 'en') {
          window.I18N.prime('en');
        }
      } catch (e) {}
      if (!this._ov) this.show();
    },

    /* إغلاق بلا تسجيل راية — للتحوّط لما الدخول يجي من مكان تالت */
    close() {
      const ov = this._ov;
      this._ov = null;
      if (this._board) { try { this._board.stop(); } catch (e) {} this._board = null; }
      if (ov && ov._dismiss) { try { ov._dismiss(); } catch (e) {} }
    },

    /* الخروج الطبيعي: الشاشة أدّت غرضها فمابترجعش */
    _finish() { this.markSeen(); this.close(); },

    /* ══ اللغة ══
       الشاشة دي أول واجهة في التطبيق، فاختيار اللغة لازم يبان فيها —
       ومن غير إعادة تحميل: الشاشة لسه مبنية قدام عين المستخدم وإعادة
       تحميلها هتبان كأن التطبيق وقع. I18N.prime بيحفظ الاختيار ويقلب
       اتجاه الصفحة ويكنس الـDOM الظاهر، و_relabel بيعيد كتابة نصوص
       الشاشة من مصدرها العربي عبر T() — فالرجوع للعربية بيرجّعها كما
       كانت بدل ما يحاول عكس ترجمة تمّت. */
    _markLang(ov) {
      const cur = (window.I18N && window.I18N.lang === 'en') ? 'en' : 'ar';
      const a = ov.querySelector('#wl-lang-ar'), e = ov.querySelector('#wl-lang-en');
      const box = ov.querySelector('.wl-lang');
      /* المؤشّر المنزلق بيتحرّك بالصنف ده وحده — لا حساب مواضع في JS */
      if (box) box.classList.toggle('is-en', cur === 'en');
      if (a) { a.classList.toggle('is-on', cur === 'ar'); a.setAttribute('aria-pressed', cur === 'ar' ? 'true' : 'false'); }
      if (e) { e.classList.toggle('is-on', cur === 'en'); e.setAttribute('aria-pressed', cur === 'en' ? 'true' : 'false'); }
    },

    _relabel(ov) {
      const t = (window.I18N && window.I18N.t) || (s => s);
      const $ = s => ov.querySelector(s);
      const put = (sel, ar) => { const el = $(sel); if (el) el.textContent = t(ar); };
      /* سطر العلامة فيه <span> لاتيني بعد النصّ، فنكتب العقدة النصّية
         وحدها كي لا نمسح الـspan */
      const bl = $('.wl-brandline');
      if (bl && bl.firstChild && bl.firstChild.nodeType === 3)
        bl.firstChild.nodeValue = t('شطرنج ');
      put('.wl-title', 'فكِّر أبعد بنقلة');
      put('.wl-sub', 'آلاف اللاعبين، وألغاز لا تنتهي، ومدرّبٌ لا ينام.');
      put('#wl-create', 'إنشاء حساب مجاني');
      put('.wl-g-label', 'المتابعة بحساب جوجل');
      put('#wl-login', 'لديّ حساب — تسجيل الدخول');
      put('#wl-skip', 'المتابعة بدون حساب');
      const er = $('#wl-err'); if (er) er.textContent = '';
    },

    show() {
      /* شاشة قصيرة بلا تمرير: بطل متحرّك كبير + جملة واحدة + أزرار
         الدخول. الجملة من كتابتنا لا ترجمة لسطر أحد. */
      const ov = window.amkhUI.mount('amkh-welcome', `
        <div class="wl-screen wl-screen--min" role="document">
          <div class="wl-lang" role="group" aria-label="Language" data-no-i18n>
            <span class="wl-lang__ind" aria-hidden="true"></span>
            <button type="button" class="wl-lang__btn" id="wl-lang-ar" lang="ar">عربية</button>
            <button type="button" class="wl-lang__btn" id="wl-lang-en" lang="en">English</button>
          </div>
          <div class="wl-info">
            <div class="wl-top">
              <div class="wl-hero"><div class="wl-knight-slot"></div></div>
              <span class="wl-brandline">شطرنج <span class="wl-brand">Am-Kh</span></span>
              <h2 class="wl-title">فكِّر أبعد بنقلة</h2>
              <p class="wl-sub">آلاف اللاعبين، وألغاز لا تنتهي، ومدرّبٌ لا ينام.</p>
            </div>
          </div>
          <div class="wl-actions">
            <button id="wl-create" class="ds-btn ds-btn--primary ds-btn--block ds-btn--lg">إنشاء حساب مجاني</button>
            <button id="wl-google" class="ds-btn ds-btn--block amkh-google-btn">
              <span class="amkh-google-mark" aria-hidden="true"></span>
              <span class="wl-g-label">المتابعة بحساب جوجل</span>
            </button>
            <p class="wl-err" id="wl-err" role="alert"></p>
            <button id="wl-login" class="ds-btn ds-btn--ghost ds-btn--block">لديّ حساب — تسجيل الدخول</button>
            <button id="wl-skip" class="wl-skip">المتابعة بدون حساب</button>
          </div>
        </div>`, { sfx: 'welcome', persistent: true });

      this._ov = ov;
      const $ = s => ov.querySelector(s);
      const err = $('#wl-err');

      /* مبدّل اللغة */
      this._markLang(ov);
      const pickLang = l => {
        try { window.amkhUI.sfx(); } catch (e) {}
        if (!window.I18N || window.I18N.lang === l) { this._markLang(ov); return; }
        window.I18N.prime(l);
        this._relabel(ov);
        this._markLang(ov);
      };
      const bAr = $('#wl-lang-ar'), bEn = $('#wl-lang-en');
      if (bAr) bAr.onclick = () => pickLang('ar');
      if (bEn) bEn.onclick = () => pickLang('en');

      /* اللوح بيتبني بعد ما الشاشة تتركّب: البناء بيرجّع stop() اللي
         close() بينادي عليها، فمافيش مؤقّت بيفضل شغّالًا ورا الشاشة */
      try {
        const slot = $('.wl-knight-slot');
        if (slot) { this._board = makeKnight(); slot.appendChild(this._board.el); }
      } catch (e) {}

      /* الغطاء بيترفع بعد ما حركة الدخول تخلص — لو رفعناه قبلها الرئيسية
         بتبان من ورا الشاشة وهي بتتلاشى داخلة، وهي دي الومضة نفسها */
      setTimeout(unveil, 520);

      /* زر جوجل بيختفي على المتصفح (الحزمة أندرويد فقط) — نفس منطق نافذة
         الدخول، عشان مانعرضش زرًّا بيخيّب لو اتضغط */
      const g = $('#wl-google');
      if (!window.amkhGoogleAuth || !window.amkhGoogleAuth.available) g.style.display = 'none';
      else g.onclick = async () => {
        window.amkhUI.sfx();
        err.textContent = '';
        g.disabled = true;
        const lb = $('.wl-g-label');
        const prev = lb.textContent;
        lb.textContent = 'جارٍ الدخول…';
        let r;
        try { r = await window.amkhAuth.loginWithGoogle(); }
        catch (e) { r = { success: false, error: 'تعذّر الدخول، حاول مرة أخرى' }; }
        g.disabled = false;
        lb.textContent = prev;
        if (r && r.success) {
          this._finish();
          window.amkhUI.notify('أهلًا بك! تم تسجيل الدخول', 'تم', '◉');
        } else if (r && !r.cancelled) {
          err.textContent = r.error || 'تعذّر الدخول';
        }
      };

      /* نافذة الحساب بتفتح فوق شاشة الترحيب وسايباها مفتوحة تحتها: لو
         المستخدم قفلها من غير تسجيل يرجع يلاقي الشاشة زي ما هي، ولو دخل
         بنجاح الاتنين بيتقفلوا مع بعض. */
      const openAuth = register => {
        window.amkhUI.sfx();
        err.textContent = '';
        window.amkhAuth.showLoginModal({ register: register, onSuccess: () => this._finish() });
      };
      $('#wl-create').onclick = () => openAuth(true);
      $('#wl-login').onclick = () => openAuth(false);

      $('#wl-skip').onclick = () => { window.amkhUI.sfx(); this._finish(); };
    },
  };

  window.amkhWelcome = amkhWelcome;

  /* الإقلاع: مانستناش amkhAuth.init() (مؤجّلة ثانية كاملة) لأن ساعتها
     المستخدم بيشوف قائمة الأنماط الأول ثم الشاشة تهبط فوقها — نطّة
     ومنظر متلخبط. بننتظر إعدادات الجهاز بس (amkhCfgReady): الثيم
     بيتطبّق في آخر Cfg.load()، فلو فتحنا قبلها الشاشة تبان بثيم
     افتراضي ثم ألوانها تتغيّر قدام العين. حدّ زمني ٢٥٠٠ms عشان
     ماتتعلّقش لو IDB اتعطّل. init() برضه بتنادي maybeShow كضمانة،
     والحرس (‎!this._ov‎) بيمنع الفتح مرتين. */
  const boot = () => { try { amkhWelcome.maybeShow(); } catch (e) {} };
  try {
    if (window.amkhCfgReady && typeof window.amkhCfgReady.then === 'function') {
      Promise.race([window.amkhCfgReady, new Promise(r => setTimeout(r, 2500))]).then(boot);
    } else setTimeout(boot, 400);
  } catch (e) { setTimeout(boot, 400); }
})();
