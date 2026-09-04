/* ══════════════════════════════════════════════════════════════════════
   دردشة الأصدقاء — العميل
   ──────────────────────────────────────────────────────────────────────
   شات 1:1 دائم بين الأصدقاء، بستايل التطبيق (نفس توكنز ومكوّنات amkhUI).
   • الرسائل محفوظة في الحساب على السيرفر — تسجّل خروج وترجع تلاقيها.
   • بتمشي على نفس سوكت الحضور (chat:*)، والسجل/العدّادات على HTTP.
   • الأسماء والرسائل بـtextContent دايمًا (مفيش innerHTML لمحتوى المستخدم).
   • إرسال متفائل: بنعرض الرسالة فورًا بمعرّف مؤقت (client_id) ونصلّحه لما
     يرجع chat:sent. الحضور بيتحدّث من friend:presence-update زي القائمة.
══════════════════════════════════════════════════════════════════════ */
const amkhChat = {
  _openWith: null,        /* id الصديق اللي محادثته مفتوحة دلوقتي */
  _msgs: {},              /* convo_key → [رسايل] */
  _unread: {},            /* friendId → عدد غير مقروء */
  _sheet: null,           /* overlay المحادثة/الصندوق المفتوح */
  _friendMeta: {},        /* friendId → {name, avatar_url, status, online, last_seen_at} */
  _cid: 0,
  _openGroup: null,       /* id الجروب المفتوح دلوقتي (لو فيه) */
  _gmsgs: {},             /* groupId → [رسايل] */
  _gunread: {},           /* groupId → عدد غير مقروء */
  _gmentions: {},         /* groupId → عدد غير المقروء اللي فيها منشن ليّ (#2) */
  _dmentions: {},         /* friendId → نفس الفكرة للمحادثة الفردية */
  _pins: { dm: {}, grp: {} },   /* محادثات مثبّتة (#4) */
  _gmeta: {},             /* groupId → {name, members_count} */
  _gmembers: {},          /* groupId → { userId → {id,username,display_name,avatar_url} } لصور القراء */
  _greads: {},            /* groupId → { userId → {read, delivered} } (high-water) للإيصالات */
  _reply: null,           /* هدف الرد الحالي {scope:'friend'|'group', id, name, preview, kind} (#130) */

  /* أيقونات مرسومة (Lucide-style، نفس ستايل MODE_ICONS في index.html).
     stroke=currentColor فبتاخد لون النص/الزر تلقائيًا وتشتغل في كل الثيمات. */
  ICONS: {
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    call: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.5 15.5c-1.3 0-2.6-.2-3.8-.6-.4-.1-.8 0-1.1.3l-2 2a15.3 15.3 0 0 1-6.6-6.6l2-2c.3-.3.4-.7.3-1.1-.4-1.2-.6-2.5-.6-3.8 0-.6-.4-1-1-1H4.2c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.2c0-.6-.4-1-1-1z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    attach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    userMinus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="11"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-4.5V6a2 2 0 0 0-2-2H8.5a2 2 0 0 0-2 2v6.5z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    emoji: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    at: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>',
  },

  _key(a, b) { const x = Number(a), y = Number(b); return Math.min(x, y) + ':' + Math.max(x, y); },
  _me() { return window.amkhAuth && window.amkhAuth.user && window.amkhAuth.user.id; },
  _socket() { return window.amkhFriends ? window.amkhFriends._socket() : null; },

  /* نص معاينة قصير حسب نوع الرسالة (للإشعارات وقائمة الصندوق). */
  _previewOf(d) {
    if (!d) return '';
    if (d.kind === 'voice') return 'رسالة صوتية';
    if (d.kind === 'image') return 'صورة';
    if (d.kind === 'video') return 'فيديو';
    return d.body || '';
  },

  async _getAuthHeader() {
    if (!window.amkhAuth || !window.amkhAuth.token) return null;
    if (window.amkhEnsureServer && !await window.amkhEnsureServer()) return null;
    return { 'Authorization': `Bearer ${window.amkhAuth.token}`, 'ngrok-skip-browser-warning': 'true' };
  },
  async _get(path) {
    const headers = await this._getAuthHeader();
    if (!headers) return null;
    try {
      const res = await fetch(`${window.getApiBase()}/chat${path}`, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  },
  async _post(path, body) {
    const headers = await this._getAuthHeader();
    if (!headers) return null;
    try {
      const res = await fetch(`${window.getApiBase()}/chat${path}`, {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => null);
      return res.ok ? (data || { ok: true }) : { error: (data && data.error) || 'خطأ' };
    } catch (e) { return { error: 'اتصال' }; }
  },

  /* ── تخزين محلي للمحادثات (IndexedDB) #133 ──
     بنحتفظ بآخر الرسائل على الجهاز عشان تظهر فورًا أول ما تفتح المحادثة
     وكمان تفضل ظاهرة من غير نت لحد ما التاريخ الحقيقي يوصل. */
  _DB_NAME: 'amkh-chat',
  _DB_VER: 2,
  _CACHE_MAX: 30,
  _idbOpen() {
    if (this._dbP) return this._dbP;
    this._dbP = new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(this._DB_NAME, this._DB_VER);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('dm')) db.createObjectStore('dm', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('grp')) db.createObjectStore('grp', { keyPath: 'key' });
          /* v2 (#8): meta = لقطة صندوق الرسائل، outbox = الطابور الأوفلاين.
             الحراسة بـcontains بتخلّي الترقية ماتمسّش الرسائل المحفوظة. */
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'cid' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return this._dbP;
  },
  /* قراءة/كتابة عامة في أي مخزن — تُستخدم للقطة الصندوق والطابور. */
  async _idbGet(store, key) {
    try {
      const db = await this._idbOpen(); if (!db || !db.objectStoreNames.contains(store)) return null;
      return await new Promise((resolve) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).get(String(key));
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  },
  async _idbAll(store) {
    try {
      const db = await this._idbOpen(); if (!db || !db.objectStoreNames.contains(store)) return [];
      return await new Promise((resolve) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).getAll();
        rq.onsuccess = () => resolve(Array.isArray(rq.result) ? rq.result : []);
        rq.onerror = () => resolve([]);
      });
    } catch (e) { return []; }
  },
  _idbPut(store, obj) {
    try {
      this._idbOpen().then(db => {
        if (!db || !db.objectStoreNames.contains(store)) return;
        try { db.transaction(store, 'readwrite').objectStore(store).put(obj); } catch (e) {}
      });
    } catch (e) {}
  },
  _idbDel(store, key) {
    try {
      this._idbOpen().then(db => {
        if (!db || !db.objectStoreNames.contains(store)) return;
        try { db.transaction(store, 'readwrite').objectStore(store).delete(String(key)); } catch (e) {}
      });
    } catch (e) {}
  },
  async _cacheGet(store, key) {
    try {
      const db = await this._idbOpen(); if (!db) return null;
      return await new Promise((resolve) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).get(String(key));
        rq.onsuccess = () => resolve(rq.result && Array.isArray(rq.result.messages) ? rq.result.messages : null);
        rq.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  },
  async _cachePut(store, key, messages) {
    try {
      const db = await this._idbOpen(); if (!db) return;
      /* آخر N رسالة فقط، وبدون المتفائلة اللي لسه بتتبعت (id == null). */
      const clean = (messages || []).filter(m => m && m.id != null).slice(-this._CACHE_MAX)
        .map(m => Object.assign({}, m, { pending: false }));
      db.transaction(store, 'readwrite').objectStore(store).put({ key: String(key), messages: clean, updated_at: Date.now() });
    } catch (e) {}
  },
  /* يحفظ الحالة الحالية للمحادثة/الحفلة في الكاش المحلي (بدون انتظار). */
  _persist(scope, key) {
    try {
      if (scope === 'grp') this._cachePut('grp', key, this._gmsgs[key] || []);
      else this._cachePut('dm', key, this._msgs[key] || []);
    } catch (e) {}
  },
  /* يمسح كل الكاش المحلي (عند تسجيل الخروج). */
  async _clearCache() {
    try {
      const db = await this._idbOpen(); if (!db) return;
      ['dm', 'grp', 'meta', 'outbox'].forEach(s => {
        if (!db.objectStoreNames.contains(s)) return;
        try { db.transaction(s, 'readwrite').objectStore(s).clear(); } catch (e) {}
      });
      this._out = [];
      this._outLoaded = false;
    } catch (e) {}
  },

  /* ══ لقطة صندوق الرسائل (#8) ══
     الصندوق كان بيستنى نداءين من الشبكة قبل ما يعرض أي حاجة، وبـPromise.all
     يعني ينتظر الأبطأ منهما: على شبكة الموبايل ده ثانية أو أكتر من «جارِ
     التحميل…»، ومن غير نت كان بيقول «لا توجد رسائل بعد» وهي موجودة. بنخزّن
     آخر لقطة محليًا ونرسمها فورًا، وكل نصف من الشبكة يرسم بمفرده أول ما يوصل. */
  _inboxSnapKey: 'inbox',
  async _inboxSnapGet() {
    const row = await this._idbGet('meta', this._inboxSnapKey);
    if (!row) return null;
    /* الحضور (متصل/آخر ظهور) ما يتخزّنش: لقطة قديمة ماتقولش «متصل الآن» غلط. */
    const dm = (Array.isArray(row.dm) ? row.dm : []).map(r => {
      const f = Object.assign({}, r.friend || {}, { online: false, status: null });
      return Object.assign({}, r, { friend: f });
    });
    return { dm, grp: Array.isArray(row.grp) ? row.grp : [] };
  },
  _inboxSnapPut(dm, grp) {
    const strip = (r) => {
      const f = Object.assign({}, r.friend || {});
      delete f.online; delete f.status; delete f.last_seen_at;
      return Object.assign({}, r, { friend: f });
    };
    this._idbPut('meta', {
      key: this._inboxSnapKey,
      dm: (Array.isArray(dm) ? dm : []).slice(0, 60).map(strip),
      grp: (Array.isArray(grp) ? grp : []).slice(0, 60),
      updated_at: Date.now(),
    });
  },

  /* ══ الطابور الأوفلاين (#8) ══
     قبل كده: لو السوكت مقطوع، الرسالة بتتلغي بإشعار «لا يوجد اتصال» والنص
     يضيع. دلوقتي بتتحوّل لرسالة معلّقة (بساعة زي واتساب) وتُخزَّن في
     IndexedDB، فتفضل ظاهرة حتى لو التطبيق اتقفل، وتتبعت لوحدها أول ما
     السوكت يفتح. الصوت/الصورة كمان — بحدّ للحجم عشان مانفجّرش التخزين. */
  _out: [],
  _OUT_MAX: 40,
  _OUT_MAX_B64: 3 * 1024 * 1024,
  async _restoreOutbox() {
    if (this._outLoaded) return this._out;
    this._outLoaded = true;
    const rows = await this._idbAll('outbox');
    const me = this._me();
    this._out = rows.filter(r => r && r.cid && (!r.me || !me || r.me === me)).sort((a, b) => (a.at || 0) - (b.at || 0));
    /* رجّع الفقاعات المعلّقة لمكانها في الذاكرة عشان تظهر أول ما تفتح المحادثة */
    this._out.forEach(it => {
      try {
        const msg = this._outToMsg(it);
        if (!msg) return;
        if (it.scope === 'grp') {
          const arr = (this._gmsgs[it.target] = this._gmsgs[it.target] || []);
          if (!arr.some(m => m.client_id === it.cid)) arr.push(msg);
        } else {
          const arr = (this._msgs[it.target] = this._msgs[it.target] || []);
          if (!arr.some(m => m.client_id === it.cid)) arr.push(msg);
        }
      } catch (e) {}
    });
    return this._out;
  },
  /* عنصر الطابور → رسالة عرض (نفس شكل الرسالة المتفائلة) */
  _outToMsg(it) {
    const me = this._me();
    if (!me) return null;
    const base = {
      id: null, client_id: it.cid, from: me, mine: true, kind: it.kind || 'text',
      body: it.body || '', audio: it.audio || null, duration: it.duration || 0, mime: it.mime || '',
      created_at: it.created_at || new Date(it.at || Date.now()).toISOString(),
      pending: true, queued: true, reply_to: it.reply_to || null, reply: it.reply || null,
    };
    if (it.scope === 'grp') return Object.assign(base, { sender_name: 'أنت', sender_avatar: null, mentions: it.mentions || [] });
    return Object.assign(base, { to: it.peer_id, read: false, delivered: false });
  },
  /* يضيف للطابور ويرجّع true لو اتحفظ */
  _queueOut(it) {
    if (this._out.length >= this._OUT_MAX) return false;
    const b64 = it.audio ? String(it.audio).length : 0;
    if (b64 > this._OUT_MAX_B64) return false;
    it.at = Date.now();
    it.me = this._me();
    this._out.push(it);
    this._idbPut('outbox', it);
    return true;
  },
  _dequeueOut(cid) {
    this._out = this._out.filter(x => x.cid !== cid);
    this._idbDel('outbox', cid);
  },
  /* يبعت كل المؤجَّل — بينادى أول ما سوكت الحضور يفتح */
  async _flushOutbox() {
    if (this._flushing) return;
    const ws = this._socket();
    if (!ws) return;
    this._flushing = true;
    try {
      await this._restoreOutbox();
      const items = this._out.slice();
      for (const it of items) {
        if (this._socket() !== ws || ws.readyState !== 1) break;
        try {
          if (it.scope === 'grp') {
            ws.send(JSON.stringify(Object.assign({ type: 'group:send', group_id: it.target, client_id: it.cid, reply_to: it.reply_to || null },
              it.kind && it.kind !== 'text' ? { kind: it.kind, audio: it.audio, duration: it.duration, mime: it.mime } : { body: it.body, mentions: it.mentions || [] })));
          } else {
            ws.send(JSON.stringify(Object.assign({ type: 'chat:send', to: it.peer_id, client_id: it.cid, reply_to: it.reply_to || null },
              it.kind && it.kind !== 'text' ? { kind: it.kind, audio: it.audio, duration: it.duration, mime: it.mime } : { body: it.body })));
          }
          this._dequeueOut(it.cid);
        } catch (e) { break; }
      }
      if (items.length && !this._out.length) {
        try { window.amkhUI.notify('أُرسلت الرسائل المؤجَّلة', 'عاد الاتصال', '◉'); } catch (e) {}
      }
    } finally { this._flushing = false; }
  },
  /* إشعار موحّد لما نأجّل رسالة (مرة كل ٦ ثوان مهما كتب) */
  _queuedNote() {
    const now = Date.now();
    if (this._qNoteAt && now - this._qNoteAt < 6000) return;
    this._qNoteAt = now;
    try { window.amkhUI.notify('لا يوجد اتصال — ستُرسل تلقائيًا أول ما يعود', 'مؤجَّلة', '◈'); } catch (e) {}
  },

  /* وقت قصير للفقاعة */
  _time(iso) {
    const t = iso ? Date.parse(iso) : Date.now();
    const d = isNaN(t) ? new Date() : new Date(t);
    let h = d.getHours(), m = d.getMinutes();
    const am = h < 12;
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m < 10 ? '0' + m : m} ${am ? 'ص' : 'م'}`;
  },

  /* ── سجل المكالمات في الشات (#153) ──
     بينادى من call-client عند نهاية أي مكالمة. رسالة محلية بمعرّف مصطنع
     (عشان تتحفظ في IndexedDB — _cachePut بيرمي id==null). */
  /* ترتيب زمني موحّد (يتعامل مع ISO أو رقم أو datetime) */
  _ts(m) { const t = m && m.created_at; if (t == null) return 0; const n = typeof t === 'number' ? t : Date.parse(t); return isNaN(n) ? 0 : n; },
  /* دمج رسائل السيرفر مع رسائل محلية (معلّقة/سجل مكالمة) غير موجودة على السيرفر،
     مع إزالة المكرر بالمعرّف وترتيب الكل زمنيًا (#156). */
  _mergeChrono(serverMsgs, extra) {
    serverMsgs = Array.isArray(serverMsgs) ? serverMsgs : [];
    if (!extra || !extra.length) return serverMsgs.slice();
    const ids = new Set();
    serverMsgs.forEach(m => { if (m.id != null) ids.add(String(m.id)); if (m.client_id != null) ids.add(String(m.client_id)); });
    const uniq = extra.filter(m => !ids.has(String(m.id)) && !(m.client_id != null && ids.has(String(m.client_id))));
    if (!uniq.length) return serverMsgs.slice();
    const all = serverMsgs.concat(uniq);
    all.sort((a, b) => this._ts(a) - this._ts(b));
    return all;
  },

  logCall(opts) {
    try {
      opts = opts || {};
      const me = this._me();
      if (!me) return;
      const cid = 'call_' + (++this._cid) + '_' + Date.now();
      const base = {
        id: cid, client_id: cid, kind: 'call', local: true,
        call_status: opts.status || 'ended', duration: Math.max(0, opts.duration || 0),
        call_video: !!opts.video,
        mine: !!opts.mine, body: '', created_at: new Date().toISOString(),
        read: true, delivered: true, pending: false,
      };
      if (opts.scope === 'group') {
        const gid = Number(opts.groupId); if (!gid) return;
        const msg = Object.assign({}, base, { from: opts.mine ? me : 0, sender_name: opts.mine ? 'أنت' : (opts.title || '') });
        (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
        this._persist('grp', gid);
        if (this._openGroup === gid) this._appendGroupBubble(msg);
      } else {
        const peerId = Number(opts.peerId); if (!peerId) return;
        const key = this._key(me, peerId);
        const msg = Object.assign({}, base, { from: opts.mine ? me : peerId, to: opts.mine ? peerId : me });
        (this._msgs[key] = this._msgs[key] || []).push(msg);
        this._persist('dm', key);
        if (this._openWith === peerId) this._appendBubble(msg, true);
      }
    } catch (e) {}
  },
  /* نص وأيقونة سجل المكالمة */
  _fmtDur2(sec) { sec = Math.max(0, Math.round(sec || 0)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); },
  _callText(m) {
    const st = m.call_status, dur = m.duration ? this._fmtDur2(m.duration) : '';
    const v = !!m.call_video;
    const noun = v ? 'مكالمة فيديو' : 'مكالمة صوتية';
    if (st === 'ended') return (m.mine ? noun + ' صادرة' : noun + ' واردة') + (dur ? ' • ' + dur : '');
    if (st === 'missed') return m.mine ? (noun + ' صادرة بدون رد') : (v ? 'مكالمة فيديو فائتة' : 'مكالمة فائتة');
    if (st === 'declined') return m.mine ? 'تم رفض المكالمة' : 'رفضت المكالمة';
    return v ? 'تعذّرت مكالمة الفيديو' : 'تعذّرت المكالمة';
  },
  _callRow(m) {
    const row = document.createElement('div');
    row.className = 'ch-callmsg' + ((m.call_status === 'missed' || m.call_status === 'declined') ? ' ch-callmsg--missed' : '');
    const ic = document.createElement('span');
    ic.className = 'ch-callmsg__ic'; ic.setAttribute('aria-hidden', 'true');
    ic.innerHTML = m.call_video ? (this.ICONS.video || this.ICONS.call) : this.ICONS.call;
    const txt = document.createElement('span');
    txt.className = 'ch-callmsg__txt'; txt.textContent = this._callText(m);
    row.appendChild(ic); row.appendChild(txt);
    return row;
  },

  /* ── PLACEHOLDER_APPEND ── */

  /* إرسال رسالة: عرض متفائل بمعرّف مؤقت، وبعدين chat:sent بيصلّح المعرّف.
     ولو مفيش سوكت، الرسالة تتأجّل في الطابور بدل ما تضيع (#8). */
  sendMessage(friendId, body) {
    body = String(body || '').trim();
    if (!body) return;
    const clientId = 'c' + (++this._cid) + '_' + Date.now();
    const key = this._key(this._me(), friendId);
    const r = this._takeReply('friend');
    const msg = { id: null, client_id: clientId, from: this._me(), to: friendId, mine: true, kind: 'text', body, created_at: new Date().toISOString(), read: false, delivered: false, pending: true, reply_to: r ? r.id : null, reply: r ? { id: r.id, name: r.name, kind: r.kind, preview: r.preview } : null };
    (this._msgs[key] = this._msgs[key] || []).push(msg);
    if (this._openWith === friendId) this._appendBubble(msg, true);
    this._sendOrQueue(
      { type: 'chat:send', to: friendId, body, client_id: clientId, reply_to: r ? r.id : null },
      { cid: clientId, scope: 'dm', target: key, peer_id: friendId, kind: 'text', body, reply_to: r ? r.id : null, reply: msg.reply, created_at: msg.created_at },
      msg, 'dm', key
    );
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  /* يبعت لو فيه سوكت، وإلا يأجّل. عند تعذّر التأجيل نشيل الفقاعة المتفائلة
     عشان مانوهمهوش إن الرسالة محفوظة. */
  _sendOrQueue(frame, item, msg, scope, target) {
    const ws = this._socket();
    if (ws) {
      try {
        ws.send(JSON.stringify(frame));
        /* نمسك نسخة من العنصر لحد ما السيرفر يأكّد: لو ردّ بإن السوكت
           مجهول (auth) نقدر نعيدها للمؤجَّل بدل ما تتفشّل على المستخدم. */
        this._pendSent = this._pendSent || {};
        const keys = Object.keys(this._pendSent);
        if (keys.length > 60) delete this._pendSent[keys[0]];
        this._pendSent[item.cid] = item;
        return 'sent';
      } catch (e) {}
    }
    if (this._queueOut(item)) {
      if (msg) msg.queued = true;
      this._queuedNote();
      return 'queued';
    }
    this._dropOptimistic(scope, target, item.cid);
    try {
      window.amkhUI.notify(
        item.audio ? 'المرفق كبير على التأجيل — أعد المحاولة بعد عودة الاتصال' : 'الرسائل المؤجَّلة ممتلئة — انتظر عودة الاتصال',
        'لم تُؤجَّل', '◈');
    } catch (e) {}
    return 'dropped';
  },
  _dropOptimistic(scope, target, cid) {
    try {
      if (scope === 'grp') this._gmsgs[target] = (this._gmsgs[target] || []).filter(m => m.client_id !== cid);
      else this._msgs[target] = (this._msgs[target] || []).filter(m => m.client_id !== cid);
      const el = this._sheet && this._sheet.querySelector(`[data-cid="${cid}"]`);
      if (el) el.remove();
    } catch (e) {}
  },

  /* إظهار زر الإرسال لو فيه نص، والميكروفون لو الحقل فاضي (زي واتساب). */
  _toggleSendMic(overlay) {
    const root = overlay || this._sheet;
    if (!root) return;
    const ta = root.querySelector('#ch-text');
    const sendBtn = root.querySelector('#ch-send');
    const micBtn = root.querySelector('#ch-mic');
    const hasText = ta && ta.value.trim().length > 0;
    if (sendBtn) sendBtn.hidden = !hasText;
    if (micBtn) micBtn.hidden = hasText;
  },

  /* ── تسجيل صوتي ──
     target = { kind:'friend'|'group', id }. نفس المسجّل بيخدم الاتنين. */
  async _startVoiceRec(target) {
    if (typeof target === 'number') target = { kind: 'friend', id: target };
    if (this._recording || this._recStarting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.amkhUI.notify('جهازك لا يدعم التسجيل الصوتي', 'غير متاح', '◈'); return;
    }
    this._recStarting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      this._recStream = stream;
      const prefer = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
      const ok = (m) => { try { return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m); } catch (e) { return false; } };
      const chosen = prefer.find(ok) || '';
      this._recorder = new MediaRecorder(stream, chosen ? { mimeType: chosen } : {});
      this._recChunks = [];
      this._recMime = this._recorder.mimeType || chosen || 'audio/webm';
      this._recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this._recChunks.push(e.data); };
      this._recorder.start(100);
      this._recording = true;
      this._recStartAt = Date.now();
      this._recCtx = target;
      this._sendRecordingState(target, true);
      this._showRecBar(true);
      this._recTimer = setInterval(() => {
        const s = Math.floor((Date.now() - this._recStartAt) / 1000);
        const el = this._sheet && this._sheet.querySelector('#ch-rec-time');
        if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      }, 250);
    } catch (e) {
      window.amkhUI.notify('لازم تسمح بالوصول للميكروفون', 'الميكروفون', '◈');
    } finally { this._recStarting = false; }
  },

  _stopVoiceRec(doSend) {
    if (!this._recording || this._stoppingRec) return;
    this._stoppingRec = true;
    if (this._recTimer) { clearInterval(this._recTimer); this._recTimer = null; }
    const durationSec = Math.round((Date.now() - this._recStartAt) / 1000);
    const mime = this._recMime;
    const ctx = this._recCtx || { kind: 'friend', id: this._openWith };
    this._recorder.onstop = () => {
      try { this._recStream && this._recStream.getTracks().forEach(t => t.stop()); } catch (e) {}
      this._recStream = null;
      this._recording = false;
      this._stoppingRec = false;
      this._sendRecordingState(ctx, false);
      this._showRecBar(false);
      if (!doSend) { this._recChunks = []; return; }
      if (durationSec < 1) { window.amkhUI.notify('التسجيل قصير جداً', 'تنبيه', '◈'); this._recChunks = []; return; }
      const blob = new Blob(this._recChunks, { type: mime });
      this._recChunks = [];
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = this._arrayBufferToBase64(reader.result);
        if (ctx.kind === 'group') this.sendGroupVoice(ctx.id, b64, durationSec, mime);
        else this.sendVoice(ctx.id, b64, durationSec, mime);
      };
      reader.readAsArrayBuffer(blob);
    };
    try { this._recorder.requestData && this._recorder.requestData(); } catch (e) {}
    try { this._recorder.stop(); } catch (e) { this._stoppingRec = false; this._showRecBar(false); }
  },

  _showRecBar(show) {
    if (!this._sheet) return;
    const rec = this._sheet.querySelector('#ch-rec');
    const ta = this._sheet.querySelector('#ch-text');
    const mic = this._sheet.querySelector('#ch-mic');
    const send = this._sheet.querySelector('#ch-send');
    const attach = this._sheet.querySelector('#ch-attach');
    if (rec) rec.hidden = !show;
    if (ta) ta.style.visibility = show ? 'hidden' : '';
    if (mic) mic.style.visibility = show ? 'hidden' : '';
    if (attach) attach.style.visibility = show ? 'hidden' : '';
    if (send && show) send.hidden = true;
    if (!show) { const t = this._sheet.querySelector('#ch-rec-time'); if (t) t.textContent = '0:00'; this._toggleSendMic(); }
  },

  sendVoice(friendId, audioB64, durationSec, mime) {
    const clientId = 'v' + (++this._cid) + '_' + Date.now();
    const key = this._key(this._me(), friendId);
    const r = this._takeReply('friend');
    const msg = { id: null, client_id: clientId, from: this._me(), to: friendId, mine: true, kind: 'voice', body: '', audio: audioB64, duration: durationSec, mime, created_at: new Date().toISOString(), read: false, pending: true, reply_to: r ? r.id : null, reply: r ? { id: r.id, name: r.name, kind: r.kind, preview: r.preview } : null };
    (this._msgs[key] = this._msgs[key] || []).push(msg);
    if (this._openWith === friendId) this._appendBubble(msg, true);
    this._sendOrQueue(
      { type: 'chat:send', kind: 'voice', to: friendId, audio: audioB64, duration: durationSec, mime, client_id: clientId, reply_to: r ? r.id : null },
      { cid: clientId, scope: 'dm', target: key, peer_id: friendId, kind: 'voice', audio: audioB64, duration: durationSec, mime, reply_to: r ? r.id : null, reply: msg.reply, created_at: msg.created_at },
      msg, 'dm', key
    );
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  /* ── وسائط (صور/فيديو) ──
     الصور بنصغّرها ونضغطها في canvas عشان ماتعدّيش الحد؛ الفيديو بيتبعت زي
     ما هو لو حجمه مناسب. الحد ~6MB بعد التحويل base64 (نفس حد السيرفر). */
  _MEDIA_MAX_B64: 8_000_000,

  async _pickMedia(file, ctx) {
    const U = window.amkhUI;
    try {
      const isImage = /^image\//i.test(file.type);
      const isVideo = /^video\//i.test(file.type);
      if (!isImage && !isVideo) { U.notify('نوع ملف غير مدعوم', 'تنبيه', '◈'); return; }
      let b64, mime, kind;
      if (isImage) {
        const r = await this._compressImage(file);
        b64 = r.b64; mime = r.mime; kind = 'image';
      } else {
        b64 = await this._fileToBase64(file); mime = file.type || 'video/mp4'; kind = 'video';
      }
      if (!b64) { U.notify('تعذّر تجهيز الملف', 'تنبيه', '◈'); return; }
      if (b64.length > this._MEDIA_MAX_B64) {
        U.notify(isVideo ? 'الفيديو كبير جداً — اختر مقطع أصغر' : 'الصورة كبيرة جداً', 'تنبيه', '◈');
        return;
      }
      if (ctx.kind === 'group') this.sendGroupMedia(ctx.id, b64, mime, kind);
      else this.sendMedia(ctx.id, b64, mime, kind);
    } catch (e) { U.notify('تعذّر إرسال الملف', 'تنبيه', '◈'); }
  },

  _fileToBase64(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => { try { resolve(String(reader.result).split(',')[1] || ''); } catch (e) { resolve(''); } };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  },

  /* تصغير الصورة لأقصى بعد 1280px وضغطها JPEG لتقليل الحجم قبل الإرسال. */
  _compressImage(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 1280;
          let { width: w, height: h } = img;
          if (w > MAX || h > MAX) { const s = Math.min(MAX / w, MAX / h); w = Math.round(w * s); h = Math.round(h * s); }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          URL.revokeObjectURL(url);
          resolve({ b64: dataUrl.split(',')[1] || '', mime: 'image/jpeg' });
        } catch (e) { URL.revokeObjectURL(url); resolve({ b64: '', mime: '' }); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ b64: '', mime: '' }); };
      img.src = url;
    });
  },

  _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(file);
    });
  },

  /* تصغير صورة الحفلة لمربّع صغير (JPEG) — نخزّنها كـ data URL في avatar_url. */
  _downscaleImage(src, size) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const SZ = size || 128;
      let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
      setTimeout(() => fin(null), 4000);
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement('canvas'); cv.width = SZ; cv.height = SZ;
          const ctx = cv.getContext('2d');
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SZ, SZ);
          fin(cv.toDataURL('image/jpeg', 0.6));
        } catch (e) { fin(null); }
      };
      img.onerror = () => fin(null);
      img.src = src;
    });
  },

  sendMedia(friendId, b64, mime, kind) {
    const clientId = 'm' + (++this._cid) + '_' + Date.now();
    const key = this._key(this._me(), friendId);
    const r = this._takeReply('friend');
    const msg = { id: null, client_id: clientId, from: this._me(), to: friendId, mine: true, kind, body: '', audio: b64, mime, created_at: new Date().toISOString(), read: false, pending: true, reply_to: r ? r.id : null, reply: r ? { id: r.id, name: r.name, kind: r.kind, preview: r.preview } : null };
    (this._msgs[key] = this._msgs[key] || []).push(msg);
    if (this._openWith === friendId) this._appendBubble(msg, true);
    this._sendOrQueue(
      { type: 'chat:send', kind, to: friendId, audio: b64, mime, client_id: clientId, reply_to: r ? r.id : null },
      { cid: clientId, scope: 'dm', target: key, peer_id: friendId, kind, audio: b64, mime, reply_to: r ? r.id : null, reply: msg.reply, created_at: msg.created_at },
      msg, 'dm', key
    );
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  },
  _base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  },

  _typing(friendId) {
    const ws = this._socket();
    if (!ws) return;
    const now = Date.now();
    if (this._lastTyping && now - this._lastTyping < 2500) return;
    this._lastTyping = now;
    try { ws.send(JSON.stringify({ type: 'chat:typing', to: friendId })); } catch (e) {}
  },

  /* إشعار الطرف التاني إني بسجّل رسالة صوتية دلوقتي (زي «بيكتب…» بس
     للتسجيل). بيشتغل للفردي والجروب حسب ctx. */
  _sendRecordingState(ctx, on) {
    const ws = this._socket();
    if (!ws || !ctx) return;
    try {
      if (ctx.kind === 'group') ws.send(JSON.stringify({ type: 'group:recording', group_id: ctx.id, on: !!on }));
      else ws.send(JSON.stringify({ type: 'chat:recording', to: ctx.id, on: !!on }));
    } catch (e) {}
  },

  /* ── السوكت مجهول عند السيرفر (reason: auth) ──
     مش خطأ في الرسالة ولا في الصلاحيات: السوكت اتفتح من غير تعريف، أو
     الجهاز صحي من النوم فالسوكت القديم مات. الرسالة مايصحّش تتفشّل —
     بنعرّف السوكت من جديد ونرجّعها للمؤجَّل، فتتبعت لوحدها بعد ثواني.
     ده اللي بيغني عن «تسجيل خروج ودخول» اللي كان الحل الوحيد قبل كده. */
  _onAuthError(d, isGroup) {
    const cid = d && d.client_id;
    if (cid) {
      const stores = isGroup ? this._gmsgs : this._msgs;
      for (const k of Object.keys(stores || {})) {
        const m = (stores[k] || []).find(x => x.client_id === cid);
        if (m) { m.pending = true; m.failed = false; m.queued = true; break; }
      }
      const it = this._pendSent && this._pendSent[cid];
      if (it) { delete this._pendSent[cid]; this._queueOut(it); }
    }
    try { if (window.amkhAuth && window.amkhAuth.revive) window.amkhAuth.revive('chat-auth'); } catch (e) {}
    clearTimeout(this._authRetryT);
    this._authRetryT = setTimeout(() => { try { this._flushOutbox(); } catch (e) {} }, 2500);
    return true;
  },

  handleSocketMessage(d) {
    if (!d || typeof d.type !== 'string') return false;
    switch (d.type) {
      case 'chat:message': return this._onMessage(d);
      case 'chat:sent': return this._onSent(d);
      case 'chat:delivered': return this._onDelivered(d);
      case 'chat:read-receipt': return this._onReadReceipt(d);
      case 'chat:pinned': return this._onPinned(d);
      case 'chat:reaction': return this._onReaction(d, false);
      case 'chat:typing': return this._onTyping(d);
      case 'chat:recording': return this._onRecording(d);
      case 'chat:unread': return this._onUnreadSnapshot(d);
      case 'chat:error':
        if (d.reason === 'auth') return this._onAuthError(d, false);
        this._onSendError(d, false);
        window.amkhUI.notify(
          d.reason === 'not-friend' ? 'يجب أن يكون صديقًا لك أولًا'
          : d.reason === 'privacy' ? 'إعدادات الخصوصية لديه لا تسمح بمراسلته'
          : d.reason === 'too-big' ? 'التسجيل الصوتي كبير جدًا'
          : 'تعذّر إرسال الرسالة', 'لم يتم', '◈');
        return true;
      case 'group:message': return this._onGroupMessage(d);
      case 'group:sent': return this._onGroupSent(d);
      case 'group:receipts': return this._onGroupReceipts(d);
      case 'group:pinned': return this._onGroupPinned(d);
      case 'group:reaction': return this._onReaction(d, true);
      case 'group:typing': return this._onGroupTyping(d);
      case 'group:recording': return this._onGroupRecording(d);
      case 'group:created': return this._onGroupCreated(d);
      case 'group:updated': return this._onGroupUpdated(d);
      case 'group:error':
        if (d.reason === 'auth') return this._onAuthError(d, true);
        this._onSendError(d, true);
        if (d.reason === 'closed') {
          const gid = d.group_id;
          if (gid != null && this._gmeta[gid]) this._gmeta[gid].send_policy = 'admins';
          if (gid != null) this._applyChatLock(gid);
          window.amkhUI.notify('قفل المشرفون الشات — الإرسال متاح للمشرفين فقط', 'الشات مقفول', '◈');
        } else {
          window.amkhUI.notify(d.reason === 'not-member' ? 'لست عضوًا في الحفلة' : (d.reason === 'too-big' ? 'التسجيلة كبيرة جداً' : 'تعذّر إرسال الرسالة'), 'لم يتم', '◈');
        }
        return true;
      default: return false;
    }
  },

  /* الاسم الظاهر للأصدقاء في الأونلاين (#145) — بنفس قاعدة السيرفر:
     مسجّل بجوجل → اسم جوجل (display_name)؛ مسجّل يدوي → الاسم المستعار (username). */
  _displayName(u) {
    if (!u) return 'صديق';
    if (u.provider === 'google') return u.display_name || u.username || 'صديق';
    return u.username || u.display_name || 'صديق';
  },

  _onMessage(d) {
    const me = this._me();
    const friendId = d.from === me ? d.to : d.from;
    const key = d.convo_key || this._key(me, friendId);
    const mine = d.from === me;
    /* لو ده صدى لرسالتي المتفائلة (نفس client_id) نتجاهله — chat:sent بيتكفّل */
    if (mine && d.client_id) {
      const arr = this._msgs[key] || [];
      if (arr.some(m => m.client_id === d.client_id)) return true;
    }
    /* حماية من الازدواج: لو نفس الرسالة وصلت مرتين (سوكتين مفتوحين أو
       إعادة اتصال) نتجاهل النسخة التانية بمعرّف السيرفر. */
    if (d.id && (this._msgs[key] || []).some(m => m.id === d.id)) return true;
    const msg = { id: d.id, client_id: d.client_id || null, from: d.from, to: d.to, mine, kind: d.kind || 'text', body: d.body, audio: d.audio || null, duration: d.duration || 0, mime: d.mime || '', created_at: d.created_at, read: false, delivered: !!d.delivered, reply_to: d.reply_to || null, reply: d.reply || null, mentions: Array.isArray(d.mentions) ? d.mentions : [] };
    (this._msgs[key] = this._msgs[key] || []).push(msg);
    this._persist('dm', key);

    if (this._openWith === friendId) {
      this._appendBubble(msg, false);
      this._clearTypingRow();
      if (!mine) this._markRead(friendId);           /* المحادثة مفتوحة = مقروء فورًا */
    } else if (!mine) {
      this._unread[friendId] = (this._unread[friendId] || 0) + 1;
      if (msg.mentions.some(x => Number(x) === Number(me))) {
        this._dmentions[friendId] = (this._dmentions[friendId] || 0) + 1;
      }
      this._updateBadge();
      /* الاسم من السيرفر (الاسم المستعار للأصدقاء / اسم جوجل) — مش fallback "صديق" (#145).
         نحدّث الكاش كمان عشان باقي الواجهة تفضل متسقة. */
      let name = d.sender_name || (this._friendMeta[friendId] && this._friendMeta[friendId].name) || 'صديق';
      if (d.sender_name) {
        this._friendMeta[friendId] = this._friendMeta[friendId] || {};
        this._friendMeta[friendId].name = d.sender_name;
        if (d.sender_avatar && !this._friendMeta[friendId].avatar_url) this._friendMeta[friendId].avatar_url = d.sender_avatar;
      }
      try { if (window.SFX) window.SFX.chat(); } catch (e) {}
      this._incomingAlert({
        kind: 'dm', id: friendId, name,
        avatar: (this._friendMeta[friendId] && this._friendMeta[friendId].avatar_url) || null,
        preview: this._previewOf(d),
      });
    }
    /* #5 — لو الوارد مفتوح: الصفّ يقفز لأعلى بمعاينته الجديدة فورًا */
    this._bumpInboxRow('dm', friendId, (mine ? 'أنت: ' : '') + this._previewOf(d), d.created_at);
    return true;
  },

  /* ══════════════════════════════════════════════════════════════════
     تنبيه رسالة أثناء المباراة (#9 + #10)
     ──────────────────────────────────────────────────────────────────
     كانت الرسالة الواردة بتفتح نافذة Modal في نُصّ الشاشة وأنت وسط
     مباراة: تغطّي الرقعة، تحتاج ضغطة «موافق»، ومافيهاش أي طريقة للرد.
     الآن جوّه شاشة اللعب بس: شريط صغير فوق، عليه «رد» بيفتح ورقة ردٍّ
     سريع من غير ما تسيب المباراة، وله مؤقّت اختفاء. وقابل للإيقاف من
     الإعدادات (Cfg.data.matchMsg) — والعدّاد على أيقونة الحساب يفضل
     شغّال في كل الأحوال فمافيش رسالة بتضيع.
  ══════════════════════════════════════════════════════════════════ */
  _inMatch() {
    try { return document.body.dataset.screen === 's-game'; } catch (e) { return false; }
  },
  _matchMsgOn() {
    try { return !(window.Cfg && window.Cfg.data && window.Cfg.data.matchMsg === false); }
    catch (e) { return true; }
  },

  /* التنبيه الموحَّد للرسالة الواردة: نافذة عادية خارج المباراة، وشريط
     صغير جوّاها (أو صمت لو المستخدم أوقفه). */
  _incomingAlert(o) {
    if (!this._inMatch()) {
      try { window.amkhUI.notify(o.preview, o.name, '◉'); } catch (e) {}
      return;
    }
    if (!this._matchMsgOn()) return;      /* العدّاد وحده كفاية */
    this._gameToast(o);
  },

  _gameToast(o) {
    const U = window.amkhUI;
    const same = this._toastKey === (o.kind + ':' + o.id);
    this._toastKey = o.kind + ':' + o.id;
    this._toastCount = same ? (this._toastCount || 1) + 1 : 1;

    let el = document.getElementById('ch-gtoast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ch-gtoast';
      el.className = 'ch-gtoast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    const initial = String(o.name || '؟').trim().charAt(0) || '؟';
    const av = o.avatar
      ? `<img class="ch-gtoast__av" src="${U.esc(o.avatar)}" alt="">`
      : `<span class="ch-gtoast__av ch-gtoast__av--txt">${U.esc(initial)}</span>`;
    const more = this._toastCount > 1 ? `<span class="ch-gtoast__more">${this._toastCount}</span>` : '';
    el.innerHTML = `
      ${av}
      <span class="ch-gtoast__txt">
        <span class="ch-gtoast__name">${U.esc(o.name || 'صديق')}${more}</span>
        <span class="ch-gtoast__body">${U.esc(o.preview || '')}</span>
      </span>
      <button type="button" class="ch-gtoast__btn" id="ch-gtoast-reply">رد</button>
      <button type="button" class="ch-gtoast__x" id="ch-gtoast-x" aria-label="إخفاء">✕</button>`;

    const hide = () => {
      clearTimeout(this._toastTimer);
      this._toastKey = null; this._toastCount = 0;
      el.classList.remove('is-open');
      setTimeout(() => { if (el.parentNode && !el.classList.contains('is-open')) el.remove(); }, 240);
    };
    el.querySelector('#ch-gtoast-x').onclick = () => { U.sfx(); hide(); };
    el.querySelector('#ch-gtoast-reply').onclick = () => {
      U.sfx(); const k = o.kind, id = o.id, nm = o.name; hide();
      this._quickReply(k, id, nm);
    };
    requestAnimationFrame(() => el.classList.add('is-open'));
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(hide, 7000);
  },

  /* ── ورقة ردٍّ سريع: بتبعت وتتقفل، والمباراة زي ما هي (#10) ── */
  _quickReply(kind, id, name) {
    const U = window.amkhUI;
    const ov = U.mount('amkh-quick-reply', `
      <div class="ds-sheet ch-qr">
        <div class="ch-qr__head">
          <span class="ch-qr__to">رد سريع إلى ${U.esc(name || 'صديق')}</span>
          <button type="button" class="ch-qr__close" data-close aria-label="إغلاق">✕</button>
        </div>
        <textarea class="ds-input ch-qr__ta" id="ch-qr-text" rows="3"
                  placeholder="اكتب ردّك…" maxlength="1000"></textarea>
        <div class="ch-qr__acts">
          <button type="button" class="ds-btn ds-btn--secondary" id="ch-qr-open">فتح المحادثة</button>
          <button type="button" class="ds-btn ds-btn--primary" id="ch-qr-send">إرسال</button>
        </div>
      </div>`, { sheet: true, sfx: 'sheet' });

    const ta = ov.querySelector('#ch-qr-text');
    const send = () => {
      const txt = String(ta.value || '').trim();
      if (!txt) { ta.focus(); return; }
      if (kind === 'grp') this.sendGroupMessage(Number(id), txt);
      else this.sendMessage(Number(id), txt);
      ov._dismiss();
    };
    ov.querySelector('#ch-qr-send').onclick = () => { U.sfx(); send(); };
    ov.querySelector('#ch-qr-open').onclick = () => {
      U.sfx(); ov._dismiss();
      if (kind === 'grp') {
        const g = this._gmeta[id] || {};
        this.openGroup({ id: Number(id), name: g.name || name, members_count: g.members_count, owner_id: g.owner_id, avatar_url: g.avatar_url || null });
      } else {
        const meta = this._friendMeta[id] || {};
        this.openChat({ id: Number(id), display_name: meta.name || name, avatar_url: meta.avatar_url || null });
      }
    };
    /* Enter يبعت، وShift+Enter سطر جديد — زي حقل الدردشة الأساسي */
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    setTimeout(() => { try { ta.focus(); } catch (e) {} }, 220);
    return ov;
  },

  _onSent(d) {
    /* نصلّح الرسالة المتفائلة: نحط الـid الحقيقي ونشيل pending */
    const key = this._key(this._me(), d.to);
    const arr = this._msgs[key] || [];
    const m = arr.find(x => x.client_id === d.client_id);
    if (m) { m.id = d.id; m.pending = false; m.queued = false; m.created_at = d.created_at || m.created_at; m.delivered = !!d.delivered; }
    if (d.client_id) this._dequeueOut(d.client_id);   /* وصلت فعلًا → تشيل من الطابور (#8) */
    this._persist('dm', key);
    if (this._openWith === d.to) {
      const el = this._sheet && this._sheet.querySelector(`[data-cid="${d.client_id}"]`);
      if (el) {
        el.classList.remove('is-pending');
        el.dataset.mid = String(d.id);
        const tick = el.querySelector('.ch-tick');
        if (tick) {
          tick.classList.remove('is-pending');
          if (d.delivered) tick.classList.add('is-delivered');
          tick.textContent = d.delivered ? '✓✓' : '✓';
        }
      }
    }
    return true;
  },

  /* ✓✓ للوصول المؤجّل: السيرفر بيبعت ده لما المستقبِل يفتح النت وتتسلّم
     رسايلي اللي كانت متبعتة وهو مقفول. نقلب العلامة لـ✓✓ (لو لسه ماتقرتش). */
  _onDelivered(d) {
    if (!d || !d.convo_key || !Array.isArray(d.ids)) return true;
    const set = new Set(d.ids.map(Number));
    const arr = this._msgs[d.convo_key] || [];
    arr.forEach(m => { if (m.mine && m.id != null && set.has(Number(m.id))) m.delivered = true; });
    const me = this._me();
    if (this._sheet && this._openWith != null && this._key(me, this._openWith) === d.convo_key) {
      set.forEach(id => {
        const el = this._sheet.querySelector(`.ch-bubble--mine[data-mid="${id}"] .ch-tick`);
        if (el && !el.classList.contains('is-read')) { el.textContent = '✓✓'; el.classList.add('is-delivered'); }
      });
    }
    return true;
  },

  /* فشل الإرسال من السيرفر: نشيل حالة الانتظار عن الرسالة المتفائلة ونعلّمها
     فشلت (بدل ما تفضل عليها أيقونة الساعة للأبد). isGroup يحدّد المخزن. */
  _onSendError(d, isGroup) {
    if (!d || !d.client_id) return;
    const cid = d.client_id;
    this._dequeueOut(cid);   /* السيرفر رفضها → مانعيدش المحاولة للأبد (#8) */
    if (this._pendSent) delete this._pendSent[cid];
    const stores = isGroup ? this._gmsgs : this._msgs;
    for (const k of Object.keys(stores || {})) {
      const m = (stores[k] || []).find(x => x.client_id === cid);
      if (m) { m.pending = false; m.queued = false; m.failed = true; break; }
    }
    const el = this._sheet && this._sheet.querySelector(`[data-cid="${cid}"]`);
    if (el) {
      el.classList.remove('is-pending');
      el.classList.add('is-failed');
      const tick = el.querySelector('.ch-tick');
      if (tick) { tick.classList.remove('is-pending'); tick.textContent = '✗'; }
    }
  },

  _onReadReceipt(d) {
    /* الطرف التاني قرا رسايلي: كلها تبقى ✓✓، وصورته «تنزل» على آخر رسالة
       اتقرت (زي ماسنجر). _applyReadAvatar بيتكفّل بالصورة على الـDOM. */
    const me = this._me();
    if (!d.convo_key) return true;
    const arr = this._msgs[d.convo_key] || [];
    arr.forEach(m => { if (m.mine) { m.read = true; m.delivered = true; } });
    if (this._sheet && this._openWith != null && this._key(me, this._openWith) === d.convo_key) {
      this._sheet.querySelectorAll('.ch-bubble--mine .ch-tick').forEach(t => { t.textContent = '✓✓'; t.classList.add('is-read'); });
      this._applyReadAvatar(this._openWith);
    }
    return true;
  },

  /* صورة «تمت المشاهدة» على آخر رسالة قراها الصديق (نمط ماسنجر): بنشيل أي
     صورة قديمة، نرجّع التشيكات المخفية، وبعدين نلاقي آخر رسالة مني اتقرت
     ونحط صورة الصديق مكان التشيك عليها. */
  _applyReadAvatar(friendId) {
    if (!this._sheet || this._openWith !== friendId) return;
    this._sheet.querySelectorAll('.ch-seen-ava').forEach(e => e.remove());
    this._sheet.querySelectorAll('.ch-bubble--mine .ch-tick').forEach(t => { t.style.display = ''; });
    const arr = this._msgs[this._key(this._me(), friendId)] || [];
    let last = null;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].mine && arr[i].read) { last = arr[i]; break; } }
    if (!last) return;
    let bubble = null;
    if (last.id != null) bubble = this._sheet.querySelector(`.ch-bubble--mine[data-mid="${last.id}"]`);
    if (!bubble && last.client_id) bubble = this._sheet.querySelector(`.ch-bubble--mine[data-cid="${last.client_id}"]`);
    if (!bubble) return;
    const meta = bubble.querySelector('.ch-bubble__meta');
    if (!meta) return;
    const tick = meta.querySelector('.ch-tick');
    if (tick) tick.style.display = 'none';
    const fm = this._friendMeta[friendId] || {};
    const initial = String(fm.name || '؟').trim().slice(0, 1).toUpperCase();
    const ava = document.createElement('span');
    ava.className = 'ch-seen-ava';
    ava.title = 'تمت المشاهدة';
    ava.style.cssText = 'width:15px;height:15px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;line-height:1;background:var(--color-primary,#4a90d9);color:#fff;margin-inline-start:5px;vertical-align:middle;flex:0 0 auto;';
    if (fm.avatar_url) {
      const img = document.createElement('img');
      img.alt = ''; img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      img.onerror = () => { img.remove(); ava.textContent = initial; };
      img.src = fm.avatar_url;
      ava.appendChild(img);
    } else ava.textContent = initial;
    meta.appendChild(ava);
  },

  _onTyping(d) {
    if (this._openWith !== d.from || !this._sheet) return true;
    this._showTypingRow();
    clearTimeout(this._typingHide);
    this._typingHide = setTimeout(() => this._clearTypingRow(), 3500);
    return true;
  },

  /* الطرف التاني بيسجّل رسالة صوتية — نبيّن ده في سطر الحالة زي «بيكتب…».
     d.on=true بيبدأ، false بيوقف. فيه مؤقّت أمان لو رسالة الإيقاف ضاعت. */
  _onRecording(d) {
    if (this._openWith !== d.from || !this._sheet) return true;
    const sub = this._sheet.querySelector('.ch-conv__sub');
    if (!sub) return true;
    clearTimeout(this._recHide);
    if (d.on) {
      sub.textContent = 'بيسجّل رسالة صوتية…';
      sub.className = 'ch-conv__sub is-online';
      this._recHide = setTimeout(() => {
        if (this._friendMeta && this._friendMeta[d.from]) this._paintSub(sub, this._friendMeta[d.from]);
      }, 8000);
    } else if (this._friendMeta && this._friendMeta[d.from]) {
      this._paintSub(sub, this._friendMeta[d.from]);
    }
    return true;
  },

  /* لقطة غير المقروء وقت الاتصال. #1: الحفلات كانت ناقصة من اللقطة خالص
     (by_group مش موجود في القديم)، فشارة الحفلات ماكانتش تبان إلا بعد فتح
     صندوق الرسائل. دلوقتي السيرفر بيبعت by_group ومعاه عدد «ذكروك». */
  _onUnreadSnapshot(d) {
    this._unread = {};
    this._dmentions = {};
    (d.by_friend || []).forEach(r => {
      this._unread[r.friend_id] = r.count;
      if (r.mentions) this._dmentions[r.friend_id] = r.mentions;
    });
    if (Array.isArray(d.by_group)) {
      this._gunread = {};
      this._gmentions = {};
      d.by_group.forEach(r => {
        this._gunread[r.group_id] = r.count || 0;
        if (r.mentions) this._gmentions[r.group_id] = r.mentions;
      });
    }
    this._updateBadge();
    return true;
  },

  _markRead(friendId) {
    this._unread[friendId] = 0;
    this._dmentions[friendId] = 0;
    this._updateBadge();
    const ws = this._socket();
    if (ws) { try { ws.send(JSON.stringify({ type: 'chat:read', from: friendId })); } catch (e) {} }
  },

  _unreadTotal() { return Object.values(this._unread).reduce((s, n) => s + (n || 0), 0); },

  /* شارة غير المقروء + طلبات الصداقة على زر الأصدقاء المستقل في الشريط
     العلوي. قبل كده كانت على زر الحساب (وقبله على ترس الإعدادات) — وده
     كان بيخلّي الرقم الأحمر في مكان مالوش علاقة بالرسايل. دلوقتي
     الأصدقاء والشاتات والحفلات ليهم زرّهم، والشارة عليه.
     الاحتياطي (الحساب ثم الترس) لو الزر لسه مش ظاهر. */
  _updateBadge() {
    const btn = document.getElementById('appbar-friends')
             || document.getElementById('amkh-auth-btn')
             || document.getElementById('appbar-settings');
    if (!btn) return;
    /* لو الشارة كانت على زر تاني قبل كده، نشيلها منه */
    ['amkh-auth-btn', 'appbar-settings', 'appbar-friends'].forEach(id => {
      if (id === btn.id) return;
      const other = document.getElementById(id);
      if (!other) return;
      const old = other.querySelector('.amkh-chat-badge');
      if (old) { old.remove(); other.classList.remove('has-badge'); }
    });
    let reqs = 0;
    try { reqs = ((window.amkhFriends && window.amkhFriends._requests && window.amkhFriends._requests.incoming) || []).length; } catch (e) {}
    const total = this._unreadTotal() + this._gunreadTotal() + reqs;
    let dot = btn.querySelector('.amkh-chat-badge');
    if (total > 0) {
      if (!dot) { dot = document.createElement('span'); dot.className = 'amkh-chat-badge'; btn.appendChild(dot); }
      dot.textContent = total > 99 ? '99+' : String(total);
      btn.classList.add('has-badge');
    } else {
      if (dot) dot.remove();
      btn.classList.remove('has-badge');
    }
    /* تحديث سطر الصندوق لو مفتوح */
    if (this._sheet && this._sheet.dataset.view === 'inbox') this._renderInboxBadges();
  },

  /* ── فتح محادثة مع صديق ── */
  async openChat(friend) {
    if (!window.amkhAuth || !window.amkhAuth.token) {
      window.amkhUI.notify('سجّل دخولك أولًا لمراسلة أصدقائك', 'محتاج حساب', '◈');
      if (window.amkhAuth) window.amkhAuth.showLoginModal();
      return;
    }
    const U = window.amkhUI;
    const fid = friend.id;
    this._friendMeta[fid] = {
      name: this._displayName(friend),
      avatar_url: friend.avatar_url || null,
      status: friend.status, online: friend.online, last_seen_at: friend.last_seen_at,
    };
    const name = this._friendMeta[fid].name;

    const overlay = U.mount('amkh-chat-modal', `
      <div class="ds-sheet ch-conv" id="amkh-chat-panel">
        <div class="ch-conv__head">
          <button class="ch-back" data-close aria-label="رجوع">›</button>
          <span class="ch-conv__av" aria-hidden="true"></span>
          <div class="ch-conv__id">
            <span class="ch-conv__name"></span>
            <span class="ch-conv__sub"></span>
          </div>
          <button class="ch-call" id="ch-vcall" aria-label="مكالمة فيديو" title="مكالمة فيديو">${this.ICONS.video || ''}</button>
          <button class="ch-call" id="ch-call" aria-label="مكالمة صوتية" title="مكالمة صوتية">${this.ICONS.call || ''}</button>
        </div>
        <div class="ch-scroll" id="ch-scroll">
          <div class="ch-loadmore" id="ch-loadmore" hidden><button class="ds-btn ds-btn--ghost ds-btn--sm">عرض الأقدم</button></div>
          <div class="ch-msgs" id="ch-msgs"></div>
          <div class="ch-typing" id="ch-typing" hidden><span></span><span></span><span></span></div>
        </div>
        <div class="ch-input" id="ch-input">
          <div class="ch-rec" id="ch-rec" hidden>
            <button class="ch-rec__cancel" id="ch-rec-cancel" aria-label="إلغاء">${this.ICONS.trash}</button>
            <span class="ch-rec__dot" aria-hidden="true"></span>
            <span class="ch-rec__time" id="ch-rec-time">0:00</span>
            <span class="ch-rec__hint">جارٍ التسجيل…</span>
            <button class="ds-btn ds-btn--primary ch-rec__send" id="ch-rec-send" aria-label="إرسال">${this.ICONS.send}</button>
          </div>
          <textarea id="ch-text" class="ds-input ch-text" rows="1" placeholder="اكتب رسالة…" autocomplete="off"></textarea>
          <button class="ds-btn ds-btn--ghost ch-attach" id="ch-attach" aria-label="إرفاق صورة أو فيديو">${this.ICONS.attach}</button>
          <input type="file" id="ch-file" accept="image/*,video/*" hidden>
          <button class="ds-btn ds-btn--ghost ch-mic" id="ch-mic" aria-label="تسجيل صوتي">${this.ICONS.mic}</button>
          <button class="ds-btn ds-btn--primary ch-send" id="ch-send" aria-label="إرسال" hidden>${this.ICONS.send}</button>
        </div>
      </div>`, { sheet: true, sfx: 'default', onDismiss: () => { try { this._stopVoicePlay(); } catch (e) {} if (this._recording) { try { this._stopVoiceRec(false); } catch (e) {} } this._openWith = null; this._sheet = null; this._reply = null; } });

    overlay.dataset.view = 'conv';
    this._sheet = overlay;
    this._openWith = fid;
    this._reply = null;
    this._anchorScroll(overlay.querySelector('#ch-scroll'));

    overlay.querySelector('.ch-conv__name').textContent = name;
    this._paintAvatar(overlay.querySelector('.ch-conv__av'), this._friendMeta[fid]);
    this._paintSub(overlay.querySelector('.ch-conv__sub'), this._friendMeta[fid]);

    const callBtn = overlay.querySelector('#ch-call');
    if (callBtn) callBtn.onclick = () => { U.sfx(); if (window.amkhCall) window.amkhCall.startCall(fid, name, this._friendMeta[fid].avatar_url); };
    const vcallBtn = overlay.querySelector('#ch-vcall');
    if (vcallBtn) vcallBtn.onclick = () => { U.sfx(); if (window.amkhCall) window.amkhCall.startVideoCall(fid, name, this._friendMeta[fid].avatar_url); };

    const ta = overlay.querySelector('#ch-text');
    const sendBtn = overlay.querySelector('#ch-send');
    const micBtn = overlay.querySelector('#ch-mic');
    const doSend = () => {
      const v = ta.value.trim();
      if (!v) return;
      this.sendMessage(fid, v);
      ta.value = ''; ta.style.height = 'auto';
      this._toggleSendMic(overlay);
      ta.focus();
    };
    sendBtn.onclick = () => { U.sfx(); doSend(); };
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; this._toggleSendMic(overlay); this._typing(fid); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
    /* الميكروفون: يبدأ/يوقف التسجيل. أزرار شريط التسجيل تُرسِل أو تلغي. */
    if (micBtn) micBtn.onclick = () => { U.sfx(); this._startVoiceRec({ kind: 'friend', id: fid }); };
    const attachBtn = overlay.querySelector('#ch-attach');
    const fileInp = overlay.querySelector('#ch-file');
    if (attachBtn && fileInp) {
      attachBtn.onclick = () => { U.sfx(); fileInp.value = ''; fileInp.click(); };
      fileInp.onchange = () => { const f = fileInp.files && fileInp.files[0]; if (f) this._pickMedia(f, { kind: 'friend', id: fid }); };
    }
    const recSend = overlay.querySelector('#ch-rec-send');
    const recCancel = overlay.querySelector('#ch-rec-cancel');
    if (recSend) recSend.onclick = () => { U.sfx(); this._stopVoiceRec(true); };
    if (recCancel) recCancel.onclick = () => { U.sfx(); this._stopVoiceRec(false); };
    overlay.querySelector('#ch-loadmore button').onclick = () => { U.sfx(); this._loadHistory(fid, true); };

    /* اعرض الكاش المحلي فورًا (#133) — يظهر التاريخ من غير انتظار النت وحتى أوفلاين.
       #8 — كان بيتخطّى الكاش خلاص لو فيه أي رسالة في الذاكرة (رسالة واحدة
       وصلت على السوكت والشات مقفول كانت تكفي)، فالمحادثة تفتح على رسالة
       واحدة وتستنى الشبكة. بندمج بدل ما نتخطّى. */
    try {
      const key = this._key(this._me(), fid);
      await this._restoreOutbox();
      const cached = await this._cacheGet('dm', key);
      if (cached && cached.length && this._openWith === fid) {
        const live = this._msgs[key] || [];
        this._msgs[key] = live.length ? this._mergeChrono(cached, live) : cached;
        this._renderMessages(fid);
        this._scrollBottom();
      }
    } catch (e) {}

    await this._loadHistory(fid, false);
    this._markRead(fid);
  },

  _paintAvatar(av, meta) {
    if (!av) return;
    av.innerHTML = '';
    const initial = String(meta.name || '؟').trim().slice(0, 1).toUpperCase();
    if (meta.avatar_url) {
      const img = document.createElement('img');
      img.className = 'ch-conv__av-img'; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => { img.remove(); av.textContent = initial; };
      img.src = meta.avatar_url;
      av.appendChild(img);
    } else av.textContent = initial;
  },

  /* صورة الحفلة: لو فيه صورة مرفوعة نعرضها، وإلا أيقونة مرسومة (مش إيموجي). */
  _paintGroupAvatar(av, g) {
    if (!av) return;
    av.innerHTML = '';
    const url = g && g.avatar_url;
    if (url) {
      const img = document.createElement('img');
      img.className = 'ch-conv__av-img'; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => { img.remove(); av.innerHTML = this.ICONS.group; };
      img.src = url;
      av.appendChild(img);
    } else {
      av.innerHTML = this.ICONS.group;
    }
  },

  _paintSub(el, meta) {
    if (!el) return;
    let txt = 'غير متصل', cls = 'ch-conv__sub';
    if (meta.status === 'in-game') { txt = 'في مباراة'; cls += ' is-ingame'; }
    else if (meta.online) { txt = 'متصل الآن'; cls += ' is-online'; }
    else if (window.amkhFriends) txt = window.amkhFriends._ago(meta.last_seen_at);
    el.textContent = txt;
    el.className = cls;
  },

  async _loadHistory(friendId, older) {
    const scroll = this._sheet && this._sheet.querySelector('#ch-scroll');
    const listEl = this._sheet && this._sheet.querySelector('#ch-msgs');
    if (!listEl) return;
    const key = this._key(this._me(), friendId);
    let before = null;
    if (older) { const arr = this._msgs[key] || []; if (arr.length && arr[0].id) before = arr[0].id; }
    const prevH = scroll ? scroll.scrollHeight : 0;

    const data = await this._get(`/history?with=${friendId}${before ? '&before=' + before : ''}&limit=30`);
    if (data && Array.isArray(data.messages)) {
      const existing = this._msgs[key] || [];
      if (older) {
        this._msgs[key] = data.messages.concat(existing);
      } else {
        /* دمج: نحافظ على الرسائل المتفائلة + سجلات المكالمات المحلية (#156)
           اللي مالهاش وجود على السيرفر عشان ماتختفيش عند الطرف التاني عند إعادة التحميل. */
        const kept = existing.filter(m => m.pending || m.local);
        this._msgs[key] = this._mergeChrono(data.messages, kept);
      }
      const loadMore = this._sheet.querySelector('#ch-loadmore');
      if (loadMore) loadMore.hidden = !data.has_more;
      this._persist('dm', key);
    }
    this._renderMessages(friendId);
    if (older && scroll) { scroll.scrollTop = scroll.scrollHeight - prevH; }
    else this._scrollBottom();
  },

  _renderMessages(friendId) {
    const listEl = this._sheet && this._sheet.querySelector('#ch-msgs');
    if (!listEl) return;
    listEl.innerHTML = '';
    const arr = this._msgs[this._key(this._me(), friendId)] || [];
    if (!arr.length) {
      const e = document.createElement('p');
      e.className = 'ch-empty';
      e.textContent = 'ابدأ المحادثة — قول له سلام';
      listEl.appendChild(e);
      return;
    }
    arr.forEach(m => listEl.appendChild(this._bubbleEl(m)));
    this._applyReadAvatar(friendId);   /* صورة «تمت المشاهدة» على آخر رسالة اتقرت */
    this._renderPinnedBar('friend');
  },

  _bubbleEl(m) {
    const b = document.createElement('div');
    b.className = 'ch-bubble ' + (m.mine ? 'ch-bubble--mine' : 'ch-bubble--their');
    if (m.pending) b.classList.add('is-pending');
    if (m.pinned) b.classList.add('ch-bubble--pinned');
    if (m.client_id) b.dataset.cid = m.client_id;
    if (m.id) b.dataset.mid = String(m.id);
    if (m.reply) b.appendChild(this._replyQuoteEl(m.reply));
    if (m.kind === 'voice') {
      b.classList.add('ch-bubble--voice');
      b.appendChild(this._voiceEl(m, 'dm'));
    } else if (m.kind === 'call') {
      b.classList.add('ch-bubble--call');
      b.appendChild(this._callRow(m));
    } else if (m.kind === 'image' || m.kind === 'video') {
      b.classList.add('ch-bubble--media');
      b.appendChild(this._mediaEl(m));
    } else {
      b.appendChild(this._bodyEl(m, 'friend'));
    }
    if (this._mentionsMe(m)) b.classList.add('ch-bubble--ment');
    const meta = document.createElement('div');
    meta.className = 'ch-bubble__meta';
    const time = document.createElement('span');
    time.className = 'ch-time';
    time.textContent = this._time(m.created_at);
    meta.appendChild(time);
    if (m.mine && m.kind !== 'call') {
      const tick = document.createElement('span');
      let cls = 'ch-tick';
      if (m.pending) cls += ' is-pending';
      else if (m.failed) cls += ' is-failed';
      else if (m.read) cls += ' is-read';
      else if (m.delivered) cls += ' is-delivered';
      tick.className = cls;
      if (m.pending) tick.innerHTML = this.ICONS.clock;   /* أيقونة ساعة مرسومة */
      else if (m.failed) tick.textContent = '✗';
      else tick.textContent = (m.delivered || m.read) ? '✓✓' : '✓';
      meta.appendChild(tick);
    }
    b.appendChild(meta);
    this._paintReactions(b, 'friend', m);
    if (m.kind !== 'call') this._bindMsgActions(b, 'friend', m);
    return b;
  },

  /* ══ منشِن (@) — #2 ══
     المنشن كان غايب تمامًا. الأسماء عربية وفيها مسافات، فمانقدرش نعتمد على
     «كلمة واحدة بعد @» زي تويتر: بنقارن نصّ الرسالة بأسماء أعضاء الحفلة
     الفعلية، والسيرفر بيعيد التحقّق من كل معرّف قبل التخزين.
     «@الكل» بتذكر كل الأعضاء (السيرفر بيسقّف العدد). */

  _myName() {
    const u = window.amkhAuth && window.amkhAuth.user;
    if (!u) return '';
    return this._displayName(u);
  },

  /* هل الرسالة بتذكرني؟ (لتمييز الفقاعة) */
  _mentionsMe(m) {
    const me = Number(this._me());
    return !!(m && Array.isArray(m.mentions) && m.mentions.some(x => Number(x) === me));
  },

  /* معرّفات الأعضاء المذكورين في نصّ الرسالة قبل الإرسال */
  _collectMentions(text, gid) {
    const t = String(text || '');
    const out = [];
    if (!t.includes('@')) return out;
    const members = this._gmembers[gid] || {};
    const me = Number(this._me());
    const all = /@(الكل|all)\b/.test(t) || t.includes('@الكل');
    Object.keys(members).forEach(k => {
      const id = Number(k);
      if (!id || id === me) return;
      if (all) { out.push(id); return; }
      const nm = this._displayName(members[k]);
      if (nm && t.includes('@' + nm)) out.push(id);
    });
    return out;
  },

  /* أسماء بنلوّنها جوه الفقاعة: أسماء المذكورين فعلًا + «الكل» */
  _mentionNames(scope, m) {
    const ids = Array.isArray(m && m.mentions) ? m.mentions.map(Number).filter(Boolean) : [];
    if (!ids.length) return [];
    const me = Number(this._me());
    const names = ['الكل', 'all'];
    const push = (n) => { if (n && !names.includes(n)) names.push(n); };
    if (scope === 'group') {
      const mem = this._gmembers[this._openGroup] || {};
      ids.forEach(id => {
        if (id === me) push(this._myName());
        else if (mem[id]) push(this._displayName(mem[id]));
      });
    } else {
      ids.forEach(id => {
        if (id === me) push(this._myName());
        else if (this._friendMeta[id]) push(this._friendMeta[id].name);
      });
    }
    /* الأطول أولًا عشان «أحمد خليفة» ماتتقطعش عند «أحمد» */
    return names.filter(Boolean).sort((a, b) => b.length - a.length);
  },

  /* جسم الرسالة كنصّ آمن (createTextNode) مع تلوين مقاطع @الاسم */
  _bodyEl(m, scope) {
    const body = document.createElement('div');
    body.className = 'ch-bubble__body';
    const txt = String(m && m.body != null ? m.body : '');
    const names = this._mentionNames(scope, m);
    if (!names.length || !txt.includes('@')) { body.textContent = txt; return body; }
    let i = 0;
    let guard = 0;
    while (i < txt.length && guard++ < 400) {
      const at = txt.indexOf('@', i);
      if (at < 0) break;
      const hit = names.find(n => txt.substr(at + 1, n.length) === n);
      if (!hit) {
        body.appendChild(document.createTextNode(txt.slice(i, at + 1)));
        i = at + 1;
        continue;
      }
      if (at > i) body.appendChild(document.createTextNode(txt.slice(i, at)));
      const tag = document.createElement('span');
      tag.className = 'ch-ment-tag';
      tag.textContent = '@' + hit;
      body.appendChild(tag);
      i = at + 1 + hit.length;
    }
    if (i < txt.length) body.appendChild(document.createTextNode(txt.slice(i)));
    return body;
  },

  /* لوحة اختيار العضو اللي بتفتح وأنت بتكتب @ جوه الحفلة */
  _bindMentions(root, gid) {
    const ta = root.querySelector('#ch-text');
    if (!ta) return;
    const close = () => { const p = root.querySelector('#ch-ment'); if (p) p.remove(); };
    const update = () => {
      const val = ta.value || '';
      const caret = (ta.selectionStart == null) ? val.length : ta.selectionStart;
      const upto = val.slice(0, caret);
      const at = upto.lastIndexOf('@');
      if (at < 0) return close();
      if (at > 0 && !/\s/.test(upto.charAt(at - 1))) return close();
      const q = upto.slice(at + 1);
      if (/\s/.test(q) || q.length > 24) return close();
      this._showMentionPicker(root, gid, q, at, caret, ta);
    };
    ta.addEventListener('input', update);
    ta.addEventListener('click', update);
    ta.addEventListener('keyup', (e) => { if (e.key === 'Escape') close(); });
    ta.addEventListener('blur', () => setTimeout(close, 220));
    ta._mentClose = close;
  },

  _showMentionPicker(root, gid, q, at, caret, ta) {
    const members = this._gmembers[gid] || {};
    const me = Number(this._me());
    const ql = String(q || '').toLowerCase();
    const list = Object.keys(members)
      .map(k => ({ id: Number(k), u: members[k] }))
      .filter(x => x.id && x.id !== me && x.u)
      .map(x => ({ id: x.id, name: this._displayName(x.u), avatar_url: x.u.avatar_url || null }))
      .filter(x => x.name && (!ql || x.name.toLowerCase().includes(ql)));
    if (!ql || 'الكل'.indexOf(ql) === 0 || 'all'.indexOf(ql) === 0) {
      list.unshift({ id: 0, name: 'الكل', everyone: true });
    }
    let box = root.querySelector('#ch-ment');
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) {
      const input = root.querySelector('#ch-input');
      if (!input || !input.parentNode) return;
      box = document.createElement('div');
      box.id = 'ch-ment';
      box.className = 'ch-ment';
      input.parentNode.insertBefore(box, input);
    }
    box.innerHTML = '';
    list.slice(0, 8).forEach(x => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ch-ment__row';
      const av = document.createElement('span');
      av.className = 'ch-ment__av';
      av.setAttribute('aria-hidden', 'true');
      if (x.everyone) av.innerHTML = this.ICONS.at;
      else this._paintAvatar(av, { name: x.name, avatar_url: x.avatar_url });
      const nm = document.createElement('span');
      nm.className = 'ch-ment__name';
      nm.textContent = x.everyone ? 'الكل — كل الأعضاء' : x.name;
      row.appendChild(av); row.appendChild(nm);
      row.onmousedown = (e) => e.preventDefault();      /* مايفقدش تركيز الحقل */
      row.onclick = () => {
        try { window.amkhUI && window.amkhUI.sfx && window.amkhUI.sfx(); } catch (e) {}
        const val = ta.value || '';
        const head = val.slice(0, at);
        const tail = val.slice(Math.min(caret, val.length));
        const ins = '@' + x.name + ' ';
        ta.value = head + ins + tail;
        const pos = (head + ins).length;
        try { ta.setSelectionRange(pos, pos); } catch (e) {}
        box.remove();
        ta.focus();
        ta.style.height = 'auto';
        ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
      };
      box.appendChild(row);
    });
  },

  /* ══ رد على رسالة (#130) ══ */

  _msgPreview(m) {
    if (!m) return '';
    if (m.kind === 'voice') return 'رسالة صوتية';
    if (m.kind === 'image') return 'صورة';
    if (m.kind === 'video') return 'فيديو';
    return String(m.body || '');
  },
  _msgAuthorName(scope, m) {
    if (m.mine) return 'أنت';
    if (scope === 'group') {
      if (m.sender_name) return m.sender_name;
      const mem = (this._gmembers[this._openGroup] || {})[m.from];
      return mem ? (mem.display_name || mem.username) : 'صديق';
    }
    const meta = this._friendMeta[this._openWith];
    return (meta && meta.name) || 'صديق';
  },

  /* بلوك الاقتباس اللي بيظهر جوه الفقاعة فوق نص الرسالة (نمط واتساب). */
  _replyQuoteEl(reply) {
    const q = document.createElement('div');
    q.className = 'ch-quote';
    q.style.cssText = 'border-inline-start:3px solid var(--color-primary,#4a90d9);background:rgba(127,127,127,.14);border-radius:6px;padding:3px 7px;margin-bottom:4px;cursor:pointer;max-width:100%;overflow:hidden;';
    const nm = document.createElement('div');
    nm.style.cssText = 'font-size:11px;font-weight:700;color:var(--color-primary,#4a90d9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    nm.textContent = reply.name || 'صديق';
    const pv = document.createElement('div');
    pv.style.cssText = 'font-size:12px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    pv.textContent = reply.preview || '';
    q.appendChild(nm); q.appendChild(pv);
    q.onclick = (e) => { e.stopPropagation(); this._scrollToMsg(reply.id); };
    return q;
  },

  /* لمسة مطوّلة/كليك يمين تفتح قائمة إجراءات الرسالة؛ وسحب أفقي = رد سريع (نمط واتساب). */
  _bindMsgActions(bubbleEl, scope, m) {
    let timer = null, moved = false;
    const open = () => this._openMsgMenu(scope, m);
    bubbleEl.addEventListener('contextmenu', (e) => { e.preventDefault(); open(); });
    /* ══ #11 — لا شريط «نسخ/مشاركة/تحديد الكل» من أندرويد ══
       اللمسة المطوّلة على نصّ قابل للتحديد تُشغّل ActionMode في الـWebView،
       فيظهر شريط أندرويد فوق ورقتنا. المنع الأساسي في screens.css
       بـuser-select:none، وهذا الحارس يوقف أي محاولة تحديد بقيت في
       إصدارات WebView التي تبدأ التحديد قبل قراءة الخاصية. النسخ متاح من
       ورقة الإجراءات نفسها («نسخ النص») فلا تفقد الميزة. */
    bubbleEl.addEventListener('selectstart', (e) => { e.preventDefault(); });

    let sx = 0, sy = 0, dx = 0, decided = false, swiping = false;
    const THRESH = 54, MAX = 74;   /* px: عتبة تفعيل الرد + أقصى إزاحة */
    const settle = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      bubbleEl.style.transition = 'transform .18s ease';
      bubbleEl.style.transform = 'translateX(0)';
      this._swipeHint(bubbleEl, 0, 0);
      decided = false; swiping = false; dx = 0;
    };

    bubbleEl.addEventListener('touchstart', (e) => {
      if (m.id == null) return;
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
      moved = false; decided = false; swiping = false; dx = 0;
      bubbleEl.style.transition = 'none';
      timer = setTimeout(() => { if (!moved) open(); }, 480);
    }, { passive: true });

    bubbleEl.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      const ddx = t.clientX - sx, ddy = t.clientY - sy;
      if (!decided) {
        if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;   /* لسه ماتحرّكش كفاية */
        decided = true;
        swiping = Math.abs(ddx) > Math.abs(ddy) + 2;          /* نية أفقية = سحب رد */
        moved = true;
        if (timer) { clearTimeout(timer); timer = null; }     /* أي حركة تلغي اللمسة المطوّلة */
      }
      if (!swiping) return;                                   /* رأسي = تمرير عادي، سيبه */
      dx = Math.max(-MAX, Math.min(MAX, ddx));
      bubbleEl.style.transform = `translateX(${dx}px)`;
      this._swipeHint(bubbleEl, dx, Math.min(Math.abs(dx) / THRESH, 1));
    }, { passive: true });

    const finish = () => {
      const fire = swiping && Math.abs(dx) >= THRESH;
      settle();
      if (fire) {
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
        try { window.amkhUI && window.amkhUI.sfx && window.amkhUI.sfx(); } catch (e) {}
        this._startReply(scope, m);
      }
    };
    bubbleEl.addEventListener('touchend', finish, { passive: true });
    bubbleEl.addEventListener('touchcancel', finish, { passive: true });
  },

  /* أيقونة الرد اللي بتظهر جوه الفقاعة وقت السحب — بتفضل مكانها بينما الفقاعة
     بتتحرك تحتها (counter-translate) وبتوضح بالتدريج مع مقدار السحب. */
  _swipeHint(bubbleEl, dx, progress) {
    let ic = bubbleEl._swipeIc;
    if (!ic) {
      if (progress <= 0) return;
      ic = document.createElement('span');
      ic.className = 'ch-swipe-ic';
      ic.innerHTML = this.ICONS.reply;
      bubbleEl.appendChild(ic);
      bubbleEl._swipeIc = ic;
    }
    ic.style.opacity = String(progress);
    ic.style.transform = `translateX(${-dx}px) scale(${0.5 + 0.5 * progress})`;
  },

  /* قائمة إجراءات الرسالة (رد + معلومات لرسايلي + تثبيت). */
  /* الرموز السريعة للتفاعل (#3) — نفس مجموعة واتساب المختصرة */
  REACTIONS: ['👍', '❤️', '😂', '😮', '😢', '🙏'],

  /* لقطة قصيرة من الرسالة تُعرض أعلى ورقة الإجراءات، فيعرف المستخدم على
     أي رسالة يعمل — كان غائبًا فكانت القائمة تبدو معلَّقة في الهواء.
     تبني على _msgPreview وتضيف رمزًا للنوع وقصًّا للطول. */
  _actPeek(m) {
    const kind = m.kind || 'text';
    if (kind === 'voice') return '🎤 رسالة صوتية';
    if (kind === 'image') return '📷 صورة';
    if (kind === 'video') return '🎬 فيديو';
    if (kind === 'call') return '📞 مكالمة';
    const b = this._msgPreview(m).replace(/\s+/g, ' ').trim();
    return b.length > 90 ? b.slice(0, 90) + '…' : (b || '—');
  },

  /* ══ ورقة إجراءات الرسالة (#11) ══
     كانت نافذة وسطية بأزرار مستطيلة كلٌّ منها بإطار كامل — شكل قوائم
     أندرويد القديمة. صارت ورقةً سفلية على طراز التطبيق: مقبض سحب، شريط
     تفاعلات عائم بحبّات دائرية تظهر بتدرّج، لقطة من الرسالة نفسها، ثم
     صفوف بأيقونات في مربّعات ملوّنة خفيفة وفواصل رقيقة بلا إطارات.
     ولها نغمتها الخاصة (msgAct) مثل بقية نوافذ التطبيق. */
  _openMsgMenu(scope, m) {
    const U = window.amkhUI;
    if (!U || m.id == null) return;
    /* معلومات الرسالة (مين قرأ/سمع) في الحفلة بس — مش في الشات الفردي. */
    const canInfo = (scope === 'group' && m.mine);
    /* التثبيت: في الحفلة للمشرفين بس؛ في 1:1 للطرفين. */
    const canPin = scope === 'group' ? this._groupIsAdmin(this._openGroup) : true;
    const txt = (m.kind === 'text' || !m.kind) ? String(m.body || '') : '';
    const media = ['image', 'video', 'voice'].includes(m.kind) && m.audio;

    const row = (act, icon, label, hint, mod) =>
      `<button class="msg-act__row${mod ? ' ' + mod : ''}" data-do="${act}">`
      + `<span class="msg-act__ic">${icon}</span>`
      + `<span class="msg-act__lb">${label}${hint ? `<small>${hint}</small>` : ''}</span></button>`;

    let rows = row('reply', this.ICONS.reply, 'رد');
    if (txt) rows += row('copy', this.ICONS.copy, 'نسخ النص');
    if (media) rows += row('save', this.ICONS.download, 'حفظ في الجهاز');
    if (canInfo) rows += row('info', this.ICONS.info, 'معلومات الرسالة');
    if (canPin) {
      rows += m.pinned
        ? row('unpin', this.ICONS.pin, 'إلغاء التثبيت', this._pinLeftText(m), 'msg-act__row--warn')
        : row('pin', this.ICONS.pin, 'تثبيت', 'تختار المدة ثم يُلغى وحده');
    }

    /* #3 — شريط التفاعلات فوق الورقة، والمختار حاليًا مميّز */
    const mineEmoji = this._myReaction(m);
    const strip = this.REACTIONS.map((e, i) =>
      `<button class="msg-act__emo${mineEmoji && mineEmoji.emoji === e ? ' is-mine' : ''}" `
      + `style="--i:${i}" data-emoji="${e}" aria-label="تفاعل ${e}">${e}</button>`).join('');

    const overlay = U.mount('amkh-msg-act', `
      <div class="ds-sheet msg-act" id="msg-act-p">
        <div class="ds-sheet__handle"></div>
        <div class="msg-act__react">${strip}</div>
        <div class="msg-act__peek">
          <span class="msg-act__peek-who">${U.esc(this._msgAuthorName(scope, m))}</span>
          <span class="msg-act__peek-txt">${U.esc(this._actPeek(m))}</span>
        </div>
        <div class="ds-sheet__body msg-act__rows">${rows}</div>
      </div>`, { sheet: true, sfx: 'msgAct' });
    try { window.DSOverlay && window.DSOverlay.makeSheetDraggable('amkh-msg-act', 'msg-act-p', () => overlay._dismiss()); } catch (e) {}

    overlay.querySelectorAll('[data-emoji]').forEach(b => b.onclick = () => {
      U.sfx();
      const emoji = b.dataset.emoji;
      try { overlay._dismiss(); } catch (e) {}
      this._react(scope, m, emoji);
    });
    overlay.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      U.sfx();
      const act = b.dataset.do;
      try { overlay._dismiss(); } catch (e) {}
      if (act === 'reply') this._startReply(scope, m);
      else if (act === 'info') this._openMsgInfo(scope, m);
      else if (act === 'pin') this._openPinDuration(scope, m);
      else if (act === 'unpin') this._pinMsg(scope, m, false);
      else if (act === 'copy') this._copyText(txt);
      else if (act === 'save') this._saveMedia(m);
    });
  },

  /* ══ مدّة التثبيت (#7) ══
     على طراز واتساب: تختار مدّة فينتهي التثبيت وحده. «دائم» متاح كذلك
     لمن يريد بقاءها. المدد المسموحة مقيَّدة في الخادم أيضًا. */
  PIN_DURATIONS: [
    { days: 3, label: '٣ أيام' },
    { days: 7, label: '٧ أيام' },
    { days: 30, label: '٣٠ يومًا' },
    { days: 0, label: 'دائمًا' },
  ],

  _openPinDuration(scope, m) {
    const U = window.amkhUI;
    if (!U) return;
    const opts = this.PIN_DURATIONS.map((d, i) =>
      `<button class="msg-act__row msg-act__row--opt" style="--i:${i}" data-days="${d.days}">`
      + `<span class="msg-act__ic">${d.days ? this.ICONS.clock : this.ICONS.pin}</span>`
      + `<span class="msg-act__lb">${d.label}${d.days ? '<small>يُلغى التثبيت تلقائيًا بعدها</small>' : '<small>يبقى حتى تُلغيه بنفسك</small>'}</span>`
      + `</button>`).join('');
    const overlay = U.mount('amkh-pin-time', `
      <div class="ds-sheet msg-act" id="pin-time-p">
        <div class="ds-sheet__handle"></div>
        <h3 class="msg-act__title">مدّة التثبيت</h3>
        <p class="msg-act__note">اختر المدّة التي تبقى فيها الرسالة مثبّتة أعلى المحادثة.</p>
        <div class="ds-sheet__body msg-act__rows">${opts}</div>
      </div>`, { sheet: true, sfx: 'pinTime' });
    try { window.DSOverlay && window.DSOverlay.makeSheetDraggable('amkh-pin-time', 'pin-time-p', () => overlay._dismiss()); } catch (e) {}
    overlay.querySelectorAll('[data-days]').forEach(b => b.onclick = () => {
      U.sfx();
      const days = Number(b.dataset.days) || 0;
      try { overlay._dismiss(); } catch (e) {}
      this._pinMsg(scope, m, true, days);
    });
  },

  /* «تنتهي بعد …» — نصّ الوقت المتبقّي لتثبيت مؤقّت. */
  _pinLeftText(m) {
    if (!m || !m.pinned_until) return 'مثبّتة دائمًا';
    const t = Date.parse(String(m.pinned_until).replace(' ', 'T') + 'Z');
    if (!Number.isFinite(t)) return '';
    const left = t - Date.now();
    if (left <= 0) return 'انتهت مدّتها';
    const days = Math.floor(left / 86400000);
    if (days >= 1) return `تنتهي بعد ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : days + ' أيام'}`;
    const hrs = Math.floor(left / 3600000);
    if (hrs >= 1) return `تنتهي بعد ${hrs === 1 ? 'ساعة' : hrs === 2 ? 'ساعتين' : hrs + ' ساعات'}`;
    const mins = Math.max(1, Math.floor(left / 60000));
    return `تنتهي بعد ${mins === 1 ? 'دقيقة' : mins === 2 ? 'دقيقتين' : mins + ' دقائق'}`;
  },

  /* ══ نسخ نص الرسالة (#11) ══
     الحافظة الحديثة أولًا، ولو المتصفّح/الويب‑ڤيو منعها (سياق غير آمن)
     نرجع لطريقة textarea + execCommand عشان الميزة ما تسقطش في التطبيق. */
  async _copyText(txt) {
    const U = window.amkhUI;
    if (!txt) return;
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, txt.length);
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) { ok = false; }
    }
    if (U) {
      if (ok) U.notify('تم نسخ الرسالة', 'نُسخت', '◉');
      else U.notify('تعذّر النسخ على هذا الجهاز', 'لم يتم', '◈');
    }
  },

  /* ══ تفاعلات الإيموجي (#3) ══
     تفاعل واحد لكل مستخدم على كل رسالة: اختيار إيموجي تاني يستبدل القديم،
     ونفس الإيموجي تاني = إلغاء. بنرسم فورًا (تفاؤليًا) قبل ردّ الخادم عشان
     اللمسة تبان لحظية، ولو الطلب فشل نرجّع الحالة زي ما كانت. */

  /* تفاعلي أنا على الرسالة: علم mine من الخادم أولًا، وإلا نستنتجه من قائمة
     المتفاعلين (بثّ الحفلة موحّد للجميع فبيوصل بلا mine). */
  _myReaction(m) {
    const me = Number(this._me());
    const list = Array.isArray(m && m.reactions) ? m.reactions : [];
    for (const r of list) {
      if (!r) continue;
      if (r.mine) return r;
      if (Array.isArray(r.users) && r.users.some(u => Number(u && u.id) === me)) return r;
    }
    return null;
  },

  /* صفّ الشرائح تحت الفقاعة — الضغط على شريحة = نفس تفاعلها (تبديل/إلغاء). */
  _paintReactions(bubbleEl, scope, m) {
    if (!bubbleEl) return;
    const old = bubbleEl.querySelector('.ch-reacts');
    if (old) old.remove();
    const list = (Array.isArray(m && m.reactions) ? m.reactions : []).filter(r => r && r.emoji && (r.count || 0) > 0);
    if (!list.length) { bubbleEl.classList.remove('has-reacts'); return; }
    bubbleEl.classList.add('has-reacts');
    const mineCell = this._myReaction(m);
    const row = document.createElement('div');
    row.className = 'ch-reacts';
    list.forEach(r => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ch-react' + (mineCell && mineCell.emoji === r.emoji ? ' is-mine' : '');
      const names = (r.users || []).map(u => (u && u.name) || '').filter(Boolean).join('، ');
      chip.title = names;
      chip.setAttribute('aria-label', `${r.emoji} ${r.count}${names ? ' — ' + names : ''}`);
      const em = document.createElement('span');
      em.className = 'ch-react__em';
      em.textContent = r.emoji;
      chip.appendChild(em);
      if ((r.count || 0) > 1) {
        const n = document.createElement('span');
        n.className = 'ch-react__n';
        n.textContent = String(r.count);
        chip.appendChild(n);
      }
      chip.onclick = (e) => {
        e.stopPropagation();
        try { window.amkhUI && window.amkhUI.sfx && window.amkhUI.sfx(); } catch (err) {}
        this._react(scope, m, r.emoji);
      };
      row.appendChild(chip);
    });
    bubbleEl.appendChild(row);
  },

  _repaintReactions(scope, m) {
    if (!this._sheet || !m || m.id == null) return;
    const b = this._sheet.querySelector(`.ch-bubble[data-mid="${m.id}"]`);
    if (b) this._paintReactions(b, scope, m);
  },

  /* تعديل محلي فوري لقائمة التفاعلات قبل ردّ الخادم. */
  _applyLocalReaction(m, emoji) {
    const me = Number(this._me());
    const list = (Array.isArray(m.reactions) ? m.reactions : [])
      .map(r => ({ emoji: r.emoji, count: r.count || 0, mine: !!r.mine, users: (r.users || []).slice() }));
    let mineCell = null;
    for (const r of list) {
      if (r.mine || r.users.some(u => Number(u && u.id) === me)) { mineCell = r; break; }
    }
    if (mineCell) {
      mineCell.count = Math.max(0, mineCell.count - 1);
      mineCell.mine = false;
      mineCell.users = mineCell.users.filter(u => Number(u && u.id) !== me);
    }
    const off = mineCell && mineCell.emoji === emoji;   /* نفس الإيموجي = إلغاء */
    if (!off && emoji) {
      let cell = list.find(r => r.emoji === emoji);
      if (!cell) { cell = { emoji, count: 0, mine: false, users: [] }; list.push(cell); }
      cell.count++;
      cell.mine = true;
      cell.users.push({ id: me, name: 'أنت' });
    }
    m.reactions = list.filter(r => (r.count || 0) > 0);
  },

  async _react(scope, m, emoji) {
    if (!m || m.id == null) return;
    const U = window.amkhUI;
    const grp = scope === 'group';
    const gid = this._openGroup, fid = this._openWith;
    if (grp ? gid == null : fid == null) return;
    const before = (Array.isArray(m.reactions) ? m.reactions : [])
      .map(r => ({ emoji: r.emoji, count: r.count || 0, mine: !!r.mine, users: (r.users || []).slice() }));
    this._applyLocalReaction(m, String(emoji || ''));
    this._repaintReactions(scope, m);
    const res = grp
      ? await this._gpost(`/${gid}/react`, { id: m.id, emoji })
      : await this._post('/react', { id: m.id, emoji });
    if (!res || res.error) {
      m.reactions = before;
      this._repaintReactions(scope, m);
      if (U) U.notify(res ? 'تعذّر إرسال التفاعل' : 'لا يوجد اتصال بالخادم حاليًا.', 'لم يتم', '◈');
      return;
    }
    m.reactions = Array.isArray(res.reactions) ? res.reactions : [];
    this._repaintReactions(scope, m);
    this._persist(grp ? 'grp' : 'dm', grp ? gid : this._key(this._me(), fid));
  },

  /* تفاعل وصل من الطرف التاني/عضو في الحفلة */
  _onReaction(d, isGroup) {
    if (!d || d.id == null) return true;
    const list = Array.isArray(d.reactions) ? d.reactions : [];
    if (isGroup) {
      const gid = d.group_id;
      if (gid == null) return true;
      const arr = this._gmsgs[gid];
      const m = arr && arr.find(x => x.id === d.id);
      if (!m) return true;
      m.reactions = list;
      this._persist('grp', gid);
      if (this._openGroup === gid) this._repaintReactions('group', m);
    } else {
      const other = Number(d.from);
      if (!other) return true;
      const key = this._key(this._me(), other);
      const arr = this._msgs[key];
      const m = arr && arr.find(x => x.id === d.id);
      if (!m) return true;
      m.reactions = list;
      this._persist('dm', key);
      if (Number(this._openWith) === other) this._repaintReactions('friend', m);
    }
    return true;
  },

  /* ══ حفظ وسائط الدردشة في الجهاز (#6) ══
     الوسائط بتوصل base64 جوه الرسالة، وروابط data: مابتتنزّلش جوه الـWebView،
     فبنمرّر البايتات لإضافة MediaSave الأصلية (تكتب في معرض الصور بلا أذونات
     على أندرويد 10+). على المتصفّح بنرجع لرابط تنزيل عادي. */
  _mediaExt(mime, kind) {
    const t = String(mime || '');
    if (t.includes('png')) return '.png';
    if (t.includes('webp')) return '.webp';
    if (t.includes('gif')) return '.gif';
    if (t.includes('jpeg') || t.includes('jpg')) return '.jpg';
    if (t.includes('mp4')) return '.mp4';
    if (t.includes('webm')) return kind === 'video' ? '.webm' : '.webm';
    if (t.includes('3gp')) return '.3gp';
    if (t.includes('ogg')) return '.ogg';
    if (t.includes('mpeg') || t.includes('mp3')) return '.mp3';
    if (t.includes('m4a') || t.includes('mp4a') || t.includes('aac')) return '.m4a';
    return kind === 'video' ? '.mp4' : kind === 'voice' ? '.m4a' : '.jpg';
  },
  async _saveMedia(m) {
    const U = window.amkhUI;
    if (!m || !m.audio) { if (U) U.notify('لا يوجد ملف للحفظ', 'لم يتم', '◈'); return; }
    const kind = m.kind === 'video' ? 'video' : m.kind === 'voice' ? 'voice' : 'image';
    const mime = m.mime || (kind === 'video' ? 'video/mp4' : kind === 'voice' ? 'audio/mp4' : 'image/jpeg');
    const stamp = (() => {
      const d = new Date(m.created_at || Date.now());
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    })();
    const name = `amkh-${kind === 'voice' ? 'audio' : kind}-${stamp}${this._mediaExt(mime, kind)}`;
    const label = kind === 'video' ? 'الفيديو' : kind === 'voice' ? 'التسجيل' : 'الصورة';

    const plugin = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaSave) || null;
    if (plugin && typeof plugin.save === 'function') {
      try {
        await plugin.save({ data: m.audio, mime, name });
        if (U) U.notify(`تم حفظ ${label} في معرض الجهاز`, 'حُفظ', '◉');
      } catch (e) {
        if (U) U.notify(`تعذّر حفظ ${label} على هذا الجهاز`, 'لم يتم', '◈');
      }
      return;
    }
    /* المتصفّح: Blob + رابط تنزيل (أفضل من data: للملفات الكبيرة) */
    try {
      const bin = atob(String(m.audio));
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buf], { type: mime }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
      if (U) U.notify(`تم تنزيل ${label}`, 'حُفظ', '◉');
    } catch (e) {
      if (U) U.notify(`تعذّر حفظ ${label} على هذا الجهاز`, 'لم يتم', '◈');
    }
  },

  _groupIsAdmin(gid) {
    const meta = this._gmeta[gid] || {};
    return meta.my_role === 'owner' || meta.my_role === 'admin';
  },

  /* تثبيت/فك تثبيت رسالة (#132) — بيبعت على السوكت والسيرفر بيبثّ للطرفين.
     days (#7): ٣/٧/٣٠ = تثبيت مؤقّت ينتهي وحده، و٠ = دائم. */
  _pinMsg(scope, m, pin, days) {
    const ws = this._socket();
    if (!ws) { window.amkhUI.notify('لا يوجد اتصال بالخادم حاليًا.', 'غير متصل', '◈'); return; }
    try { if (window.SFX) window.SFX.modalOpen('pin'); } catch (e) {}
    const d = Number(days) || 0;
    if (scope === 'group') {
      const gid = this._openGroup; if (gid == null) return;
      try { ws.send(JSON.stringify({ type: 'group:pin', group_id: gid, id: m.id, pin: !!pin, days: d })); } catch (e) {}
    } else {
      const to = this._openWith; if (to == null) return;
      try { ws.send(JSON.stringify({ type: 'chat:pin', to, id: m.id, pin: !!pin, days: d })); } catch (e) {}
    }
  },

  _onPinned(d) {
    if (!d || d.id == null) return true;
    const friendId = d.with;
    const key = this._key(this._me(), friendId);
    const arr = this._msgs[key];
    if (arr) {
      const m = arr.find(x => x.id === d.id);
      if (m) { m.pinned = !!d.pinned; m.pinned_until = d.pinned ? (d.pinned_until || null) : null; }
    }
    this._persist('dm', key);
    if (this._openWith === friendId) { this._markBubblePinned(d.id, !!d.pinned); this._renderPinnedBar('friend'); }
    return true;
  },
  _onGroupPinned(d) {
    if (!d || d.id == null || d.group_id == null) return true;
    const arr = this._gmsgs[d.group_id];
    if (arr) {
      const m = arr.find(x => x.id === d.id);
      if (m) { m.pinned = !!d.pinned; m.pinned_until = d.pinned ? (d.pinned_until || null) : null; }
    }
    this._persist('grp', d.group_id);
    if (this._openGroup === d.group_id) { this._markBubblePinned(d.id, !!d.pinned); this._renderPinnedBar('group'); }
    return true;
  },

  _markBubblePinned(id, pinned) {
    if (!this._sheet) return;
    const b = this._sheet.querySelector(`.ch-bubble[data-mid="${id}"]`);
    if (b) b.classList.toggle('ch-bubble--pinned', !!pinned);
  },

  /* هل التثبيت لا يزال ساريًا؟ (#7) — النسخة المحلّية المخزّنة قد تكون
     أُخذت قبل انتهاء المدّة والتطبيق كان مقفولًا، فنتحقّق عند العرض. */
  _pinLive(m) {
    if (!m || !m.pinned) return false;
    if (!m.pinned_until) return true;
    const t = Date.parse(String(m.pinned_until).replace(' ', 'T') + 'Z');
    return !Number.isFinite(t) || t > Date.now();
  },

  /* شريط الرسائل المثبّتة أعلى المحادثة (زي واتساب): أحدث رسالة مثبّتة
     + عدّاد، والضغط بيقفز للرسالة. */
  _renderPinnedBar(scope) {
    if (!this._sheet) return;
    const arr = scope === 'group' ? (this._gmsgs[this._openGroup] || []) : (this._msgs[this._key(this._me(), this._openWith)] || []);
    /* التثبيت المنتهي (#7) يُعامَل كغير مثبّت فورًا، ونصفّي علامته من
       الفقاعة كذلك عشان الخط السفلي المميّز ما يفضلش. */
    arr.forEach(m => { if (m.pinned && !this._pinLive(m)) { m.pinned = false; m.pinned_until = null; this._markBubblePinned(m.id, false); } });
    const pinned = arr.filter(m => m.pinned && m.id != null);
    let bar = this._sheet.querySelector('#ch-pinned');
    if (!pinned.length) { if (bar) bar.remove(); if (this._pinTick) { clearInterval(this._pinTick); this._pinTick = null; } return; }
    const last = pinned[pinned.length - 1];
    const scroll = this._sheet.querySelector('#ch-scroll');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ch-pinned';
      bar.className = 'ch-pinned';
      bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(127,127,127,.14);border-inline-start:3px solid var(--color-primary,#4a90d9);cursor:pointer;font-size:13px;';
      if (scroll && scroll.parentNode) scroll.parentNode.insertBefore(bar, scroll);
    }
    const preview = (last.kind === 'voice' ? '🎤 رسالة صوتية' : last.kind === 'image' ? '📷 صورة' : last.kind === 'video' ? '🎬 فيديو' : (last.body || ''));
    const esc = (window.amkhUI && window.amkhUI.esc) ? window.amkhUI.esc : (s => String(s));
    const left = last.pinned_until ? this._pinLeftText(last) : '';
    bar.innerHTML = `<span style="opacity:.8;">${this.ICONS.pin}</span>`
      + `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pinned.length > 1 ? `<b>${pinned.length} مثبّتة · </b>` : '<b>مثبّتة · </b>'}${esc(preview)}</span>`
      + (left ? `<span style="flex:0 0 auto;opacity:.65;font-size:11px;">${esc(left)}</span>` : '');
    bar.onclick = () => { try { window.amkhUI.sfx(); } catch (e) {} this._scrollToMsg(last.id); };
    /* عدّاد خفيف يحدّث «تنتهي بعد …» ويشيل الشريط لحظة الانتهاء بلا
       انتظار بثّ الخادم — دقيقة واحدة كافية ولا تُثقل شيئًا. */
    if (!this._pinTick) {
      this._pinTick = setInterval(() => {
        if (!this._sheet || !this._sheet.querySelector('#ch-pinned')) { clearInterval(this._pinTick); this._pinTick = null; return; }
        this._renderPinnedBar(scope);
      }, 60000);
    }
  },

  /* تسجيل استماع رسالة صوتية مرة واحدة (#131) — مش لرسايلي أنا. */
  _reportPlayed(info) {
    if (!info || info.mine || info.mid == null) return;
    const scope = info.scope || 'dm';
    this._played = this._played || {};
    const tag = scope + ':' + info.mid;
    if (this._played[tag]) return;
    this._played[tag] = true;
    if (scope === 'grp') { const gid = this._openGroup; if (gid != null) this._gpost(`/${gid}/played`, { id: info.mid }); }
    else this._post('/played', { id: info.mid });
  },

  /* نافذة معلومات الرسالة (#131): تسليم/قراءة + مين سمع الصوتية. */
  async _openMsgInfo(scope, m) {
    const U = window.amkhUI;
    if (!U) return;
    const data = scope === 'group'
      ? await this._gget(`/${this._openGroup}/message-info?id=${m.id}`)
      : await this._get(`/message-info?id=${m.id}`);
    if (!data || data.error) { U.notify('تعذّر جلب معلومات الرسالة', 'تنبيه', '◈'); return; }
    const fmt = (iso) => iso ? this._time(iso) : '—';
    const avaHtml = (u) => u.avatar_url
      ? `<img src="${u.avatar_url}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
      : `<span style="width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--color-primary,#4a90d9);color:#fff;font-weight:700;">${(u.name || '؟').slice(0,1)}</span>`;
    const rowHtml = (u, right) => `<div style="display:flex;align-items:center;gap:10px;padding:6px 2px;">${avaHtml(u)}<div style="flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.name}</div><div style="opacity:.7;font-size:12px;">${right}</div></div>`;
    let inner = '';
    if (scope === 'group') {
      const readList = (data.members || []).filter(u => u.read);
      const delivList = (data.members || []).filter(u => u.delivered && !u.read);
      const pendList = (data.members || []).filter(u => !u.delivered);
      inner += `<div style="font-weight:800;margin:8px 0 4px;">مقروءة (${readList.length})</div>`;
      inner += readList.length ? readList.map(u => rowHtml(u, '✓✓')).join('') : `<div style="opacity:.6;font-size:13px;">لا أحد بعد</div>`;
      if (delivList.length) { inner += `<div style="font-weight:800;margin:10px 0 4px;">تم التسليم (${delivList.length})</div>` + delivList.map(u => rowHtml(u, '✓')).join(''); }
      if (pendList.length) { inner += `<div style="font-weight:800;margin:10px 0 4px;">قيد الانتظار (${pendList.length})</div>` + pendList.map(u => rowHtml(u, '…')).join(''); }
    } else {
      const line = (label, val) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 2px;border-bottom:1px solid rgba(127,127,127,.15);"><span style="font-weight:700;">${label}</span><span style="opacity:.75;">${val}</span></div>`;
      inner += line('تم التسليم', fmt(data.delivered_at));
      inner += line('تمت القراءة', fmt(data.read_at));
    }
    if (data.kind === 'voice') {
      const L = data.listened || [];
      inner += `<div style="font-weight:800;margin:10px 0 4px;">استمعوا (${L.length})</div>`;
      inner += L.length ? L.map(u => rowHtml(u, this._time(u.at))).join('') : `<div style="opacity:.6;font-size:13px;">لا أحد بعد</div>`;
    }
    U.mount('amkh-msg-info', `
      <div class="ds-dialog">
        <h2 class="ds-dialog__title">معلومات الرسالة</h2>
        <div class="ds-dialog__message" style="text-align:start;max-height:56vh;overflow:auto;">${inner}</div>
        <div class="ds-dialog__actions"><button class="ds-btn ds-btn--primary ds-btn--block" data-close>تمام</button></div>
      </div>`, { sfx: 'msgInfo' });
  },

  _startReply(scope, m) {
    this._reply = { scope, id: m.id, name: this._msgAuthorName(scope, m), preview: this._msgPreview(m).slice(0, 120), kind: m.kind || 'text' };
    this._showReplyBar();
  },

  _showReplyBar() {
    if (!this._sheet || !this._reply) return;
    const composer = this._sheet.querySelector('#ch-input');
    if (!composer || !composer.parentNode) return;
    let bar = this._sheet.querySelector('#ch-reply');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ch-reply';
      bar.className = 'ch-reply';
      /* شقيق فوق حقل الكتابة جوه .ch-conv — مش جوّه صف الأزرار (ده كان بيبوّظ الشكل). */
      composer.parentNode.insertBefore(bar, composer);
    }
    const r = this._reply;
    bar.innerHTML = '';
    const body = document.createElement('div');
    body.className = 'ch-reply__body';
    const nm = document.createElement('div');
    nm.className = 'ch-reply__name';
    nm.textContent = 'رد على ' + r.name;
    const pv = document.createElement('div');
    pv.className = 'ch-reply__preview';
    pv.textContent = r.preview;
    body.appendChild(nm); body.appendChild(pv);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'ch-reply__x';
    x.setAttribute('aria-label', 'إلغاء الرد');
    x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    x.onclick = () => { try { window.amkhUI.sfx(); } catch (e) {} this._clearReply(); };
    bar.appendChild(body); bar.appendChild(x);
    const ta = this._sheet.querySelector('#ch-text');
    if (ta) ta.focus();
  },

  _clearReply() {
    this._reply = null;
    const bar = this._sheet && this._sheet.querySelector('#ch-reply');
    if (bar) bar.remove();
  },

  /* بياخد هدف الرد لو من نفس النطاق ويصفّي الشريط — بيتنادى وقت الإرسال. */
  _takeReply(scope) {
    const r = this._reply;
    if (r && r.scope === scope) { this._clearReply(); return r; }
    return null;
  },

  /* التمرير لرسالة أصلية عند الضغط على الاقتباس + وميض بسيط. */
  _scrollToMsg(id) {
    if (!this._sheet || id == null) return;
    const el = this._sheet.querySelector(`.ch-bubble[data-mid="${id}"]`);
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
    el.style.transition = 'background-color .3s';
    const prev = el.style.backgroundColor;
    el.style.backgroundColor = 'rgba(74,144,217,.25)';
    setTimeout(() => { el.style.backgroundColor = prev; }, 700);
  },

  _mediaEl(m) {
    const wrap = document.createElement('div');
    wrap.className = 'ch-media';
    const src = 'data:' + (m.mime || (m.kind === 'video' ? 'video/mp4' : 'image/jpeg')) + ';base64,' + (m.audio || '');
    if (m.kind === 'video') {
      const v = document.createElement('video');
      v.className = 'ch-media__video';
      v.src = src; v.controls = true; v.preload = 'metadata'; v.playsInline = true;
      wrap.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.className = 'ch-media__img'; img.alt = 'صورة'; img.loading = 'lazy';
      img.src = src;
      img.onclick = () => { try { this._openMediaViewer(src); } catch (e) {} };
      wrap.appendChild(img);
    }
    return wrap;
  },

  /* عارض صورة بملء الشاشة (اضغط في أي مكان للإغلاق). */
  _openMediaViewer(src) {
    const ov = document.createElement('div');
    ov.className = 'ch-media-viewer';
    const img = document.createElement('img');
    img.src = src; img.alt = '';
    ov.appendChild(img);
    ov.onclick = () => { try { window.amkhUI && window.amkhUI.sfx && window.amkhUI.sfx(); } catch (e) {} ov.remove(); };
    document.body.appendChild(ov);
  },

  /* عنصر رسالة صوتية: زر تشغيل + شريط تقدّم + مدة. الصوت (base64) مخزّن
     كخاصية JS على العنصر مش attribute عشان مايتخزنش نص ضخم في الـDOM. */
  _voiceEl(m, scope) {
    const wrap = document.createElement('div');
    wrap.className = 'ch-voice';
    wrap._voice = { audio: m.audio, duration: m.duration || 0, mime: m.mime || '', mid: m.id, scope: scope || (this._openGroup != null ? 'grp' : 'dm'), mine: !!m.mine };
    const btn = document.createElement('button');
    btn.className = 'ch-voice__play';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'تشغيل');
    btn.innerHTML = this.ICONS.play;
    const bar = document.createElement('div');
    bar.className = 'ch-voice__bar v-bar';
    bar.style.setProperty('--prog', '0%');
    const dur = document.createElement('span');
    dur.className = 'ch-voice__dur';
    const d = m.duration || 0;
    dur.textContent = Math.floor(d / 60) + ':' + String(d % 60).padStart(2, '0');
    btn.onclick = () => { try { window.amkhUI && window.amkhUI.sfx && window.amkhUI.sfx(); } catch (e) {} this._toggleVoice(wrap, btn, bar); };
    wrap.appendChild(btn); wrap.appendChild(bar); wrap.appendChild(dur);
    return wrap;
  },

  _ensureAudioCtx() {
    try {
      if (!this._actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; this._actx = new C(); }
      if (this._actx.state === 'suspended') this._actx.resume().catch(() => {});
      return this._actx;
    } catch (e) { return null; }
  },

  /* تشغيل/إيقاف رسالة صوتية عبر Web Audio API (يفكّ webm/opus في كل
     المنصّات). إعادة الضغط توقف التشغيل الحالي. */
  _toggleVoice(wrap, btn, bar) {
    // نفس الرسالة شغّالة (أو بيتفكّ ترميزها دلوقتي)؟ الضغطة توقفها فورًا.
    if (this._vWrap === wrap && (this._vSource || this._vPending)) { this._stopVoicePlay(); return; }
    this._stopVoicePlay();
    const info = wrap._voice || {};
    if (!info.audio) { window.amkhUI.notify('التسجيل غير متاح', 'تنبيه', '◈'); return; }
    const ctx = this._ensureAudioCtx();
    if (!ctx) { window.amkhUI.notify('جهازك لا يدعم تشغيل الصوت', 'تنبيه', '◈'); return; }
    let buf;
    try { buf = this._base64ToArrayBuffer(info.audio); } catch (e) { window.amkhUI.notify('تعذّر قراءة التسجيل', 'تنبيه', '◈'); return; }
    // توكن يميّز محاولة التشغيل دي؛ أي إيقاف/تبديل بيزوّده فيلغي أي فكّ ترميز جارٍ.
    const tok = ++this._vTok;
    this._vPending = true; this._vWrap = wrap; this._vBtn = btn; this._vBar = bar;
    btn.innerHTML = this.ICONS.pause;   // إحساس فوري بالضغط أثناء فكّ الترميز
    let started = false;
    const fail = () => {
      if (tok !== this._vTok) return;   // اتلغت المحاولة دي خلاص
      this._stopVoicePlay();
      window.amkhUI.notify('لا يمكن تشغيل هذا الملف الصوتي', 'تنبيه', '◈');
    };
    const onDecoded = (audioBuf) => {
      // decodeAudioData ممكن ينادي الكولباك ويرجّع Promise مع بعض → لازم يتنفّذ
      // مرة واحدة بس، وميتنفّذش لو المحاولة اتلغت (توقّف/تبديل) أثناء الترميز.
      if (started || tok !== this._vTok) return;
      started = true; this._vPending = false;
      try { this._reportPlayed(wrap._voice); } catch (e) {}
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      this._vSource = src; this._vWrap = wrap; this._vBar = bar; this._vBtn = btn;
      const dur = info.duration > 0 ? info.duration : (audioBuf.duration || 0);
      const startAt = ctx.currentTime;
      btn.innerHTML = this.ICONS.pause;
      const tick = () => {
        if (this._vSource !== src) return;
        const elapsed = ctx.currentTime - startAt;
        if (dur > 0) bar.style.setProperty('--prog', Math.max(0, Math.min(100, (elapsed / dur) * 100)) + '%');
        this._vRaf = requestAnimationFrame(tick);
      };
      src.onended = () => { if (this._vSource === src) this._stopVoicePlay(); };
      try { src.start(0); } catch (e) { this._stopVoicePlay(); return; }
      this._vRaf = requestAnimationFrame(tick);
    };
    try {
      const p = ctx.decodeAudioData(buf, onDecoded, fail);
      if (p && typeof p.then === 'function') p.then(onDecoded).catch(fail);
    } catch (e) { fail(); }
  },

  _stopVoicePlay() {
    this._vTok = (this._vTok || 0) + 1;   // يبطل أي فكّ ترميز جارٍ فمايشتغلش بعد الإيقاف
    this._vPending = false;
    if (this._vRaf) { cancelAnimationFrame(this._vRaf); this._vRaf = 0; }
    if (this._vSource) { try { this._vSource.onended = null; this._vSource.stop(0); } catch (e) {} this._vSource = null; }
    if (this._vBar) { this._vBar.style.setProperty('--prog', '0%'); this._vBar = null; }
    if (this._vBtn) { this._vBtn.innerHTML = this.ICONS.play; this._vBtn = null; }
    this._vWrap = null;
  },

  _appendBubble(m, scroll) {
    const listEl = this._sheet && this._sheet.querySelector('#ch-msgs');
    if (!listEl) return;
    const empty = listEl.querySelector('.ch-empty');
    if (empty) empty.remove();
    listEl.appendChild(this._bubbleEl(m));
    if (scroll !== false) this._scrollBottom();
  },

  _scrollBottom() {
    const scroll = this._sheet && this._sheet.querySelector('#ch-scroll');
    if (scroll) requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
  },

  /* ── تثبيت موضع القراءة عند تغيّر ارتفاع منطقة الرسائل (#4د) ──
     فتح الكيبورد يقصّ ارتفاع #ch-scroll بمقدار الكيبورد كاملًا (٣٣٦px على
     التابلت ≈ أربع رسائل)، والمتصفح يحافظ على scrollTop لا على المسافة من
     القاع — فالمحادثة كانت تنزلق إلى أعلى بمقدار الكيبورد لحظة الكتابة،
     فيرى المستخدم وسط المحادثة بدل الرسالة التي يردّ عليها، ثم تنزلق مرّةً
     أخرى عند إغلاق الكيبورد. القياس أثبته على كل مقاس: الفرق = ارتفاع
     الكيبورد بالضبط. الحلّ: نحفظ المسافة من القاع مع كل تمرير ونستعيدها
     بعد أي تغيّر في الارتفاع — عند آخر رسالة تبقى عندها، وفي منتصف
     الأرشيف تبقى في موضعك. ينفع كذلك لشريط الردّ والتثبيت وتدوير الجهاز. */
  _anchorScroll(el) {
    if (!el || el._anchored) return;
    el._anchored = true;
    let dist = 0, fixing = false, lastH = el.clientHeight;
    /* لا نقرأ المسافة إلا والارتفاع مستقرّ: تغيّر الارتفاع نفسه قد يقصّ
       scrollTop ويُطلق حدث تمرير قبل أن نصحّح، فتُقرأ مسافة ملوّثة. */
    const read = () => { if (!fixing && el.clientHeight === lastH) dist = Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight); };
    el.addEventListener('scroll', read, { passive: true });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (el.clientHeight === lastH) return;
      lastH = el.clientHeight;
      fixing = true;
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - dist);
      requestAnimationFrame(() => { fixing = false; });
    });
    ro.observe(el);
    el._anchorRO = ro;
  },

  _showTypingRow() { const t = this._sheet && this._sheet.querySelector('#ch-typing'); if (t) { t.hidden = false; this._scrollBottom(); } },
  _clearTypingRow() { const t = this._sheet && this._sheet.querySelector('#ch-typing'); if (t) t.hidden = true; },

  /* ── صندوق الوارد: كل المحادثات اللي فيها رسايل ── */
  async showInbox() {
    if (!window.amkhAuth || !window.amkhAuth.token) {
      window.amkhUI.notify('سجّل دخولك أولًا لعرض رسائلك', 'محتاج حساب', '◈');
      if (window.amkhAuth) window.amkhAuth.showLoginModal();
      return;
    }
    const U = window.amkhUI;
    const overlay = U.mount('amkh-chat-modal', `
      <div class="ds-sheet ch-inbox" id="amkh-chat-panel">
        <div class="ch-inbox__head">
          <button class="ch-back" data-close aria-label="رجوع">›</button>
          <h2 class="ch-inbox__title">الرسائل</h2>
          <button class="ch-inbox__new" id="ch-new-group" aria-label="حفلة شطرنجية جديدة">＋</button>
        </div>
        <div class="ch-inbox__list" id="ch-inbox-list">
          <p class="ch-empty">جارِ التحميل…</p>
        </div>
      </div>`, { sheet: true, sfx: 'default', onDismiss: () => { try { this._stopVoicePlay(); } catch (e) {} this._openWith = null; this._openGroup = null; this._sheet = null; } });

    overlay.dataset.view = 'inbox';
    this._sheet = overlay;
    this._openWith = null;

    const newBtn = overlay.querySelector('#ch-new-group');
    if (newBtn) newBtn.onclick = () => { U.sfx(); this.createGroupFlow(); };

    /* #8 — اللقطة المحفوظة تُرسم فورًا (بلا شبكة، وتعمل أوفلاين)، وبعدها
       كل نصف من الشبكة يرسم بمفرده أول ما يوصل بدل انتظار الأبطأ. */
    let dm = null, grp = null;
    try {
      const snap = await this._inboxSnapGet();
      if (snap && this._sheet === overlay && (snap.dm.length || snap.grp.length)) {
        dm = snap.dm; grp = snap.grp;
        this._paintInbox(overlay, dm, grp, true);
      }
    } catch (e) {}
    const paint = () => { if (this._sheet === overlay) this._paintInbox(overlay, dm, grp, false); };
    await Promise.all([
      this._get('/conversations').then(d => { if (Array.isArray(d)) { dm = d; paint(); } }),
      this._gget('/').then(g => { if (Array.isArray(g)) { grp = g; paint(); } }),
    ]);
    if (dm || grp) this._inboxSnapPut(dm, grp);
    else if (this._sheet === overlay) this._paintInbox(overlay, null, null, false);
  },

  /* يرسم صندوق الرسائل من أي مصدر (لقطة محفوظة أو شبكة). fromCache بيمنع
     رسالة «لا توجد رسائل» على لقطة فاضية عشان مانكدبش قبل وصول الشبكة. */
  _paintInbox(overlay, dmRows, grpRows, fromCache) {
    const listEl = overlay && overlay.querySelector('#ch-inbox-list');
    if (!listEl) return;
    const data = dmRows, groups = grpRows;
    if (!Array.isArray(data) && !Array.isArray(groups)) {
      /* مفيش شبكة ومفيش لقطة — نقول الحقيقة بدل «لا توجد رسائل بعد» */
      if (!fromCache && !listEl.querySelector('.ch-inbox__row')) {
        listEl.innerHTML = '';
        const e = document.createElement('p');
        e.className = 'ch-empty';
        e.textContent = 'لا يوجد اتصال بالخادم — ستظهر محادثاتك المحفوظة هنا، وأي رسالة تكتبها ستُرسل أول ما يعود الاتصال.';
        listEl.appendChild(e);
      }
      return;
    }
    /* دمج المحادثات الفردية والحفلات وترتيبها: المثبّت أولًا ثم الأحدث زمنًا.
       #5 — الترتيب القديم كان بـ last_id، والرسائل الفردية والجماعية من
       جدولين لكلٍّ تسلسله المستقل، فالمقارنة بين رقمين من تسلسلين مختلفين
       بلا معنى: حفلة قديمة كانت تسبق محادثة وصلت الآن. الوقت هو المعيار
       الصحيح الوحيد، والسيرفر بقى يرتّب بنفس القاعدة. */
    const items = [];
    this._pins = { dm: {}, grp: {} };
    /* الحضور معلوم فقط لو فيه سوكت مفتوح. من اللقطة المحفوظة ومفيش سوكت =
       معلومة قديمة، فمانرسمش نقطة «متصل» على واحد ممكن يكون خرج. */
    const presenceLive = !!this._socket();
    (Array.isArray(data) ? data : []).forEach(r => {
      const f = r.friend || {};
      const prev = this._friendMeta[f.id] || {};
      const on = fromCache ? (presenceLive && !!prev.online) : f.online;
      this._friendMeta[f.id] = {
        name: f.display_name || f.username || 'صديق',
        avatar_url: f.avatar_url || null,
        /* من اللقطة المحفوظة مافيش حضور — نسيب اللي عندنا من الحضور الحقيقي */
        status: fromCache ? (presenceLive ? prev.status : null) : f.status,
        online: fromCache ? on : f.online,
        last_seen_at: fromCache ? prev.last_seen_at : f.last_seen_at,
      };
      if (fromCache) { f.online = on; f.status = this._friendMeta[f.id].status; }
      if (typeof r.unread === 'number') this._unread[f.id] = r.unread;
      if (typeof r.mentions === 'number') this._dmentions[f.id] = r.mentions;
      if (r.pinned) this._pins.dm[f.id] = true;
      items.push({ type: 'friend', data: r, at: Date.parse(r.last_at) || 0, pinned: r.pinned ? 1 : 0 });
    });
    (Array.isArray(groups) ? groups : []).forEach(g => {
      const gp = this._gmeta[g.id] || {};
      this._gmeta[g.id] = {
        name: g.name, members_count: g.members_count, owner_id: g.owner_id,
        avatar_url: (g.avatar_url != null ? g.avatar_url : gp.avatar_url) || null,
        send_policy: (g.send_policy != null ? g.send_policy : gp.send_policy) || 'all',
        my_role: g.my_role || gp.my_role || 'member',
      };
      if (typeof g.unread === 'number') this._gunread[g.id] = g.unread;
      if (typeof g.mentions === 'number') this._gmentions[g.id] = g.mentions;
      if (g.pinned) this._pins.grp[g.id] = true;
      items.push({ type: 'group', data: g, at: Date.parse(g.last_at) || 0, pinned: g.pinned ? 1 : 0 });
    });

    if (!items.length) {
      if (fromCache) return;                 /* لقطة فاضية: نسيب «جارِ التحميل…» */
      listEl.innerHTML = '';
      const e = document.createElement('p');
      e.className = 'ch-empty';
      e.textContent = 'لا توجد رسائل بعد — افتح محادثة مع صديقك، أو أنشئ حفلة شطرنجية جديدة من زرّ ＋.';
      listEl.appendChild(e);
      this._updateBadge();
      return;
    }
    listEl.innerHTML = '';
    items.sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at));
    items.forEach(it => {
      listEl.appendChild(it.type === 'group' ? this._groupInboxRow(it.data) : this._inboxRow(it.data));
    });
    this._updateBadge();
  },

  _groupInboxRow(g) {
    const row = document.createElement('button');
    row.className = 'ch-inbox__row ch-inbox__row--group';
    row.dataset.gid = String(g.id);
    const av = document.createElement('span');
    av.className = 'ch-inbox__av ch-inbox__av--group'; av.setAttribute('aria-hidden', 'true');
    this._paintGroupAvatar(av, g);
    row.appendChild(av);
    const mid = document.createElement('div');
    mid.className = 'ch-inbox__mid';
    const name = document.createElement('span');
    name.className = 'ch-inbox__name'; name.textContent = g.name;
    const prev = document.createElement('span');
    prev.className = 'ch-inbox__prev';
    const who = g.last_sender ? (g.last_from_me ? 'أنت: ' : g.last_sender + ': ') : '';
    prev.textContent = g.last_message ? (who + g.last_message) : (g.members_count + ' أعضاء');
    mid.appendChild(name); mid.appendChild(prev);
    row.appendChild(mid);
    const end = document.createElement('div');
    end.className = 'ch-inbox__end';
    const time = document.createElement('span');
    time.className = 'ch-inbox__time'; time.textContent = this._time(g.last_at);
    end.appendChild(time);
    row.appendChild(end);
    this._paintRowEnd(row, 'grp', g.id);
    row.onclick = () => {
      if (row._lpFired && row._lpFired()) return;   /* لمسة مطوّلة فتحت القائمة */
      if (window.amkhUI) window.amkhUI.sfx();
      this.openGroup({ id: g.id, name: g.name, members_count: g.members_count, owner_id: g.owner_id, avatar_url: g.avatar_url || null, send_policy: g.send_policy, my_role: g.my_role });
    };
    this._bindConvActions(row, 'grp', g.id, g.name, g);
    return row;
  },

  /* ── إنشاء جروب: اختيار أصدقاء + اسم ── */
  async createGroupFlow() {
    const U = window.amkhUI;
    let friends = [];
    if (window.amkhFriends) {
      try {
        if (typeof window.amkhFriends.loadFriends === 'function') friends = await window.amkhFriends.loadFriends();
        if ((!friends || !friends.length) && Array.isArray(window.amkhFriends._friends)) friends = window.amkhFriends._friends;
      } catch (e) { if (Array.isArray(window.amkhFriends._friends)) friends = window.amkhFriends._friends; }
    }
    if (!Array.isArray(friends)) friends = [];
    const online = friends.filter(f => f && f.id);
    const rows = online.map(f => `
      <label class="grp-pick">
        <span class="grp-pick__av" data-pav="${f.id}"></span>
        <span class="grp-pick__name" data-pname="${f.id}"></span>
        <input type="checkbox" class="grp-pick__cb" value="${f.id}">
      </label>`).join('');
    const overlay = U.mount('amkh-grp-create', `
      <div class="ds-sheet grp-sheet">
        <div class="ch-inbox__head"><button class="ch-back" data-close>›</button><h2 class="ch-inbox__title">حفلة شطرنجية جديدة</h2></div>
        <div class="grp-create__body">
          <input type="text" id="grp-name" class="ds-input" maxlength="60" placeholder="اسم الحفلة" autocomplete="off">
          <p class="grp-create__hint">${online.length ? 'اختر الأصدقاء (اختياري):' : 'ممكن تعمل حفلة لنفسك وتضيف أصدقاء بعدين.'}</p>
          <div class="grp-pick__list">${rows}</div>
        </div>
        <div class="grp-sheet__foot"><button class="ds-btn ds-btn--primary" id="grp-create-btn">إنشاء الحفلة</button></div>
      </div>`, { sheet: true, sfx: 'groupNew' });
    online.forEach(f => {
      const av = overlay.querySelector(`[data-pav="${f.id}"]`);
      if (av) this._paintAvatar(av, { name: f.display_name || f.username, avatar_url: f.avatar_url });
      const nm = overlay.querySelector(`[data-pname="${f.id}"]`);
      if (nm) nm.textContent = f.display_name || f.username;
    });
    const createBtn = overlay.querySelector('#grp-create-btn');
    if (createBtn) createBtn.onclick = async () => {
      U.sfx();
      const name = (overlay.querySelector('#grp-name').value || '').trim();
      const members = [...overlay.querySelectorAll('.grp-pick__cb:checked')].map(cb => Number(cb.value));
      if (!name) { U.notify('اكتب اسم للحفلة', 'تنبيه', '◈'); return; }
      createBtn.disabled = true;
      const r = await this._gpost('/', { name, members });
      createBtn.disabled = false;
      if (r && r.id) {
        this._gmeta[r.id] = { name: r.name, members_count: r.members_count, owner_id: r.owner_id };
        try { overlay.querySelector('[data-close]').click(); } catch (e) {}
        this.openGroup({ id: r.id, name: r.name, members_count: r.members_count, owner_id: r.owner_id });
      } else U.notify((r && r.error) || 'تعذّر إنشاء الحفلة', 'تنبيه', '◈');
    };
  },

  _inboxRow(r) {
    const f = r.friend || {};
    const meta = this._friendMeta[f.id];
    const row = document.createElement('button');
    row.className = 'ch-inbox__row';
    row.dataset.fid = String(f.id);

    const av = document.createElement('span');
    av.className = 'ch-inbox__av'; av.setAttribute('aria-hidden', 'true');
    this._paintAvatar(av, meta);
    if (f.online) av.classList.add('is-online');
    row.appendChild(av);

    const mid = document.createElement('div');
    mid.className = 'ch-inbox__mid';
    const name = document.createElement('span');
    name.className = 'ch-inbox__name';
    name.textContent = meta.name;
    const prev = document.createElement('span');
    prev.className = 'ch-inbox__prev';
    prev.textContent = (r.last_from_me ? 'أنت: ' : '') + (r.last_message || '');
    mid.appendChild(name); mid.appendChild(prev);
    row.appendChild(mid);

    const end = document.createElement('div');
    end.className = 'ch-inbox__end';
    const time = document.createElement('span');
    time.className = 'ch-inbox__time';
    time.textContent = this._time(r.last_at);
    end.appendChild(time);
    row.appendChild(end);
    this._paintRowEnd(row, 'dm', f.id);

    row.onclick = () => {
      if (row._lpFired && row._lpFired()) return;   /* لمسة مطوّلة فتحت القائمة */
      if (window.amkhUI) window.amkhUI.sfx();
      this.openChat({ id: f.id, display_name: meta.name, username: f.username, avatar_url: meta.avatar_url, status: f.status, online: f.online, last_seen_at: f.last_seen_at });
    };
    this._bindConvActions(row, 'dm', f.id, meta.name, meta);
    return row;
  },

  /* ══ علامات صفّ الوارد: مثبّتة + منشن + عدّاد غير المقروء (#1/#2/#4) ══
     مبنيّة في مكان واحد عشان الرسم الأول والتحديث اللحظي مايختلفوش. */
  _paintRowEnd(row, kind, id) {
    if (!row) return;
    const end = row.querySelector('.ch-inbox__end');
    if (!end) return;
    const grp = kind === 'grp';
    const unread = (grp ? this._gunread[id] : this._unread[id]) || 0;
    const mentions = (grp ? this._gmentions[id] : this._dmentions[id]) || 0;
    const pinned = !!(grp ? this._pins.grp[id] : this._pins.dm[id]);
    row.classList.toggle('is-pinned', pinned);
    let marks = end.querySelector('.ch-inbox__marks');
    if (!marks) {
      marks = document.createElement('span');
      marks.className = 'ch-inbox__marks';
      end.appendChild(marks);
    }
    marks.innerHTML = '';
    if (pinned) {
      const p = document.createElement('span');
      p.className = 'ch-inbox__pin';
      p.innerHTML = this.ICONS.pin;
      p.setAttribute('aria-label', 'محادثة مثبّتة');
      marks.appendChild(p);
    }
    if (mentions > 0 && unread > 0) {
      const at = document.createElement('span');
      at.className = 'ch-inbox__at';
      at.innerHTML = this.ICONS.at;
      at.setAttribute('aria-label', 'ذكرك في رسالة');
      marks.appendChild(at);
    }
    if (unread > 0) {
      const badge = document.createElement('span');
      badge.className = 'ch-inbox__badge';
      badge.textContent = unread > 99 ? '99+' : String(unread);
      marks.appendChild(badge);
    }
  },

  /* #5 — صفّ المحادثة يقفز لأعلى القائمة أول ما توصل رسالة والوارد مفتوح،
     مع تحديث معاينته ووقته. المثبّت بيفضل فوق دايمًا. */
  _bumpInboxRow(kind, id, preview, at) {
    if (!this._sheet || this._sheet.dataset.view !== 'inbox') return;
    const listEl = this._sheet.querySelector('#ch-inbox-list');
    if (!listEl) return;
    const row = listEl.querySelector(kind === 'grp'
      ? `.ch-inbox__row[data-gid="${id}"]` : `.ch-inbox__row[data-fid="${id}"]`);
    if (!row) return;                    /* محادثة جديدة — تظهر عند إعادة فتح الوارد */
    const prev = row.querySelector('.ch-inbox__prev');
    if (prev && preview != null) prev.textContent = preview;
    const time = row.querySelector('.ch-inbox__time');
    if (time) time.textContent = this._time(at || new Date().toISOString());
    if (row.classList.contains('is-pinned')) {
      if (listEl.firstChild !== row) listEl.insertBefore(row, listEl.firstChild);
    } else {
      const firstFree = Array.from(listEl.querySelectorAll('.ch-inbox__row'))
        .find(r => !r.classList.contains('is-pinned'));
      if (firstFree && firstFree !== row) listEl.insertBefore(row, firstFree);
    }
    this._paintRowEnd(row, kind, id);
  },

  /* لمسة مطوّلة على صفّ المحادثة تفتح قائمة التثبيت (#4). الصفّ زرّ، فلازم
     نمنع الـclick اللي بيجي بعد اللمسة المطوّلة عشان المحادثة ماتفتحش وراها. */
  _bindConvActions(row, kind, id, name, meta) {
    let timer = null, fired = false, sx = 0, sy = 0;
    const open = () => { fired = true; this._openConvMenu(kind, id, name, meta); };
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    row.addEventListener('mousedown', () => { fired = false; });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); open(); });
    row.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; fired = false;
      timer = setTimeout(() => {
        timer = null;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) {}
        open();
      }, 480);
    }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) cancel();
    }, { passive: true });
    row.addEventListener('touchend', cancel, { passive: true });
    row.addEventListener('touchcancel', cancel, { passive: true });
    row._lpFired = () => fired;
  },

  /* قائمة إجراءات صفّ المحادثة (#4) — بنفس هيئة ورقة إجراءات الرسالة (#11)
     عشان اللمستين المطوّلتين في التطبيق تديّا نفس الإحساس. */
  _openConvMenu(kind, id, name, meta) {
    const U = window.amkhUI;
    if (!U) return;
    const pinned = !!(kind === 'grp' ? this._pins.grp[id] : this._pins.dm[id]);
    const overlay = U.mount('amkh-conv-act', `
      <div class="ds-sheet msg-act" id="conv-act-p">
        <div class="ds-sheet__handle"></div>
        <div class="msg-act__hero">
          <span class="msg-act__hero-av" id="conv-act-av"></span>
          <span class="msg-act__hero-nm"></span>
        </div>
        <div class="ds-sheet__body msg-act__rows">
          <button class="msg-act__row${pinned ? ' msg-act__row--warn' : ''}" data-do="pin">
            <span class="msg-act__ic">${this.ICONS.pin}</span>
            <span class="msg-act__lb">${pinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}<small>${pinned ? 'تعود إلى ترتيبها الطبيعي' : 'تبقى أعلى صندوق الرسائل'}</small></span>
          </button>
        </div>
      </div>`, { sheet: true, sfx: 'pin' });
    try { window.DSOverlay && window.DSOverlay.makeSheetDraggable('amkh-conv-act', 'conv-act-p', () => overlay._dismiss()); } catch (e) {}
    const av = overlay.querySelector('#conv-act-av');
    if (av) {
      if (kind === 'grp') { av.classList.add('ch-conv__av--group'); this._paintGroupAvatar(av, Object.assign({ name }, meta || {})); }
      else this._paintAvatar(av, meta || { name });
    }
    const nmEl = overlay.querySelector('.msg-act__hero-nm');
    if (nmEl) nmEl.textContent = name || 'محادثة';
    overlay.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      U.sfx();
      const act = b.dataset.do;
      try { overlay._dismiss(); } catch (e) {}
      if (act === 'pin') this._toggleChatPin(kind, id);
    });
  },

  /* التثبيت تبديلي على السيرفر (نفس النداء يثبّت ويفكّ) وبسقف 5 محادثات. */
  async _toggleChatPin(kind, id) {
    const U = window.amkhUI;
    const res = await this._post('/pin-chat', { kind: kind === 'grp' ? 'grp' : 'dm', target_id: id });
    if (!res || res.error) {
      if (U) U.notify((res && res.error) || 'لا يوجد اتصال بالخادم حاليًا.', 'لم يتم', '◈');
      return;
    }
    const store = kind === 'grp' ? this._pins.grp : this._pins.dm;
    if (res.pinned) store[id] = true; else delete store[id];
    if (U) U.notify(res.pinned ? 'ثُبّتت المحادثة في أعلى القائمة' : 'أُلغي تثبيت المحادثة', res.pinned ? 'مثبّتة' : 'أُلغي', '◉');
    if (this._sheet && this._sheet.dataset.view === 'inbox') this.showInbox();
  },

  /* تحديث علامات صندوق الوارد لو مفتوح — للفردي والحفلات (#1: الحفلات كانت
     بتفقد شارتها لأن التحديث كان بيقرأ dataset.fid بس فيطلع NaN للحفلة). */
  _renderInboxBadges() {
    if (!this._sheet || this._sheet.dataset.view !== 'inbox') return;
    this._sheet.querySelectorAll('.ch-inbox__row').forEach(row => {
      if (row.dataset.gid != null && row.dataset.gid !== '') this._paintRowEnd(row, 'grp', Number(row.dataset.gid));
      else if (row.dataset.fid != null && row.dataset.fid !== '') this._paintRowEnd(row, 'dm', Number(row.dataset.fid));
    });
  },

  /* ══════════════════════════════════════════════════════════════════
     جروبات الأصدقاء (شات جماعي)
     كل رسالة من غيري بتظهر باسم صاحبها وصورته (زي واتساب).
  ══════════════════════════════════════════════════════════════════ */
  async _gget(path) {
    const headers = await this._getAuthHeader();
    if (!headers) return null;
    try {
      const res = await fetch(`${window.getApiBase()}/groups${path}`, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  },
  async _gpost(path, body) {
    const headers = await this._getAuthHeader();
    if (!headers) return null;
    try {
      const res = await fetch(`${window.getApiBase()}/groups${path}`, {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => null);
      return res.ok ? (data || { ok: true }) : { error: (data && data.error) || 'خطأ' };
    } catch (e) { return { error: 'اتصال' }; }
  },
  async _gdel(path) {
    const headers = await this._getAuthHeader();
    if (!headers) return null;
    try {
      const res = await fetch(`${window.getApiBase()}/groups${path}`, { method: 'DELETE', headers });
      const data = await res.json().catch(() => null);
      return res.ok ? (data || { ok: true }) : { error: (data && data.error) || 'خطأ' };
    } catch (e) { return { error: 'اتصال' }; }
  },
  _gunreadTotal() { return Object.values(this._gunread).reduce((s, n) => s + (n || 0), 0); },

  /* ── استقبال رسالة جروب ── */
  _onGroupMessage(d) {
    const me = this._me();
    const gid = d.group_id;
    const mine = d.from === me;
    if (mine && d.client_id) {
      const arr = this._gmsgs[gid] || [];
      if (arr.some(m => m.client_id === d.client_id)) return true;
    }
    /* حماية من الازدواج بمعرّف السيرفر (سوكتين/إعادة اتصال). */
    if (d.id && (this._gmsgs[gid] || []).some(m => m.id === d.id)) return true;
    const msg = {
      id: d.id, client_id: d.client_id || null, from: d.from, mine,
      sender_name: d.sender_name || 'صديق', sender_avatar: d.sender_avatar || null,
      kind: d.kind || 'text', body: d.body, audio: d.audio || null,
      duration: d.duration || 0, mime: d.mime || '', created_at: d.created_at,
      reply_to: d.reply_to || null, reply: d.reply || null,
      mentions: Array.isArray(d.mentions) ? d.mentions : [],
    };
    (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
    this._persist('grp', gid);
    if (this._openGroup === gid) {
      this._appendGroupBubble(msg);
      this._clearTypingRow();
      this._markGroupRead(gid);
    } else if (!mine) {
      this._gunread[gid] = (this._gunread[gid] || 0) + 1;
      const mentioned = msg.mentions.some(x => Number(x) === Number(me));
      if (mentioned) this._gmentions[gid] = (this._gmentions[gid] || 0) + 1;
      this._updateBadge();
      const gname = (this._gmeta[gid] && this._gmeta[gid].name) || 'حفلة شطرنجية';
      try { if (window.SFX) window.SFX.chat(); } catch (e) {}
      this._incomingAlert({
        kind: 'grp', id: gid, name: gname,
        avatar: (this._gmeta[gid] && this._gmeta[gid].avatar_url) || null,
        preview: msg.sender_name + (mentioned ? ' ذكرك: ' : ': ') + this._previewOf(d),
      });
    }
    /* #1/#5 — شارة الحفلة وترتيبها في الوارد بيتحدّثوا لحظيًا */
    this._bumpInboxRow('grp', gid, (mine ? 'أنت: ' : msg.sender_name + ': ') + this._previewOf(d), d.created_at);
    return true;
  },

  _onGroupSent(d) {
    const arr = this._gmsgs[d.group_id] || [];
    const m = arr.find(x => x.client_id === d.client_id);
    if (m) { m.id = d.id; m.pending = false; m.queued = false; m.created_at = d.created_at || m.created_at; }
    if (d.client_id) this._dequeueOut(d.client_id);   /* وصلت فعلًا → تشيل من الطابور (#8) */
    this._persist('grp', d.group_id);
    if (this._openGroup === d.group_id) {
      const el = this._sheet && this._sheet.querySelector(`[data-cid="${d.client_id}"]`);
      if (el) {
        el.classList.remove('is-pending');
        el.dataset.mid = String(d.id);
        const tick = el.querySelector('.ch-tick');
        if (tick) { tick.classList.remove('is-pending'); tick.textContent = '✓'; }
      }
      /* لقطة الإيصالات ممكن تكون وصلت قبل ما اترجّع الـid — طبّقها دلوقتي */
      this._applyGroupReceipts(d.group_id);
    }
    return true;
  },

  /* لقطة إيصالات الحفلة: بنخزّنها ونعيد رسم العلامات + صور القراء لو مفتوحة. */
  _onGroupReceipts(d) {
    if (!d || d.group_id == null || !Array.isArray(d.reads)) return true;
    this._setGroupReads(d.group_id, d.reads);
    if (this._openGroup === d.group_id) this._applyGroupReceipts(d.group_id);
    return true;
  },

  _setGroupReads(gid, reads) {
    const map = {};
    reads.forEach(r => { map[r.user_id] = { read: r.last_read_id || 0, delivered: r.last_delivered_id || 0 }; });
    this._greads[gid] = map;
  },

  /* حساب ورسم إيصالات الحفلة (نمط واتساب/ماسنجر):
     • علامة رسايلي: ✓ لسه، ✓✓ رمادية لما توصل كل الأعضاء، ✓✓ زرقا لما
       يقروها كلهم.
     • صور القراء مكدّسة على آخر رسالة مني قراها كل عضو (نمط ماسنجر). */
  _applyGroupReceipts(gid) {
    if (this._openGroup !== gid || !this._sheet) return;
    const reads = this._greads[gid] || {};
    const members = this._gmembers[gid] || {};
    const me = this._me();
    const others = Object.keys(reads).map(Number).filter(id => id !== me);
    const total = others.length;
    const arr = this._gmsgs[gid] || [];

    /* 1) علامات الإرسال على رسايلي */
    arr.forEach(m => {
      if (!m.mine || m.id == null || m.pending) return;
      const bubble = this._sheet.querySelector(`.ch-bubble[data-mid="${m.id}"]`);
      if (!bubble) return;
      const tick = bubble.querySelector('.ch-tick');
      if (!tick) return;
      let dc = 0, rc = 0;
      others.forEach(uid => { const r = reads[uid] || {}; if ((r.delivered || 0) >= m.id) dc++; if ((r.read || 0) >= m.id) rc++; });
      tick.classList.remove('is-delivered', 'is-read');
      if (total > 0 && rc >= total) { tick.textContent = '✓✓'; tick.classList.add('is-read'); }
      else if (total > 0 && dc >= total) { tick.textContent = '✓✓'; tick.classList.add('is-delivered'); }
      else tick.textContent = '✓';
    });

    /* 2) صور القراء: لكل عضو، أكبر رسالة مني قراها → نكدّس صورته عليها */
    this._sheet.querySelectorAll('.ch-seen-ava').forEach(e => e.remove());
    const myIds = arr.filter(m => m.mine && m.id != null).map(m => m.id).sort((a, b) => a - b);
    const byMsg = {};   /* msgId → [uid,...] */
    others.forEach(uid => {
      const rid = (reads[uid] || {}).read || 0;
      if (rid <= 0) return;
      let target = 0;
      for (const id of myIds) { if (id <= rid) target = id; else break; }
      if (target > 0) (byMsg[target] = byMsg[target] || []).push(uid);
    });
    Object.keys(byMsg).forEach(mid => {
      const bubble = this._sheet.querySelector(`.ch-bubble[data-mid="${mid}"]`);
      if (!bubble) return;
      const meta = bubble.querySelector('.ch-bubble__meta');
      if (!meta) return;
      byMsg[mid].forEach(uid => {
        const mm = members[uid] || {};
        const nm = mm.display_name || mm.username || '؟';
        const ava = document.createElement('span');
        ava.className = 'ch-seen-ava';
        ava.title = nm + ' شاف';
        ava.style.cssText = 'width:14px;height:14px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;line-height:1;background:var(--color-primary,#4a90d9);color:#fff;margin-inline-start:3px;vertical-align:middle;flex:0 0 auto;';
        const initial = String(nm).trim().slice(0, 1).toUpperCase();
        if (mm.avatar_url) {
          const img = document.createElement('img');
          img.alt = ''; img.loading = 'lazy';
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
          img.onerror = () => { img.remove(); ava.textContent = initial; };
          img.src = mm.avatar_url;
          ava.appendChild(img);
        } else ava.textContent = initial;
        meta.appendChild(ava);
      });
    });
  },

  _onGroupTyping(d) {
    if (this._openGroup !== d.group_id || !this._sheet) return true;
    const sub = this._sheet.querySelector('.ch-conv__sub');
    if (sub && d.name) { sub.textContent = d.name + ' بيكتب…'; sub.className = 'ch-conv__sub is-online'; }
    this._showTypingRow();
    clearTimeout(this._gtypingHide);
    this._gtypingHide = setTimeout(() => {
      this._clearTypingRow();
      if (sub && this._gmeta[d.group_id]) this._paintGroupSub(sub, this._gmeta[d.group_id]);
    }, 3500);
    return true;
  },

  /* عضو في الجروب بيسجّل رسالة صوتية */
  _onGroupRecording(d) {
    if (this._openGroup !== d.group_id || !this._sheet) return true;
    const sub = this._sheet.querySelector('.ch-conv__sub');
    if (!sub) return true;
    clearTimeout(this._grecHide);
    if (d.on) {
      sub.textContent = (d.name ? d.name + ' ' : '') + 'بيسجّل رسالة صوتية…';
      sub.className = 'ch-conv__sub is-online';
      this._grecHide = setTimeout(() => {
        if (this._gmeta[d.group_id]) this._paintGroupSub(sub, this._gmeta[d.group_id]);
      }, 8000);
    } else if (this._gmeta[d.group_id]) {
      this._paintGroupSub(sub, this._gmeta[d.group_id]);
    }
    return true;
  },

  _onGroupCreated(d) {
    /* اتحطّينا في حفلة جديدة — نحدّث الشارة، والصندوق لو مفتوح. */
    this._gunread[d.group_id] = (this._gunread[d.group_id] || 0);
    if (this._sheet && this._sheet.dataset.view === 'inbox') this.showInbox();
    return true;
  },

  _onGroupUpdated(d) {
    /* بيانات الحفلة اتغيّرت (صورة مثلًا) — حدّث الميتا والواجهات المفتوحة. */
    const gid = d.group_id;
    if (gid == null) return true;
    if (this._gmeta[gid]) {
      if ('avatar_url' in d) this._gmeta[gid].avatar_url = d.avatar_url || null;
      if (d.name) this._gmeta[gid].name = d.name;
      if ('send_policy' in d) this._gmeta[gid].send_policy = d.send_policy || 'all';
    }
    if (this._openGroup === gid && this._sheet) {
      this._paintGroupAvatar(this._sheet.querySelector('#ch-grp-av'), this._gmeta[gid] || { avatar_url: d.avatar_url || null });
      if ('send_policy' in d) this._applyChatLock(gid);
    }
    if (this._sheet && this._sheet.dataset.view === 'inbox') this.showInbox();
    return true;
  },

  _markGroupRead(gid) {
    this._gunread[gid] = 0;
    this._gmentions[gid] = 0;
    this._updateBadge();
    const ws = this._socket();
    if (ws) { try { ws.send(JSON.stringify({ type: 'group:read', group_id: gid })); } catch (e) {} }
    /* احتياطي على HTTP كمان */
    this._gpost(`/${gid}/read`, {});
  },

  sendGroupMessage(gid, body) {
    body = String(body || '').trim();
    if (!body) return;
    const clientId = 'g' + (++this._cid) + '_' + Date.now();
    const r = this._takeReply('group');
    const mentions = this._collectMentions(body, gid);        /* #2 */
    const msg = { id: null, client_id: clientId, from: this._me(), mine: true, sender_name: 'أنت', sender_avatar: null, kind: 'text', body, created_at: new Date().toISOString(), pending: true, reply_to: r ? r.id : null, reply: r ? { id: r.id, name: r.name, kind: r.kind, preview: r.preview } : null, mentions };
    (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
    if (this._openGroup === gid) this._appendGroupBubble(msg);
    this._sendOrQueue(
      { type: 'group:send', group_id: gid, body, client_id: clientId, reply_to: r ? r.id : null, mentions },
      { cid: clientId, scope: 'grp', target: gid, kind: 'text', body, mentions, reply_to: r ? r.id : null, reply: msg.reply, created_at: msg.created_at },
      msg, 'grp', gid
    );
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  sendGroupVoice(gid, audioB64, durationSec, mime) {
    const clientId = 'gv' + (++this._cid) + '_' + Date.now();
    const r = this._takeReply('group');
    const msg = { id: null, client_id: clientId, from: this._me(), mine: true, sender_name: 'أنت', sender_avatar: null, kind: 'voice', body: '', audio: audioB64, duration: durationSec, mime, created_at: new Date().toISOString(), pending: true, reply_to: r ? r.id : null, reply: r ? { id: r.id, name: r.name, kind: r.kind, preview: r.preview } : null };
    (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
    if (this._openGroup === gid) this._appendGroupBubble(msg);
    this._sendOrQueue(
      { type: 'group:send', kind: 'voice', group_id: gid, audio: audioB64, duration: durationSec, mime, client_id: clientId, reply_to: r ? r.id : null },
      { cid: clientId, scope: 'grp', target: gid, kind: 'voice', audio: audioB64, duration: durationSec, mime, reply_to: r ? r.id : null, reply: msg.reply, created_at: msg.created_at },
      msg, 'grp', gid
    );
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  sendGroupMedia(gid, b64, mime, kind) {
    const clientId = 'gm' + (++this._cid) + '_' + Date.now();
    const r = this._takeReply('group');
    const msg = { id: null, client_id: clientId, from: this._me(), mine: true, sender_name: 'أنت', sender_avatar: null, kind, body: '', audio: b64, mime, created_at: new Date().toISOString(), pending: true, reply_to: r ? r.id : null, reply: r ? { id: r.id, name: r.name, kind: r.kind, preview: r.preview } : null };
    (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
    if (this._openGroup === gid) this._appendGroupBubble(msg);
    this._sendOrQueue(
      { type: 'group:send', kind, group_id: gid, audio: b64, mime, client_id: clientId, reply_to: r ? r.id : null },
      { cid: clientId, scope: 'grp', target: gid, kind, audio: b64, mime, reply_to: r ? r.id : null, reply: msg.reply, created_at: msg.created_at },
      msg, 'grp', gid
    );
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  _typingGroup(gid) {
    const ws = this._socket();
    if (!ws) return;
    const now = Date.now();
    if (this._lastGTyping && now - this._lastGTyping < 2500) return;
    this._lastGTyping = now;
    try { ws.send(JSON.stringify({ type: 'group:typing', group_id: gid })); } catch (e) {}
  },

  /* ── فتح جروب ── */
  async openGroup(group) {
    if (!window.amkhAuth || !window.amkhAuth.token) {
      window.amkhUI.notify('سجّل دخولك الأول', 'محتاج حساب', '◈');
      if (window.amkhAuth) window.amkhAuth.showLoginModal();
      return;
    }
    const U = window.amkhUI;
    const gid = group.id;
    const _prev = this._gmeta[gid] || {};
    this._gmeta[gid] = { name: group.name || _prev.name || 'حفلة شطرنجية', members_count: group.members_count || _prev.members_count || 0, owner_id: group.owner_id || _prev.owner_id, avatar_url: (group.avatar_url != null ? group.avatar_url : _prev.avatar_url) || null, send_policy: (group.send_policy != null ? group.send_policy : _prev.send_policy) || 'all', my_role: group.my_role || _prev.my_role || 'member' };

    const overlay = U.mount('amkh-chat-modal', `
      <div class="ds-sheet ch-conv ch-conv--group" id="amkh-chat-panel">
        <div class="ch-conv__head">
          <button class="ch-back" data-close aria-label="رجوع">›</button>
          <span class="ch-conv__av ch-conv__av--group" id="ch-grp-av" aria-hidden="true"></span>
          <div class="ch-conv__id">
            <span class="ch-conv__name"></span>
            <span class="ch-conv__sub"></span>
          </div>
          <button class="ch-call" id="ch-grp-call" aria-label="مكالمة جماعية" title="مكالمة جماعية">${this.ICONS.call || ''}</button>
          <button class="ch-call" id="ch-grp-vcall" aria-label="مكالمة فيديو جماعية" title="مكالمة فيديو جماعية">${this.ICONS.video || ''}</button>
          <button class="ch-conv__info" id="ch-grp-info" aria-label="أعضاء الحفلة">⋯</button>
        </div>
        <div class="ch-scroll" id="ch-scroll">
          <div class="ch-loadmore" id="ch-loadmore" hidden><button class="ds-btn ds-btn--ghost ds-btn--sm">عرض الأقدم</button></div>
          <div class="ch-msgs" id="ch-msgs"></div>
          <div class="ch-typing" id="ch-typing" hidden><span></span><span></span><span></span></div>
        </div>
        <div class="ch-input" id="ch-input">
          <div class="ch-rec" id="ch-rec" hidden>
            <button class="ch-rec__cancel" id="ch-rec-cancel" aria-label="إلغاء">${this.ICONS.trash}</button>
            <span class="ch-rec__dot" aria-hidden="true"></span>
            <span class="ch-rec__time" id="ch-rec-time">0:00</span>
            <span class="ch-rec__hint">جارٍ التسجيل…</span>
            <button class="ds-btn ds-btn--primary ch-rec__send" id="ch-rec-send" aria-label="إرسال">${this.ICONS.send}</button>
          </div>
          <textarea id="ch-text" class="ds-input ch-text" rows="1" placeholder="اكتب رسالة…" autocomplete="off"></textarea>
          <button class="ds-btn ds-btn--ghost ch-attach" id="ch-attach" aria-label="إرفاق صورة أو فيديو">${this.ICONS.attach}</button>
          <input type="file" id="ch-file" accept="image/*,video/*" hidden>
          <button class="ds-btn ds-btn--ghost ch-mic" id="ch-mic" aria-label="تسجيل صوتي">${this.ICONS.mic}</button>
          <button class="ds-btn ds-btn--primary ch-send" id="ch-send" aria-label="إرسال" hidden>${this.ICONS.send}</button>
        </div>
      </div>`, { sheet: true, sfx: 'group', onDismiss: () => { try { this._stopVoicePlay(); } catch (e) {} if (this._recording) { try { this._stopVoiceRec(false); } catch (e) {} } this._openGroup = null; this._sheet = null; this._reply = null; } });

    overlay.dataset.view = 'group';
    this._sheet = overlay;
    this._openGroup = gid;
    this._reply = null;
    this._openWith = null;
    this._anchorScroll(overlay.querySelector('#ch-scroll'));

    overlay.querySelector('.ch-conv__name').textContent = this._gmeta[gid].name;
    this._paintGroupAvatar(overlay.querySelector('#ch-grp-av'), this._gmeta[gid]);
    this._paintGroupSub(overlay.querySelector('.ch-conv__sub'), this._gmeta[gid]);

    const gCallBtn = overlay.querySelector('#ch-grp-call');
    if (gCallBtn) gCallBtn.onclick = () => {
      U.sfx();
      const ids = Object.keys(this._gmembers[gid] || {}).map(Number).filter(Boolean);
      if (window.amkhCall) window.amkhCall.startGroupCall(gid, this._gmeta[gid].name, ids);
    };
    const gVCallBtn = overlay.querySelector('#ch-grp-vcall');
    if (gVCallBtn) gVCallBtn.onclick = () => {
      U.sfx();
      const ids = Object.keys(this._gmembers[gid] || {}).map(Number).filter(Boolean);
      if (window.amkhCall) window.amkhCall.startGroupVideoCall(gid, this._gmeta[gid].name, ids);
    };

    const ta = overlay.querySelector('#ch-text');
    const sendBtn = overlay.querySelector('#ch-send');
    const micBtn = overlay.querySelector('#ch-mic');
    const doSend = () => {
      const v = ta.value.trim();
      if (!v) return;
      this.sendGroupMessage(gid, v);
      ta.value = ''; ta.style.height = 'auto';
      if (ta._mentClose) ta._mentClose();
      this._toggleSendMic(overlay);
      ta.focus();
    };
    sendBtn.onclick = () => { U.sfx(); doSend(); };
    this._bindMentions(overlay, gid);        /* #2 — لوحة @ لأعضاء الحفلة */
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; this._toggleSendMic(overlay); this._typingGroup(gid); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
    if (micBtn) micBtn.onclick = () => { U.sfx(); this._startVoiceRec({ kind: 'group', id: gid }); };
    const gAttachBtn = overlay.querySelector('#ch-attach');
    const gFileInp = overlay.querySelector('#ch-file');
    if (gAttachBtn && gFileInp) {
      gAttachBtn.onclick = () => { U.sfx(); gFileInp.value = ''; gFileInp.click(); };
      gFileInp.onchange = () => { const f = gFileInp.files && gFileInp.files[0]; if (f) this._pickMedia(f, { kind: 'group', id: gid }); };
    }
    const recSend = overlay.querySelector('#ch-rec-send');
    const recCancel = overlay.querySelector('#ch-rec-cancel');
    if (recSend) recSend.onclick = () => { U.sfx(); this._stopVoiceRec(true); };
    if (recCancel) recCancel.onclick = () => { U.sfx(); this._stopVoiceRec(false); };
    const infoBtn = overlay.querySelector('#ch-grp-info');
    if (infoBtn) infoBtn.onclick = () => { U.sfx(); this._showGroupMembers(gid); };
    overlay.querySelector('#ch-loadmore button').onclick = () => { U.sfx(); this._loadGroupHistory(gid, true); };

    /* اعرض الكاش المحلي فورًا (#133) — ودمج بدل تخطّي (#8). */
    try {
      await this._restoreOutbox();
      const cached = await this._cacheGet('grp', gid);
      if (cached && cached.length && this._openGroup === gid) {
        const live = this._gmsgs[gid] || [];
        this._gmsgs[gid] = live.length ? this._mergeChrono(cached, live) : cached;
        this._renderGroupMessages(gid);
        this._scrollBottom();
      }
    } catch (e) {}

    await this._loadGroupHistory(gid, false);
    this._markGroupRead(gid);
    this._applyChatLock(gid);
  },

  /* ── غلق الشات زي واتساب: نستبدل حقل الإرسال بشريط ثابت للأعضاء العاديين ── */
  _applyChatLock(gid) {
    if (this._openGroup !== gid || !this._sheet) return;
    const panel = this._sheet.querySelector('#amkh-chat-panel');
    const input = this._sheet.querySelector('#ch-input');
    if (!panel || !input) return;
    const meta = this._gmeta[gid] || {};
    const isAdmin = meta.my_role === 'owner' || meta.my_role === 'admin';
    const closed = meta.send_policy === 'admins' && !isAdmin;
    let banner = this._sheet.querySelector('#ch-closed');
    if (closed) {
      /* لو كان بيسجّل صوت، نوقف التسجيل قبل ما نخفي الحقل */
      if (this._recording) { try { this._stopVoiceRec(false); } catch (e) {} }
      input.hidden = true;
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'ch-closed';
        banner.className = 'ch-closed';
        banner.innerHTML = `<span class="ch-closed__ic">${this.ICONS.lock}</span><span>قفل المشرفون الشات — الإرسال متاح للمشرفين فقط</span>`;
        panel.appendChild(banner);
      }
      banner.hidden = false;
    } else {
      input.hidden = false;
      if (banner) banner.hidden = true;
    }
  },

  _paintGroupSub(el, meta) {
    if (!el) return;
    el.textContent = (meta.members_count || 0) + ' أعضاء';
    el.className = 'ch-conv__sub';
  },

  async _loadGroupHistory(gid, older) {
    const scroll = this._sheet && this._sheet.querySelector('#ch-scroll');
    const listEl = this._sheet && this._sheet.querySelector('#ch-msgs');
    if (!listEl) return;
    let before = null;
    if (older) { const arr = this._gmsgs[gid] || []; if (arr.length && arr[0].id) before = arr[0].id; }
    const prevH = scroll ? scroll.scrollHeight : 0;
    const data = await this._gget(`/${gid}/history?${before ? 'before=' + before + '&' : ''}limit=30`);
    if (data && Array.isArray(data.messages)) {
      const existing = this._gmsgs[gid] || [];
      if (older) this._gmsgs[gid] = data.messages.concat(existing);
      else { const kept = existing.filter(m => m.pending || m.local); this._gmsgs[gid] = this._mergeChrono(data.messages, kept); }
      const loadMore = this._sheet.querySelector('#ch-loadmore');
      if (loadMore) loadMore.hidden = !data.has_more;
      this._persist('grp', gid);
    }
    /* خزّن أعضاء الحفلة ولقطة الإيصالات (لصور القراء والعلامات) */
    if (data && Array.isArray(data.members)) {
      const mm = {};
      data.members.forEach(x => { mm[x.id] = x; });
      this._gmembers[gid] = mm;
    }
    if (data && Array.isArray(data.reads)) this._setGroupReads(gid, data.reads);
    this._renderGroupMessages(gid);
    if (older && scroll) scroll.scrollTop = scroll.scrollHeight - prevH;
    else this._scrollBottom();
  },

  _renderGroupMessages(gid) {
    const listEl = this._sheet && this._sheet.querySelector('#ch-msgs');
    if (!listEl) return;
    listEl.innerHTML = '';
    const arr = this._gmsgs[gid] || [];
    if (!arr.length) {
      const e = document.createElement('p');
      e.className = 'ch-empty';
      e.textContent = 'لا توجد رسائل بعد — ابدأ الحديث مع الحفلة';
      listEl.appendChild(e);
      return;
    }
    let lastFrom = null;
    arr.forEach(m => {
      const showHead = !m.mine && m.from !== lastFrom;   /* أول رسالة من نفس الشخص فيها اسمه وصورته */
      listEl.appendChild(this._groupBubbleEl(m, showHead));
      lastFrom = m.from;
    });
    this._applyGroupReceipts(gid);
    this._renderPinnedBar('group');
  },

  /* فقاعة جروب: للرسايل من غيري نعرض صورة صاحبها + اسمه فوق الفقاعة. */
  _groupBubbleEl(m, showHead) {
    const wrap = document.createElement('div');
    wrap.className = 'ch-grow ' + (m.mine ? 'ch-grow--mine' : 'ch-grow--their');
    if (showHead) {
      const av = document.createElement('span');
      av.className = 'ch-grow__av'; av.setAttribute('aria-hidden', 'true');
      this._paintAvatar(av, { name: m.sender_name, avatar_url: m.sender_avatar });
      wrap.appendChild(av);
    } else if (!m.mine) {
      const spacer = document.createElement('span');
      spacer.className = 'ch-grow__av ch-grow__av--spacer';
      wrap.appendChild(spacer);
    }
    const b = document.createElement('div');
    b.className = 'ch-bubble ' + (m.mine ? 'ch-bubble--mine' : 'ch-bubble--their');
    if (m.pending) b.classList.add('is-pending');
    if (m.pinned) b.classList.add('ch-bubble--pinned');
    if (m.client_id) b.dataset.cid = m.client_id;
    if (m.id) b.dataset.mid = String(m.id);
    if (showHead) {
      const nm = document.createElement('div');
      nm.className = 'ch-bubble__from';
      nm.textContent = m.sender_name;
      b.appendChild(nm);
    }
    if (m.reply) b.appendChild(this._replyQuoteEl(m.reply));
    if (m.kind === 'voice') { b.classList.add('ch-bubble--voice'); b.appendChild(this._voiceEl(m, 'grp')); }
    else if (m.kind === 'call') { b.classList.add('ch-bubble--call'); b.appendChild(this._callRow(m)); }
    else if (m.kind === 'image' || m.kind === 'video') { b.classList.add('ch-bubble--media'); b.appendChild(this._mediaEl(m)); }
    else { b.appendChild(this._bodyEl(m, 'group')); }
    if (this._mentionsMe(m)) b.classList.add('ch-bubble--ment');
    const meta = document.createElement('div');
    meta.className = 'ch-bubble__meta';
    const time = document.createElement('span');
    time.className = 'ch-time'; time.textContent = this._time(m.created_at);
    meta.appendChild(time);
    if (m.mine && m.kind !== 'call') {
      const tick = document.createElement('span');
      tick.className = 'ch-tick' + (m.pending ? ' is-pending' : '');
      if (m.pending) tick.innerHTML = this.ICONS.clock; else tick.textContent = '✓';
      meta.appendChild(tick);
    }
    b.appendChild(meta);
    this._paintReactions(b, 'group', m);
    if (m.kind !== 'call') this._bindMsgActions(b, 'group', m);
    wrap.appendChild(b);
    return wrap;
  },

  _appendGroupBubble(m) {
    const listEl = this._sheet && this._sheet.querySelector('#ch-msgs');
    if (!listEl) return;
    const empty = listEl.querySelector('.ch-empty');
    if (empty) empty.remove();
    const arr = this._gmsgs[this._openGroup] || [];
    const idx = arr.indexOf(m);
    const prev = idx > 0 ? arr[idx - 1] : null;
    const showHead = !m.mine && (!prev || prev.from !== m.from);
    listEl.appendChild(this._groupBubbleEl(m, showHead));
    this._scrollBottom();
    this._applyGroupReceipts(this._openGroup);
  },

  async _showGroupMembers(gid) {
    const data = await this._gget(`/${gid}/members`);
    const U = window.amkhUI;
    if (!data || !Array.isArray(data.members)) { U.notify('تعذّر جلب الأعضاء', 'تنبيه', '◈'); return; }
    const meId = this._me();
    const myRole = data.my_role || 'member';
    const amAdmin = myRole === 'owner' || myRole === 'admin';
    const isOwner = data.owner_id === meId;
    const sendPolicy = data.send_policy || 'all';
    const meta = this._gmeta[gid] || {};
    const roleTag = r => r === 'owner'
      ? '<span class="grp-mem__tag">المالك</span>'
      : (r === 'admin' ? '<span class="grp-mem__tag grp-mem__tag--admin">مشرف</span>' : '');
    const rowsHtml = data.members.map(mem => {
      const canAct = amAdmin && mem.id !== meId && mem.id !== data.owner_id;
      return `<div class="grp-mem" data-mid="${mem.id}"><span class="grp-mem__av" data-av="${mem.id}"></span>`
        + `<span class="grp-mem__name"></span>${roleTag(mem.role)}`
        + (canAct ? `<button class="grp-mem__act" data-act="${mem.id}" aria-label="إجراءات">${this.ICONS.dots}</button>` : '')
        + `</div>`;
    }).join('');
    const adminHtml = amAdmin ? `
        <div class="grp-admin">
          <button class="grp-admin__row" id="grp-policy">
            <span class="grp-admin__ic">${this.ICONS.lock}</span>
            <span class="grp-admin__mid"><span class="grp-admin__t">إرسال الرسائل</span>
              <span class="grp-admin__s" id="grp-policy-s">${sendPolicy === 'admins' ? 'المشرفون فقط' : 'كل الأعضاء'}</span></span>
          </button>
          <button class="grp-admin__row" id="grp-invite">
            <span class="grp-admin__ic">${this.ICONS.link}</span>
            <span class="grp-admin__mid"><span class="grp-admin__t">رابط الدعوة</span>
              <span class="grp-admin__s">مشاركة أو تصفير الرابط</span></span>
          </button>
        </div>` : '';
    const overlay = U.mount('amkh-grp-members', `
      <div class="ds-sheet grp-sheet">
        <div class="ch-inbox__head"><button class="ch-back" data-close>›</button><h2 class="ch-inbox__title">أعضاء الحفلة</h2></div>
        <div class="grp-info__hero">
          <span class="grp-info__av ch-conv__av--group" id="grp-info-av" aria-hidden="true"></span>
          <span class="grp-info__name" id="grp-info-name"></span>
          ${isOwner ? `<button class="ds-btn ds-btn--ghost ds-btn--sm" id="grp-av-btn">${this.ICONS.camera}<span>تغيير الصورة</span></button><input type="file" id="grp-av-file" accept="image/*" hidden>` : ''}
        </div>
        ${adminHtml}
        <button class="grp-add" id="grp-add">${this.ICONS.plus}<span>إضافة أعضاء</span></button>
        <div class="grp-mem__list">${rowsHtml}</div>
        <div class="grp-sheet__foot"><button class="ds-btn ds-btn--danger" id="grp-leave">مغادرة الحفلة</button></div>
      </div>`, { sheet: true, sfx: 'members' });
    /* رأس الحفلة: الصورة + الاسم */
    this._paintGroupAvatar(overlay.querySelector('#grp-info-av'), meta);
    const nmEl = overlay.querySelector('#grp-info-name');
    if (nmEl) nmEl.textContent = meta.name || 'حفلة شطرنجية';
    /* المالك يقدر يغيّر صورة الحفلة */
    if (isOwner) {
      const avBtn = overlay.querySelector('#grp-av-btn');
      const avFile = overlay.querySelector('#grp-av-file');
      if (avBtn && avFile) {
        avBtn.onclick = () => { U.sfx(); avFile.value = ''; avFile.click(); };
        avFile.onchange = async () => {
          const f = avFile.files && avFile.files[0];
          if (!f) return;
          const dataUrl = await this._fileToDataUrl(f).catch(() => null);
          const small = dataUrl ? await this._downscaleImage(dataUrl, 128) : null;
          if (!small) { U.notify('تعذّر تجهيز الصورة', 'تنبيه', '◈'); return; }
          const r = await this._gpost(`/${gid}/avatar`, { avatar_url: small });
          if (r && !r.error) {
            const url = r.avatar_url || small;
            if (this._gmeta[gid]) this._gmeta[gid].avatar_url = url;
            this._paintGroupAvatar(overlay.querySelector('#grp-info-av'), { avatar_url: url });
            /* حدّث رأس شاشة الحفلة والصندوق لو مفتوحين */
            if (this._openGroup === gid && this._sheet) this._paintGroupAvatar(this._sheet.querySelector('#ch-grp-av'), { avatar_url: url });
          } else U.notify((r && r.error) || 'تعذّر تغيير الصورة', 'تنبيه', '◈');
        };
      }
    }
    /* أسماء وصور بأمان (textContent). صورتي أنا ممكن تكون لسه ماترفعتش
       للسيرفر (users.avatar_url فاضي) لكن محفوظة محليًا — فبنستخدم صورة
       الملف الشخصي المحلية كبديل عشان تبان في قائمة الأعضاء زي الباقيين. */
    let myLocalAvatar = '';
    try { myLocalAvatar = localStorage.getItem('chess_profile_image') || ''; } catch (e) {}
    data.members.forEach(mem => {
      const av = overlay.querySelector(`[data-av="${mem.id}"]`);
      if (!av) return;
      const url = mem.avatar_url || (mem.id === meId ? myLocalAvatar : '');
      this._paintAvatar(av, { name: mem.display_name || mem.username, avatar_url: url });
    });
    /* لو صورتي محليًا موجودة والسيرفر مايعرفهاش — نرفعها في الخلفية عشان
       باقي الأعضاء كمان يشوفوها، مش أنا بس. */
    try {
      const meRow = data.members.find(m => m.id === meId);
      if (myLocalAvatar && meRow && !meRow.avatar_url && window.amkhSyncMyAvatar) window.amkhSyncMyAvatar();
    } catch (e) {}
    const names = overlay.querySelectorAll('.grp-mem__name');
    data.members.forEach((mem, i) => { if (names[i]) names[i].textContent = (mem.display_name || mem.username) + (mem.id === meId ? ' (أنت)' : ''); });
    /* إضافة أعضاء (متاح لأي عضو زي واتساب) */
    const addBtn = overlay.querySelector('#grp-add');
    if (addBtn) addBtn.onclick = () => { U.sfx(); this._addMembersFlow(gid, data.members.map(m => m.id)); };
    /* إجراءات المشرف على عضو: ترقية/تنزيل مشرف + إزالة */
    if (amAdmin) {
      overlay.querySelectorAll('.grp-mem__act').forEach(btn => {
        btn.onclick = () => {
          U.sfx();
          const mem = data.members.find(m => m.id === Number(btn.dataset.act));
          if (mem) this._memberActions(gid, mem);
        };
      });
      const polBtn = overlay.querySelector('#grp-policy');
      if (polBtn) polBtn.onclick = () => { U.sfx(); this._sendPolicyFlow(gid, sendPolicy); };
      const invBtn = overlay.querySelector('#grp-invite');
      if (invBtn) invBtn.onclick = () => { U.sfx(); this._inviteLinkFlow(gid); };
    }
    const leaveBtn = overlay.querySelector('#grp-leave');
    if (leaveBtn) leaveBtn.onclick = async () => {
      U.sfx();
      const r = await this._gpost(`/${gid}/leave`, {});
      if (r && !r.error) {
        delete this._gmsgs[gid]; delete this._gmeta[gid]; delete this._gunread[gid];
        try { overlay.querySelector('[data-close]').click(); } catch (e) {}
        if (this._openGroup === gid && this._sheet) { try { this._sheet.querySelector('[data-close]').click(); } catch (e) {} }
        this.showInbox();
      } else U.notify((r && r.error) || 'تعذّرت المغادرة', 'تنبيه', '◈');
    };
  },

  /* ── إضافة أعضاء بعد الإنشاء: منتقي أصدقاء (اللي مش في الحفلة) ── */
  async _addMembersFlow(gid, existingIds) {
    const U = window.amkhUI;
    let friends = [];
    if (window.amkhFriends) {
      try {
        if (typeof window.amkhFriends.loadFriends === 'function') friends = await window.amkhFriends.loadFriends();
        if ((!friends || !friends.length) && Array.isArray(window.amkhFriends._friends)) friends = window.amkhFriends._friends;
      } catch (e) { if (Array.isArray(window.amkhFriends._friends)) friends = window.amkhFriends._friends; }
    }
    if (!Array.isArray(friends)) friends = [];
    const have = new Set((existingIds || []).map(Number));
    const pool = friends.filter(f => f && f.id && !have.has(Number(f.id)));
    if (!pool.length) { U.notify('كل أصدقائك في الحفلة بالفعل', 'إضافة أعضاء', '◉'); return; }
    const rows = pool.map(f => `
      <label class="grp-pick">
        <span class="grp-pick__av" data-pav="${f.id}"></span>
        <span class="grp-pick__name" data-pname="${f.id}"></span>
        <input type="checkbox" class="grp-pick__cb" value="${f.id}">
      </label>`).join('');
    const overlay = U.mount('amkh-grp-add', `
      <div class="ds-sheet grp-sheet">
        <div class="ch-inbox__head"><button class="ch-back" data-close>›</button><h2 class="ch-inbox__title">إضافة أعضاء</h2></div>
        <div class="grp-create__body"><div class="grp-pick__list">${rows}</div></div>
        <div class="grp-sheet__foot"><button class="ds-btn ds-btn--primary" id="grp-add-btn">إضافة</button></div>
      </div>`, { sheet: true, sfx: 'groupNew' });
    pool.forEach(f => {
      const av = overlay.querySelector(`[data-pav="${f.id}"]`);
      if (av) this._paintAvatar(av, { name: f.display_name || f.username, avatar_url: f.avatar_url });
      const nm = overlay.querySelector(`[data-pname="${f.id}"]`);
      if (nm) nm.textContent = f.display_name || f.username;
    });
    const btn = overlay.querySelector('#grp-add-btn');
    if (btn) btn.onclick = async () => {
      U.sfx();
      const members = [...overlay.querySelectorAll('.grp-pick__cb:checked')].map(cb => Number(cb.value));
      if (!members.length) { U.notify('اختر عضو واحد على الأقل', 'تنبيه', '◈'); return; }
      btn.disabled = true;
      const r = await this._gpost(`/${gid}/members`, { members });
      btn.disabled = false;
      if (r && !r.error) {
        if (this._gmeta[gid]) this._gmeta[gid].members_count = r.members;
        try { overlay._dismiss(); } catch (e) {}
        this._showGroupMembers(gid);
      } else U.notify((r && r.error) || 'تعذّرت الإضافة', 'تنبيه', '◈');
    };
  },

  /* ── إجراءات المشرف على عضو: ترقية/تنزيل مشرف + إزالة ── */
  _memberActions(gid, mem) {
    const U = window.amkhUI;
    const name = mem.display_name || mem.username;
    const isAdminMem = mem.role === 'admin';
    const overlay = U.mount('amkh-grp-memact', `
      <div class="ds-dialog grp-act">
        <div class="grp-act__hero"><span class="grp-act__av" id="grp-act-av"></span>
          <span class="grp-act__name"></span></div>
        <div class="grp-act__list">
          <button class="grp-act__btn" data-do="admin">${this.ICONS.shield}<span>${isAdminMem ? 'إزالة كمشرف' : 'تعيين كمشرف'}</span></button>
          <button class="grp-act__btn grp-act__btn--danger" data-do="remove">${this.ICONS.userMinus}<span>إزالة من الحفلة</span></button>
          <button class="grp-act__btn grp-act__btn--ghost" data-close><span>إلغاء</span></button>
        </div>
      </div>`, { sfx: 'sheet' });
    this._paintAvatar(overlay.querySelector('#grp-act-av'), { name, avatar_url: mem.avatar_url });
    const nmEl = overlay.querySelector('.grp-act__name'); if (nmEl) nmEl.textContent = name;
    overlay.querySelectorAll('[data-do]').forEach(b => b.onclick = async () => {
      U.sfx();
      const act = b.dataset.do;
      if (act === 'admin') {
        const r = await this._gpost(`/${gid}/admins`, { user_id: mem.id, make: !isAdminMem });
        try { overlay._dismiss(); } catch (e) {}
        if (r && !r.error) this._showGroupMembers(gid);
        else U.notify((r && r.error) || 'تعذّر التغيير', 'تنبيه', '◈');
      } else if (act === 'remove') {
        try { overlay._dismiss(); } catch (e) {}
        const ok = await U.confirm('إزالة عضو', `إزالة ${name} من الحفلة؟`, 'إزالة', 'إلغاء');
        if (!ok) return;
        const r = await this._gdel(`/${gid}/members/${mem.id}`);
        if (r && !r.error) this._showGroupMembers(gid);
        else U.notify((r && r.error) || 'تعذّرت الإزالة', 'تنبيه', '◈');
      }
    });
  },

  /* ── سياسة الإرسال: فتح/غلق الحفلة ── */
  _sendPolicyFlow(gid, current) {
    const U = window.amkhUI;
    const overlay = U.mount('amkh-grp-policy', `
      <div class="ds-dialog grp-act">
        <h2 class="ds-dialog__title">مين يقدر يبعت؟</h2>
        <div class="grp-act__list">
          <button class="grp-act__opt${current === 'all' ? ' is-sel' : ''}" data-pol="all"><span>كل الأعضاء</span></button>
          <button class="grp-act__opt${current === 'admins' ? ' is-sel' : ''}" data-pol="admins"><span>المشرفون فقط</span></button>
          <button class="grp-act__btn grp-act__btn--ghost" data-close><span>إلغاء</span></button>
        </div>
      </div>`, { sfx: 'sheet' });
    overlay.querySelectorAll('[data-pol]').forEach(b => b.onclick = async () => {
      U.sfx();
      const pol = b.dataset.pol;
      try { overlay._dismiss(); } catch (e) {}
      if (pol === current) return;
      const r = await this._gpost(`/${gid}/settings`, { send_policy: pol });
      if (r && !r.error) this._showGroupMembers(gid);
      else U.notify((r && r.error) || 'تعذّر الحفظ', 'تنبيه', '◈');
    });
  },

  /* ── رابط الدعوة: عرض/نسخ/تصفير ── */
  async _inviteLinkFlow(gid) {
    const U = window.amkhUI;
    let cur = await this._gget(`/${gid}/invite`);
    /* الرابط لازم يفتح من أي مكان في العالم. جوّه التطبيق (Capacitor) بيكون
       location.origin = https://localhost، وده رابط مالوش أي معنى بره الجهاز.
       فلو احنا جوّه التطبيق نبني الرابط على موقع الويب العام (GitHub Pages)
       اللي بيخدم نفس index.html وبيفهم ‎#join=‎. على الويب العادي نفضل نستخدم
       نفس الصفحة الحالية. */
    const siteBase = () => {
      const origin = (location.origin || '');
      const isApp = /^https?:\/\/localhost/i.test(origin) || /^capacitor:/i.test(origin) || origin === 'null' || origin === '';
      if (isApp) return (window.SITE_URL || 'https://12362aa.github.io/chess/');
      let b = origin + location.pathname;
      return b;
    };
    const linkOf = t => {
      if (!t) return '';
      let b = siteBase();
      if (!/\/$/.test(b)) b += (/\.[a-z0-9]+$/i.test(b) ? '' : '/'); // نخلي فيه / قبل الـhash لو مفيش امتداد ملف
      return `${b}#join=${t}`;
    };
    const render = (token) => {
      const link = linkOf(token);
      const overlay = U.mount('amkh-grp-invite', `
        <div class="ds-dialog grp-act">
          <h2 class="ds-dialog__title">رابط الدعوة</h2>
          <p class="ds-dialog__message grp-inv__url">${token ? U.esc(link) : 'الرابط مقفول حالياً'}</p>
          <div class="grp-act__list">
            <button class="grp-act__btn" data-do="copy" ${token ? '' : 'disabled'}>${this.ICONS.copy}<span>نسخ الرابط</span></button>
            <button class="grp-act__btn" data-do="reset">${this.ICONS.refresh}<span>${token ? 'تصفير الرابط' : 'توليد رابط'}</span></button>
            <button class="grp-act__btn grp-act__btn--ghost" data-close><span>إغلاق</span></button>
          </div>
        </div>`, { sfx: 'sheet' });
      overlay.querySelectorAll('[data-do]').forEach(b => b.onclick = async () => {
        U.sfx();
        if (b.dataset.do === 'copy' && token) {
          try { await navigator.clipboard.writeText(link); U.notify('اتنسخ الرابط', 'تم', '◉'); } catch (e) { U.notify(link, 'رابط الدعوة', '◉'); }
        } else if (b.dataset.do === 'reset') {
          const r = await this._gpost(`/${gid}/invite`, { enabled: true, reset: !!token });
          try { overlay._dismiss(); } catch (e) {}
          if (r && !r.error) render(r.token);
          else U.notify((r && r.error) || 'تعذّر التوليد', 'تنبيه', '◈');
        }
      });
    };
    render(cur && cur.token);
  },
  /* ── الانضمام لحفلة عبر رابط دعوة (#join=TOKEN) ── */
  async joinByInvite(token, _tries) {
    const U = window.amkhUI;
    token = String(token || '').trim();
    if (!token) return;
    /* نحفظ التوكِن فورًا: لو المستخدم مش مسجّل دخول لسه، الرابط بيتفتح على
       الموقع من غير ما ينضم لأي حفلة. بنسيبه محفوظ لحد ما يسجّل الدخول
       ونستأنف الانضمام تلقائيًا (من setToken في auth-client). */
    try { sessionStorage.setItem('amkh_pending_invite', token); } catch (e) {}
    const authed = () => { try { return !!(window.amkhAuth && window.amkhAuth.token); } catch (e) { return false; } };
    if (!authed()) {
      const t = (_tries || 0);
      /* محاولات سريعة قليلة تحسبًا إن الحساب لسه بيتحمّل عند الإقلاع. */
      if (t < 8) { setTimeout(() => this.joinByInvite(token, t + 1), 500); return; }
      /* بعد كده نبطّل اللف الصامت ونطلب الدخول بوضوح — التوكِن محفوظ. */
      if (U) U.notify('سجّل الدخول أولًا للانضمام إلى الحفلة، وسنكمل تلقائيًا', 'دعوة حفلة', '◈');
      return;
    }
    /* لازم رابط السيرفر يكون متاح قبل النداء — على الموقع (GitHub Pages)
       getApiBase بترجع "/api" النسبي قبل تحميل الرابط، فالطلب كان بيروح
       لـ github.io/api (404) والحفلة ماتتفتحش. _gpost بيضمنه عبر
       _getAuthHeader، بس بنأكّده هنا كمان قبل إظهار أي مؤشّر. */
    try { if (window.amkhEnsureServer) await window.amkhEnsureServer(); } catch (e) {}
    if (U) U.notify('جارٍ إضافتك إلى الحفلة…', 'دعوة حفلة', '◉');
    const r = await this._gpost(`/join/${token}`, {});
    if (r && !r.error && r.group_id) {
      try { sessionStorage.removeItem('amkh_pending_invite'); } catch (e) {}
      const s = r.summary || {};
      this._gmeta[r.group_id] = { name: s.name, members_count: s.members_count, owner_id: s.owner_id, avatar_url: s.avatar_url || null };
      if (r.already) { if (U) U.notify('أنت عضو في هذه الحفلة بالفعل', 'دعوة حفلة', '◉'); }
      this.openGroup({ id: r.group_id, name: s.name, members_count: s.members_count, owner_id: s.owner_id, avatar_url: s.avatar_url || null });
    } else {
      /* فشل حقيقي (رابط منتهي/شبكة): نمسح التوكِن المعلّق عشان ما نلفّش عليه
         عند كل تسجيل دخول. */
      try { sessionStorage.removeItem('amkh_pending_invite'); } catch (e) {}
      if (U) U.notify((r && r.error) || 'الرابط منتهي أو غير صالح', 'دعوة حفلة', '◈');
    }
  },
  /* يُستدعى بعد تسجيل الدخول (من setToken) عشان يكمّل انضمام حفلة معلّق. */
  resumePendingInvite() {
    let tok = null;
    try { tok = sessionStorage.getItem('amkh_pending_invite'); } catch (e) {}
    if (tok) this.joinByInvite(tok);
  },
};
window.amkhChat = amkhChat;
