// friends-client.js
// يعالج قائمة الأصدقاء ودعوات اللعب

const amkhFriends = {
  friends: [],
  requests: { incoming: [], outgoing: [] },
  
  async getAuthHeader() {
    if (!window.amkhAuth || !window.amkhAuth.token) return null;
    return { 'Authorization': `Bearer ${window.amkhAuth.token}`, 'ngrok-skip-browser-warning': 'true' };
  },

  async loadFriends() {
    const headers = await this.getAuthHeader();
    if (!headers) return;
    try {
      const res = await fetch(`${window.getApiBase()}/friends`, { headers });
      if (res.ok) {
        this.friends = await res.json();
      }
    } catch (e) {}
  },

  async loadRequests() {
    const headers = await this.getAuthHeader();
    if (!headers) return;
    try {
      const res = await fetch(`${window.getApiBase()}/friends/requests`, { headers });
      if (res.ok) {
        this.requests = await res.json();
      }
    } catch (e) {}
  },

  async sendRequest(receiver_id) {
    const headers = await this.getAuthHeader();
    if (!headers) return;
    try {
      await fetch(`${window.getApiBase()}/friends/request`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id })
      });
      window.amkhUI.notify('تم إرسال طلب الصداقة', 'تم', '◉');
      this.loadRequests();
    } catch (e) {
      window.amkhUI.notify('تعذّر إرسال الطلب. تأكد من الإنترنت وحاول تاني.', 'لم يتم الإرسال', '◈');
    }
  },

  async respondRequest(request_id, action) {
    const headers = await this.getAuthHeader();
    if (!headers) return;
    try {
      await fetch(`${window.getApiBase()}/friends/respond`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, action })
      });
      await this.loadRequests();
      await this.loadFriends();
      this.renderFriendsUI();
    } catch (e) {}
  },

  async searchUsers(query) {
    const headers = await this.getAuthHeader();
    if (!headers) return [];
    try {
      const res = await fetch(`${window.getApiBase()}/friends/search?q=${encodeURIComponent(query)}`, { headers });
      if (res.ok) return await res.json();
    } catch (e) {}
    return [];
  },

  inviteFriend(friend_id) {
    const ws = window.chessWs || window.socket || (window.getWs && window.getWs());
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'friend:invite', friend_id }));
      window.amkhUI.notify('تم إرسال الدعوة — استنى صاحبك يقبل', 'تم', '◉');
    } else {
      window.amkhUI.notify('لازم تكون متصل بالأونلاين الأول عشان تبعت دعوة.', 'غير متصل', '◈');
    }
  },

  /* قائمة الأصدقاء قائمة طويلة، فالورقة السفلية أنسب من نافذة صغيرة —
     نفس نمط باقي القوائم في التطبيق. */
  async showFriendsModal() {
    const U = window.amkhUI;
    const overlay = U.mount('amkh-friends-modal', `
      <div class="ds-sheet" id="amkh-friends-panel">
        <div class="ds-sheet__handle" aria-hidden="true"></div>
        <div class="ds-sheet__header">
          <h3 class="ds-sheet__title">الأصدقاء</h3>
          <button class="ds-sheet__close" data-close aria-label="إغلاق">✕</button>
        </div>
        <div class="ds-sheet__body">
          <div class="fr-search">
            <input type="text" id="friend-search-input" class="ds-input" placeholder="ابحث بالاسم أو البريد…">
            <button id="btn-friend-search" class="ds-btn ds-btn--secondary">بحث</button>
          </div>
          <div id="friend-search-results" class="fr-group"></div>
          <div id="friend-requests-container" class="fr-group"></div>
          <div id="friends-list-container" class="fr-group"></div>
        </div>
      </div>`, { sheet: true });

    if (window.DSOverlay && window.DSOverlay.makeSheetDraggable) {
      try { window.DSOverlay.makeSheetDraggable('amkh-friends-modal', 'amkh-friends-panel'); } catch (e) {}
    }

    const listDiv = overlay.querySelector('#friends-list-container');
    listDiv.innerHTML = '<p class="fr-empty">جاري التحميل…</p>';

    const input = overlay.querySelector('#friend-search-input');
    const searchBtn = overlay.querySelector('#btn-friend-search');
    const runSearch = async () => {
      const q = input.value.trim();
      const resDiv = overlay.querySelector('#friend-search-results');
      if (q.length < 3) { resDiv.innerHTML = '<p class="fr-empty">اكتب 3 حروف على الأقل للبحث</p>'; return; }
      resDiv.innerHTML = '<p class="fr-empty">جاري البحث…</p>';
      const results = await this.searchUsers(q);
      if (!results.length) { resDiv.innerHTML = '<p class="fr-empty">مفيش حد بالاسم ده</p>'; return; }
      resDiv.innerHTML = '<h4 class="fr-heading">نتائج البحث</h4>';
      results.forEach(u => {
        const row = this._row(u.display_name || u.email, null);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ds-btn ds-btn--secondary ds-btn--sm';
        btn.textContent = 'إضافة';
        btn.onclick = () => { U.sfx(); btn.disabled = true; btn.textContent = 'تم الإرسال'; this.sendRequest(u.id); };
        row.appendChild(btn);
        resDiv.appendChild(row);
      });
    };
    searchBtn.onclick = () => { U.sfx(); runSearch(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

    await this.loadFriends();
    await this.loadRequests();
    this.renderFriendsUI();
  },

  /* صف لاعب: اسم + حالة اختيارية، والأزرار بتتضاف من برّه */
  _row(name, online) {
    const U = window.amkhUI;
    const d = document.createElement('div');
    d.className = 'fr-row';
    const status = online === null || online === undefined ? '' :
      `<span class="fr-row__status ${online ? 'is-online' : ''}">${online ? 'أونلاين' : 'غير متصل'}</span>`;
    d.innerHTML = `<span class="fr-row__info">
        <span class="fr-row__name">${U.esc(name)}</span>${status}
      </span>`;
    return d;
  },

  renderFriendsUI() {
    const U = window.amkhUI;
    const reqDiv = document.getElementById('friend-requests-container');
    const listDiv = document.getElementById('friends-list-container');
    if (!reqDiv || !listDiv) return;

    // الطلبات الواردة
    reqDiv.innerHTML = '';
    if (this.requests.incoming && this.requests.incoming.length > 0) {
      reqDiv.innerHTML = '<h4 class="fr-heading">طلبات واردة</h4>';
      this.requests.incoming.forEach(r => {
        const row = this._row(r.display_name || r.email, null);
        const acts = document.createElement('div');
        acts.className = 'fr-row__acts';

        const accept = document.createElement('button');
        accept.type = 'button';
        accept.className = 'ds-btn ds-btn--primary ds-btn--sm';
        accept.textContent = 'قبول';
        accept.onclick = () => { U.sfx(); this.respondRequest(r.id, 'accept'); };

        const reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'ds-btn ds-btn--ghost ds-btn--sm';
        reject.textContent = 'رفض';
        reject.onclick = () => { U.sfx(); this.respondRequest(r.id, 'decline'); };

        acts.appendChild(accept);
        acts.appendChild(reject);
        row.appendChild(acts);
        reqDiv.appendChild(row);
      });
    }

    // قائمة الأصدقاء
    listDiv.innerHTML = '<h4 class="fr-heading">أصدقائي</h4>';
    if (!this.friends.length) {
      listDiv.innerHTML += '<p class="fr-empty">لسه مضفتش أصدقاء — دوّر بالاسم أو البريد فوق.</p>';
      return;
    }
    this.friends.forEach(f => {
      const row = this._row(f.display_name || f.email, !!f.is_online);
      if (f.is_online) {
        const invBtn = document.createElement('button');
        invBtn.type = 'button';
        invBtn.className = 'ds-btn ds-btn--primary ds-btn--sm';
        invBtn.textContent = 'العب';
        invBtn.onclick = () => {
          U.sfx();
          this.inviteFriend(f.id);
          const ov = document.getElementById('amkh-friends-modal');
          if (ov && ov._dismiss) ov._dismiss();
        };
        row.appendChild(invBtn);
      }
      listDiv.appendChild(row);
    });
  },

  listenForInvites() {
    /* لا نستبدل window.WebSocket: الاستبدال القديم أسقط الثوابت الساكنة
       مثل WebSocket.OPEN، فكان اتصال اللعبة يفتح لكن send() يرفض إرسال
       create/join وتظل الشاشة على «جاري الاتصال» للأبد. نراقب الرسائل
       بإضافة listener لكل socket مع إبقاء الـconstructor الأصلي كما هو. */
    const OriginalWS = window.WebSocket;
    if (!OriginalWS || OriginalWS.__amkhFriendsObserved) return;

    const ObservedWS = function(url, protocols) {
      const ws = protocols === undefined
        ? new OriginalWS(url)
        : new OriginalWS(url, protocols);

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'friend:invite-received') {
            amkhFriends.handleInvite(msg);
          } else if (msg.type === 'friend:presence-update') {
            if (document.getElementById('amkh-friends-modal')) {
              amkhFriends.loadFriends().then(() => amkhFriends.renderFriendsUI());
            }
          }
        } catch(e) {}
      });

      ws.addEventListener('open', () => {
        if (window.amkhAuth && window.amkhAuth.token) {
          ws.send(JSON.stringify({ type: 'presence:hello', token: window.amkhAuth.token }));
        }
      });
      return ws;
    };

    Object.setPrototypeOf(ObservedWS, OriginalWS);
    ObservedWS.prototype = OriginalWS.prototype;
    ObservedWS.__amkhFriendsObserved = true;
    window.WebSocket = ObservedWS;
  },

  async handleInvite(msg) {
    const wantsToPlay = await window.amkhUI.confirm(
      'دعوة للعب',
      `${msg.from_user} بيدعوك لمباراة أونلاين. تقبل؟`,
      'اقبل والعب', 'مش دلوقتي'
    );
    if (wantsToPlay) {
      // Auto join room
      window.location.hash = 'online?room=' + msg.room_code;
      window.location.reload(); // Quick way to force join logic in the main app
    }
  }
};

window.amkhFriends = amkhFriends;
amkhFriends.listenForInvites();
