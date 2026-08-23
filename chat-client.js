/* ══════════════════════════════════════════════════════════════════════
   دردشة الأصدقاء — العميل
   ──────────────────────────────────────────────────────────────────────
   شات 1:1 دائم بين الأصدقاء، بستايل التطبيق (نفس توكنز ومكوّنات amkhUI).
   • الرسايل محفوظة في الحساب على السيرفر — تسجّل خروج وترجع تلاقيها.
   • بتمشي على نفس سوكت الحضور (chat:*)، والسجل/العدّادات على HTTP.
   • الأسماء والرسايل بـtextContent دايمًا (مفيش innerHTML لمحتوى المستخدم).
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
  _gmeta: {},             /* groupId → {name, members_count} */

  /* أيقونات مرسومة (Lucide-style، نفس ستايل MODE_ICONS في index.html).
     stroke=currentColor فبتاخد لون النص/الزر تلقائيًا وتشتغل في كل الثيمات. */
  ICONS: {
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
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

  /* وقت قصير للفقاعة */
  _time(iso) {
    const t = iso ? Date.parse(iso) : Date.now();
    const d = isNaN(t) ? new Date() : new Date(t);
    let h = d.getHours(), m = d.getMinutes();
    const am = h < 12;
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m < 10 ? '0' + m : m} ${am ? 'ص' : 'م'}`;
  },

  /* ── PLACEHOLDER_APPEND ── */

  /* إرسال رسالة: عرض متفائل بمعرّف مؤقت، وبعدين chat:sent بيصلّح المعرّف. */
  sendMessage(friendId, body) {
    body = String(body || '').trim();
    if (!body) return;
    const ws = this._socket();
    if (!ws) { window.amkhUI.notify('مفيش اتصال بالسيرفر دلوقتي. تأكد من الإنترنت.', 'غير متصل', '◈'); return; }
    const clientId = 'c' + (++this._cid) + '_' + Date.now();
    const key = this._key(this._me(), friendId);
    const msg = { id: null, client_id: clientId, from: this._me(), to: friendId, mine: true, kind: 'text', body, created_at: new Date().toISOString(), read: false, pending: true };
    (this._msgs[key] = this._msgs[key] || []).push(msg);
    if (this._openWith === friendId) this._appendBubble(msg, true);
    try { ws.send(JSON.stringify({ type: 'chat:send', to: friendId, body, client_id: clientId })); } catch (e) {}
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
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
      window.amkhUI.notify('جهازك مايدعمش التسجيل الصوتي', 'غير متاح', '◈'); return;
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
    const ws = this._socket();
    if (!ws) { window.amkhUI.notify('مفيش اتصال بالسيرفر دلوقتي.', 'غير متصل', '◈'); return; }
    const clientId = 'v' + (++this._cid) + '_' + Date.now();
    const key = this._key(this._me(), friendId);
    const msg = { id: null, client_id: clientId, from: this._me(), to: friendId, mine: true, kind: 'voice', body: '', audio: audioB64, duration: durationSec, mime, created_at: new Date().toISOString(), read: false, pending: true };
    (this._msgs[key] = this._msgs[key] || []).push(msg);
    if (this._openWith === friendId) this._appendBubble(msg, true);
    try { ws.send(JSON.stringify({ type: 'chat:send', kind: 'voice', to: friendId, audio: audioB64, duration: durationSec, mime, client_id: clientId })); } catch (e) {}
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

  sendMedia(friendId, b64, mime, kind) {    const ws = this._socket();
    if (!ws) { window.amkhUI.notify('مفيش اتصال بالسيرفر دلوقتي.', 'غير متصل', '◈'); return; }
    const clientId = 'm' + (++this._cid) + '_' + Date.now();
    const key = this._key(this._me(), friendId);
    const msg = { id: null, client_id: clientId, from: this._me(), to: friendId, mine: true, kind, body: '', audio: b64, mime, created_at: new Date().toISOString(), read: false, pending: true };
    (this._msgs[key] = this._msgs[key] || []).push(msg);
    if (this._openWith === friendId) this._appendBubble(msg, true);
    try { ws.send(JSON.stringify({ type: 'chat:send', kind, to: friendId, audio: b64, mime, client_id: clientId })); } catch (e) {}
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

  handleSocketMessage(d) {
    if (!d || typeof d.type !== 'string') return false;
    switch (d.type) {
      case 'chat:message': return this._onMessage(d);
      case 'chat:sent': return this._onSent(d);
      case 'chat:read-receipt': return this._onReadReceipt(d);
      case 'chat:typing': return this._onTyping(d);
      case 'chat:recording': return this._onRecording(d);
      case 'chat:unread': return this._onUnreadSnapshot(d);
      case 'chat:error':
        this._onSendError(d, false);
        window.amkhUI.notify(d.reason === 'not-friend' ? 'لازم يكون صديقك' : (d.reason === 'too-big' ? 'التسجيلة كبيرة جداً' : 'تعذّر إرسال الرسالة'), 'لم يتم', '◈');
        return true;
      case 'group:message': return this._onGroupMessage(d);
      case 'group:sent': return this._onGroupSent(d);
      case 'group:typing': return this._onGroupTyping(d);
      case 'group:recording': return this._onGroupRecording(d);
      case 'group:created': return this._onGroupCreated(d);
      case 'group:updated': return this._onGroupUpdated(d);
      case 'group:error':
        this._onSendError(d, true);
        if (d.reason === 'closed') {
          const gid = d.group_id;
          if (gid != null && this._gmeta[gid]) this._gmeta[gid].send_policy = 'admins';
          if (gid != null) this._applyChatLock(gid);
          window.amkhUI.notify('قفل المشرفون الشات — الإرسال متاح للمشرفين فقط', 'الشات مقفول', '◈');
        } else {
          window.amkhUI.notify(d.reason === 'not-member' ? 'مش عضو في الحفلة' : (d.reason === 'too-big' ? 'التسجيلة كبيرة جداً' : 'تعذّر إرسال الرسالة'), 'لم يتم', '◈');
        }
        return true;
      default: return false;
    }
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
    const msg = { id: d.id, client_id: d.client_id || null, from: d.from, to: d.to, mine, kind: d.kind || 'text', body: d.body, audio: d.audio || null, duration: d.duration || 0, mime: d.mime || '', created_at: d.created_at, read: false };
    (this._msgs[key] = this._msgs[key] || []).push(msg);

    if (this._openWith === friendId) {
      this._appendBubble(msg, false);
      this._clearTypingRow();
      if (!mine) this._markRead(friendId);           /* المحادثة مفتوحة = مقروء فورًا */
    } else if (!mine) {
      this._unread[friendId] = (this._unread[friendId] || 0) + 1;
      this._updateBadge();
      const name = (this._friendMeta[friendId] && this._friendMeta[friendId].name) || 'صديق';
      try { if (window.SFX) window.SFX.chat(); } catch (e) {}
      window.amkhUI.notify(this._previewOf(d), `💬 ${name}`, '◉');
    }
    return true;
  },

  _onSent(d) {
    /* نصلّح الرسالة المتفائلة: نحط الـid الحقيقي ونشيل pending */
    const key = this._key(this._me(), d.to);
    const arr = this._msgs[key] || [];
    const m = arr.find(x => x.client_id === d.client_id);
    if (m) { m.id = d.id; m.pending = false; m.created_at = d.created_at || m.created_at; }
    if (this._openWith === d.to) {
      const el = this._sheet && this._sheet.querySelector(`[data-cid="${d.client_id}"]`);
      if (el) {
        el.classList.remove('is-pending');
        el.dataset.mid = String(d.id);
        const tick = el.querySelector('.ch-tick');
        if (tick) { tick.classList.remove('is-pending'); tick.textContent = d.delivered ? '✓✓' : '✓'; }
      }
    }
    return true;
  },

  /* فشل الإرسال من السيرفر: نشيل حالة الانتظار عن الرسالة المتفائلة ونعلّمها
     فشلت (بدل ما تفضل عليها أيقونة الساعة للأبد). isGroup يحدّد المخزن. */
  _onSendError(d, isGroup) {
    if (!d || !d.client_id) return;
    const cid = d.client_id;
    const stores = isGroup ? this._gmsgs : this._msgs;
    for (const k of Object.keys(stores || {})) {
      const m = (stores[k] || []).find(x => x.client_id === cid);
      if (m) { m.pending = false; m.failed = true; break; }
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
    /* الطرف التاني قرا كل رسايلي: كل التشيكات تبقى ✓✓ */
    const me = this._me();
    if (!d.convo_key) return true;
    const arr = this._msgs[d.convo_key] || [];
    arr.forEach(m => { if (m.mine) m.read = true; });
    if (this._sheet && this._openWith != null && this._key(me, this._openWith) === d.convo_key) {
      this._sheet.querySelectorAll('.ch-bubble--mine .ch-tick').forEach(t => { t.textContent = '✓✓'; t.classList.add('is-read'); });
    }
    return true;
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

  _onUnreadSnapshot(d) {
    this._unread = {};
    (d.by_friend || []).forEach(r => { this._unread[r.friend_id] = r.count; });
    this._updateBadge();
    return true;
  },

  _markRead(friendId) {
    this._unread[friendId] = 0;
    this._updateBadge();
    const ws = this._socket();
    if (ws) { try { ws.send(JSON.stringify({ type: 'chat:read', from: friendId })); } catch (e) {} }
  },

  _unreadTotal() { return Object.values(this._unread).reduce((s, n) => s + (n || 0), 0); },

  /* شارة على زر الأصدقاء/الإعدادات في الشريط العلوي (رقم الرسايل غير المقروءة) */
  _updateBadge() {
    const btn = document.getElementById('appbar-friends') || document.getElementById('appbar-settings');
    if (!btn) return;
    const total = this._unreadTotal() + this._gunreadTotal();
    let dot = btn.querySelector('.amkh-chat-badge');
    if (total > 0) {
      if (!dot) { dot = document.createElement('span'); dot.className = 'amkh-chat-badge'; btn.appendChild(dot); }
      dot.textContent = total > 99 ? '99+' : String(total);
    } else if (dot) dot.remove();
    /* تحديث سطر الصندوق لو مفتوح */
    if (this._sheet && this._sheet.dataset.view === 'inbox') this._renderInboxBadges();
  },

  /* ── فتح محادثة مع صديق ── */
  async openChat(friend) {
    if (!window.amkhAuth || !window.amkhAuth.token) {
      window.amkhUI.notify('سجّل دخولك الأول عشان تراسل أصحابك', 'محتاج حساب', '◈');
      if (window.amkhAuth) window.amkhAuth.showLoginModal();
      return;
    }
    const U = window.amkhUI;
    const fid = friend.id;
    this._friendMeta[fid] = {
      name: friend.display_name || friend.username || 'صديق',
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
      </div>`, { sheet: true, sfx: 'default', onDismiss: () => { try { this._stopVoicePlay(); } catch (e) {} if (this._recording) { try { this._stopVoiceRec(false); } catch (e) {} } this._openWith = null; this._sheet = null; } });

    overlay.dataset.view = 'conv';
    this._sheet = overlay;
    this._openWith = fid;

    overlay.querySelector('.ch-conv__name').textContent = name;
    this._paintAvatar(overlay.querySelector('.ch-conv__av'), this._friendMeta[fid]);
    this._paintSub(overlay.querySelector('.ch-conv__sub'), this._friendMeta[fid]);

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
        /* دمج: نحافظ على الرسايل المتفائلة اللي لسه ماترجعتش */
        const pend = existing.filter(m => m.pending);
        this._msgs[key] = data.messages.concat(pend);
      }
      const loadMore = this._sheet.querySelector('#ch-loadmore');
      if (loadMore) loadMore.hidden = !data.has_more;
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
      e.textContent = 'ابدأ المحادثة — قول له سلام 👋';
      listEl.appendChild(e);
      return;
    }
    arr.forEach(m => listEl.appendChild(this._bubbleEl(m)));
  },

  _bubbleEl(m) {
    const b = document.createElement('div');
    b.className = 'ch-bubble ' + (m.mine ? 'ch-bubble--mine' : 'ch-bubble--their');
    if (m.pending) b.classList.add('is-pending');
    if (m.client_id) b.dataset.cid = m.client_id;
    if (m.id) b.dataset.mid = String(m.id);
    if (m.kind === 'voice') {
      b.classList.add('ch-bubble--voice');
      b.appendChild(this._voiceEl(m));
    } else if (m.kind === 'image' || m.kind === 'video') {
      b.classList.add('ch-bubble--media');
      b.appendChild(this._mediaEl(m));
    } else {
      const body = document.createElement('div');
      body.className = 'ch-bubble__body';
      body.textContent = m.body;                 /* نص دايمًا مش HTML */
      b.appendChild(body);
    }
    const meta = document.createElement('div');
    meta.className = 'ch-bubble__meta';
    const time = document.createElement('span');
    time.className = 'ch-time';
    time.textContent = this._time(m.created_at);
    meta.appendChild(time);
    if (m.mine) {
      const tick = document.createElement('span');
      tick.className = 'ch-tick' + (m.read ? ' is-read' : '') + (m.pending ? ' is-pending' : '');
      if (m.pending) tick.innerHTML = this.ICONS.clock;   /* أيقونة ساعة مرسومة بدل 🕓 */
      else tick.textContent = m.read ? '✓✓' : '✓';
      meta.appendChild(tick);
    }
    b.appendChild(meta);
    return b;
  },

  /* عنصر وسائط (صورة/فيديو): بنحط الـbase64 كـdata URL. الصورة تفتح بملء
     الشاشة عند الضغط؛ الفيديو بعناصر التحكم القياسية. */
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
  _voiceEl(m) {
    const wrap = document.createElement('div');
    wrap.className = 'ch-voice';
    wrap._voice = { audio: m.audio, duration: m.duration || 0, mime: m.mime || '' };
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
    if (!info.audio) { window.amkhUI.notify('التسجيل مش متاح', 'تنبيه', '◈'); return; }
    const ctx = this._ensureAudioCtx();
    if (!ctx) { window.amkhUI.notify('جهازك مايدعمش تشغيل الصوت', 'تنبيه', '◈'); return; }
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

  _showTypingRow() { const t = this._sheet && this._sheet.querySelector('#ch-typing'); if (t) { t.hidden = false; this._scrollBottom(); } },
  _clearTypingRow() { const t = this._sheet && this._sheet.querySelector('#ch-typing'); if (t) t.hidden = true; },

  /* ── صندوق الوارد: كل المحادثات اللي فيها رسايل ── */
  async showInbox() {
    if (!window.amkhAuth || !window.amkhAuth.token) {
      window.amkhUI.notify('سجّل دخولك الأول عشان تشوف رسايلك', 'محتاج حساب', '◈');
      if (window.amkhAuth) window.amkhAuth.showLoginModal();
      return;
    }
    const U = window.amkhUI;
    const overlay = U.mount('amkh-chat-modal', `
      <div class="ds-sheet ch-inbox" id="amkh-chat-panel">
        <div class="ch-inbox__head">
          <button class="ch-back" data-close aria-label="رجوع">›</button>
          <h2 class="ch-inbox__title">الرسايل</h2>
        </div>
        <div class="ch-inbox__head">
          <button class="ch-back" data-close aria-label="رجوع">›</button>
          <h2 class="ch-inbox__title">الرسايل</h2>
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

    const [data, groups] = await Promise.all([this._get('/conversations'), this._gget('/')]);
    const listEl = overlay.querySelector('#ch-inbox-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    /* دمج المحادثات الفردية والجروبات وترتيبها بالأحدث. */
    const items = [];
    (Array.isArray(data) ? data : []).forEach(r => {
      const f = r.friend || {};
      this._friendMeta[f.id] = {
        name: f.display_name || f.username || 'صديق',
        avatar_url: f.avatar_url || null,
        status: f.status, online: f.online, last_seen_at: f.last_seen_at,
      };
      if (typeof r.unread === 'number') this._unread[f.id] = r.unread;
      items.push({ type: 'friend', data: r, at: Date.parse(r.last_at) || 0, id: r.last_id || 0 });
    });
    (Array.isArray(groups) ? groups : []).forEach(g => {
      this._gmeta[g.id] = { name: g.name, members_count: g.members_count, owner_id: g.owner_id };
      if (typeof g.unread === 'number') this._gunread[g.id] = g.unread;
      items.push({ type: 'group', data: g, at: Date.parse(g.last_at) || 0, id: g.last_id || 0 });
    });

    if (!items.length) {
      const e = document.createElement('p');
      e.className = 'ch-empty';
      e.textContent = 'مفيش رسايل لسه — افتح محادثة مع صاحبك، أو اعمل حفلة شطرنجية جديدة من زر ＋.';
      listEl.appendChild(e);
      this._updateBadge();
      return;
    }
    items.sort((a, b) => (b.id - a.id) || (b.at - a.at));
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
    const unread = this._gunread[g.id] || 0;
    if (unread > 0) {
      const badge = document.createElement('span');
      badge.className = 'ch-inbox__badge'; badge.textContent = unread > 99 ? '99+' : String(unread);
      end.appendChild(badge);
    }
    row.appendChild(end);
    row.onclick = () => { if (window.amkhUI) window.amkhUI.sfx(); this.openGroup({ id: g.id, name: g.name, members_count: g.members_count, owner_id: g.owner_id, avatar_url: g.avatar_url || null, send_policy: g.send_policy, my_role: g.my_role }); };
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
    const unread = this._unread[f.id] || 0;
    if (unread > 0) {
      const badge = document.createElement('span');
      badge.className = 'ch-inbox__badge';
      badge.textContent = unread > 99 ? '99+' : String(unread);
      end.appendChild(badge);
    }
    row.appendChild(end);

    row.onclick = () => {
      if (window.amkhUI) window.amkhUI.sfx();
      this.openChat({ id: f.id, display_name: meta.name, username: f.username, avatar_url: meta.avatar_url, status: f.status, online: f.online, last_seen_at: f.last_seen_at });
    };
    return row;
  },

  /* تحديث شارات غير المقروء داخل صندوق الوارد لو مفتوح */
  _renderInboxBadges() {
    if (!this._sheet || this._sheet.dataset.view !== 'inbox') return;
    this._sheet.querySelectorAll('.ch-inbox__row').forEach(row => {
      const fid = Number(row.dataset.fid);
      const unread = this._unread[fid] || 0;
      const end = row.querySelector('.ch-inbox__end');
      if (!end) return;
      let badge = end.querySelector('.ch-inbox__badge');
      if (unread > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'ch-inbox__badge'; end.appendChild(badge); }
        badge.textContent = unread > 99 ? '99+' : String(unread);
      } else if (badge) badge.remove();
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
    };
    (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
    if (this._openGroup === gid) {
      this._appendGroupBubble(msg);
      this._clearTypingRow();
      this._markGroupRead(gid);
    } else if (!mine) {
      this._gunread[gid] = (this._gunread[gid] || 0) + 1;
      this._updateBadge();
      const gname = (this._gmeta[gid] && this._gmeta[gid].name) || 'حفلة شطرنجية';
      try { if (window.SFX) window.SFX.chat(); } catch (e) {}
      window.amkhUI.notify(msg.sender_name + ': ' + this._previewOf(d), gname, '◉');
    }
    return true;
  },

  _onGroupSent(d) {
    const arr = this._gmsgs[d.group_id] || [];
    const m = arr.find(x => x.client_id === d.client_id);
    if (m) { m.id = d.id; m.pending = false; m.created_at = d.created_at || m.created_at; }
    if (this._openGroup === d.group_id) {
      const el = this._sheet && this._sheet.querySelector(`[data-cid="${d.client_id}"]`);
      if (el) {
        el.classList.remove('is-pending');
        el.dataset.mid = String(d.id);
        const tick = el.querySelector('.ch-tick');
        if (tick) { tick.classList.remove('is-pending'); tick.textContent = '✓'; }
      }
    }
    return true;
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
    this._updateBadge();
    const ws = this._socket();
    if (ws) { try { ws.send(JSON.stringify({ type: 'group:read', group_id: gid })); } catch (e) {} }
    /* احتياطي على HTTP كمان */
    this._gpost(`/${gid}/read`, {});
  },

  sendGroupMessage(gid, body) {
    body = String(body || '').trim();
    if (!body) return;
    const ws = this._socket();
    if (!ws) { window.amkhUI.notify('مفيش اتصال بالسيرفر دلوقتي. تأكد من الإنترنت.', 'غير متصل', '◈'); return; }
    const clientId = 'g' + (++this._cid) + '_' + Date.now();
    const msg = { id: null, client_id: clientId, from: this._me(), mine: true, sender_name: 'أنت', sender_avatar: null, kind: 'text', body, created_at: new Date().toISOString(), pending: true };
    (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
    if (this._openGroup === gid) this._appendGroupBubble(msg);
    try { ws.send(JSON.stringify({ type: 'group:send', group_id: gid, body, client_id: clientId })); } catch (e) {}
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  sendGroupVoice(gid, audioB64, durationSec, mime) {
    const ws = this._socket();
    if (!ws) { window.amkhUI.notify('مفيش اتصال بالسيرفر دلوقتي.', 'غير متصل', '◈'); return; }
    const clientId = 'gv' + (++this._cid) + '_' + Date.now();
    const msg = { id: null, client_id: clientId, from: this._me(), mine: true, sender_name: 'أنت', sender_avatar: null, kind: 'voice', body: '', audio: audioB64, duration: durationSec, mime, created_at: new Date().toISOString(), pending: true };
    (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
    if (this._openGroup === gid) this._appendGroupBubble(msg);
    try { ws.send(JSON.stringify({ type: 'group:send', kind: 'voice', group_id: gid, audio: audioB64, duration: durationSec, mime, client_id: clientId })); } catch (e) {}
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  sendGroupMedia(gid, b64, mime, kind) {
    const ws = this._socket();
    if (!ws) { window.amkhUI.notify('مفيش اتصال بالسيرفر دلوقتي.', 'غير متصل', '◈'); return; }
    const clientId = 'gm' + (++this._cid) + '_' + Date.now();
    const msg = { id: null, client_id: clientId, from: this._me(), mine: true, sender_name: 'أنت', sender_avatar: null, kind, body: '', audio: b64, mime, created_at: new Date().toISOString(), pending: true };
    (this._gmsgs[gid] = this._gmsgs[gid] || []).push(msg);
    if (this._openGroup === gid) this._appendGroupBubble(msg);
    try { ws.send(JSON.stringify({ type: 'group:send', kind, group_id: gid, audio: b64, mime, client_id: clientId })); } catch (e) {}
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
      </div>`, { sheet: true, sfx: 'group', onDismiss: () => { try { this._stopVoicePlay(); } catch (e) {} if (this._recording) { try { this._stopVoiceRec(false); } catch (e) {} } this._openGroup = null; this._sheet = null; } });

    overlay.dataset.view = 'group';
    this._sheet = overlay;
    this._openGroup = gid;
    this._openWith = null;

    overlay.querySelector('.ch-conv__name').textContent = this._gmeta[gid].name;
    this._paintGroupAvatar(overlay.querySelector('#ch-grp-av'), this._gmeta[gid]);
    this._paintGroupSub(overlay.querySelector('.ch-conv__sub'), this._gmeta[gid]);

    const ta = overlay.querySelector('#ch-text');
    const sendBtn = overlay.querySelector('#ch-send');
    const micBtn = overlay.querySelector('#ch-mic');
    const doSend = () => {
      const v = ta.value.trim();
      if (!v) return;
      this.sendGroupMessage(gid, v);
      ta.value = ''; ta.style.height = 'auto';
      this._toggleSendMic(overlay);
      ta.focus();
    };
    sendBtn.onclick = () => { U.sfx(); doSend(); };
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
      else { const pend = existing.filter(m => m.pending); this._gmsgs[gid] = data.messages.concat(pend); }
      const loadMore = this._sheet.querySelector('#ch-loadmore');
      if (loadMore) loadMore.hidden = !data.has_more;
    }
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
      e.textContent = 'مفيش رسايل لسه — ابدأ الكلام مع الحفلة';
      listEl.appendChild(e);
      return;
    }
    let lastFrom = null;
    arr.forEach(m => {
      const showHead = !m.mine && m.from !== lastFrom;   /* أول رسالة من نفس الشخص فيها اسمه وصورته */
      listEl.appendChild(this._groupBubbleEl(m, showHead));
      lastFrom = m.from;
    });
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
    if (m.client_id) b.dataset.cid = m.client_id;
    if (m.id) b.dataset.mid = String(m.id);
    if (showHead) {
      const nm = document.createElement('div');
      nm.className = 'ch-bubble__from';
      nm.textContent = m.sender_name;
      b.appendChild(nm);
    }
    if (m.kind === 'voice') { b.classList.add('ch-bubble--voice'); b.appendChild(this._voiceEl(m)); }
    else if (m.kind === 'image' || m.kind === 'video') { b.classList.add('ch-bubble--media'); b.appendChild(this._mediaEl(m)); }
    else { const body = document.createElement('div'); body.className = 'ch-bubble__body'; body.textContent = m.body; b.appendChild(body); }
    const meta = document.createElement('div');
    meta.className = 'ch-bubble__meta';
    const time = document.createElement('span');
    time.className = 'ch-time'; time.textContent = this._time(m.created_at);
    meta.appendChild(time);
    if (m.mine) {
      const tick = document.createElement('span');
      tick.className = 'ch-tick' + (m.pending ? ' is-pending' : '');
      if (m.pending) tick.innerHTML = this.ICONS.clock; else tick.textContent = '✓';
      meta.appendChild(tick);
    }
    b.appendChild(meta);
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
    /* لازم تكون مسجّل دخول — نستنى شوية لو التوكِن وصل قبل ما الحساب يجهز. */
    const authed = () => { try { return !!(window.amkhAuth && window.amkhAuth.token); } catch (e) { return false; } };
    if (!authed()) {
      const t = (_tries || 0);
      if (t < 20) { setTimeout(() => this.joinByInvite(token, t + 1), 600); return; }
      if (U) U.notify('سجّل الدخول الأول عشان تنضم للحفلة', 'دعوة حفلة', '◈');
      return;
    }
    const r = await this._gpost(`/join/${token}`, {});
    if (r && !r.error && r.group_id) {
      const s = r.summary || {};
      this._gmeta[r.group_id] = { name: s.name, members_count: s.members_count, owner_id: s.owner_id, avatar_url: s.avatar_url || null };
      if (r.already) { if (U) U.notify('أنت عضو في الحفلة دي بالفعل', 'دعوة حفلة', '◉'); }
      this.openGroup({ id: r.group_id, name: s.name, members_count: s.members_count, owner_id: s.owner_id, avatar_url: s.avatar_url || null });
    } else if (U) U.notify((r && r.error) || 'الرابط منتهي أو غير صالح', 'دعوة حفلة', '◈');
  },
};
window.amkhChat = amkhChat;
