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

  sendMedia(friendId, b64, mime, kind) {
    const ws = this._socket();
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
      case 'group:error':
        this._onSendError(d, true);
        window.amkhUI.notify(d.reason === 'not-member' ? 'مش عضو في الجروب' : (d.reason === 'too-big' ? 'التسجيلة كبيرة جداً' : 'تعذّر إرسال الرسالة'), 'لم يتم', '◈');
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
    if (this._vSource && this._vWrap === wrap) { this._stopVoicePlay(); return; }
    this._stopVoicePlay();
    const info = wrap._voice || {};
    if (!info.audio) { window.amkhUI.notify('التسجيل مش متاح', 'تنبيه', '◈'); return; }
    const ctx = this._ensureAudioCtx();
    if (!ctx) { window.amkhUI.notify('جهازك مايدعمش تشغيل الصوت', 'تنبيه', '◈'); return; }
    let buf;
    try { buf = this._base64ToArrayBuffer(info.audio); } catch (e) { window.amkhUI.notify('تعذّر قراءة التسجيل', 'تنبيه', '◈'); return; }
    const onDecoded = (audioBuf) => {
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
      const p = ctx.decodeAudioData(buf, onDecoded, () => window.amkhUI.notify('لا يمكن تشغيل هذا الملف الصوتي', 'تنبيه', '◈'));
      if (p && typeof p.then === 'function') p.then(onDecoded).catch(() => window.amkhUI.notify('لا يمكن تشغيل هذا الملف الصوتي', 'تنبيه', '◈'));
    } catch (e) { window.amkhUI.notify('لا يمكن تشغيل هذا الملف الصوتي', 'تنبيه', '◈'); }
  },

  _stopVoicePlay() {
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
          <button class="ch-inbox__new" id="ch-new-group" aria-label="جروب جديد">＋</button>
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
      e.textContent = 'مفيش رسايل لسه — افتح محادثة مع صاحبك، أو اعمل جروب جديد من زر ＋.';
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
    av.textContent = '👥';
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
    row.onclick = () => { if (window.amkhUI) window.amkhUI.sfx(); this.openGroup({ id: g.id, name: g.name, members_count: g.members_count, owner_id: g.owner_id }); };
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
        <div class="ch-inbox__head"><button class="ch-back" data-close>›</button><h2 class="ch-inbox__title">جروب جديد</h2></div>
        <div class="grp-create__body">
          <input type="text" id="grp-name" class="ds-input" maxlength="60" placeholder="اسم الجروب" autocomplete="off">
          <p class="grp-create__hint">${online.length ? 'اختر الأصدقاء (اختياري):' : 'ممكن تعمل جروب لنفسك وتضيف أصدقاء بعدين.'}</p>
          <div class="grp-pick__list">${rows}</div>
        </div>
        <div class="grp-sheet__foot"><button class="ds-btn ds-btn--primary" id="grp-create-btn">إنشاء الجروب</button></div>
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
      if (!name) { U.notify('اكتب اسم للجروب', 'تنبيه', '◈'); return; }
      createBtn.disabled = true;
      const r = await this._gpost('/', { name, members });
      createBtn.disabled = false;
      if (r && r.id) {
        this._gmeta[r.id] = { name: r.name, members_count: r.members_count, owner_id: r.owner_id };
        try { overlay.querySelector('[data-close]').click(); } catch (e) {}
        this.openGroup({ id: r.id, name: r.name, members_count: r.members_count, owner_id: r.owner_id });
      } else U.notify((r && r.error) || 'تعذّر إنشاء الجروب', 'تنبيه', '◈');
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
      const gname = (this._gmeta[gid] && this._gmeta[gid].name) || 'جروب';
      try { if (window.SFX) window.SFX.chat(); } catch (e) {}
      window.amkhUI.notify(msg.sender_name + ': ' + this._previewOf(d), `👥 ${gname}`, '◉');
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
    /* اتحطّينا في جروب جديد — نحدّث الشارة، والصندوق لو مفتوح. */
    this._gunread[d.group_id] = (this._gunread[d.group_id] || 0);
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
    this._gmeta[gid] = { name: group.name || 'جروب', members_count: group.members_count || 0, owner_id: group.owner_id };

    const overlay = U.mount('amkh-chat-modal', `
      <div class="ds-sheet ch-conv ch-conv--group" id="amkh-chat-panel">
        <div class="ch-conv__head">
          <button class="ch-back" data-close aria-label="رجوع">›</button>
          <span class="ch-conv__av ch-conv__av--group" aria-hidden="true">👥</span>
          <div class="ch-conv__id">
            <span class="ch-conv__name"></span>
            <span class="ch-conv__sub"></span>
          </div>
          <button class="ch-conv__info" id="ch-grp-info" aria-label="أعضاء الجروب">⋯</button>
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
      e.textContent = 'مفيش رسايل لسه — ابدأ الكلام مع الجروب 👋';
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
    const rowsHtml = data.members.map(mem => {
      const isOwner = mem.id === data.owner_id;
      return `<div class="grp-mem"><span class="grp-mem__av" data-av="${mem.id}"></span>`
        + `<span class="grp-mem__name"></span>${isOwner ? '<span class="grp-mem__tag">المالك</span>' : ''}</div>`;
    }).join('');
    const overlay = U.mount('amkh-grp-members', `
      <div class="ds-sheet grp-sheet">
        <div class="ch-inbox__head"><button class="ch-back" data-close>›</button><h2 class="ch-inbox__title">أعضاء الجروب</h2></div>
        <div class="grp-mem__list">${rowsHtml}</div>
        <div class="grp-sheet__foot"><button class="ds-btn ds-btn--danger" id="grp-leave">مغادرة الجروب</button></div>
      </div>`, { sheet: true, sfx: 'members' });
    /* أسماء وصور بأمان (textContent) */
    data.members.forEach(mem => {
      const av = overlay.querySelector(`[data-av="${mem.id}"]`);
      if (av) this._paintAvatar(av, { name: mem.display_name || mem.username, avatar_url: mem.avatar_url });
    });
    const names = overlay.querySelectorAll('.grp-mem__name');
    data.members.forEach((mem, i) => { if (names[i]) names[i].textContent = (mem.display_name || mem.username) + (mem.id === meId ? ' (أنت)' : ''); });
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
};
window.amkhChat = amkhChat;
