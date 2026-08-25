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
        /* نرفع صورتي للسيرفر لو محفوظة محليًا بس السيرفر مايعرفهاش — عشان
           تبان لأصدقائي وفي قائمة أعضاء الحفلة، مش عندي محليًا بس. */
        try { if (window.amkhSyncMyAvatar) window.amkhSyncMyAvatar(); } catch (e) {}
      } else if (state === 'invalid') {
        /* السيرفر رفض التوكن نفسه — ده الخروج الشرعي الوحيد */
        this.logout();
      } else {
        /* offline: السيرفر مش متاح دلوقتي. الجلسة بتفضل والتطبيق يشتغل،
           وبنحاول تاني بعد شوية. مسح التوكن هنا كان بيطلّع المستخدم من
           حسابه على أول فشل شبكة. */
        console.log('[auth] الحساب محفوظ، السيرفر مش متاح دلوقتي — هنحاول تاني');
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
      return { success: false, error: 'تعذّر الوصول للسيرفر. تأكد من الإنترنت وحاول تاني.' };
    }
    const res = await fetch(`${window.getApiBase()}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      this.setToken(data.token, data.user);
      return { success: true };
    }
    return { success: false, error: data.error };
  },

  async register(email, password, displayName) {
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول للسيرفر. تأكد من الإنترنت وحاول تاني.' };
    }
    const res = await fetch(`${window.getApiBase()}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ email, password, display_name: displayName })
    });
    const data = await res.json();
    if (res.ok) {
      this.setToken(data.token, data.user);
      await this.promptMigration();
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
  async loginWithGoogle() {
    if (!await window.amkhEnsureServer()) {
      return { success: false, error: 'تعذّر الوصول للسيرفر. تأكد من الإنترنت وحاول تاني.' };
    }
    const g = window.amkhGoogleAuth;
    if (!g || !g.available) {
      return { success: false, error: 'الدخول بجوجل متاح في تطبيق الأندرويد' };
    }
    let idToken;
    try {
      const r = await g.signIn();
      idToken = r && r.idToken;
    } catch (e) {
      const m = String((e && e.message) || '');
      /* إلغاء المستخدم مش خطأ — مانزعّجهوش برسالة */
      if (/cancel|closed|12501|user_cancel/i.test(m)) return { success: false, cancelled: true };
      console.error('[auth] google sign-in failed:', m);
      /* السبب بيظهر في الرسالة كاملًا: تشخيص فشل الدخول بجوجل على تليفون
         بعيد من غير سبب مكتوب كان شبه مستحيل. مابنقصّش الرسالة كتير عشان
         رسائل الـplugin الأصلية (زي «10:» أو «main activity») تبان كلها. */
      return { success: false, error: 'تعذّر الدخول بجوجل — ' + (m.slice(0, 200) || 'سبب غير معروف') };
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
      await this.promptMigration();
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
    this._reconcileAvatar();
    /* بعد الدخول: اربط توكِن الإشعارات بالحساب عشان توصلك رسايل الأصدقاء
       وأنت غير متصل (السيرفر بيبعت للـuserId). */
    try { if (window.Notifications && window.Notifications._linkTokenToUser) window.Notifications._linkTokenToUser(); } catch (e) {}
    /* لو المستخدم فتح رابط دعوة حفلة (#join=TOKEN) وهو مش مسجّل دخول،
       التوكِن اتحفظ في sessionStorage — نكمّل الانضمام دلوقتي بعد الدخول. */
    try { if (window.amkhChat && window.amkhChat.resumePendingInvite) window.amkhChat.resumePendingInvite(); } catch (e) {}
  },

  /* توفيق صورة الملف بين الجهاز والخادم بعد تسجيل الدخول:
     - عندي صورة محلية والخادم فاضي → ارفعها (بيشمل مين ضبط صورته قبل الميزة دي).
     - الخادم عنده صورة data: ومحليًا مفيش → املأ المحلي عشان تشوف صورتك على أي جهاز.
     بيشتغل بهدوء؛ أي فشل مايأثرش على الدخول. مابنملّاش المحلي من روابط
     جوجل (http) عشان صورة اللوحة تفضل تشتغل أوفلاين وجوّه الـAPK. */
  _reconcileAvatar() {
    try {
      if (typeof Cfg === 'undefined' || !Cfg.data) return;
      const server = this.user && this.user.avatar_url;
      const local = Cfg.data.playerImage;
      if (local && !server) {
        if (typeof Cfg._syncAvatarToServer === 'function') Cfg._syncAvatarToServer(local);
      } else if (!local && server && /^data:image\//i.test(String(server))) {
        Cfg.data.playerImage = server;
        try { Cfg._persist(); } catch (e) {}
        try { if (typeof Cfg._updateProfileImage === 'function') Cfg._updateProfileImage(); } catch (e) {}
      }
    } catch (e) {}
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

  async promptMigration() {
    const wantsSync = await amkhUI.confirm(
      'ربط تقدمك الحالي',
      'تم إنشاء الحساب. تحب نربط التقدم والإعدادات المحفوظة على الجهاز ده بحسابك الجديد؟',
      'اربط الآن', 'لاحقًا'
    );
    if (wantsSync) {
      await this.syncLocalData();
    }
  },

  async syncLocalData() {
    // Collect local data
    let localSettings = {};
    try {
      const cfg = localStorage.getItem('chess-cfg-v6');
      if (cfg) localSettings = JSON.parse(cfg);
    } catch(e) {}

    let localProgress = [];
    try {
      const dbRequest = indexedDB.open('ChessNourDB', 1);
      await new Promise((resolve) => {
        dbRequest.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('nourProgress')) {
            resolve(); return;
          }
          const tx = db.transaction('nourProgress', 'readonly');
          const store = tx.objectStore('nourProgress');
          const getReq = store.getAll();
          getReq.onsuccess = () => {
            localProgress = getReq.result || [];
            resolve();
          };
          getReq.onerror = resolve;
        };
        dbRequest.onerror = resolve;
        dbRequest.onupgradeneeded = resolve;
      });
    } catch(e) {}

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
  },

  showLoginModal() {
    const overlay = amkhUI.mount('amkh-auth-modal', `
      <div class="ds-dialog amkh-auth-dialog">
        <div class="ds-dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h2 class="ds-dialog__title" id="auth-modal-title">تسجيل الدخول</h2>
        <p class="ds-dialog__message" id="auth-modal-sub">سجّل دخولك عشان تقدر تزامن تقدمك وتلعب مع أصدقائك</p>

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
            amkhUI.notify('اهلاً بك! تم تسجيل الدخول', 'تم', '◉');
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
        subEl.textContent = 'حسابك بيحفظ تقدمك في المراحل وإعداداتك على أي جهاز';
        nameField.style.display = '';
        loginBtn.textContent = 'إنشاء الحساب';
        toggleBtn.textContent = 'لديك حساب بالفعل؟ سجّل الدخول';
      } else {
        titleEl.textContent = 'تسجيل الدخول';
        subEl.textContent = 'سجّل دخولك عشان تقدر تزامن تقدمك وتلعب مع أصدقائك';
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
        res = { success: false, error: 'تعذّر الاتصال بالخادم. تأكد من الإنترنت وحاول تاني.' };
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
          <button id="btn-friends" class="ds-btn ds-btn--primary ds-btn--block">قائمة الأصدقاء</button>
          <button id="btn-sync"    class="ds-btn ds-btn--secondary ds-btn--block">مزامنة بياناتي الآن</button>
          <button id="btn-logout"  class="ds-btn ds-btn--danger ds-btn--block">تسجيل الخروج</button>
          <button class="ds-btn ds-btn--ghost ds-btn--block" data-close>إغلاق</button>
        </div>
      </div>`);

    overlay.querySelector('#btn-logout').onclick = async () => {
      amkhUI.sfx();
      const sure = await amkhUI.confirm('تسجيل الخروج', 'هتخرج من حسابك على الجهاز ده. متأكد؟', 'خروج', 'إلغاء');
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

    overlay.querySelector('#btn-friends').onclick = () => {
      amkhUI.sfx();
      overlay._dismiss();
      if (window.amkhFriends) window.amkhFriends.showFriendsModal();
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
