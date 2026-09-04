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

  /* علامة التطبيق: بيدق مرسوم SVG مش المحرف ♟.
     المحرف بياخد خطّه من النظام — وعلى بعض أجهزة أندرويد بيقع على خط
     الإيموجي الملوّن فيبان إيموجي وسط شاشة قالوا فيها «بلا إيموجي»،
     وعلى أجهزة تانية بيبان بوزن وحجم مختلفين تمامًا. الرسم بيضمن نفس
     الشكل بلون الثيم على كل جهاز. */
  const MARK = '<svg viewBox="0 0 48 48" width="100%" height="100%" fill="currentColor" aria-hidden="true">'
    + '<circle cx="24" cy="12.5" r="6.6"/>'
    + '<path d="M19.1 20h9.8l-1.6 3.7c2.2 3.1 3.5 6.8 3.8 10.6H16.9c.3-3.8 1.6-7.5 3.8-10.6z"/>'
    + '<path d="M12.6 36h22.8c.6 0 1.1.4 1.3.9l1.5 4.3c.2.7-.3 1.4-1.1 1.4H10.9c-.8 0-1.3-.7-1.1-1.4l1.5-4.3c.2-.5.7-.9 1.3-.9z"/>'
    + '</svg>';

  /* أيقونات خطية من نفس عائلة أيقونات التطبيق — مافيش إيموجي في أي نص */
  const ICO = {
    friends: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    rating:  svg('<path d="M6 21V10"/><path d="M12 21V4"/><path d="M18 21v-7"/><path d="M3 21h18"/>'),
    chat:    svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'),
    sync:    svg('<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>'),
  };

  const FEATS = [
    ['friends', 'لاعبون حقيقيون', 'تحدَّ أصدقاءك أو خصمًا في مستواك، في أي وقت'],
    ['rating',  'تقييم يتحدّث بعد كل مباراة', 'مباريات مصنّفة ولوحة صدارة بين اللاعبين'],
    ['chat',    'دردشة ومكالمات صوتية', 'اتكلم مع أصدقائك وأنت بتلعب، من غير تطبيق تاني'],
    ['sync',    'تقدّمك محفوظ', 'المراحل والإعدادات والصورة بترجع معاك على أي جهاز'],
  ];

  const amkhWelcome = {
    _ov: null,

    seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
    markSeen() { try { localStorage.setItem(KEY, '1'); } catch (e) {} },

    shouldShow() {
      if (this.seen()) return false;
      try { if (window.amkhAuth && window.amkhAuth.token) return false; } catch (e) {}
      return true;
    },

    maybeShow() { if (this.shouldShow() && !this._ov) this.show(); },

    /* إغلاق بلا تسجيل راية — للتحوّط لما الدخول يجي من مكان تالت */
    close() {
      const ov = this._ov;
      this._ov = null;
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
              <span class="wl-mark" aria-hidden="true">${MARK}</span>
              <h2 class="wl-title">أهلًا بك في شطرنج Am-Kh</h2>
              <p class="wl-sub">اللعبة كاملة معاك أوفلاين — والحساب هو اللي يفتح باقي التطبيق</p>
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
        lb.textContent = 'جاري الدخول…';
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
