// auth-client.js
// يعالج تسجيل الدخول والاتصال بالـ API

/* هل إحنا جوه تطبيق أندرويد (Capacitor) ولا في متصفح؟
   ──────────────────────────────────────────────────────────────
   الفرق ده حرج: Capacitor بيقدّم الصفحة من https://localhost، يعني
   location.hostname === 'localhost' جوه التطبيق. والنسخة القديمة كانت
   بتاخد ده كإشارة «إحنا في التطوير» وترجّع http://localhost:8081/api —
   وده عنوان التليفون نفسه، مافيهوش سيرفر. النتيجة إن تسجيل الدخول
   كان بيفشل دايمًا في الـAPK بـ«تعذّر الاتصال بالخادم» رغم إن السيرفر
   البعيد شغّال (الأونلاين كان شغّال لأنه بيستخدم رابطه الخاص).
   فالاختصار المحلي بقى للمتصفح بس. */
window.amkhIsNative = () => {
  try {
    if (window.Capacitor) {
      if (typeof window.Capacitor.isNativePlatform === 'function') return window.Capacitor.isNativePlatform();
      return true;
    }
  } catch (e) {}
  return /\bwv\b|Android.*Version\/[\d.]+\s+Chrome/.test(navigator.userAgent) && location.protocol === 'https:' && location.hostname === 'localhost';
};

window.getApiBase = () => {
  if (window.SERVER_HTTP) return window.SERVER_HTTP + '/api';
  if (!window.amkhIsNative()
      && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8081/api';
  }
  return '/api';
};

/* ──────────────────────────────────────────────────────────────
   التأكد إن رابط السيرفر متاح قبل أي نداء API.
   ──────────────────────────────────────────────────────────────
   الرابط بيتحمّل جوه وحدة الأونلاين (OL) وبيتعرّض على
   window.SERVER_HTTP، لكن تحميله كان بيحصل أول ما تفتح شاشة الأونلاين
   بس. فلو المستخدم فتح تسجيل الدخول من الشاشة الرئيسية، الرابط مايكونش
   اتحمّل وgetApiBase ترجع مسار مش صحيح.

   الدالة دي بتحمّله عند الحاجة وبترجّع true لو بقى متاح. كل نداء
   بيتصل بالسيرفر بينادي عليها الأول. */
window.amkhEnsureServer = async function ensureServer() {
  if (window.SERVER_HTTP) return true;
  /* متصفح تطوير محلي: getApiBase عندها مسار مباشر للسيرفر المحلي */
  const h = window.location.hostname;
  if (!window.amkhIsNative() && (h === 'localhost' || h === '127.0.0.1')) return true;
  if (typeof window.amkhLoadServerUrl === 'function') {
    /* نداء واحد بس لو كان فيه محاولة شغّالة، عشان فتح النافذة مرتين
       مايبعتش طلبين للـGitHub */
    if (!window.__srvPromise) {
      window.__srvPromise = window.amkhLoadServerUrl()
        .catch(() => false)
        .finally(() => { window.__srvPromise = null; });
    }
    try { await window.__srvPromise; } catch (e) {}
  }
  return !!window.SERVER_HTTP;
};

/* ──────────────────────────────────────────────────────────────
   amkhUI — طبقة عرض مشتركة للحساب والأصدقاء.
   الملفين دول كانوا بيحقنوا HTML بستايل inline خام (أزرار برتقالي
   عايمة و alert/confirm بتاعة المتصفح) فكانوا بيبانوا كأنهم مش من
   نفس التطبيق. هنا بنبني كل حاجة على نفس التوكنز والكلاسات
   (.ds-overlay / .ds-dialog / .ds-sheet / .ds-btn / .ds-input)
   وبنستخدم DSOverlay بتاع التطبيق لما يكون موجود.
────────────────────────────────────────────────────────────── */
const amkhUI = {
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },

  sfx() { try { if (window.SFX) window.SFX.btn(); } catch (e) {} },

  open(el) {
    if (window.DSOverlay) return window.DSOverlay.open(el);
    el.classList.add('is-open');
  },

  close(el) {
    if (!el) return;
    if (window.DSOverlay) window.DSOverlay.close(el);
    else el.classList.remove('is-open');
    setTimeout(() => { if (el.parentNode) el.remove(); }, 260);
  },

  /* بيرجّع الـoverlay جاهز ومفتوح. الإغلاق بالضغط على الخلفية أو Escape. */
  mount(id, innerHTML, opts) {
    const old = document.getElementById(id);
    /* لو النافذة القديمة لسه مفتوحة، نقفلها صح الأول عشان قفل التمرير
       يتصحّح — مش بس نشيلها من الـDOM (ده كان بيخلي التمرير يتجمّد). */
    if (old) {
      try { if (window.DSOverlay) window.DSOverlay.close(old); } catch (e) {}
      old.remove();
      try { if (window.DSOverlay && window.DSOverlay._syncBodyLock) window.DSOverlay._syncBodyLock(); } catch (e) {}
    }
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'ds-overlay' + ((opts && opts.sheet) ? ' ds-overlay--sheet' : '');
    /* نوع صوت الفتح: مخصّص من opts.sfx، وإلا الأوراق السفلية تاخد صوت
       sheet والباقي default. DSOverlay.open بيقرا الخاصية دي. */
    if (opts && opts.sfx) overlay.dataset.sfx = opts.sfx;
    else if (opts && opts.sheet) overlay.dataset.sfx = 'sheet';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = innerHTML;
    document.body.appendChild(overlay);

    const dismiss = () => {
      document.removeEventListener('keydown', onKey);
      this.close(overlay);
      if (opts && typeof opts.onDismiss === 'function') { try { opts.onDismiss(); } catch (e) {} }
    };
    /* نقرة الشبح: على اللمس، بعد ما تضغط الزر اللي بيفتح النافذة، بيتبعت
       click تاني «شبح» بعد ~300ms عند نفس مكان الزر. النافذة بتكون فتحت
       وغطّت المكان ده، فالنقرة دي بتقع على خلفية النافذة وتقفلها فورًا —
       ده بالظبط «الأيقونة تفتح النافذة وتختفي». بنتجاهل إغلاق الخلفية
       أول ٤٥٠ms عشان نمتص نقرة الشبح. (مالوش أي أثر على المتصفح). */
    let openedAt = 0;
    const onKey = e => { if (e.key === 'Escape') dismiss(); };
    /* opts.persistent: نافذة مالهاش خروج ضمني — لا نقرة على الخلفية ولا
       Escape بيقفلوها، والإغلاق بيحصل من أزرارها بس. شاشة الترحيب أول
       تشغيل محتاجة ده: لازم المستخدم ياخد قرارًا صريحًا (حساب / جوجل /
       بدون حساب) مش يهرب منها بنقرة على الحاشية فيفضل بلا حساب من غير
       ما يعرف إن فيه أصلًا. الافتراضي زي ما كان. */
    if (!(opts && opts.persistent)) {
      overlay.addEventListener('click', e => {
        if (e.target !== overlay) return;
        if (openedAt && (Date.now() - openedAt) < 450) return;
        dismiss();
      });
      document.addEventListener('keydown', onKey);
    }

    overlay.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => { this.sfx(); dismiss(); });
    });

    requestAnimationFrame(() => { openedAt = Date.now(); this.open(overlay); });
    overlay._dismiss = dismiss;
    return overlay;
  },

  /* بديل alert() — بيستخدم نافذة التطبيق نفسها لو متاحة */
  notify(message, title, icon) {
    if (window.Modal && window.Modal.show) return window.Modal.show(message, title || 'تنبيه', icon || '◉');
    const kind = (icon === '✕' || icon === '◆' || icon === '⚡' || icon === '⚠') ? 'error' : 'success';
    const ov = this.mount('amkh-ui-notify', `
      <div class="ds-dialog">
        <div class="ds-dialog__icon">${this.esc(icon || '◉')}</div>
        <h2 class="ds-dialog__title">${this.esc(title || 'تنبيه')}</h2>
        <p class="ds-dialog__message">${this.esc(message)}</p>
        <div class="ds-dialog__actions">
          <button class="ds-btn ds-btn--primary" data-close>موافق</button>
        </div>
      </div>`, { sfx: kind });
    return ov;
  },

  /* بديل confirm() — بيرجّع Promise<boolean> */
  confirm(title, message, okText, cancelText) {
    return new Promise(resolve => {
      let settled = false;
      const done = v => { if (!settled) { settled = true; resolve(v); } };
      const ov = this.mount('amkh-ui-confirm', `
        <div class="ds-dialog">
          <div class="ds-dialog__icon">؟</div>
          <h2 class="ds-dialog__title">${this.esc(title)}</h2>
          <p class="ds-dialog__message">${this.esc(message)}</p>
          <div class="ds-dialog__actions">
            <button class="ds-btn ds-btn--secondary" data-act="no">${this.esc(cancelText || 'إلغاء')}</button>
            <button class="ds-btn ds-btn--primary"   data-act="yes">${this.esc(okText || 'تأكيد')}</button>
          </div>
        </div>`, { sfx: 'confirm' });
      ov.querySelectorAll('[data-act]').forEach(b => {
        b.addEventListener('click', () => {
          this.sfx();
          done(b.dataset.act === 'yes');
          ov._dismiss();
        });
      });
      ov.addEventListener('click', e => { if (e.target === ov) done(false); });
    });
  }
};
window.amkhUI = amkhUI;

const amkhAuth = {
  token: localStorage.getItem('amkh_auth_token') || null,
  user: null,

  async init() {
    if (this.token) {
      /* نعرض المستخدم المحفوظ فورًا قبل أي شبكة، عشان الواجهة تفتح
         وهو داخل بدل ما تبان كأنه خرج لثانية */
      if (!this.user) {
        try { this.user = JSON.parse(localStorage.getItem('amkh_user') || 'null'); } catch (e) {}
      }
      this.updateUI();

      const state = await this.fetchMe();
      if (state === 'ok') {
        console.log('Logged in as', this.user.display_name || this.user.email);
        this.updateUI();
        this.connectPresence();
        this.startAutoSync();
        /* الجلسة استعادت — نعيد ربط توكِن الإشعارات بالحساب. لو داخل من غير
           تسجيل تفاعلي (فتح التطبيق وهو مسجّل) كان التوكِن مايتربطش أبدًا. */
        try { if (window.Notifications && window.Notifications._linkTokenToUser) window.Notifications._linkTokenToUser(); } catch (e) {}
        /* توفيق الملف الشخصي في الاتجاهين. كان هنا نداء amkhSyncMyAvatar
           بيرفع الصورة المحلية فوق صورة الحساب في كل فتحة للتطبيق — وده
           كان بيمحي صورة اتغيّرت من جهاز تاني. _reconcileProfile بترفع
           لما الحساب يكون فاضي بس، وبتملأ الجهاز من الحساب لما الجهاز
           يكون فاضي (ده بالظبط حال إعادة التثبيت: التوكِن مستعاد من غير
           setToken، فالاسم والصورة مكانوش بيرجعوا أبدًا). */
        this._reconcileProfile();
      } else if (state === 'invalid') {
        /* السيرفر رفض التوكن نفسه — ده الخروج الشرعي الوحيد */
        this.logout();
      } else {
        /* offline: السيرفر مش متاح دلوقتي. الجلسة بتفضل والتطبيق يشتغل،
           وبنحاول تاني بعد شوية. مسح التوكن هنا كان بيطلّع المستخدم من
           حسابه على أول فشل شبكة. */
        console.log('[auth] الحساب محفوظ، الخادم غير متاح حاليًا — ستُعاد المحاولة');
        setTimeout(() => { this.init(); }, 15000);
      }
    } else {
      this.updateUI();
    }
    /* شاشة الترحيب (أول تشغيل بلا حساب). بتتنادى في الحالتين والدالة نفسها
       بتتأكد من الشروط: مافيش توكن + مالهاش ظهور قبل كده. حطّها هنا مش في
       فرع الـelse لأن logout() فوق ممكن يخلّينا بلا توكن كذلك. */
    try { if (window.amkhWelcome) window.amkhWelcome.maybeShow(); } catch (e) {}
  },

  /* بترجّع 'ok' لو البيانات جت، 'invalid' لو التوكن مرفوض فعلًا،
     'offline' لو مافيش وصول للسيرفر.
     ──────────────────────────────────────────────────────────────
     التفريق ده مهم: النسخة القديمة كانت بتحوّل الحالتين لـuser=null،
     وinit() بتعمل logout() على أي null — فأي فشل شبكة لحظي (وده بيحصل
     عند بدء التطبيق لأن رابط السيرفر لسه بيتحمّل) كان بيمسح التوكن.
     النتيجة إن المستخدم يلاقي نفسه خارج كل مرة يرجع للتطبيق. */
  async fetchMe() {
    if (window.amkhEnsureServer && !await window.amkhEnsureServer()) {
      return 'offline';
    }
    try {
      const res = await fetch(`${window.getApiBase()}/me`, {
        headers: { 'Authorization': `Bearer ${this.token}`, 'ngrok-skip-browser-warning': 'true' }
      });
      if (res.ok) {
        this.user = await res.json();
        try { localStorage.setItem('amkh_user', JSON.stringify(this.user)); } catch (e) {}
        this._reconcileAvatar();
        return 'ok';
      }
      /* 401/403 = التوكن نفسه باطل. أي كود تاني (500، 502 من النفق)
         مشكلة في السيرفر مش في التوكن، فمنمسحوش. */
      if (res.status === 401 || res.status === 403) { this.user = null; return 'invalid'; }
      return 'offline';
    } catch (e) {
      return 'offline';
    }
  },

  async login(email, password) {
    /* الرابط لازم يكون متاح قبل النداء، وإلا الطلب بيروح لمسار نسبي
       مش موجود في الـAPK */
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول إلى الخادم. تأكّد من اتصال الإنترنت ثم أعِد المحاولة.' };
    }
    const res = await fetch(`${window.getApiBase()}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      this.setToken(data.token, data.user);
      /* #172: علم الدولة (وباقي بيانات الحساب) مربوط بالحساب على الخادم.
         نجيب /me بعد الدخول عشان auth.user يبقى النسخة الكاملة (فيها country)
         فيفضل العلم ثابت بعد أي خروج/دخول وعلى أي جهاز. */
      await this.fetchMe();
      return { success: true };
    }
    return { success: false, error: data.error };
  },

  /* ── #13: التسجيل بقى خطوتين ──
     الطلب ده مابيعملش حسابًا: بيطلب رمز تأكيد على البريد. الحساب بيتولد
     في verifySignup بعد ما صاحب البريد يثبت إنه بريده فعلًا.
     verify_flow بتقول للخادم إن العميل ده يعرف الخطوة التانية — الخوادم
     بترد على النسخ القديمة بالسلوك القديم (توكن فورًا) فمافيش نسخة
     منشورة بتتعطّل. */
  async register(email, password, displayName) {
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول إلى الخادم. تأكّد من اتصال الإنترنت ثم أعِد المحاولة.' };
    }
    let res, data;
    try {
      res = await fetch(`${window.getApiBase()}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ email, password, display_name: displayName, verify_flow: 1 })
      });
      data = await res.json();
    } catch (e) {
      return { success: false, error: 'تعذّر الاتصال بالخادم. أعِد المحاولة.' };
    }
    if (res.ok) {
      /* خادم بيطلب تأكيدًا: مافيش توكن، والنافذة بتنقل لخانة الرمز */
      if (data.verify) {
        return { success: true, verify: true, email: data.email || email, ttl: data.ttl_minutes || 15 };
      }
      /* خادم قديم: التوكن جه على طول */
      this.setToken(data.token, data.user);
      this.mergeDeviceData();   /* #18: ربط صامت بلا نافذة — بالخلفية */
      return { success: true };
    }
    return {
      success: false, error: data.error,
      /* الخادم عارف إن فيه رمز مبعوت بالفعل لهذا البريد */
      pending: !!data.pending, retryAfter: data.retry_after || 0,
      exists: !!data.exists, ttl: data.ttl_minutes || 15,
    };
  },

  /* الخطوة التانية: الرمز صح → الحساب اتعمل وإحنا داخلين بيه */
  async verifySignup(email, code) {
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول إلى الخادم. تأكّد من اتصال الإنترنت ثم أعِد المحاولة.' };
    }
    let res, data;
    try {
      res = await fetch(`${window.getApiBase()}/register-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ email, code })
      });
      data = await res.json();
    } catch (e) {
      return { success: false, error: 'تعذّر الاتصال بالخادم. أعِد المحاولة.' };
    }
    if (res.ok) {
      this.setToken(data.token, data.user);
      this.mergeDeviceData();   /* #18: ربط صامت بلا نافذة — بالخلفية */
      await this.fetchMe();
      return { success: true };
    }
    return {
      success: false, error: data.error || 'تعذّر تأكيد البريد',
      expired: !!data.expired, exists: !!data.exists,
    };
  },

  /* ── #6: نسيت كلمة المرور ──
     الردّ من الخادم موحّد دائمًا (مش بيقول الحساب موجود أو لا) عشان
     مايبقاش أداة تكشف مَن عنده حساب. فالعميل مايحاولش يخمّن: بيوصّل
     الرسالة زي ما هي وبينتقل لخطوة الرمز في كل الحالات. */
  async forgotPassword(email) {
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول إلى الخادم. تأكّد من اتصال الإنترنت ثم أعِد المحاولة.' };
    }
    let res, data;
    try {
      res = await fetch(`${window.getApiBase()}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ email })
      });
      data = await res.json();
    } catch (e) {
      return { success: false, error: 'تعذّر الاتصال بالخادم. أعِد المحاولة.' };
    }
    if (res.ok) return { success: true, message: data.message, ttl: data.ttl_minutes || 15 };
    return { success: false, error: data.error || 'تعذّر إرسال الرمز', retryAfter: data.retry_after || 0 };
  },

  async resetPassword(email, code, password) {
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول إلى الخادم. تأكّد من اتصال الإنترنت ثم أعِد المحاولة.' };
    }
    let res, data;
    try {
      res = await fetch(`${window.getApiBase()}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ email, code, password })
      });
      data = await res.json();
    } catch (e) {
      return { success: false, error: 'تعذّر الاتصال بالخادم. أعِد المحاولة.' };
    }
    if (res.ok) {
      /* الخادم بيرجّع توكن جاهز: المستخدم أثبت ملكية بريده وعرف كلمته
         الجديدة، فمافيش داعي يسجّل دخول تاني بعد كل ده. */
      this.setToken(data.token, data.user);
      await this.fetchMe();
      return { success: true };
    }
    return { success: false, error: data.error || 'تعذّر تغيير كلمة المرور', expired: !!data.expired };
  },

  /* ── الدخول بجوجل ──
     الـplugin الأصلي بيرجّع idToken، والسيرفر هو اللي بيتحقّق منه ويطلّع
     الـJWT بتاعنا. العميل مابيثقش في التوكن ولا بيقرا منه حاجة — بيمرّره
     وخلاص، فالتحقّق كله في مكان واحد.
     على المتصفح مافيش plugin: جوجل بترفض OAuth جوه WebView وفي المتصفح
     العادي محتاج تدفق مختلف، فبنقول للمستخدم يستخدم التطبيق بدل ما
     نسيبه يضغط زر مايحصلش منه حاجة. */
  /* ── تصنيف أخطاء الدخول بجوجل ──
     الـplugin بيرمي رسائل إنجليزية طويلة موجّهة للمطوّر (فيها Logcat وOAuth
     consent screen وغيره). عرضها للمستخدم كان خطأ: نصّ إنجليزي جوّه تطبيق
     عربي ومافيهوش أي إرشاد مفيد. بنترجم السبب لرسالة عربية قصيرة تقول
     للمستخدم يعمل إيه، وبنسيب التفصيل الكامل في console للتشخيص، مع كود
     رقمي مختصر بين قوسين عشان نعرف السبب من صورة الشاشة. */
  _googleErr(raw) {
    const m = String(raw || '');
    const code = (m.match(/\[(\d{1,5})\]/) || m.match(/(?:^|\s)(\d{1,5}):/) || [])[1] || '';
    const tail = code ? ` (${code})` : '';
    /* إعداد المشروع/التوقيع: بصمة التوقيع غير مسجّلة أو شاشة الموافقة مقيّدة */
    if (/Account reauth failed|Developer console|28444|\[10\]|(?:^|\s)10:/i.test(m)) {
      return 'تعذّر الدخول بحساب جوجل في هذا الإصدار من التطبيق. استخدم البريد الإلكتروني وكلمة المرور الآن' + tail;
    }
    if (/no credential|NoCredential|no accounts|GetCredentialUnsupported/i.test(m)) {
      return 'لا يوجد حساب جوجل مُضاف على هذا الجهاز. أضف حسابك من إعدادات الجهاز ثم أعِد المحاولة' + tail;
    }
    if (/network|timeout|unable to resolve host|7:/i.test(m)) {
      return 'تعذّر الوصول إلى خدمات جوجل. تأكّد من اتصال الإنترنت ثم أعِد المحاولة' + tail;
    }
    if (/main activity|scopes/i.test(m)) {
      return 'تعذّر بدء الدخول بحساب جوجل. استخدم البريد الإلكتروني وكلمة المرور' + tail;
    }
    return 'تعذّر الدخول بحساب جوجل. أعِد المحاولة، أو استخدم البريد الإلكتروني وكلمة المرور' + tail;
  },

  async loginWithGoogle() {
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول إلى الخادم. تأكّد من اتصال الإنترنت ثم أعِد المحاولة.' };
    }
    const g = window.amkhGoogleAuth;
    if (!g || !g.available) {
      return { success: false, error: 'الدخول بجوجل متاح في تطبيق الأندرويد' };
    }
    let idToken;
    const t0 = Date.now();
    try {
      const r = await g.signIn();
      idToken = r && r.idToken;
    } catch (e) {
      const m = String((e && e.message) || '');
      const ms = Date.now() - t0;
      console.error('[auth] google sign-in failed after', ms, 'ms:', m);
      /* إلغاء المستخدم مش خطأ — مانزعّجهوش برسالة. لكن لازم نفرّق: لمّا
         الإعداد يكون ناقصًا، «ورقة اختيار الحساب» بتتقفل وحدها في أقل من
         ثانية وجوجل بترجّع نفس استثناء الإلغاء — فكان الزر بيفشل بصمت
         تمامًا من غير أي رسالة. لو الإلغاء جا أسرع من أن يكون المستخدم
         شافها واختار، بنعرض رسالة إرشادية بدل الصمت. */
      const cancelled = /cancel|closed|12501|user_cancel|dismiss/i.test(m);
      if (cancelled && ms >= 1200) return { success: false, cancelled: true };
      return { success: false, error: this._googleErr(m) };
    }
    if (!idToken) return { success: false, error: 'تعذّر الحصول على هوية جوجل' };

    const res = await fetch(`${window.getApiBase()}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      this.setToken(data.token, data.user);
      await this.fetchMe();   // #172: هيدرَيت auth.user من /me (فيه country) فالعلم يفضل ثابت
      this.mergeDeviceData();   /* #18: ربط صامت بلا نافذة — بالخلفية */
      return { success: true };
    }
    return { success: false, error: data.error || 'تعذّر تسجيل الدخول' };
  },

  setToken(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('amkh_auth_token', token);
    /* بيانات المستخدم بتتحفظ كمان: عند بدء التطبيق بنعرضها فورًا قبل
       ما الشبكة ترد، فالواجهة تفتح والمستخدم داخل بدل ما تبان كأنه خرج. */
    try { localStorage.setItem('amkh_user', JSON.stringify(user || null)); } catch (e) {}
    this.updateUI();
    this.connectPresence();
    this._reconcileProfile();
    /* بعد الدخول: اربط توكِن الإشعارات بالحساب عشان توصلك رسايل الأصدقاء
       وأنت غير متصل (السيرفر بيبعت للـuserId). */
    try { if (window.Notifications && window.Notifications._linkTokenToUser) window.Notifications._linkTokenToUser(); } catch (e) {}
    /* لو المستخدم فتح رابط دعوة حفلة (#join=TOKEN) وهو مش مسجّل دخول،
       التوكِن اتحفظ في sessionStorage — نكمّل الانضمام دلوقتي بعد الدخول. */
    try { if (window.amkhChat && window.amkhChat.resumePendingInvite) window.amkhChat.resumePendingInvite(); } catch (e) {}
  },

  /* توفيق الملف الشخصي (الاسم + الصورة) بين الجهاز والحساب.
     ──────────────────────────────────────────────────────────────
     المشكلة اللي بتتصلّح هنا: خانة «اسم اللاعب» وصورة الملف في الإعدادات
     كانوا محليين بحتين (IDB + localStorage). أول ما المستخدم يشيل التطبيق
     ويحمّله تاني، التخزين المحلي بيتمسح، والحساب مش عارف عنهم حاجة —
     فبيرجع يلاقي الخانتين فاضيتين رغم إنه داخل بنفس حسابه.

     القاعدة: الحساب هو المصدر الدائم.
     - عندي محليًا والحساب فاضي → ارفع (بيشمل مين ضبطهم قبل الميزة دي).
     - الحساب عنده والمحلي فاضي → املأ المحلي.
     - الاتنين موجودين → الحساب أولى؛ ده اللي بيخلّي نفس الاسم والصورة
       يظهروا على كل الأجهزة بدل ما كل جهاز يعيش لوحده.
     صورة جوجل (رابط https) بتتحوّل لـdata: مرّة واحدة قبل ما تتخزن محليًا،
     عشان تبان وإنت أوفلاين وجوّه الـAPK زي أي صورة مرفوعة. */
  async _reconcileProfile() {
    try {
      if (typeof Cfg === 'undefined' || !Cfg.data) return;
      /* لازم إعدادات الجهاز تكون اتحمّلت من IDB الأول، وإلا هنقرأ خانات
         فاضية ونملأها من الحساب ثم Cfg.load() تدمج القديم فوقها. */
      try {
        if (window.amkhCfgReady) {
          await Promise.race([window.amkhCfgReady, new Promise(r => setTimeout(r, 4000))]);
        }
      } catch (e) {}
      const u = this.user || {};

      /* ── الاسم ── */
      const srvName = String(u.display_name || '').trim();
      const locName = String(Cfg.data.playerName || '').trim();
      if (srvName && srvName !== locName) {
        Cfg.data.playerName = srvName.slice(0, 20);
        try { Cfg._persist(); } catch (e) {}
        try { if (typeof Cfg.refreshProfileUI === 'function') Cfg.refreshProfileUI(); } catch (e) {}
      } else if (!srvName && locName) {
        try { if (typeof Cfg._syncNameToServer === 'function') Cfg._syncNameToServer(locName); } catch (e) {}
      }

      /* ── الصورة ──
         لما الاتنين موجودين بنسيب المحلية: المحلية هي الأصل بدقّته الكاملة
         (بتظهر في المباراة بحجم كبير) والمرفوعة نسخة 96×96 مضغوطة — لو
         ملأنا منها هنخسّر الجودة في كل فتحة للتطبيق. */
      const server = String(u.avatar_url || '');
      const local = Cfg.data.playerImage;
      if (local && !server) {
        if (typeof Cfg._syncAvatarToServer === 'function') Cfg._syncAvatarToServer(local);
      } else if (server && !local) {
        let img = server;
        if (!/^data:image\//i.test(server)) {
          /* رابط خارجي (صورة جوجل) — ننزّله ونحوّله data: عشان يفضل شغّال
             أوفلاين. لو فشل (شبكة/CORS) بنستخدم الرابط زي ما هو: أحسن من
             خانة فاضية، وهيتحوّل تلقائيًا أول مرة ينزّل بنجاح. */
          img = await this._toDataUrl(server) || server;
        }
        Cfg.data.playerImage = img;
        try { Cfg._persist(); } catch (e) {}
        try { if (typeof Cfg.refreshProfileUI === 'function') Cfg.refreshProfileUI(); } catch (e) {}
        /* لو حوّلناها data: نرفعها للحساب كمان عشان الأصدقاء يشوفوها
           (قائمة الأصدقاء بتعرض الصورة من الحساب) */
        if (/^data:image\//i.test(img) && typeof Cfg._syncAvatarToServer === 'function') {
          Cfg._syncAvatarToServer(img);
        }
      }
    } catch (e) {}
  },

  /* تحويل رابط صورة لـdata URL (96×96 JPEG) — مرّة واحدة عند أول دخول */
  _toDataUrl(url) {
    return new Promise((resolve) => {
      let done = false;
      const fin = v => { if (!done) { done = true; resolve(v); } };
      setTimeout(() => fin(null), 6000);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const SZ = 96, cv = document.createElement('canvas');
          cv.width = SZ; cv.height = SZ;
          const ctx = cv.getContext('2d');
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SZ, SZ);
          fin(cv.toDataURL('image/jpeg', 0.6));
        } catch (e) { fin(null); }
      };
      img.onerror = () => fin(null);
      img.src = url;
    });
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('amkh_auth_token');
    localStorage.removeItem('amkh_user');
    this.disconnectPresence();
    this.updateUI();
    /* من غير window.location.reload(): الـreload كان بيعيد تحميل الصفحة
       كلها، والـ<body> بيتْرسم فريم بثيم amkh الافتراضي قبل ما سكربت الثيم
       المتزامن يشتغل تاني — ده بالظبط مصدر ومضة amkh على الشاشة الرئيسية
       وقت الخروج. مافيش داعي لإعادة تحميل: updateUI() صفّرت زر الحساب،
       disconnectPresence() قطعت الاتصال، وهنا بنمسح كاش الأصدقاء. */
    try {
      if (window.amkhFriends) {
        window.amkhFriends._friends = [];
        if (typeof window.amkhFriends._updateBadge === 'function') {
          window.amkhFriends._updateBadge();
        }
      }
    } catch (e) {}
    /* امسح كاش المحادثات المحلي (#133) عشان ميتشافش لحساب تاني على نفس الجهاز. */
    try { if (window.amkhChat && typeof window.amkhChat._clearCache === 'function') window.amkhChat._clearCache(); } catch (e) {}
  },

  /* ── ربط بيانات الجهاز بالحساب (#18) ──
     كان في نافذة سؤال «هل تريد ربط تقدّمك؟» بعد كل تسجيل دخول وعلى كل
     جهاز: نصّها غامض، وبتطلب من المستخدم قرارًا مالهوش لازمة أصلًا لأن
     الدمج في الخادم غير مُدمِّر (النجوم بتاخد الأعلى، والمراحل المكتملة
     تفضل مكتملة). فبقى الربط تلقائيًا وصامتًا، مرة واحدة لكل حساب على كل
     جهاز، وبإشعار سطر واحد لو فعلًا اتنقلت بيانات — بلا أي نافذة. */
  async mergeDeviceData() {
    const uid = this.user && this.user.id;
    if (!uid) return;
    const flag = 'amkh_device_merged_' + uid;
    try { if (localStorage.getItem(flag) === '1') return; } catch (e) {}
    let progress = [];
    try { progress = await this._readLocalProgress(); } catch (e) { progress = []; }
    try { localStorage.setItem(flag, '1'); } catch (e) {}
    if (!progress.length) return;                 /* مافيش تقدّم محلي يُربط */
    try {
      const res = await fetch(`${window.getApiBase()}/sync-local`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ progress, overwrite: false }),
      });
      if (!res.ok) return;
      if (window.amkhUI) {
        window.amkhUI.notify('أُضيف تقدُّمك المحفوظ على هذا الجهاز إلى حسابك', 'تمت المزامنة', '◉');
      }
    } catch (e) {
      try { localStorage.removeItem(flag); } catch (e2) {}   /* نعيد المحاولة لاحقًا */
    }
  },

  /* تقدّم «نور» المحفوظ محليًا (IndexedDB) */
  async _readLocalProgress() {
    return await new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v || []); } };
      try {
        const req = indexedDB.open('ChessNourDB', 1);
        req.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('nourProgress')) return finish([]);
          const store = db.transaction('nourProgress', 'readonly').objectStore('nourProgress');
          const all = store.getAll();
          all.onsuccess = () => finish(all.result || []);
          all.onerror = () => finish([]);
        };
        req.onerror = () => finish([]);
        req.onupgradeneeded = () => finish([]);
        setTimeout(() => finish([]), 4000);
      } catch (e) { finish([]); }
    });
  },

  async syncLocalData() {
    // Collect local data
    let localSettings = {};
    try {
      const cfg = localStorage.getItem('chess-cfg-v6');
      if (cfg) localSettings = JSON.parse(cfg);
    } catch(e) {}

    let localProgress = [];
    try { localProgress = await this._readLocalProgress(); } catch (e) {}

    try {
      await fetch(`${window.getApiBase()}/sync-local`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${this.token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          progress: localProgress,
          settings: localSettings,
          overwrite: false
        })
      });
      // Optionally alert on manual sync, but we use this for auto-sync too
    } catch(e) {
      console.error('Migration error', e);
    }
  },

  async startAutoSync() {
    // Pull server data and overwrite local on startup
    try {
      const resSet = await fetch(`${window.getApiBase()}/settings`, { headers: { 'Authorization': `Bearer ${this.token}`, 'ngrok-skip-browser-warning': 'true' } });
      if (resSet.ok) {
        const s = await resSet.json();
        if (Object.keys(s).length > 0) {
          localStorage.setItem('chess-cfg-v6', JSON.stringify(s));
          this.lastSyncSettings = JSON.stringify(s);
        } else {
          /* #18: الخادم مالوش إعدادات محفوظة (حساب جديد) — نرفع إعدادات
             الجهاز فورًا بدل ما نستنى دورة العشر ثوانٍ، فأول ما يفتح
             الحساب على جهاز تاني يلاقي نفس الثيم والصوت. */
          const cur = localStorage.getItem('chess-cfg-v6');
          if (cur) { this.lastSyncSettings = cur; this.syncLocalData(); }
        }
      }

      const resProg = await fetch(`${window.getApiBase()}/progress`, { headers: { 'Authorization': `Bearer ${this.token}`, 'ngrok-skip-browser-warning': 'true' } });
      if (resProg.ok) {
        const serverProg = await resProg.json();
        if (serverProg.length > 0) {
          const dbRequest = indexedDB.open('ChessNourDB', 1);
          dbRequest.onsuccess = (e) => {
            const db = e.target.result;
            if (db.objectStoreNames.contains('nourProgress')) {
              const tx = db.transaction('nourProgress', 'readwrite');
              const store = tx.objectStore('nourProgress');
              serverProg.forEach(p => {
                store.put({ stage: p.stage_number, completed: p.completed === 1, stars: p.stars });
              });
            }
          };
        }
      }
    } catch(e) {}

    // Every 10 seconds, check if local changed, and push to server
    setInterval(async () => {
      if (!this.token) return;
      const currentSettings = localStorage.getItem('chess-cfg-v6');
      if (currentSettings && currentSettings !== this.lastSyncSettings) {
        this.lastSyncSettings = currentSettings;
        this.syncLocalData(); // background sync
      }
      // IndexDB progress is also synced periodically to be safe
      // Note: A more optimized version would track IndexDB changes, but periodic sync works well.
    }, 10000);
  },

  /* ── سوكت الحضور ──
     النسخة القديمة كانت تعليقات و setInterval فاضي — مكانت بتعمل حاجة
     خالص. فالتطبيق مكانش بيقول للسيرفر «أنا موجود» إلا لو المستخدم فتح
     شاشة الأونلاين. نتيجة كده إن صاحبك يبان «منذ 3 ساعات» وهو فاتح
     التطبيق جنبك، وزر «العب» يفضل مقفول لأنه بيتفعّل للمتصل بس.

     الحل: سوكت مستقل للحضور بيتفتح أول ما المستخدم يسجّل دخول ويفضل
     مفتوح. لو الأونلاين فتح سوكته الخاص، بنستخدمه هو (سوكت واحد أحسن).
     وفيه إعادة اتصال بتأخير متزايد، ونبضة كل 25 ثانية عشان الوسطاء
     مايقطعوش الاتصال الساكت. */
  _presWs: null,
  _presTimer: null,
  _presPing: null,
  _presBackoff: 1000,
  _presWaitPong: 0,
  _presHooked: false,

  /* ── تعريف أي سوكت ──
     أخطر عطل في النظام كان إن سوكت الأونلاين (window.chessWs) بيتفتح من
     غير «presence:hello»، فالسيرفر مايعرفهوش. ووحدة الأصدقاء بتسقط عليه
     لما سوكت الحضور يكون مقفول، فكل رسالة/دعوة/مشاهدة ترجّع auth
     والأصدقاء يبانوا غير متصلين — والحل الوحيد كان تسجيل خروج ودخول.
     الدالة دي بتخلّي أي سوكت موثّقًا، وبتُنادى من كل مكان بيفتح سوكت. */
  identify(ws) {
    if (!ws || ws.readyState !== 1 || !this.token) return false;
    try {
      ws.send(JSON.stringify({ type: 'presence:hello', token: this.token }));
      ws.__amkhHelloAt = Date.now();
      return true;
    } catch (e) { return false; }
  },

  /* هل السوكت ده يقدر يبعت رسايل ودعوات فعلاً؟ (وصله إيصال التوثيق) */
  isIdentified(ws) { return !!(ws && ws.readyState === 1 && ws.__amkhAuthed); },

  connectPresence() {
    if (!this.token) return;
    this._hookRevive();
    /* لو الأونلاين عنده سوكت مفتوح، نعرّفه كمان — سوكت واحد موثّق أحسن */
    const shared = window.chessWs;
    if (shared && shared.readyState === 1) this.identify(shared);
    /* وبرضه بنفتح سوكتنا لو مفيش واحد شغّال — الحضور لازم يفضل حتى لو
       المستخدم مافتحش الأونلاين خالص */
    if (this._presWs && (this._presWs.readyState === 0 || this._presWs.readyState === 1)) return;
    this._openPresence();
  },

  /* ── معالج رسايل الحضور ──
     بيُنادى من سوكت الحضور ومن سوكت الأونلاين، فأي سوكت بيعرف حالته. */
  _onPresenceFrame(d, ws) {
    if (d.type === 'presence:ok') {
      ws.__amkhAuthed = true;
      this._presWaitPong = 0;
      this._presBackoff = 1000;
      this._afterIdentified(ws);
      return true;
    }
    if (d.type === 'presence:pong') {
      this._presWaitPong = 0;
      /* السيرفر بيقول إن السوكت ده مجهول عنده → نعرّفه من غير أي تدخّل
         من المستخدم. ده اللي بيمنع «تسجيل خروج ودخول» نهائيًا. */
      if (d.authed === false) { ws.__amkhAuthed = false; this.identify(ws); }
      else ws.__amkhAuthed = true;
      return true;
    }
    if (d.type === 'presence:fail') { ws.__amkhAuthed = false; return true; }
    return false;
  },

  /* بعد ما التوثيق يتأكّد فعلاً — مش وقت فتح السوكت. الترتيب ده مهم:
     الرسايل المؤجَّلة والبثّ المحلي كانوا بيتبعتوا قبل ما السيرفر يعرف
     مين صاحب السوكت، فيفشلوا بصمت. */
  _afterIdentified(ws) {
    try { if (window.amkhFriends && window.amkhFriends.loadPartyInvites) window.amkhFriends.loadPartyInvites(); } catch (e) {}
    try { if (window.amkhChat && window.amkhChat._flushOutbox) window.amkhChat._flushOutbox(); } catch (e) {}
    try { if (window.amkhLocalCast && window.amkhLocalCast.resume) window.amkhLocalCast.resume(); } catch (e) {}
    /* حالة «في مباراة» بتموت مع السوكت القديم — نبعتها تاني */
    try { if (window.amkhLocalActivityResend) window.amkhLocalActivityResend(); } catch (e) {}
    /* حالات الأصدقاء بتتأخّر لحد أول بثّ؛ التحديث الفوري بيخلّي «متصل
       الآن» يبان لحظة رجوع الاتصال بدل ما يفضل «غير متصل» غلط. */
    try { if (window.amkhFriends && window.amkhFriends.refreshPresence) window.amkhFriends.refreshPresence(); } catch (e) {}
  },


  /* ── إعادة الإحياء ──
     أندرويد بيجمّد الـWebView وقت ما التطبيق يبقى في الخلفية: السوكت
     بيموت، والمؤقّتات بتتخنق، وممكن onclose ماتوصلش لدقايق. من غير
     الإحياء ده كان اللاعب يرجع للتطبيق فيلاقي نفسه «غير متصل» بلا رجعة.
     بنُنادى من: رجوع التطبيق، ظهور الصفحة، رجوع الشبكة، وفتح الشاشات. */
  revive(reason) {
    if (!this.token) return;
    /* كتم التكرار: visibility + focus + online بييجوا مع بعض، ووحدة
       الأصدقاء بتطلب الإحياء مع كل محاولة إرسال. */
    const now = Date.now();
    if (this._reviveAt && now - this._reviveAt < 1500) return;
    this._reviveAt = now;
    this._presBackoff = 1000;
    this._presWaitPong = 0;
    clearTimeout(this._presTimer);
    const p = this._presWs;
    if (p && p.readyState === 1) {
      /* نبضة فحص فورية: لو السوكت «ميت صامت» مش هيردّ، فالمراقب هيقفله
         ويفتح غيره. ولو مش موثّق نعرّفه دلوقتي. */
      this._presWaitPong = 1;
      try { p.send(JSON.stringify({ type: 'presence:ping' })); } catch (e) {}
      if (!p.__amkhAuthed) this.identify(p);
      clearTimeout(this._presCheck);
      this._presCheck = setTimeout(() => {
        if (this._presWaitPong > 0 && this._presWs === p) { try { p.close(); } catch (e) {} }
      }, 6000);
    } else if (!p || p.readyState !== 0) {
      this._presWs = null;
      this._openPresence();
    }
    const a = window.chessWs;
    if (a && a.readyState === 1 && !a.__amkhAuthed) this.identify(a);
  },

  _hookRevive() {
    if (this._presHooked) return;
    this._presHooked = true;
    const go = (why) => { try { this.revive(why); } catch (e) {} };
    try { document.addEventListener('visibilitychange', () => { if (!document.hidden) go('visible'); }); } catch (e) {}
    try { window.addEventListener('online', () => go('net')); } catch (e) {}
    try { window.addEventListener('focus', () => go('focus')); } catch (e) {}
    try {
      const C = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (C && C.addListener) C.addListener('appStateChange', (s) => { if (s && s.isActive) go('app'); });
    } catch (e) {}
  },

  async _openPresence() {
    if (!this.token) return;
    /* حرس ضدّ سوكتات متوازية: أي نداء تاني وإحنا بنتصل أو متصلين يرجع */
    if (this._presWs && (this._presWs.readyState === 0 || this._presWs.readyState === 1)) return;
    if (window.amkhEnsureServer && !await window.amkhEnsureServer()) {
      /* السيرفر مش متاح — نحاول تاني بعد شوية */
      clearTimeout(this._presTimer);
      this._presTimer = setTimeout(() => this._openPresence(), 10000);
      return;
    }
    const base = window.SERVER_HTTP;
    if (!base) {
      clearTimeout(this._presTimer);
      this._presTimer = setTimeout(() => this._openPresence(), 10000);
      return;
    }
    const url = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    let ws;
    try { ws = new WebSocket(url); } catch (e) {
      clearTimeout(this._presTimer);
      this._presTimer = setTimeout(() => this._openPresence(), 5000);
      return;
    }
    this._presWs = ws;
    /* اتصال معلّق للأبد (شبكة نصف واقعة) كان بيوقف كل إعادة المحاولة
       لأن الحرس فوق شايفه «بيتصل». المهلة دي بتفكّ القفلة. */
    clearTimeout(this._presOpenTo);
    this._presOpenTo = setTimeout(() => {
      if (ws.readyState === 0) { try { ws.close(); } catch (e) {} }
    }, 9000);

    ws.onopen = () => {
      clearTimeout(this._presOpenTo);
      this._presBackoff = 1000;
      this._presWaitPong = 0;
      ws.__amkhAuthed = false;
      this.identify(ws);
      clearInterval(this._presPing);
      /* نبضة كل 15 ثانية بردّ مطلوب: الوسطاء مايقطعوش الاتصال الساكت،
         وفي نفس الوقت بنكتشف السوكت الميت الصامت بعد ~30 ثانية بدل ما
         يفضل «مفتوح» شكليًا والرسايل تروح للعدم. */
      this._presPing = setInterval(() => {
        if (ws.readyState !== 1) return;
        if (this._presWaitPong >= 2) {
          this._presWaitPong = 0;
          try { ws.close(); } catch (e) {}
          return;
        }
        this._presWaitPong++;
        try { ws.send(JSON.stringify({ type: 'presence:ping' })); } catch (e) {}
      }, 15000);
    };


    /* رسائل الأصدقاء (طلبات، دعوات، حضور) بتوصل على السوكت ده كمان لما
       الأونلاين مش مفتوح، فبنمرّرها لنفس المعالج. وكمان: مباراة الصديق
       بتبدأ على السوكت ده نفسه — السيرفر بيبعت friend:invite-room وبعدها
       start وباقي رسائل المباراة، فلازم نمرّر رسائل المباراة لوحدة
       الأونلاين، وإلا المباراة ماتبدأش أبدًا (ده كان سبب إن الدعوة تتقبل
       وميحصلش أي مباراة). */
    ws.onmessage = (ev) => {
      let d = null;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (!d || typeof d.type !== 'string') return;
      /* إيصالات التوثيق والنبض أول حاجة: عليها بيتبنى كل الباقي */
      if (d.type.indexOf('presence:') === 0 && this._onPresenceFrame(d, ws)) return;
      if (d.type.indexOf('chat:') === 0) {
        try { if (window.amkhChat) window.amkhChat.handleSocketMessage(d); } catch (e) {}
        return;
      }
      /* رسائل الجروبات (group:message / group:sent / group:typing…) بتوصل
         على سوكت الحضور ده كمان — من غير التمرير ده كانت بتروح لمعالج
         المباراة (OL._recv) وتتبلع، فرسايل الجروب تعلّق على الساعة أو
         توصل متأخّر جدًا لما نفتح السجل بالـHTTP. */
      if (d.type.indexOf('group:') === 0) {
        try { if (window.amkhChat) window.amkhChat.handleSocketMessage(d); } catch (e) {}
        return;
      }
      if (d.type.indexOf('friend:') === 0) {
        try { if (window.amkhFriends) window.amkhFriends.handleSocketMessage(d); } catch (e) {}
        /* قبول الدعوة بيولّد غرفة على سوكت الحضور ده. لازم وحدة الأونلاين
           تتبنّى السوكت قبل ما تيجي start (بتيجي بعد invite-room مباشرة
           على نفس السوكت، فالترتيب مضمون). */
        if (d.type === 'friend:invite-room' && window.OL && window.OL._adoptPresence) {
          try { window.OL._adoptPresence(ws); } catch (e) {}
        }
        return;
      }
      /* دعوات الحفلات (بديل الإضافة المباشرة لما الخصوصية تمنعها) بتوصل
         على سوكت الحضور — بنمرّرها لوحدة الأصدقاء اللي بتعرض الكارت. */
      if (d.type.indexOf('party:') === 0) {
        try { if (window.amkhFriends) window.amkhFriends.handleSocketMessage(d); } catch (e) {}
        return;
      }
      /* إشارات المكالمة الصوتية (WebRTC) — بتتنقل لوحدة المكالمة (#135) */
      if (d.type.indexOf('call:') === 0) {
        try { if (window.amkhCall) window.amkhCall.handleSocketMessage(d); } catch (e) {}
        return;
      }
      /* وضع المشاهدة (#14): اللقطة والنقلات للمتفرّج، وعدّاد المتفرّجين
         ومن دخل يتفرّج للاعبين. الاتنين على سوكت الحضور المُوثَّق. */
      if (d.type.indexOf('spectate:') === 0) {
        try { if (window.amkhSpectate) window.amkhSpectate.handleSocketMessage(d); } catch (e) {}
        return;
      }
      /* start / move / resign / chat / name / pimg… رسائل مباراة جاية على
         سوكت الحضور — بتحصل بس في مباريات الأصدقاء. في الأونلاين العادي
         رسائل المباراة بتيجي على سوكتها الخاص مش هنا، فمفيش ازدواج. */
      try { if (window.OL && window.OL._recv) window.OL._recv(d); } catch (e) {}
    };

    ws.onclose = () => {
      clearInterval(this._presPing);
      clearTimeout(this._presOpenTo);
      clearTimeout(this._presCheck);
      ws.__amkhAuthed = false;
      /* لو كانت مباراة صديق ماشية على السوكت ده، نبلّغ وحدة الأونلاين إنها
         انقطعت (زي أي انقطاع أونلاين) قبل ما نعيد الاتصال للحضور */
      try { if (window.OL && window.OL._presenceLost) window.OL._presenceLost(); } catch (e) {}
      if (this._presWs === ws) this._presWs = null;
      if (!this.token) return;
      /* تأخير متزايد بحد أقصى 30 ثانية: مانضربش السيرفر لو هو واقع.
         بس أول محاولة بتبقى فورية تقريبًا عشان القطع اللحظي مايستمرّش. */
      clearTimeout(this._presTimer);
      this._presTimer = setTimeout(() => this._openPresence(), this._presBackoff);
      this._presBackoff = Math.min(this._presBackoff * 2, 30000);
    };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  },

  disconnectPresence() {
    clearInterval(this._presPing);
    clearTimeout(this._presTimer);
    clearTimeout(this._presOpenTo);
    clearTimeout(this._presCheck);
    if (this._presWs) { try { this._presWs.close(); } catch (e) {} this._presWs = null; }
  },


  /* زر الحساب بيعيش جوه شريط التطبيق جنب الإعدادات — مش زر عايم فوق
     الشاشة. أيقونة بس، من غير إيموجي، وبتتغير لما نكون داخلين. */
  updateUI() {
    /* بقى داخلًا بأي مسار (بريد، جوجل، أو جلسة مستعادة) → شاشة الترحيب
       مالهاش لازمة. تحوّط: كل زر فيها بيقفلها بنفسه، لكن ده بيضمن إنها
       ماتفضلش معلّقة لو الدخول جا من مكان تالت. */
    if (this.user) { try { if (window.amkhWelcome) window.amkhWelcome.close(); } catch (e) {} }
    const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const trail = document.querySelector('.appbar__trail');
    let btn = document.getElementById('amkh-auth-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'amkh-auth-btn';
      btn.className = 'appbar__icon-btn amkh-auth-btn';
      /* الأيقونة (SVG) تُكتب مرة واحدة عند إنشاء الزر ولا تُعاد أبدًا.
         إعادة كتابة innerHTML في كل updateUI (وبتتنادى مرتين على الإقلاع:
         من الكاش ثم بعد التحقق) كانت بتعيد رسم الـSVG فيومض. نقطة الحالة
         بقت عنصر منفصل نضيفه/نشيله من غير ما نلمس الأيقونة — وكده
         friends-client يقدر يتشارك نفس النقطة بأمان. */
      btn.innerHTML = ICON;
      if (trail) trail.insertBefore(btn, trail.firstChild);
      else document.body.appendChild(btn);
    }

    if (this.user) {
      const name = this.user.display_name || this.user.email;
      btn.classList.add('is-signed-in');
      if (!btn.querySelector('.amkh-auth-btn__dot')) {
        const dot = document.createElement('span');
        dot.className = 'amkh-auth-btn__dot';
        dot.setAttribute('aria-hidden', 'true');
        btn.appendChild(dot);
      }
      btn.setAttribute('aria-label', 'حسابي — ' + name);
      btn.title = name;
      btn.onclick = () => { amkhUI.sfx(); this.showProfileModal(); };
    } else {
      btn.classList.remove('is-signed-in');
      const dot = btn.querySelector('.amkh-auth-btn__dot');
      if (dot) dot.remove();
      btn.setAttribute('aria-label', 'تسجيل الدخول');
      btn.title = 'تسجيل الدخول';
      btn.onclick = () => { amkhUI.sfx(); this.showLoginModal(); };
    }

    /* زر الأصدقاء المستقل: مالوش معنى قبل تسجيل الدخول، وبيقف جنب زر
       الحساب على طول (زر الحساب بيتحقن قبله فيبقى أول واحد). */
    const fb = document.getElementById('appbar-friends');
    if (fb) {
      fb.style.display = this.user ? '' : 'none';
      if (!this.user) {
        const bd = fb.querySelector('.amkh-chat-badge');
        if (bd) bd.remove();
      }
    }
  },

  /* opts.register: تفتح على وضع «إنشاء حساب» على طول (شاشة الترحيب).
     opts.onSuccess: تتنادى بعد أي دخول ناجح (بريد أو جوجل) — شاشة الترحيب
     بتستخدمها عشان تقفل نفسها، لأنها بتفضل مفتوحة تحت نافذة الدخول
     فلو المستخدم قفل النافذة من غير تسجيل يرجع يلاقيها زي ما هي. */
  showLoginModal(opts) {
    const overlay = amkhUI.mount('amkh-auth-modal', `
      <div class="ds-dialog amkh-auth-dialog">
        <div class="ds-dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h2 class="ds-dialog__title" id="auth-modal-title">تسجيل الدخول</h2>
        <p class="ds-dialog__message" id="auth-modal-sub">سجّل دخولك لمزامنة تقدّمك واللعب مع أصدقائك</p>

        <div class="ds-field">
          <input type="email" id="auth-email" class="ds-input" placeholder="البريد الإلكتروني"
            autocomplete="email" style="direction:ltr;text-align:left;">
        </div>
        <div class="ds-field">
          <input type="password" id="auth-pass" class="ds-input" placeholder="كلمة المرور"
            autocomplete="current-password" style="direction:ltr;text-align:left;">
        </div>
        <div class="ds-field" id="auth-name-field" style="display:none;">
          <input type="text" id="auth-name" class="ds-input" placeholder="الاسم الظاهر للاعبين">
        </div>

        <p class="ds-field__hint ds-field__hint--error" id="auth-err" role="alert" style="min-height:18px;"></p>

        <div class="ds-dialog__actions" style="flex-direction:column;">
          <button id="btn-login" class="ds-btn ds-btn--primary ds-btn--block">تسجيل الدخول</button>
          <button id="btn-forgot" class="ds-btn ds-btn--ghost ds-btn--block amkh-forgot-link">نسيت كلمة المرور؟</button>
          <div class="amkh-auth-sep" aria-hidden="true"><span>أو</span></div>
          <button id="btn-google" class="ds-btn ds-btn--block amkh-google-btn">
            <span class="amkh-google-mark" aria-hidden="true"></span>
            <span>المتابعة بحساب جوجل</span>
          </button>
          <button id="btn-register-toggle" class="ds-btn ds-btn--ghost ds-btn--block">ليس لديك حساب؟ أنشئ حسابًا</button>
          <button class="ds-btn ds-btn--ghost ds-btn--block" data-close>إغلاق</button>
        </div>
      </div>`);

    let isRegisterMode = false;
    const errDiv = overlay.querySelector('#auth-err');
    const nameField = overlay.querySelector('#auth-name-field');
    const nameInput = overlay.querySelector('#auth-name');
    const titleEl = overlay.querySelector('#auth-modal-title');
    const subEl = overlay.querySelector('#auth-modal-sub');
    const loginBtn = overlay.querySelector('#btn-login');
    const toggleBtn = overlay.querySelector('#btn-register-toggle');
    const forgotBtn = overlay.querySelector('#btn-forgot');

    /* زر جوجل: نفس الزر بيسجّل أو بيدخل — جوجل هي اللي بتحدّد، والسيرفر
       بيعمل الحساب لو مش موجود. فمافيش وضع «تسجيل» منفصل ليه. */
    const googleBtn = overlay.querySelector('#btn-google');
    if (googleBtn) {
      /* على المتصفح الحزمة مش بتشتغل، فبنخفي الزر بدل ما نسيبه يخيّب */
      if (!window.amkhGoogleAuth || !window.amkhGoogleAuth.available) {
        googleBtn.style.display = 'none';
        const sep = overlay.querySelector('.amkh-auth-sep');
        if (sep) sep.style.display = 'none';
      } else {
        googleBtn.onclick = async () => {
          amkhUI.sfx();
          errDiv.textContent = '';
          googleBtn.disabled = true;
          const prev = googleBtn.innerHTML;
          googleBtn.innerHTML = '<span>جاري الدخول…</span>';
          const r = await amkhAuth.loginWithGoogle();
          googleBtn.disabled = false;
          googleBtn.innerHTML = prev;
          if (r.success) {
            amkhUI.close(overlay);
            amkhAuth.updateUI();
            if (opts && typeof opts.onSuccess === 'function') { try { opts.onSuccess(); } catch (e) {} }
            amkhUI.notify('أهلًا بك! تم تسجيل الدخول', 'تم', '◉');
          } else if (!r.cancelled) {
            errDiv.textContent = r.error || 'تعذّر الدخول';
          }
        };
      }
    }

    /* التبديل بين الدخول والتسجيل بقى دالة مستقلة عشان شاشة الترحيب تقدر
       تفتح النافذة على وضع التسجيل مباشرة من غير ما تزوّر نقرة على الزر */
    const setMode = reg => {
      isRegisterMode = reg;
      errDiv.textContent = '';
      if (reg) {
        titleEl.textContent = 'إنشاء حساب جديد';
        subEl.textContent = 'حسابك يحفظ تقدّمك في المراحل وإعداداتك على أي جهاز';
        nameField.style.display = '';
        loginBtn.textContent = 'إنشاء الحساب';
        toggleBtn.textContent = 'لديك حساب بالفعل؟ سجّل الدخول';
        /* «نسيت كلمة المرور» مالهاش معنى وإنت بتعمل حسابًا جديدًا */
        if (forgotBtn) forgotBtn.style.display = 'none';
      } else {
        titleEl.textContent = 'تسجيل الدخول';
        subEl.textContent = 'سجّل دخولك لمزامنة تقدّمك واللعب مع أصدقائك';
        nameField.style.display = 'none';
        loginBtn.textContent = 'تسجيل الدخول';
        toggleBtn.textContent = 'ليس لديك حساب؟ أنشئ حسابًا';
        if (forgotBtn) forgotBtn.style.display = '';
      }
    };

    if (forgotBtn) {
      forgotBtn.onclick = () => {
        amkhUI.sfx();
        const typed = (overlay.querySelector('#auth-email').value || '').trim();
        overlay._dismiss();
        /* بنمرّر onSuccess جاية من نافذة الدخول: لو المستخدم دخل عن طريق
           إعادة التعيين، شاشة الترحيب لازم تقفل نفسها زي أي دخول ناجح. */
        amkhAuth.showResetModal(typed, opts);
      };
    }

    toggleBtn.onclick = () => { amkhUI.sfx(); setMode(!isRegisterMode); };

    loginBtn.onclick = async () => {
      amkhUI.sfx();
      const email = overlay.querySelector('#auth-email').value.trim();
      const pass = overlay.querySelector('#auth-pass').value;
      const name = nameInput.value.trim();

      if (!email || !pass) { errDiv.textContent = 'الرجاء إدخال البريد وكلمة المرور'; return; }

      errDiv.textContent = '';
      loginBtn.disabled = true;
      const label = loginBtn.textContent;
      loginBtn.textContent = 'جاري التحميل…';

      let res;
      try {
        res = isRegisterMode
          ? await amkhAuth.register(email, pass, name)
          : await amkhAuth.login(email, pass);
      } catch (e) {
        res = { success: false, error: 'تعذّر الاتصال بالخادم. تأكّد من اتصال الإنترنت ثم أعِد المحاولة.' };
      }

      loginBtn.disabled = false;
      loginBtn.textContent = label;

      if (res && res.success && res.verify) {
        /* الحساب لسه ماتعملش — الرمز في بريده. نافذة التسجيل بتقفل
           والتأكيد بياخد مكانها، و«تغيير البريد» بترجّعه لهنا. */
        overlay._dismiss();
        amkhAuth.showVerifyModal({
          email: email, password: pass, displayName: name,
          ttl: res.ttl, loginOpts: opts,
        });
        return;
      }

      if (res && res.success) {
        overlay._dismiss();
        if (opts && typeof opts.onSuccess === 'function') { try { opts.onSuccess(); } catch (e) {} }
        return;
      }

      /* عنده رمز مبعوت بالفعل (قفل النافذة ورجع، أو دوس مرتين): الخادم
         بيرفض بكولداون. سيبانه في نافذة التسجيل معناه إن عنده رمز في
         بريده ومافيش خانة يكتبه فيها، فبنوديه على خانة الرمز على طول. */
      if (res && res.pending) {
        overlay._dismiss();
        amkhAuth.showVerifyModal({
          email: email, password: pass, displayName: name,
          ttl: res.ttl, cooldown: res.retryAfter, already: true, loginOpts: opts,
        });
        return;
      }

      errDiv.textContent = (res && res.error) || 'حدث خطأ، حاول مرة أخرى';
    };

    if (opts && opts.register) setMode(true);
  },

  /* ══════════════════════════════════════════════════════════════
     #6 — نافذة «نسيت كلمة المرور»
     خطوتان في نافذة واحدة: البريد ← الرمز وكلمة المرور الجديدة.
     نافذة واحدة مش اتنين عشان المستخدم مايحسّش إنه بيتنقّل بين شاشات
     وهو في نصّ عملية واحدة، ولأن البريد لازم يفضل متعرَّفًا في الخطوة
     التانية بلا ما يكتبه تاني.
     الخادم بيردّ نفس الردّ سواء البريد مسجَّل أو لا، فالنافذة بتنقل
     للخطوة التانية دايمًا — أي «البريد غير موجود» هنا كان هيكشف
     حسابات الناس لأي حد بيجرّب بريدًا.
     ══════════════════════════════════════════════════════════════ */
  showResetModal(prefillEmail, loginOpts) {
    const overlay = amkhUI.mount('amkh-reset-modal', `
      <div class="ds-dialog amkh-auth-dialog amkh-reset-dialog">
        <div class="ds-dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><rect x="4" y="10.5" width="16" height="10" rx="2.2"/><path d="M8 10.5V7.6A4 4 0 0 1 15.6 6"/><circle cx="12" cy="15.5" r="1.3"/></svg>
        </div>
        <h2 class="ds-dialog__title" id="reset-title">نسيت كلمة المرور؟</h2>
        <p class="ds-dialog__message" id="reset-sub">اكتب بريدك الإلكتروني وسيصلك رمز من 6 أرقام لتعيين كلمة مرور جديدة</p>

        <div id="reset-step1">
          <div class="ds-field">
            <input type="email" id="reset-email" class="ds-input" placeholder="البريد الإلكتروني"
              autocomplete="email" style="direction:ltr;text-align:left;">
          </div>
        </div>

        <div id="reset-step2" style="display:none;">
          <div class="ds-field">
            <input type="text" id="reset-code" class="ds-input amkh-reset-code" placeholder="- - - - - -"
              inputmode="numeric" autocomplete="one-time-code" maxlength="6">
          </div>
          <div class="ds-field">
            <input type="password" id="reset-pass" class="ds-input" placeholder="كلمة المرور الجديدة"
              autocomplete="new-password" style="direction:ltr;text-align:left;">
          </div>
          <div class="ds-field">
            <input type="password" id="reset-pass2" class="ds-input" placeholder="تأكيد كلمة المرور"
              autocomplete="new-password" style="direction:ltr;text-align:left;">
          </div>
        </div>

        <p class="ds-field__hint ds-field__hint--error" id="reset-err" role="alert" style="min-height:18px;"></p>

        <div class="ds-dialog__actions" style="flex-direction:column;">
          <button id="reset-go" class="ds-btn ds-btn--primary ds-btn--block">إرسال الرمز</button>
          <button id="reset-resend" class="ds-btn ds-btn--ghost ds-btn--block" style="display:none;">إعادة إرسال الرمز</button>
          <button id="reset-back" class="ds-btn ds-btn--ghost ds-btn--block">رجوع لتسجيل الدخول</button>
        </div>
      </div>`, { sfx: 'reset', onDismiss: () => { try { stopTick(); } catch (e) {} } });

    const q = s => overlay.querySelector(s);
    const errDiv = q('#reset-err');
    const goBtn = q('#reset-go');
    const resendBtn = q('#reset-resend');
    const backBtn = q('#reset-back');
    const emailIn = q('#reset-email');
    const codeIn = q('#reset-code');
    const passIn = q('#reset-pass');
    const pass2In = q('#reset-pass2');
    let step = 1;
    let sentTo = '';
    let ttl = 15;
    let tick = null;

    if (prefillEmail) emailIn.value = prefillEmail;

    /* الرمز أرقام فقط: أي حرف أو مسافة بيتشالوا وقت الكتابة، فالمستخدم
       اللي بيلزق الرمز من البريد بمسافات مايشوفش خطأ بلا سبب. */
    codeIn.addEventListener('input', () => {
      const v = codeIn.value.replace(/\D/g, '').slice(0, 6);
      if (v !== codeIn.value) codeIn.value = v;
    });

    const stopTick = () => { if (tick) { clearInterval(tick); tick = null; } };
    /* تصريف «ثانية» عربيًّا: العدّاد بينزل من 60 لواحد فبيمرّ على كل
       الصيغ — «5 ثوانٍ» و«ثانيتين» و«ثانية واحدة» و«45 ثانية». */
    const secsAr = n => {
      n = Math.max(0, n | 0);
      if (n === 1) return 'ثانية واحدة';
      if (n === 2) return 'ثانيتين';
      return n + ' ' + ((n >= 3 && n <= 10) ? 'ثوانٍ' : 'ثانية');
    };
    /* عدّاد إعادة الإرسال: الخادم بيفرض 60 ثانية بين طلبين لنفس البريد،
       فالزر بيقعد مقفولًا بنفس المدة بدل ما المستخدم يدوس ويلاقي رفضًا. */
    const startCooldown = secs => {
      stopTick();
      let left = Math.max(1, secs | 0);
      const paint = () => {
        resendBtn.disabled = left > 0;
        resendBtn.textContent = left > 0 ? `إعادة إرسال الرمز بعد ${secsAr(left)}` : 'إعادة إرسال الرمز';
        if (left <= 0) stopTick();
        left--;
      };
      paint();
      tick = setInterval(paint, 1000);
    };

    const maskEmail = e => String(e || '').replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');

    const toStep2 = () => {
      step = 2;
      q('#reset-title').textContent = 'أدخل الرمز';
      q('#reset-sub').innerHTML = `أرسلنا رمزًا من 6 أرقام إلى <b style="direction:ltr;display:inline-block">${amkhUI.esc(maskEmail(sentTo))}</b> — صالح لمدة ${ttl} دقيقة.<br>لو لم تجده فراجع مجلد الرسائل غير المرغوبة.`;
      q('#reset-step1').style.display = 'none';
      q('#reset-step2').style.display = '';
      goBtn.textContent = 'تغيير كلمة المرور';
      resendBtn.style.display = '';
      backBtn.textContent = 'إلغاء';
      startCooldown(60);
      try { if (window.SFX && window.SFX.modalOpen) window.SFX.modalOpen('codeSent'); } catch (e) {}
      setTimeout(() => { try { codeIn.focus(); } catch (e) {} }, 120);
    };

    const sendCode = async (isResend) => {
      const email = ((step === 2 ? (sentTo || emailIn.value) : emailIn.value) || '').trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errDiv.textContent = 'اكتب بريدًا إلكترونيًا صحيحًا';
        return;
      }
      errDiv.textContent = '';
      const btn = isResend ? resendBtn : goBtn;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'جاري الإرسال…';
      const r = await amkhAuth.forgotPassword(email);
      btn.disabled = false;
      btn.textContent = label;
      if (r.success) {
        sentTo = email;
        ttl = r.ttl || 15;
        if (step === 1) toStep2();
        else {
          startCooldown(60);
          amkhUI.notify('أرسلنا لك رمزًا جديدًا على بريدك', 'تم الإرسال', '◉');
        }
      } else if (r.retryAfter && step === 1) {
        /* حالة واقعية: المستخدم طلب رمزًا، قفل النافذة، فتحها تاني ودوس
           «إرسال». الخادم بيرفض بسبب مهلة الستين ثانية — ولو سِبناه في
           الخطوة الأولى يبقى عنده رمز في بريده ومافيش خانة يكتبه فيها،
           فيقعد يدوس ويتفرّج على رسالة «انتظر». بنعدّيه للخطوة التانية
           على طول ونشغّل العدّاد بالباقي من المهلة. */
        sentTo = email;
        toStep2();
        startCooldown(r.retryAfter);
        q('#reset-sub').innerHTML = `سبق أن أرسلنا رمزًا إلى <b style="direction:ltr;display:inline-block">${amkhUI.esc(maskEmail(sentTo))}</b> — أدخله هنا.<br>لو لم يصلك فاطلب رمزًا جديدًا بعد انتهاء المهلة.`;
        errDiv.textContent = '';
      } else {
        errDiv.textContent = r.error;
        if (r.retryAfter) startCooldown(r.retryAfter);
      }
    };

    const doReset = async () => {
      const code = (codeIn.value || '').replace(/\D/g, '');
      const p1 = passIn.value;
      const p2 = pass2In.value;
      if (code.length !== 6) { errDiv.textContent = 'الرمز 6 أرقام'; return; }
      if (!p1 || p1.length < 8) { errDiv.textContent = 'كلمة المرور 8 أحرف على الأقل'; return; }
      if (p1 !== p2) { errDiv.textContent = 'كلمتا المرور غير متطابقتين'; return; }
      errDiv.textContent = '';
      goBtn.disabled = true;
      const label = goBtn.textContent;
      goBtn.textContent = 'جاري التغيير…';
      const r = await amkhAuth.resetPassword(sentTo, code, p1);
      goBtn.disabled = false;
      goBtn.textContent = label;
      if (r.success) {
        stopTick();
        overlay._dismiss();
        amkhAuth.updateUI();
        if (loginOpts && typeof loginOpts.onSuccess === 'function') { try { loginOpts.onSuccess(); } catch (e) {} }
        amkhUI.notify('تم تغيير كلمة المرور وتسجيل دخولك', 'تم', '◉');
      } else {
        errDiv.textContent = r.error;
        /* الرمز حُرق أو انتهى: مافيش فايدة من محاولة تانية بنفس الرمز،
           فبنرجّعه للخطوة الأولى عشان يطلب رمزًا جديدًا. */
        if (r.expired) {
          codeIn.value = '';
          stopTick();
          resendBtn.disabled = false;
          resendBtn.textContent = 'إرسال رمز جديد';
        }
      }
    };

    goBtn.onclick = () => { amkhUI.sfx(); if (step === 1) sendCode(false); else doReset(); };
    resendBtn.onclick = () => { amkhUI.sfx(); sendCode(true); };
    backBtn.onclick = () => {
      amkhUI.sfx();
      stopTick();
      overlay._dismiss();
      /* «رجوع» في الخطوة الأولى معناها ترجع لنافذة الدخول، وفي الخطوة
         التانية معناها إلغاء العملية كلها. */
      if (step === 1) amkhAuth.showLoginModal(loginOpts);
    };

    /* Enter بينقل للخطوة اللي بعدها بدل ما يعمل حاجة */
    const onEnter = e => { if (e.key === 'Enter') { e.preventDefault(); goBtn.click(); } };
    [emailIn, codeIn, passIn, pass2In].forEach(el => el.addEventListener('keydown', onEnter));

    setTimeout(() => { try { (prefillEmail ? goBtn : emailIn).focus(); } catch (e) {} }, 150);
    return overlay;
  },

  /* ══════════════════════════════════════════════════════════════
     #13 — نافذة تأكيد البريد عند إنشاء الحساب
     الحساب لسه ماتعملش لما النافذة دي تفتح: الخادم شايل الطلب مؤقتًا
     ومستني الرمز. فلو المستخدم قفلها مافيش حساب نصف جاهز اتعمل، ولو
     رجع وسجّل تاني بنفس البريد الطلب القديم بيتبطّل بالجديد.
     شكلها مقصود إنه يشبه نافذة الاستعادة: نفس خانة الأرقام الستة ونفس
     العدّاد — المستخدم اللي شاف واحدة منهم يبقى فاهم التانية.
     ══════════════════════════════════════════════════════════════ */
  showVerifyModal(o) {
    const opt = o || {};
    const email = String(opt.email || '').trim();
    let pass = String(opt.password || '');
    const displayName = String(opt.displayName || '');
    const ttl = opt.ttl || 15;
    const loginOpts = opt.loginOpts;
    const maskEmail = e => String(e || '').replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');

    const overlay = amkhUI.mount('amkh-verify-modal', `
      <div class="ds-dialog amkh-auth-dialog amkh-reset-dialog">
        <div class="ds-dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M3.5 7.5h17v10a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.7 8 12 13.6 20.3 8"/><path d="m8.8 15.4 1.9 1.9 3.9-4.2"/></svg>
        </div>
        <h2 class="ds-dialog__title">أكّد بريدك الإلكتروني</h2>
        <p class="ds-dialog__message" id="vf-sub">${opt.already
          ? `سبق أن أرسلنا رمزًا إلى <b style="direction:ltr;display:inline-block">${amkhUI.esc(maskEmail(email))}</b> — أدخله هنا لإكمال إنشاء حسابك.`
          : `أرسلنا رمزًا من 6 أرقام إلى <b style="direction:ltr;display:inline-block">${amkhUI.esc(maskEmail(email))}</b> — صالح لمدة ${ttl} دقيقة.<br>لو لم تجده فراجع مجلد الرسائل غير المرغوبة.`}</p>

        <div class="ds-field">
          <input type="text" id="vf-code" class="ds-input amkh-reset-code" placeholder="- - - - - -"
            inputmode="numeric" autocomplete="one-time-code" maxlength="6">
        </div>

        <p class="ds-field__hint ds-field__hint--error" id="vf-err" role="alert" style="min-height:18px;"></p>

        <div class="ds-dialog__actions" style="flex-direction:column;">
          <button id="vf-go" class="ds-btn ds-btn--primary ds-btn--block">تأكيد وإنشاء الحساب</button>
          <button id="vf-resend" class="ds-btn ds-btn--ghost ds-btn--block">إعادة إرسال الرمز</button>
          <button id="vf-back" class="ds-btn ds-btn--ghost ds-btn--block">تعديل البريد أو كلمة المرور</button>
        </div>
      </div>`, { sfx: 'signup', onDismiss: () => { try { stopTick(); } catch (e) {} } });

    const q = s => overlay.querySelector(s);
    const errDiv = q('#vf-err');
    const goBtn = q('#vf-go');
    const resendBtn = q('#vf-resend');
    const backBtn = q('#vf-back');
    const codeIn = q('#vf-code');
    let tick = null;

    /* الرمز أرقام فقط: اللزق من البريد بمسافات مايطلّعش خطأ بلا سبب */
    codeIn.addEventListener('input', () => {
      const v = codeIn.value.replace(/\D/g, '').slice(0, 6);
      if (v !== codeIn.value) codeIn.value = v;
    });

    const stopTick = () => { if (tick) { clearInterval(tick); tick = null; } };
    const secsAr = n => {
      n = Math.max(0, n | 0);
      if (n === 1) return 'ثانية واحدة';
      if (n === 2) return 'ثانيتين';
      return n + ' ' + ((n >= 3 && n <= 10) ? 'ثوانٍ' : 'ثانية');
    };
    /* الخادم بيفرض 60 ثانية بين طلبين لنفس البريد، فالزر بيقعد مقفولًا
       بنفس المدة بدل ما المستخدم يدوس ويلاقي رفضًا */
    const startCooldown = secs => {
      stopTick();
      let left = Math.max(1, secs | 0);
      const paint = () => {
        resendBtn.disabled = left > 0;
        resendBtn.textContent = left > 0 ? `إعادة إرسال الرمز بعد ${secsAr(left)}` : 'إعادة إرسال الرمز';
        if (left <= 0) stopTick();
        left--;
      };
      paint();
      tick = setInterval(paint, 1000);
    };
    startCooldown(opt.cooldown || 60);

    const doVerify = async () => {
      const code = (codeIn.value || '').replace(/\D/g, '');
      if (code.length !== 6) { errDiv.textContent = 'الرمز 6 أرقام'; return; }
      errDiv.textContent = '';
      goBtn.disabled = true;
      const label = goBtn.textContent;
      goBtn.textContent = 'جاري التأكيد…';
      const r = await amkhAuth.verifySignup(email, code);
      goBtn.disabled = false;
      goBtn.textContent = label;
      if (r.success) {
        stopTick();
        overlay._dismiss();
        amkhAuth.updateUI();
        if (loginOpts && typeof loginOpts.onSuccess === 'function') { try { loginOpts.onSuccess(); } catch (e) {} }
        amkhUI.notify('تم تأكيد بريدك وإنشاء حسابك', 'أهلًا بك', '◉');
        return;
      }
      errDiv.textContent = r.error;
      /* الرمز اتحرق أو خلصت صلاحيته: محاولة تانية بنفس الرمز مالهاش
         فايدة، فبنفتح له إعادة الإرسال فورًا */
      if (r.expired) {
        codeIn.value = '';
        stopTick();
        resendBtn.disabled = false;
        resendBtn.textContent = 'إرسال رمز جديد';
      }
      /* البريد بقى مسجّلًا وإحنا مستنيين (سجّل من جهاز تاني مثلًا) */
      if (r.exists) {
        stopTick();
        overlay._dismiss();
        amkhAuth.showLoginModal(loginOpts);
      }
    };

    const resend = async () => {
      if (!pass) {
        /* مافيش كلمة مرور في الذاكرة (النافذة اتفتحت من مسار تاني):
           إعادة الإرسال محتاجة الطلب كامل، فبنرجّعه لنافذة التسجيل. */
        stopTick();
        overlay._dismiss();
        amkhAuth.showLoginModal(Object.assign({ register: true }, loginOpts || {}));
        return;
      }
      errDiv.textContent = '';
      resendBtn.disabled = true;
      const label = resendBtn.textContent;
      resendBtn.textContent = 'جاري الإرسال…';
      const r = await amkhAuth.register(email, pass, displayName);
      resendBtn.textContent = label;
      resendBtn.disabled = false;
      if (r.success && r.verify) {
        startCooldown(60);
        amkhUI.notify('أرسلنا لك رمزًا جديدًا على بريدك', 'تم الإرسال', '◉');
      } else if (r.success) {
        /* خادم قديم عمل الحساب فورًا — العملية خلصت */
        stopTick();
        overlay._dismiss();
        amkhAuth.updateUI();
        if (loginOpts && typeof loginOpts.onSuccess === 'function') { try { loginOpts.onSuccess(); } catch (e) {} }
      } else {
        errDiv.textContent = r.error;
        if (r.retryAfter) startCooldown(r.retryAfter);
        if (r.exists) { stopTick(); overlay._dismiss(); amkhAuth.showLoginModal(loginOpts); }
      }
    };

    goBtn.onclick = () => { amkhUI.sfx(); doVerify(); };
    resendBtn.onclick = () => { amkhUI.sfx(); resend(); };
    backBtn.onclick = () => {
      amkhUI.sfx();
      stopTick();
      pass = '';
      overlay._dismiss();
      /* رجوع لنافذة التسجيل: الرمز المبعوت يفضل صالح، ولو كتب نفس
         البريد تاني الخادم بيوديه لنفس النافذة دي بالعدّاد الباقي. */
      amkhAuth.showLoginModal(Object.assign({ register: true }, loginOpts || {}));
    };
    codeIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); goBtn.click(); }
    });
    setTimeout(() => { try { codeIn.focus(); } catch (e) {} }, 150);
    return overlay;
  },

  showProfileModal() {
    const name = (this.user && (this.user.display_name || this.user.email)) || 'لاعب';
    const overlay = amkhUI.mount('amkh-auth-modal', `
      <div class="ds-dialog amkh-auth-dialog">
        <div class="ds-dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h2 class="ds-dialog__title">${amkhUI.esc(name)}</h2>
        <p class="ds-dialog__message">حسابك متصل — تقدمك وإعداداتك بيتزامنوا تلقائيًا</p>

        <div class="ds-dialog__actions" style="flex-direction:column;">
          <button id="btn-profile" class="ds-btn ds-btn--primary ds-btn--block">ملفي الشخصي الكامل</button>
          <button id="btn-sync"    class="ds-btn ds-btn--secondary ds-btn--block">مزامنة بياناتي الآن</button>
          <button id="btn-logout"  class="ds-btn ds-btn--danger ds-btn--block">تسجيل الخروج</button>
          <button class="ds-btn ds-btn--ghost ds-btn--block" data-close>إغلاق</button>
        </div>
      </div>`);

    overlay.querySelector('#btn-logout').onclick = async () => {
      amkhUI.sfx();
      const sure = await amkhUI.confirm('تسجيل الخروج', 'سيتم تسجيل خروجك من حسابك على هذا الجهاز. هل أنت متأكد؟', 'خروج', 'إلغاء');
      if (sure) { overlay._dismiss(); this.logout(); }
    };

    const syncBtn = overlay.querySelector('#btn-sync');
    syncBtn.onclick = async () => {
      amkhUI.sfx();
      syncBtn.disabled = true;
      syncBtn.textContent = 'جاري المزامنة…';
      await this.syncLocalData();
      syncBtn.textContent = 'تمت المزامنة';
      setTimeout(() => { syncBtn.disabled = false; syncBtn.textContent = 'مزامنة بياناتي الآن'; }, 1600);
    };

    /* الأصدقاء بقى ليهم زرّهم في الشريط العلوي، فمكانهم هنا اتحوّل
       للملف الشخصي الكامل (نفس البطاقة اللي بتفتح من لوحة الصدارة). */
    overlay.querySelector('#btn-profile').onclick = () => {
      amkhUI.sfx();
      const uid = this.user && Number(this.user.id);
      if (!uid || !window.PlayerCard) return;
      overlay._dismiss();
      window.PlayerCard.open(uid, {
        name: (this.user.display_name || this.user.email || 'لاعب'),
        avatar_url: this.user.avatar_url || '',
        country: this.user.country || '',
      });
    };
  }
};

window.amkhAuth = amkhAuth;
/* اعرض زر الحساب فورًا بالحالة المحفوظة عشان يبان مع شريط التطبيق من
   أول رسم بدل ما «ينطّ» بعد ثانية (شريط التطبيق موجود في الصفحة قبل
   ما السكربت ده يتحمّل، فالزر بيلاقي مكانه على طول). التحقق من التوكن
   والحضور والمزامنة بيفضلوا مؤجَّلين لأنهم بيحتاجوا رابط السيرفر
   يتحمّل الأول. */
try {
  if (amkhAuth.token && !amkhAuth.user) {
    try { amkhAuth.user = JSON.parse(localStorage.getItem('amkh_user') || 'null'); } catch (e) {}
  }
  amkhAuth.updateUI();
} catch (e) {}
setTimeout(() => amkhAuth.init(), 1000);
