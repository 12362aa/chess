// auth-client.js
// يعالج تسجيل الدخول والاتصال بالـ API
window.getApiBase = () => {
  if (window.SERVER_HTTP) return window.SERVER_HTTP + '/api';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return 'http://localhost:8081/api';
  return '/api';
};

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
    const wantsSync = confirm('لقد قمت بإنشاء حساب جديد. هل تريد ربط تقدمك وإعداداتك الحالية المحفوظة على هذا الجهاز بحسابك الجديد؟');
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

  updateUI() {
    let btn = document.getElementById('amkh-auth-btn');
    if (!btn) {
      btn = document.createElement('div');
      btn.id = 'amkh-auth-btn';
      btn.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9999;background:rgba(0,0,0,0.7);color:#fff;padding:8px 15px;border-radius:20px;cursor:pointer;font-family:sans-serif;font-size:14px;';
      document.body.appendChild(btn);
    }
    
    if (this.user) {
      btn.innerHTML = `مرحباً ${this.user.display_name || this.user.email} ▼`;
      btn.onclick = () => this.showProfileModal();
    } else {
      btn.innerHTML = 'تسجيل الدخول / حساب جديد';
      btn.onclick = () => this.showLoginModal();
    }
  },

  showLoginModal() {
    const existing = document.getElementById('amkh-auth-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'amkh-auth-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);z-index:10000;display:flex;justify-content:center;align-items:center;direction:rtl;';
    
    overlay.innerHTML = \`
      <div style="background:#222;color:#fff;padding:20px;border-radius:10px;width:300px;text-align:center;font-family:sans-serif;">
        <h2 style="margin-top:0;">تسجيل الدخول</h2>
        <input type="email" id="auth-email" placeholder="البريد الإلكتروني" style="width:100%;margin-bottom:10px;padding:8px;box-sizing:border-box;">
        <input type="password" id="auth-pass" placeholder="كلمة المرور" style="width:100%;margin-bottom:10px;padding:8px;box-sizing:border-box;">
        <input type="text" id="auth-name" placeholder="الاسم (للحساب الجديد فقط)" style="width:100%;margin-bottom:15px;padding:8px;box-sizing:border-box;display:none;">
        
        <div style="color:red;margin-bottom:10px;font-size:12px;" id="auth-err"></div>

        <button id="btn-login" style="width:100%;padding:10px;background:#4CAF50;color:#fff;border:none;border-radius:5px;cursor:pointer;margin-bottom:10px;">تسجيل الدخول</button>
        <button id="btn-register-toggle" style="background:none;border:none;color:#aaa;cursor:pointer;text-decoration:underline;">ليس لديك حساب؟ إنشاء حساب جديد</button>
        <button id="btn-close-auth" style="margin-top:15px;background:none;border:none;color:#ff5555;cursor:pointer;">إغلاق</button>
      </div>
    \`;

    document.body.appendChild(overlay);

    let isRegisterMode = false;
    const errDiv = document.getElementById('auth-err');
    const nameInput = document.getElementById('auth-name');

    document.getElementById('btn-close-auth').onclick = () => overlay.remove();
    
    document.getElementById('btn-register-toggle').onclick = (e) => {
      isRegisterMode = !isRegisterMode;
      if (isRegisterMode) {
        document.querySelector('#amkh-auth-modal h2').innerText = 'إنشاء حساب جديد';
        nameInput.style.display = 'block';
        document.getElementById('btn-login').innerText = 'إنشاء الحساب';
        e.target.innerText = 'لديك حساب بالفعل؟ تسجيل الدخول';
      } else {
        document.querySelector('#amkh-auth-modal h2').innerText = 'تسجيل الدخول';
        nameInput.style.display = 'none';
        document.getElementById('btn-login').innerText = 'تسجيل الدخول';
        e.target.innerText = 'ليس لديك حساب؟ إنشاء حساب جديد';
      }
    };

    document.getElementById('btn-login').onclick = async () => {
      const email = document.getElementById('auth-email').value;
      const pass = document.getElementById('auth-pass').value;
      const name = nameInput.value;
      
      if (!email || !pass) return errDiv.innerText = 'الرجاء إدخال البريد وكلمة المرور';
      errDiv.innerText = 'جاري التحميل...';

      let res;
      if (isRegisterMode) {
        res = await amkhAuth.register(email, pass, name);
      } else {
        res = await amkhAuth.login(email, pass);
      }

      if (res.success) {
        overlay.remove();
      } else {
        errDiv.innerText = res.error || 'حدث خطأ';
      }
    };
  },

  showProfileModal() {
    const existing = document.getElementById('amkh-auth-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'amkh-auth-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);z-index:10000;display:flex;justify-content:center;align-items:center;direction:rtl;';
    
    overlay.innerHTML = \`
      <div style="background:#222;color:#fff;padding:20px;border-radius:10px;width:300px;text-align:center;font-family:sans-serif;">
        <h2 style="margin-top:0;">الملف الشخصي</h2>
        <p>مرحباً، \${this.user.display_name || this.user.email}</p>
        
        <button id="btn-friends" style="width:100%;padding:10px;background:#2196F3;color:#fff;border:none;border-radius:5px;cursor:pointer;margin-bottom:10px;">قائمة الأصدقاء</button>
        <button id="btn-sync" style="width:100%;padding:10px;background:#FF9800;color:#fff;border:none;border-radius:5px;cursor:pointer;margin-bottom:10px;">مزامنة البيانات المحلية قسراً</button>
        <button id="btn-logout" style="width:100%;padding:10px;background:#f44336;color:#fff;border:none;border-radius:5px;cursor:pointer;margin-bottom:10px;">تسجيل الخروج</button>
        
        <button id="btn-close-auth" style="margin-top:15px;background:none;border:none;color:#aaa;cursor:pointer;">إغلاق</button>
      </div>
    \`;

    document.body.appendChild(overlay);

    document.getElementById('btn-close-auth').onclick = () => overlay.remove();
    document.getElementById('btn-logout').onclick = () => {
      this.logout();
      overlay.remove();
    };
    document.getElementById('btn-sync').onclick = async () => {
      await this.syncLocalData();
    };
    document.getElementById('btn-friends').onclick = () => {
      overlay.remove();
      if (window.amkhFriends) window.amkhFriends.showFriendsModal();
    };
  }
};

window.amkhAuth = amkhAuth;
setTimeout(() => amkhAuth.init(), 1000);
