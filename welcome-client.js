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
     البيدق القافز — بطل شاشة الترحيب
     ──────────────────────────────────────────────────────────────
     بحثٌ حيّ على شاشة تسجيل chess.com (عبر متصفّح الجهاز) كشف أن بطلهم
     أنيميشن Rive اسمه «onboarding-delightful-signup»: بيدقٌ لامع يقفز
     قفزةً بهيجة على أرضيّةٍ عاكسة وحوله بريقٌ يلمع. صنعنا نظيره من عندنا:
     بيدق SVG لامع بلون سِمة التطبيق (فيتناغم مع الأزرار)، يقفز بانبطاحٍ
     وتمدّد (squash & stretch) وظلٌّ يكبر ويبهت مع ارتفاعه، ونجيماتٌ
     تلمع، وصوتُ هبوطٍ ناعم مع كل قفزة (SFX.pawnHop).

     كل الحركة CSS (transform/opacity) — JS هنا فقط يوقّت صوت الهبوط
     مع لحظة ملامسة الأرض في دورة الأنميشن، ويحترم تقليل الحركة.
  ══════════════════════════════════════════════════════════════ */
  const PAWN_SVG =
    '<svg viewBox="0 0 100 128" aria-hidden="true">'
    + '<defs>'
    + '<linearGradient id="wlPwnBody" x1="28%" y1="6%" x2="74%" y2="98%">'
    + '<stop offset="0" stop-color="var(--pawn-hi)"/>'
    + '<stop offset="0.5" stop-color="var(--pawn-mid)"/>'
    + '<stop offset="1" stop-color="var(--pawn-lo)"/>'
    + '</linearGradient>'
    + '<radialGradient id="wlPwnShine" cx="38%" cy="20%" r="42%">'
    + '<stop offset="0" stop-color="rgba(255,255,255,0.9)"/>'
    + '<stop offset="1" stop-color="rgba(255,255,255,0)"/>'
    + '</radialGradient>'
    + '</defs>'
    + '<g fill="url(#wlPwnBody)">'
    + '<ellipse cx="50" cy="115" rx="35" ry="11"/>'
    + '<path d="M31 116 C33 99 40 92 44 84 L56 84 C60 92 67 99 69 116 Z"/>'
    + '<rect x="35" y="77" width="30" height="9.5" rx="4.75"/>'
    + '<circle cx="50" cy="55" r="21"/>'
    + '</g>'
    + '<circle cx="43" cy="47" r="9" fill="url(#wlPwnShine)"/>'
    + '</svg>';
  const STAR_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor"'
    + ' d="M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0 Z"/></svg>';

  const PAWN_CYCLE_MS = 1800;   /* لازم يطابق مدّة wlPawnBounce في screens.css */
  const PAWN_LAND_MS = 1008;    /* لحظة ملامسة الأرض = 56% من الدورة */

  function makePawn() {
    const box = document.createElement('div');
    box.className = 'wl-knight';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML =
      '<div class="wl-pawn">'
      + '<svg class="wl-pawn__floor" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">'
      + '<path d="M50 6 L92 24 L50 40 L8 24 Z" fill="rgba(255,255,255,.10)"/>'
      + '<path d="M50 6 L92 24 L50 40 Z" fill="rgba(0,0,0,.16)"/>'
      + '</svg>'
      + '<span class="wl-pawn__sh"></span>'
      + '<span class="wl-pawn__pc">' + PAWN_SVG + '</span>'
      + '<span class="wl-pawn__spark s1">' + STAR_SVG + '</span>'
      + '<span class="wl-pawn__spark s2">' + STAR_SVG + '</span>'
      + '<span class="wl-pawn__spark s3">' + STAR_SVG + '</span>'
      + '</div>';

    let reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    if (reduced) return { el: box, stop: () => {} };

    /* صوت الهبوط موقوتٌ على لحظة ملامسة الأرض في كل دورة قفز */
    let dead = false, iv = null, t0 = null;
    const hop = () => { if (dead) return; try { if (window.SFX && SFX.pawnHop) SFX.pawnHop(); } catch (e) {} };
    t0 = setTimeout(() => {
      if (dead) return;
      hop();
      iv = setInterval(hop, PAWN_CYCLE_MS);
    }, PAWN_LAND_MS);

    return {
      el: box,
      stop: () => { dead = true; if (t0) clearTimeout(t0); if (iv) clearInterval(iv); },
    };
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
        if (slot) { this._board = makePawn(); slot.appendChild(this._board.el); }
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
