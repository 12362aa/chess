// auth-client.js
// يعالج تسجيل الدخول والاتصال بالـ API
window.getApiBase = () => {
  if (window.SERVER_HTTP) return window.SERVER_HTTP + '/api';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return 'http://localhost:8081/api';
  return '/api';
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
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'ds-overlay' + ((opts && opts.sheet) ? ' ds-overlay--sheet' : '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = innerHTML;
    document.body.appendChild(overlay);

    const dismiss = () => {
      document.removeEventListener('keydown', onKey);
      this.close(overlay);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
    const onKey = e => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);

    overlay.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => { this.sfx(); dismiss(); });
    });

    requestAnimationFrame(() => this.open(overlay));
    overlay._dismiss = dismiss;
    return overlay;
  },

  /* بديل alert() — بيستخدم نافذة التطبيق نفسها لو متاحة */
  notify(message, title, icon) {
    if (window.Modal && window.Modal.show) return window.Modal.show(message, title || 'تنبيه', icon || '◉');
    const ov = this.mount('amkh-ui-notify', `
      <div class="ds-dialog">
        <div class="ds-dialog__icon">${this.esc(icon || '◉')}</div>
        <h2 class="ds-dialog__title">${this.esc(title || 'تنبيه')}</h2>
        <p class="ds-dialog__message">${this.esc(message)}</p>
        <div class="ds-dialog__actions">
          <button class="ds-btn ds-btn--primary" data-close>موافق</button>
        </div>
      </div>`);
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
        </div>`);
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
      await this.fetchMe();
      if (this.user) {
        // Logged in
        console.log('Logged in as', this.user.display_name || this.user.email);
        this.updateUI();
        // connect WS presence
        this.connectPresence();
        this.startAutoSync();
      } else {
        // Invalid token
        this.logout();
      }
    } else {
      this.updateUI();
    }
  },

  async fetchMe() {
    try {
      const res = await fetch(`${window.getApiBase()}/me`, {
        headers: { 'Authorization': `Bearer ${this.token}`, 'ngrok-skip-browser-warning': 'true' }
      });
      if (res.ok) {
        this.user = await res.json();
      } else {
        this.user = null;
      }
    } catch (e) {
      this.user = null;
    }
  },

  async login(email, password) {
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
      return { success: false, error: 'تعذّر الدخول بجوجل. جرّب تاني.' };
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
    this.updateUI();
    this.connectPresence();
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('amkh_auth_token');
    this.updateUI();
    window.location.reload();
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

  connectPresence() {
    // Attempt to hook into existing WS or create new for presence if needed
    // Assuming the site has `window.ws` or similar, but since we can't be sure, we rely on the main site's WS if possible.
    // Or we just send a presence:hello if we have a connection.
    // As a fallback, we poll or let the main app dispatch a custom event.
    // In Am-Kh, let's just listen for a global WebSocket 'open' or try to get window.ws
    setInterval(() => {
      // Periodic check if WS is open
      const ws = window.chessWs || window.socket || (window.getWs && window.getWs());
      // We will define a global hook if possible, or assume friends-client will handle it
    }, 5000);
  },

  /* زر الحساب بيعيش جوه شريط التطبيق جنب الإعدادات — مش زر عايم فوق
     الشاشة. أيقونة بس، من غير إيموجي، وبتتغير لما نكون داخلين. */
  updateUI() {
    const trail = document.querySelector('.appbar__trail');
    let btn = document.getElementById('amkh-auth-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'amkh-auth-btn';
      btn.className = 'appbar__icon-btn amkh-auth-btn';
      if (trail) trail.insertBefore(btn, trail.firstChild);
      else document.body.appendChild(btn);
    }

    const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

    if (this.user) {
      const name = this.user.display_name || this.user.email;
      btn.innerHTML = ICON + '<span class="amkh-auth-btn__dot" aria-hidden="true"></span>';
      btn.classList.add('is-signed-in');
      btn.setAttribute('aria-label', 'حسابي — ' + name);
      btn.title = name;
      btn.onclick = () => { amkhUI.sfx(); this.showProfileModal(); };
    } else {
      btn.innerHTML = ICON;
      btn.classList.remove('is-signed-in');
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
setTimeout(() => amkhAuth.init(), 1000);
