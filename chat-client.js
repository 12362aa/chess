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

  _key(a, b) { const x = Number(a), y = Number(b); return Math.min(x, y) + ':' + Math.max(x, y); },
  _me() { return window.amkhAuth && window.amkhAuth.user && window.amkhAuth.user.id; },
  _socket() { return window.amkhFriends ? window.amkhFriends._socket() : null; },

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
    const msg = { id: null, client_id: clientId, from: this._me(), to: friendId, mine: true, body, created_at: new Date().toISOString(), read: false, pending: true };
    (this._msgs[key] = this._msgs[key] || []).push(msg);
    if (this._openWith === friendId) this._appendBubble(msg, true);
    try { ws.send(JSON.stringify({ type: 'chat:send', to: friendId, body, client_id: clientId })); } catch (e) {}
    try { if (window.SFX) window.SFX.chat(); } catch (e) {}
  },

  _typing(friendId) {
    const ws = this._socket();
    if (!ws) return;
    const now = Date.now();
    if (this._lastTyping && now - this._lastTyping < 2500) return;
    this._lastTyping = now;
    try { ws.send(JSON.stringify({ type: 'chat:typing', to: friendId })); } catch (e) {}
  },

  handleSocketMessage(d) {
    if (!d || typeof d.type !== 'string') return false;
    switch (d.type) {
      case 'chat:message': return this._onMessage(d);
      case 'chat:sent': return this._onSent(d);
      case 'chat:read-receipt': return this._onReadReceipt(d);
      case 'chat:typing': return this._onTyping(d);
      case 'chat:unread': return this._onUnreadSnapshot(d);
      case 'chat:error':
        window.amkhUI.notify(d.reason === 'not-friend' ? 'لازم يكون صديقك' : 'تعذّر إرسال الرسالة', 'لم يتم', '◈');
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
    const msg = { id: d.id, client_id: d.client_id || null, from: d.from, to: d.to, mine, body: d.body, created_at: d.created_at, read: false };
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
      window.amkhUI.notify(d.body, `💬 ${name}`, '◉');
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
        if (tick) tick.textContent = d.delivered ? '✓✓' : '✓';
      }
    }
    return true;
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
    const total = this._unreadTotal();
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
        <div class="ch-input">
          <textarea id="ch-text" class="ds-input ch-text" rows="1" placeholder="اكتب رسالة…" autocomplete="off"></textarea>
          <button class="ds-btn ds-btn--primary ch-send" id="ch-send" aria-label="إرسال">➤</button>
        </div>
      </div>`, { sheet: true, sfx: 'default', onDismiss: () => { this._openWith = null; this._sheet = null; } });

    overlay.dataset.view = 'conv';
    this._sheet = overlay;
    this._openWith = fid;

    overlay.querySelector('.ch-conv__name').textContent = name;
    this._paintAvatar(overlay.querySelector('.ch-conv__av'), this._friendMeta[fid]);
    this._paintSub(overlay.querySelector('.ch-conv__sub'), this._friendMeta[fid]);

    const ta = overlay.querySelector('#ch-text');
    const sendBtn = overlay.querySelector('#ch-send');
    const doSend = () => {
      const v = ta.value.trim();
      if (!v) return;
      this.sendMessage(fid, v);
      ta.value = ''; ta.style.height = 'auto';
      ta.focus();
    };
    sendBtn.onclick = () => { U.sfx(); doSend(); };
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; this._typing(fid); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
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
    const body = document.createElement('div');
    body.className = 'ch-bubble__body';
    body.textContent = m.body;                 /* نص دايمًا مش HTML */
    b.appendChild(body);
    const meta = document.createElement('div');
    meta.className = 'ch-bubble__meta';
    const time = document.createElement('span');
    time.className = 'ch-time';
    time.textContent = this._time(m.created_at);
    meta.appendChild(time);
    if (m.mine) {
      const tick = document.createElement('span');
      tick.className = 'ch-tick' + (m.read ? ' is-read' : '');
      tick.textContent = m.pending ? '🕓' : (m.read ? '✓✓' : '✓');
      meta.appendChild(tick);
    }
    b.appendChild(meta);
    return b;
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
        <div class="ch-inbox__list" id="ch-inbox-list">
          <p class="ch-empty">جارِ التحميل…</p>
        </div>
      </div>`, { sheet: true, sfx: 'default', onDismiss: () => { this._openWith = null; this._sheet = null; } });

    overlay.dataset.view = 'inbox';
    this._sheet = overlay;
    this._openWith = null;

    const data = await this._get('/conversations');
    const listEl = overlay.querySelector('#ch-inbox-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      const e = document.createElement('p');
      e.className = 'ch-empty';
      e.textContent = 'مفيش رسايل لسه — افتح محادثة مع صاحبك من قائمة الأصدقاء.';
      listEl.appendChild(e);
      return;
    }
    rows.forEach(r => {
      const f = r.friend || {};
      this._friendMeta[f.id] = {
        name: f.display_name || f.username || 'صديق',
        avatar_url: f.avatar_url || null,
        status: f.status, online: f.online, last_seen_at: f.last_seen_at,
      };
      if (typeof r.unread === 'number') this._unread[f.id] = r.unread;
      listEl.appendChild(this._inboxRow(r));
    });
    this._updateBadge();
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
};
window.amkhChat = amkhChat;
