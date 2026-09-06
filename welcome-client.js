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
  const svg = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" '
    + 'width="22" height="22" aria-hidden="true">' + d + '</svg>';

  /* ══ غطاء الإقلاع ══
     الغطاء بيتحطّ من سكربت متزامن في أول <body> (شوف index.html) عشان
     الرئيسية ماتبانش لجزء من الثانية قبل شاشة الترحيب. مين ما يقرّر إن
     الشاشة مش هتظهر — أو الشاشة نفسها بعد ما تخلّص دخولها — بيرفعه. */
  const unveil = () => {
    try { document.documentElement.classList.remove('amkh-preboot'); } catch (e) {}
  };

  /* ══════════════════════════════════════════════════════════════
     لوح مصغّر بيلعب «المات المخنوق»
     ──────────────────────────────────────────────────────────────
     الشاشة كانت علامة ساكنة وأربع سطور — مابتقولش إن ده تطبيق شطرنج
     من أول نظرة. بقى في مكان العلامة لوح ٤×٤ (المنطقة e5–h8 من رقعة
     حقيقية) بيلعب أشهر مات في الشطرنج بتسلسله الصحيح:
         Qe6-g8+   Rf8xg8   Ng5-f7#
     والوضع ده مات مقفول فعلًا مش تشبيه: الفارس على f7 بيكشف على الملك
     في h8، وg8 بقى عليها رخّ أسود بعد ما أكل الملكة، وg7 وh7 عليهم
     بيادق سودا — الملك مالوش مربع واحد يهرب له.
     القطع صور من مجموعة التطبيق نفسها (pieces/neo، مرفقة في الحزمة)
     مش محارف: المحرف ♟ على بعض أجهزة أندرويد بيقع على خط الإيموجي
     الملوّن، وشاشة قالوا فيها «بلا إيموجي» ماينفعش يبان فيها إيموجي.
     الحركة كلها transform (مش left/top) فالـcompositor بيشيلها من غير
     إعادة تخطيط — نفس درس ومضة الـWebView.
  ══════════════════════════════════════════════════════════════ */
  const PZ = 'pieces/neo/';
  /* c = العمود (e f g h) و r = الصف (8 7 6 5) — الصفر فوق وعلى الشمال */
  const B_START = [
    { id: 'k', p: 'bk', c: 3, r: 0 },
    { id: 'r', p: 'br', c: 1, r: 0 },
    { id: 'p1', p: 'bp', c: 2, r: 1 },
    { id: 'p2', p: 'bp', c: 3, r: 1 },
    { id: 'n', p: 'wn', c: 2, r: 3 },
    { id: 'q', p: 'wq', c: 0, r: 2 },
  ];
  const B_PLAY = [
    { id: 'q', c: 2, r: 0, check: 1, sfx: 'check' },      /* الملكة تضحّي بنفسها على g8 */
    { id: 'r', c: 2, r: 0, takes: 'q', sfx: 'capture' },  /* الرخّ مجبَر ياكلها */
    { id: 'n', c: 1, r: 1, mate: 1, sfx: 'checkmate' },   /* الفارس ينزل f7 — مات */
  ];

  /* أصوات القطع نفسها المستخدمة في المباريات (SFX في index.html): بتحترم
     إعداد الصوت وقوّته تلقائيًا، فلو المستخدم مقفّل الصوت مافيش أي صوت. */
  const snd = name => { try { if (window.SFX && window.SFX[name]) window.SFX[name](); } catch (e) {} };


  function makeBoard() {
    const box = document.createElement('div');
    box.className = 'wl-board';
    box.setAttribute('aria-hidden', 'true');

    let sq = '';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        /* لون المربع محسوب من إحداثيّاته الحقيقية على الرقعة (e=5، الصف
           الأول 8) فالفاتح والغامق يقعوا زي أي رقعة شطرنج مضبوطة */
        const light = ((5 + c) + (8 - r)) % 2 === 1;
        sq += '<i class="wl-sq wl-sq--' + (light ? 'l' : 'd') + '"></i>';
      }
    }
    const pcs = B_START.map(p =>
      '<img class="wl-pc" data-p="' + p.id + '" src="' + PZ + p.p + '.png" alt=""'
      + ' style="--c:' + p.c + ';--r:' + p.r + '">').join('');
    box.innerHTML = '<div class="wl-board__grid">' + sq + '</div>'
      + '<div class="wl-board__pcs">' + pcs + '</div>';

    const sqs = box.querySelectorAll('.wl-sq');
    const pc = id => box.querySelector('.wl-pc[data-p="' + id + '"]');
    const at = (c, r) => sqs[r * 4 + c];
    const clearHl = () => sqs.forEach(s => s.classList.remove('is-hl'));

    const place = (el, c, r) => { el.style.setProperty('--c', c); el.style.setProperty('--r', r); };

    const reset = () => {
      clearHl();
      B_START.forEach(p => {
        const el = pc(p.id);
        if (!el) return;
        el.classList.remove('wl-pc--gone', 'wl-pc--mate', 'wl-pc--check');
        place(el, p.c, p.r);
      });
    };

    const play = i => {
      const m = B_PLAY[i];
      const el = pc(m.id);
      if (!el) return;
      clearHl();
      const from = at(+el.style.getPropertyValue('--c'), +el.style.getPropertyValue('--r'));
      if (from) from.classList.add('is-hl');
      const to = at(m.c, m.r);
      if (to) to.classList.add('is-hl');
      if (m.takes) { const v = pc(m.takes); if (v) v.classList.add('wl-pc--gone'); }
      place(el, m.c, m.r);
      const k = pc('k');
      if (k && m.check) k.classList.add('wl-pc--check');
      if (k && m.mate) { k.classList.remove('wl-pc--check'); k.classList.add('wl-pc--mate'); }
      if (m.sfx) snd(m.sfx);
    };

    /* «حركة أقل» في إعدادات النظام: نعرض وضع المات ثابتًا وخلاص */
    let reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    if (reduced) {
      box.classList.add('wl-board--still');
      B_PLAY.forEach((m, i) => play(i));
      return { el: box, stop: () => {} };
    }

    /* دورة العرض. اللوح نفسه (الإطار والمربعات) مابيختفيش أبدًا — القطع
       وحدها بتتلاشى لحظة إعادة الوضع الابتدائي، لأن تلاشي اللوح كله كان
       بيبان كأن الحركة وقفت وسابت فراغًا (بلاغ أحمد). */
    const SEQ = [
      { d: 900,  fn: () => {} },
      { d: 1000, fn: () => play(0) },
      { d: 1000, fn: () => play(1) },
      { d: 2300, fn: () => play(2) },
      { d: 300,  fn: () => box.classList.add('wl-board--fade') },
      { d: 70,   fn: () => reset() },                              /* الرجوع وهي غير مرئية */
      { d: 500,  fn: () => box.classList.remove('wl-board--fade') },
    ];
    let i = 0, timer = null, dead = false;
    const next = () => {
      if (dead) return;
      const s = SEQ[i];
      i = (i + 1) % SEQ.length;
      try { s.fn(); } catch (e) {}
      timer = setTimeout(next, s.d);
    };
    next();
    /* لازم يتوقّف مع إغلاق الشاشة — مؤقّت شارد على شاشة مرمية بيفضل
       يشغّل transitions على عناصر مالهاش وجود على الشاشة */
    return { el: box, stop: () => { dead = true; if (timer) clearTimeout(timer); } };
  }

  /* أيقونات خطية من نفس عائلة أيقونات التطبيق — مافيش إيموجي في أي نص */
  const ICO = {
    friends: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    rating:  svg('<path d="M6 21V10"/><path d="M12 21V4"/><path d="M18 21v-7"/><path d="M3 21h18"/>'),
    chat:    svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'),
    sync:    svg('<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>'),
  };

  /* نصوص الشاشة بالفصحى — دي أول واجهة يشوفها المستخدم، والعامّية فيها
     كانت بتخلّي التطبيق يبان أقل رسميّة (طلب أحمد). */
  const FEATS = [
    ['friends', 'لاعبون حقيقيون', 'تحدَّ أصدقاءك أو خصمًا في مستواك، في أي وقت'],
    ['rating',  'تقييم يتغيّر بعد كل مباراة', 'مباريات مصنّفة ولوحة صدارة بين اللاعبين'],
    ['chat',    'دردشة ومكالمات صوتية', 'تحدَّث مع أصدقائك أثناء اللعب، دون تطبيق آخر'],
    ['sync',    'تقدّمك محفوظ', 'المراحل والإعدادات والصورة تعود معك على أي جهاز'],
  ];

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

    show() {
      const feats = FEATS.map(f => `
        <li class="wl-feat">
          <span class="wl-feat__ic" aria-hidden="true">${ICO[f[0]]}</span>
          <span class="wl-feat__txt">
            <b class="wl-feat__t">${f[1]}</b>
            <span class="wl-feat__s">${f[2]}</span>
          </span>
        </li>`).join('');

      const ov = window.amkhUI.mount('amkh-welcome', `
        <div class="wl-screen" role="document">
          <div class="wl-info">
            <div class="wl-top">
              <div class="wl-hero"><div class="wl-board-slot"></div></div>
              <h2 class="wl-title">أهلًا بك في شطرنج <span class="wl-brand">Am-Kh</span></h2>
              <p class="wl-sub">اللعبة كاملة بلا إنترنت، والحساب يفتح باقي التطبيق</p>
            </div>
            <ul class="wl-feats">${feats}</ul>
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

      /* اللوح بيتبني بعد ما الشاشة تتركّب: البناء بيرجّع stop() اللي
         close() بينادي عليها، فمافيش مؤقّت بيفضل شغّالًا ورا الشاشة */
      try {
        const slot = $('.wl-board-slot');
        if (slot) { this._board = makeBoard(); slot.appendChild(this._board.el); }
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
