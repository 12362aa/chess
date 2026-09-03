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
    overlay.addEventListener('click', e => {
      if (e.target !== overlay) return;
      if (openedAt && (Date.now() - openedAt) < 450) return;
      dismiss();
    });
    const onKey = e => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);

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

  async register(email, password, displayName) {
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول إلى الخادم. تأكّد من اتصال الإنترنت ثم أعِد المحاولة.' };
    }
    const res = await fetch(`${window.getApiBase()}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ email, password, display_name: displayName })
    });
    const data = await res.json();
    if (res.ok) {
      this.setToken(data.token, data.user);
      this.mergeDeviceData();   /* #18: ربط صامت بلا نافذة — بالخلفية */
      return { success: true };
    }
    return { success: false, error: data.error };
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

  connectPresence() {
    if (!this.token) return;
    /* لو الأونلاين عنده سوكت مفتوح، نستخدمه ونبعت التعريف عليه */
    const shared = window.chessWs;
    if (shared && shared.readyState === 1) {
      try { shared.send(JSON.stringify({ type: 'presence:hello', token: this.token })); } catch (e) {}
      /* #8 — رسائل مؤجَّلة من وقت الانقطاع: تتبعت لوحدها هنا */
      try { if (window.amkhChat && window.amkhChat._flushOutbox) window.amkhChat._flushOutbox(); } catch (e) {}
      /* #5 — والمباراة المحلية الشغّالة تُبَثّ من جديد على السوكت ده */
      try { if (window.amkhLocalCast && window.amkhLocalCast.resume) window.amkhLocalCast.resume(); } catch (e) {}
    }
    /* وبرضه بنفتح سوكتنا لو مفيش واحد شغّال — الحضور لازم يفضل حتى لو
       المستخدم مافتحش الأونلاين خالص */
    if (this._presWs && (this._presWs.readyState === 0 || this._presWs.readyState === 1)) return;
    this._openPresence();
  },

  async _openPresence() {
    if (!this.token) return;
    if (window.amkhEnsureServer && !await window.amkhEnsureServer()) {
      /* السيرفر مش متاح — نحاول تاني بعد شوية */
      clearTimeout(this._presTimer);
      this._presTimer = setTimeout(() => this._openPresence(), 10000);
      return;
    }
    const base = window.SERVER_HTTP;
    if (!base) return;
    const url = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    let ws;
    try { ws = new WebSocket(url); } catch (e) { return; }
    this._presWs = ws;

    ws.onopen = () => {
      this._presBackoff = 1000;
      try { ws.send(JSON.stringify({ type: 'presence:hello', token: this.token })); } catch (e) {}
      /* دعوات الحفلات اللي وصلت والتطبيق كان مقفول — نجيبها ونعرضها. */
      try { if (window.amkhFriends && window.amkhFriends.loadPartyInvites) window.amkhFriends.loadPartyInvites(); } catch (e) {}
      /* #8 — أي رسالة اتكتبت وقت الانقطاع تتبعت دلوقتي بترتيبها */
      try { if (window.amkhChat && window.amkhChat._flushOutbox) window.amkhChat._flushOutbox(); } catch (e) {}
      /* #5 — مباراة محلية لسه شغّالة على الشاشة؟ نعيد بثّها عشان
         المتفرّجين مايتعلّقوش والأصدقاء يشوفوا «في مباراة» تاني. */
      try { if (window.amkhLocalCast && window.amkhLocalCast.resume) window.amkhLocalCast.resume(); } catch (e) {}
      clearInterval(this._presPing);
      /* نبضة أقصر من مهلة الخمول في أي وسيط (ngrok بيقطع بعد ~60ث) */
      this._presPing = setInterval(() => {
        if (ws.readyState === 1) {
          try { ws.send(JSON.stringify({ type: 'presence:ping' })); } catch (e) {}
        }
      }, 25000);
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
      /* لو كانت مباراة صديق ماشية على السوكت ده، نبلّغ وحدة الأونلاين إنها
         انقطعت (زي أي انقطاع أونلاين) قبل ما نعيد الاتصال للحضور */
      try { if (window.OL && window.OL._presenceLost) window.OL._presenceLost(); } catch (e) {}
      if (!this.token) return;
      /* تأخير متزايد بحد أقصى 30 ثانية: مانضربش السيرفر لو هو واقع */
      clearTimeout(this._presTimer);
      this._presTimer = setTimeout(() => this._openPresence(), this._presBackoff);
      this._presBackoff = Math.min(this._presBackoff * 2, 30000);
    };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  },

  disconnectPresence() {
    clearInterval(this._presPing);
    clearTimeout(this._presTimer);
    if (this._presWs) { try { this._presWs.close(); } catch (e) {} this._presWs = null; }
  },


  /* زر الحساب بيعيش جوه شريط التطبيق جنب الإعدادات — مش زر عايم فوق
     الشاشة. أيقونة بس، من غير إيموجي، وبتتغير لما نكون داخلين. */
  updateUI() {
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

  showLoginModal() {
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
            amkhUI.notify('أهلًا بك! تم تسجيل الدخول', 'تم', '◉');
          } else if (!r.cancelled) {
            errDiv.textContent = r.error || 'تعذّر الدخول';
          }
        };
      }
    }

    toggleBtn.onclick = () => {
      amkhUI.sfx();
      isRegisterMode = !isRegisterMode;
      errDiv.textContent = '';
      if (isRegisterMode) {
        titleEl.textContent = 'إنشاء حساب جديد';
        subEl.textContent = 'حسابك يحفظ تقدّمك في المراحل وإعداداتك على أي جهاز';
        nameField.style.display = '';
        loginBtn.textContent = 'إنشاء الحساب';
        toggleBtn.textContent = 'لديك حساب بالفعل؟ سجّل الدخول';
      } else {
        titleEl.textContent = 'تسجيل الدخول';
        subEl.textContent = 'سجّل دخولك لمزامنة تقدّمك واللعب مع أصدقائك';
        nameField.style.display = 'none';
        loginBtn.textContent = 'تسجيل الدخول';
        toggleBtn.textContent = 'ليس لديك حساب؟ أنشئ حسابًا';
      }
    };

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

      if (res && res.success) overlay._dismiss();
      else errDiv.textContent = (res && res.error) || 'حدث خطأ، حاول مرة أخرى';
    };
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
