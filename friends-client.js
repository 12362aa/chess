/* ══════════════════════════════════════════════════════════════════════
   نظام الأصدقاء — العميل
   ──────────────────────────────────────────────────────────────────────
   ورقة سفلية واحدة فيها تبويبين: أصدقائك، وبحث. الطلبات الواردة بتظهر
   فوق كشريط تنبيه لأنها الحاجة الوحيدة اللي محتاجة قرار منك.

   مبادئ:
   • الأسماء اللي بيكتبها المستخدم بتتحط بـtextContent مش innerHTML.
     اسم لاعب فيه <script> مش المفروض يتنفّذ في تليفون صاحبه.
   • الحالة بتتحدّث من رسائل الـWebSocket على طول، مش بـpolling. القائمة
     بتتحمّل مرة وبعد كده أي تغيير جاي من السيرفر بيعدّل السطر بس.
   • كل زر بيتقفل وهو شغّال، عشان دبل-كليك مايبعتش طلبين.
══════════════════════════════════════════════════════════════════════ */
const amkhFriends = {
  _friends: [],
  _requests: { incoming: [], outgoing: [] },
  _invites: [],           /* دعوات واردة لسه صالحة */
  _sheet: null,           /* الورقة المفتوحة دلوقتي، لو مفتوحة */
  _tab: 'friends',
  _outgoingInvite: null,  /* دعوة أنا باعتها ومستني ردّ */

  async getAuthHeader() {
    if (!window.amkhAuth || !window.amkhAuth.token) return null;
    /* نفس سبب الحماية في auth-client: نداءات الأصدقاء بتفشل بصمت لو
       رابط السيرفر ماكانش اتحمّل، لأن getApiBase بترجع مسار نسبي. */
    if (window.amkhEnsureServer && !await window.amkhEnsureServer()) return null;
    return { 'Authorization': `Bearer ${window.amkhAuth.token}`, 'ngrok-skip-browser-warning': 'true' };
  },

  async _get(path) {
    const headers = await this.getAuthHeader();
    if (!headers) return null;
    try {
      const res = await fetch(`${window.getApiBase()}${path}`, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  },

  async _post(path, body) {
    const headers = await this.getAuthHeader();
    if (!headers) return { ok: false, error: 'مش مسجّل دخول' };
    try {
      const res = await fetch(`${window.getApiBase()}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, error: data.error, data };
    } catch (e) { return { ok: false, error: 'تأكد من الإنترنت' }; }
  },

  /* ── تحميل البيانات ── */
  /* كاش محلي للأصدقاء: القائمة لازم ماتختفيش أبدًا حتى لو السيرفر واقع أو
     مفيش نت. بنخزّنها لكل مستخدم على حدة (بمفتاح فيه id الحساب) عشان
     حساب مايشوفش أصدقاء حساب تاني. */
  _cacheKey() {
    const uid = window.amkhAuth && window.amkhAuth.user && window.amkhAuth.user.id;
    return uid ? `amkh_friends_cache_${uid}` : null;
  },
  _saveCache(list) {
    const key = this._cacheKey();
    if (!key || !Array.isArray(list)) return;
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
  },
  _loadCache() {
    const key = this._cacheKey();
    if (!key) return [];
    try {
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(arr)) return [];
      /* السيرفر مش موصول، فمش عارفين الحضور الحقيقي: نعرضهم «غير متصل»
         عشان مانضلّلش. أي رسالة حضور جاية بعدين بتصحّح السطر. */
      return arr.map(f => ({ ...f, online: false, status: 'offline' }));
    } catch (e) { return []; }
  },
  async loadFriends() {
    const data = await this._get('/friends');
    if (Array.isArray(data)) {
      this._friends = data;
      this._saveCache(data);        /* نجاح: نحدّث الكاش */
    } else if (!this._friends.length) {
      this._friends = this._loadCache();   /* فشل والقائمة فاضية: من الكاش */
    }
    return this._friends;
  },
  async loadRequests() {
    this._requests = (await this._get('/friends/requests')) || { incoming: [], outgoing: [] };
    this._updateBadge();
    return this._requests;
  },
  async searchUsers(q) { return (await this._get(`/friends/search?q=${encodeURIComponent(q)}`)) || []; },

  /* ── أفعال ── */
  async sendRequest(userId) {
    const r = await this._post('/friends/request', { receiver_id: userId });
    if (r.ok) {
      window.amkhUI.notify(r.data.status === 'friends' ? 'بقيتم أصدقاء' : 'تم إرسال طلب الصداقة', 'تم', '◉');
      await this.loadFriends();
      if (this._sheet) this._render();
    } else {
      window.amkhUI.notify(r.error || 'تعذّر إرسال الطلب', 'لم يتم', '◈');
    }
    return r.ok;
  },

  async respondRequest(requestId, action) {
    const r = await this._post('/friends/respond', { request_id: requestId, action });
    if (r.ok) {
      await Promise.all([this.loadRequests(), this.loadFriends()]);
      if (this._sheet) this._render();
    } else {
      window.amkhUI.notify(r.error || 'تعذّر الرد على الطلب', 'لم يتم', '◈');
    }
    return r.ok;
  },

  async removeFriend(userId, name) {
    const yes = await window.amkhUI.confirm('إزالة صديق', `متأكد إنك عايز تشيل ${name} من أصدقائك؟`, 'شيله', 'إلغاء');
    if (!yes) return;
    const headers = await this.getAuthHeader();
    try {
      await fetch(`${window.getApiBase()}/friends/${userId}`, { method: 'DELETE', headers });
      await this.loadFriends();
      if (this._sheet) this._render();
    } catch (e) { window.amkhUI.notify('تعذّر الحذف', 'لم يتم', '◈'); }
  },

  async blockUser(userId, name) {
    const yes = await window.amkhUI.confirm('حظر لاعب', `${name} مش هيقدر يبعتلك طلب ولا دعوة، ومش هيلاقيك في البحث.`, 'احظره', 'إلغاء');
    if (!yes) return;
    const r = await this._post('/friends/block', { user_id: userId });
    if (r.ok) {
      await Promise.all([this.loadFriends(), this.loadRequests()]);
      if (this._sheet) this._render();
      window.amkhUI.notify('تم الحظر', 'تم', '◉');
    } else window.amkhUI.notify(r.error || 'تعذّر الحظر', 'لم يتم', '◈');
  },

  /* أي سوكت مفتوح ينفع للأصدقاء: سوكت الأونلاين لو المستخدم فاتح مباراة،
     وإلا سوكت الحضور اللي بيفضل مفتوح طول ما هو مسجّل دخول. النسخة
     القديمة كانت بتدوّر على سوكت الأونلاين بس، فالدعوة كانت تفشل بـ
     «لازم تكون متصل بالأونلاين» وهو أصلًا متصل. */
  _socket() {
    /* نفضّل سوكت الحضور المُعرّف بالتوكن (بيبعت presence:hello فالسيرفر
       عارف صاحبه). سوكت الأونلاين العادي (window.chessWs) ممكن يكون مفتوح
       ومش معرّف على السيرفر — ولو بعتنا الشات/الدعوة عليه، السيرفر كان
       بيلاقي socketUser فاضي فيهمل الرسالة من غير أي رد، فتفضل الساعة
       عالقة على الرسالة للأبد (مش علاقة بالحجم خالص). التفضيل هنا بيضمن
       إن الشات دايمًا يمشي على سوكت معرّف. */
    const p = window.amkhAuth && window.amkhAuth._presWs;
    if (p && p.readyState === 1) return p;
    const a = window.chessWs;
    if (a && a.readyState === 1) return a;
    return null;
  },

  /* ── دعوة لمباراة ──
     بتمشي على الـWebSocket مش HTTP: السيرفر لازم يوصّلها للطرف التاني
     لحظيًا، ونفس السوكت هو اللي هيبدأ المباراة لو قبل. */
  inviteFriend(friendId, name, color, rated, tc) {
    const ws = this._socket();
    if (!ws) {
      window.amkhUI.notify('مفيش اتصال بالسيرفر دلوقتي. تأكد من الإنترنت وحاول تاني.', 'غير متصل', '◈');
      return false;
    }
    /* الداعي بيختار لونه زي الأونلاين العادي: أبيض/أسود/عشوائي. السيرفر
       بياخد ده كلون المضيف (الداعي) والمدعو بياخد العكس. */
    const c = (color === 'w' || color === 'b') ? color : 'r';
    ws.send(JSON.stringify({ type: 'friend:invite', friend_id: friendId, color: c, rated: !!rated, tc: tc || null }));
    this._outgoingInvite = { friend_id: friendId, name, at: Date.now() };
    window.amkhUI.notify(`تم إرسال الدعوة لـ${name} — استنى يقبل`, 'تم', '◉');
    return true;
  },

  /* ── رسائل الـWebSocket ──
     index.html بينادي الدالة دي لكل رسالة جاية من السيرفر. بترجّع true
     لو استهلكت الرسالة، عشان اللي بيناديها يعرف إنها مش محتاجة معالجة
     تانية. */
  handleSocketMessage(d) {
    if (!d || typeof d.type !== 'string') return false;
    if (!d.type.startsWith('friend:') && !d.type.startsWith('party:')) return false;
    switch (d.type) {
      case 'friend:presence-update': {
        const f = this._friends.find(x => x.id === d.friend_id);
        if (f) {
          f.status = d.status || (d.is_online ? 'online' : 'offline');
          f.online = f.status !== 'offline';
          f.last_seen_at = d.last_seen_at || f.last_seen_at;
          this._patchRow(f);
        }
        return true;
      }
      case 'friend:request-received':
        this.loadRequests().then(() => { if (this._sheet) this._render(); });
        if (d.from) window.amkhUI.notify(`${d.from.display_name || d.from.username} عايز يضيفك صديق`, 'طلب صداقة', '◉');
        return true;
      case 'friend:added':
        this.loadFriends().then(() => { if (this._sheet) this._render(); });
        if (d.friend) window.amkhUI.notify(`${d.friend.display_name || d.friend.username} بقى صديقك`, 'صداقة جديدة', '◉');
        return true;
      case 'friend:removed':
        this.loadFriends().then(() => { if (this._sheet) this._render(); });
        return true;
      case 'friend:invite-received':
        if (d.invite) this._showInvite(d.invite);
        return true;
      case 'friend:invite-sent':
        if (d.delivered === false) {
          window.amkhUI.notify('صاحبك مش متصل دلوقتي — هيلاقي الدعوة أول ما يفتح التطبيق', 'الدعوة مسجّلة', '◈');
        }
        return true;
      case 'friend:invite-declined': {
        const n = this._outgoingInvite && this._outgoingInvite.name;
        window.amkhUI.notify(n ? `${n} رفض الدعوة` : 'الدعوة اترفضت', 'مرفوضة', '◈');
        this._outgoingInvite = null;
        return true;
      }
      case 'friend:invite-cancelled':
        this._closeInvite(d.invite_id);
        return true;
      case 'friend:invite-room':
        /* المباراة بتبدأ من رسالة start العادية — ده مجرد تأكيد */
        this._outgoingInvite = null;
        this._closeInvite();
        return true;
      case 'friend:invite-error': {
        const map = {
          'not-friend': 'لازم يكون صديقك الأول',
          'blocked': 'مش ممكن إرسال الدعوة',
          'expired': 'الدعوة انتهت',
          'host-offline': 'اللاعب قفل التطبيق',
        };
        window.amkhUI.notify(map[d.reason] || 'تعذّر إتمام الدعوة', 'لم يتم', '◈');
        this._outgoingInvite = null;
        return true;
      }
      case 'friend:requests-pending':
        this.loadRequests();
        return true;
      case 'party:invite':
        this._showPartyInvite(d);
        return true;
      default:
        return false;
    }
  },

  /* ── نافذة الدعوة الواردة ──
     بتعدّ تنازليًا وبتقفل نفسها لوحدها، عشان اللاعب مايقعدش يبص على
     دعوة ميتة. */
  _showInvite(invite) {
    const U = window.amkhUI;
    this._invites = this._invites.filter(i => i.id !== invite.id).concat([invite]);
    const from = invite.from || {};
    const name = from.display_name || from.username || 'صديق';
    const seconds = Number(invite.expires_in) || 90;

    const overlay = U.mount('amkh-invite-modal', `
      <div class="ds-dialog fr-invite" data-invite="${Number(invite.id)}">
        <div class="ds-dialog__icon" aria-hidden="true"><i class="ico ico--online"></i></div>
        <h2 class="ds-dialog__title">دعوة لمباراة</h2>
        <p class="ds-dialog__message"><b class="fr-invite__name"></b> بيدعيك للعب دلوقتي</p>
        ${invite.rated ? '<p class="fr-invite__rated">★ مباراة مصنّفة — هتأثّر على تقييمك</p>' : ''}
        ${invite.tc ? `<p class="fr-invite__rated">⏱ زمن المباراة: ${Math.round(invite.tc.base / 60)} دقيقة${invite.tc.inc ? ` + ${invite.tc.inc} ث/نقلة` : ''}</p>` : ''}
        <div class="fr-invite__timer" aria-hidden="true"><span class="fr-invite__bar"></span></div>
        <p class="fr-invite__left"><span class="fr-invite__n">${seconds}</span> ثانية</p>
        <div class="ds-dialog__actions" style="flex-direction:column;">
          <button class="ds-btn ds-btn--primary ds-btn--block" data-accept>قبول واللعب</button>
          <button class="ds-btn ds-btn--ghost ds-btn--block" data-decline>رفض</button>
        </div>
      </div>`, { sfx: 'invite' });
    /* الاسم نص مش HTML */
    overlay.querySelector('.fr-invite__name').textContent = name;

    const bar = overlay.querySelector('.fr-invite__bar');
    const numEl = overlay.querySelector('.fr-invite__n');
    let left = seconds;
    const tick = setInterval(() => {
      left--;
      if (numEl) numEl.textContent = String(Math.max(0, left));
      if (bar) bar.style.width = Math.max(0, (left / seconds) * 100) + '%';
      if (left <= 0) { clearInterval(tick); U.close(overlay); }
    }, 1000);
    if (bar) bar.style.width = '100%';

    const send = (action) => {
      clearInterval(tick);
      const ws = this._socket();
      if (ws) {
        ws.send(JSON.stringify({ type: 'friend:invite-respond', invite_id: invite.id, action }));
      }
      this._invites = this._invites.filter(i => i.id !== invite.id);
      U.close(overlay);
    };
    overlay.querySelector('[data-accept]').onclick = () => { U.sfx(); send('accept'); };
    overlay.querySelector('[data-decline]').onclick = () => { U.sfx(); send('decline'); };
  },

  /* ── دعوة انضمام لحفلة (بديل الإضافة المباشرة لما الخصوصية تمنعها) ──
     مش زي دعوة اللعب: مالهاش عدّاد لحظي (بتعيش 72 ساعة على السيرفر)،
     والرد بيروح HTTP لراوتر الحفلات مش على السوكت. */
  _showPartyInvite(d) {
    const U = window.amkhUI;
    const iid = Number(d.invite_id);
    if (!iid) return;
    /* نتجنّب تكرار نفس الدعوة لو وصلت مرتين */
    if (document.querySelector(`[data-party-invite="${iid}"]`)) return;
    const pname = d.party_name || 'حفلة';
    const fname = d.from_name || 'صديق';

    const overlay = U.mount('amkh-party-invite-modal', `
      <div class="ds-dialog fr-invite" data-party-invite="${iid}">
        <div class="ds-dialog__icon" aria-hidden="true"><i class="ico ico--join"></i></div>
        <h2 class="ds-dialog__title">دعوة لحفلة</h2>
        <p class="ds-dialog__message"><b class="fr-invite__name"></b> بيدعيك تنضم لحفلة «<b class="fr-invite__party"></b>»</p>
        <div class="ds-dialog__actions" style="flex-direction:column;">
          <button class="ds-btn ds-btn--primary ds-btn--block" data-accept>انضمام</button>
          <button class="ds-btn ds-btn--ghost ds-btn--block" data-decline>رفض</button>
        </div>
      </div>`, { sfx: 'invite' });
    overlay.querySelector('.fr-invite__name').textContent = fname;
    overlay.querySelector('.fr-invite__party').textContent = pname;

    const done = async (action) => {
      U.close(overlay);
      const r = await this._post(`/groups/party-invite/${iid}/${action}`, {});
      if (action === 'accept') {
        if (r && r.ok) U.notify(`انضممت لحفلة «${pname}»`, 'تم', '◉');
        /* السيرفر بيبعت group:created لكل الأعضاء بعد القبول، وamkhChat
           بيحدّث صندوق الحفلات لوحده — مش محتاجين نعمل reload هنا. */
        else U.notify((r && r.error) || 'تعذّر الانضمام', 'لم يتم', '◈');
      }
    };
    overlay.querySelector('[data-accept]').onclick = () => { U.sfx(); done('accept'); };
    overlay.querySelector('[data-decline]').onclick = () => { U.sfx(); done('decline'); };
  },

  /* عند فتح التطبيق: هات أي دعوات حفلات معلّقة واعرضها (اللي وصلت والتطبيق مقفول). */
  async loadPartyInvites() {
    const list = await this._get('/groups/party-invites');
    if (Array.isArray(list)) for (const inv of list) this._showPartyInvite(inv);
  },

  _closeInvite(inviteId) {
    const el = document.getElementById('amkh-invite-modal');
    if (!el) return;
    if (inviteId) {
      const d = el.querySelector('.fr-invite');
      if (d && Number(d.dataset.invite) !== Number(inviteId)) return;
    }
    window.amkhUI.close(el);
  },

  /* المباراة بدأت — نقفل كل نوافذ الدعوة/الأصدقاء على أي طرف: نافذة
     «تم إرسال الدعوة»، الدعوة الواردة، اختيار اللون، وورقة الأصدقاء
     اللي تحتهم. بينادَى من index.html عند رسالة start. */
  closeAllInviteUI() {
    const U = window.amkhUI;
    this._outgoingInvite = null;
    this._invites = [];
    ['amkh-ui-notify', 'amkh-invite-modal', 'amkh-color-modal', 'amkh-friends-modal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { try { U.close(el); } catch (e) { try { el.remove(); } catch (e2) {} } }
    });
    /* لو أي close رمى خطأ وشِلنا العنصر يدويًا، نعيد حساب قفل التمرير عشان
       مايتعلّقش overflow:hidden ويجمّد الصفحة. */
    try { if (window.DSOverlay && window.DSOverlay._syncBodyLock) window.DSOverlay._syncBodyLock(); } catch (e) {}
    this._sheet = null;
  },

  /* ── نافذة اختيار اللون قبل إرسال الدعوة ──
     نافذة متخصصة بالثيم (مش قائمة صغيرة) — 3 أزرار كبيرة واضحة.
     بترجّع 'w' | 'b' | 'r'، أو null لو اتلغت أو اتقفلت. */
  _colorChoice(name) {
    const U = window.amkhUI;
    const TC_PRESETS = { 'none': null, '1+0': { base: 60, inc: 0 }, '3+2': { base: 180, inc: 2 }, '5+0': { base: 300, inc: 0 }, '10+0': { base: 600, inc: 0 }, '15+10': { base: 900, inc: 10 } };
    return new Promise((resolve) => {
      let chosen = null;
      let rated = false;
      let tcKey = 'none';
      const overlay = U.mount('amkh-color-modal', `
        <div class="ds-dialog fr-color">
          <div class="ds-dialog__icon" aria-hidden="true">♟</div>
          <h2 class="ds-dialog__title">تلعب بأنهي لون؟</h2>
          <p class="ds-dialog__message">هتبعت دعوة لـ<b class="fr-color__name"></b></p>
          <div class="fr-color__opts">
            <button class="fr-color__opt" data-color="w">
              <span class="fr-color__disc fr-color__disc--w">♔</span>
              <span class="fr-color__lbl">أبيض</span>
            </button>
            <button class="fr-color__opt" data-color="r">
              <span class="fr-color__disc fr-color__disc--r">⚄</span>
              <span class="fr-color__lbl">عشوائي</span>
            </button>
            <button class="fr-color__opt" data-color="b">
              <span class="fr-color__disc fr-color__disc--b">♚</span>
              <span class="fr-color__lbl">أسود</span>
            </button>
          </div>
          <p class="fr-color__sub">نوع المباراة</p>
          <div class="fr-color__type">
            <button class="fr-color__tbtn is-active" data-rated="0">ودّية</button>
            <button class="fr-color__tbtn" data-rated="1">مصنّفة</button>
          </div>
          <p class="fr-color__sub">زمن المباراة</p>
          <div class="fr-color__type fr-color__tc">
            <button class="fr-color__tbtn is-active" data-tc="none">بدون</button>
            <button class="fr-color__tbtn" data-tc="1+0">1+0</button>
            <button class="fr-color__tbtn" data-tc="3+2">3+2</button>
            <button class="fr-color__tbtn" data-tc="5+0">5+0</button>
            <button class="fr-color__tbtn" data-tc="10+0">10+0</button>
            <button class="fr-color__tbtn" data-tc="15+10">15+10</button>
          </div>
          <div class="ds-dialog__actions">
            <button class="ds-btn ds-btn--ghost ds-btn--block" data-cancel>إلغاء</button>
          </div>
        </div>`, { sfx: 'account', onDismiss: () => resolve(chosen ? { color: chosen, rated, tc: TC_PRESETS[tcKey] || null } : null) });
      overlay.querySelector('.fr-color__name').textContent = name || 'صديق';
      const tbtns = overlay.querySelectorAll('[data-rated]');
      tbtns.forEach((b) => {
        b.onclick = () => { U.sfx(); rated = b.dataset.rated === '1'; tbtns.forEach(x => x.classList.toggle('is-active', x === b)); };
      });
      const tcbtns = overlay.querySelectorAll('[data-tc]');
      tcbtns.forEach((b) => {
        b.onclick = () => { U.sfx(); tcKey = b.dataset.tc; tcbtns.forEach(x => x.classList.toggle('is-active', x === b)); };
      });
      overlay.querySelectorAll('[data-color]').forEach((b) => {
        b.onclick = () => { U.sfx(); chosen = b.dataset.color; overlay._dismiss(); };
      });
      overlay.querySelector('[data-cancel]').onclick = () => { U.sfx(); overlay._dismiss(); };
    });
  },

  /* ── شارة عدد الطلبات على زر الأصدقاء ── */
  _updateBadge() {
    const n = (this._requests.incoming || []).length;
    const btn = document.getElementById('appbar-friends');
    if (!btn) return;
    let dot = btn.querySelector('.amkh-auth-btn__dot');
    if (n > 0) {
      if (!dot) { dot = document.createElement('span'); dot.className = 'amkh-auth-btn__dot'; btn.appendChild(dot); }
    } else if (dot) dot.remove();
  },

  /* ── الورقة ── */
  async showFriendsModal() {
    const U = window.amkhUI;
    if (!window.amkhAuth || !window.amkhAuth.token) {
      U.notify('سجّل دخولك الأول عشان تضيف أصدقاء وتلعب معاهم', 'محتاج حساب', '◈');
      if (window.amkhAuth) window.amkhAuth.showLoginModal();
      return;
    }

    const overlay = U.mount('amkh-friends-modal', `
      <div class="ds-sheet" id="amkh-friends-panel">
        <div class="ds-sheet__handle" aria-hidden="true"></div>
        <div class="ds-sheet__header">
          <h3 class="ds-sheet__title">الأصدقاء</h3>
          <button class="ds-sheet__inbox" data-inbox aria-label="الرسايل">${(window.amkhChat && window.amkhChat.ICONS.chat) || '✉'}</button>
          <button class="ds-sheet__close" data-close aria-label="إغلاق">✕</button>
        </div>
        <div class="fr-tabs" role="tablist">
          <button class="fr-tab is-active" role="tab" data-tab="friends">أصدقائك</button>
          <button class="fr-tab" role="tab" data-tab="search">إضافة صديق</button>
        </div>
        <div class="ds-sheet__body">
          <div id="fr-pane-friends">
            <div id="friend-requests-container" class="fr-group"></div>
            <div id="friends-list-container" class="fr-group"></div>
          </div>
          <div id="fr-pane-search" hidden>
            <div class="fr-search">
              <input type="text" id="friend-search-input" class="ds-input"
                     placeholder="ابحث باسم اللاعب…" autocomplete="off" inputmode="search">
              <button id="btn-friend-search" class="ds-btn ds-btn--secondary">بحث</button>
            </div>
            <p class="fr-hint">اللاعبين بيتلاقوا باسم المستخدم — البريد الإلكتروني مش ظاهر لأي حد.</p>
            <div id="friend-search-results" class="fr-group"></div>
          </div>
        </div>
      </div>`, { sheet: true });

    this._sheet = overlay;
    overlay.addEventListener('ds-closed', () => { this._sheet = null; }, { once: true });
    if (window.DSOverlay && window.DSOverlay.makeSheetDraggable) {
      try { window.DSOverlay.makeSheetDraggable('amkh-friends-modal', 'amkh-friends-panel'); } catch (e) {}
    }

    /* زر صندوق الرسايل في رأس القائمة */
    const inboxBtn = overlay.querySelector('[data-inbox]');
    if (inboxBtn) inboxBtn.onclick = () => { U.sfx(); if (window.amkhChat) window.amkhChat.showInbox(); };

    /* التبويبات */
    overlay.querySelectorAll('.fr-tab').forEach(tab => {
      tab.onclick = () => {
        U.sfx();
        this._tab = tab.dataset.tab;
        overlay.querySelectorAll('.fr-tab').forEach(t => t.classList.toggle('is-active', t === tab));
        overlay.querySelector('#fr-pane-friends').hidden = this._tab !== 'friends';
        overlay.querySelector('#fr-pane-search').hidden = this._tab !== 'search';
        if (this._tab === 'search') { const i = overlay.querySelector('#friend-search-input'); if (i) i.focus(); }
      };
    });

    /* البحث */
    const input = overlay.querySelector('#friend-search-input');
    const resDiv = overlay.querySelector('#friend-search-results');
    let searchTimer = null;
    const runSearch = async () => {
      const q = input.value.trim();
      if (q.length < 2) { resDiv.innerHTML = '<p class="fr-empty">اكتب حرفين على الأقل</p>'; return; }
      resDiv.innerHTML = '<p class="fr-empty">جاري البحث…</p>';
      const results = await this.searchUsers(q);
      resDiv.innerHTML = '';
      if (!results.length) { resDiv.innerHTML = '<p class="fr-empty">مفيش لاعب بالاسم ده</p>'; return; }
      results.forEach(u => resDiv.appendChild(this._searchRow(u)));
    };
    overlay.querySelector('#btn-friend-search').onclick = () => { U.sfx(); runSearch(); };
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } };
    /* بحث تلقائي بعد ما يبطّل كتابة — أقل ضغط على السيرفر من كل حرف */
    input.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 450); };

    /* الأصدقاء لازم يبانوا فورًا وميختفوش أبدًا: لو عندنا كاش نعرضه على
       طول قبل ما نكلّم السيرفر، وبعدين نحدّث لما الرد يوصل. */
    if (!this._friends.length) {
      const cached = this._loadCache();
      if (cached.length) this._friends = cached;
    }
    if (this._friends.length) {
      this._render();
    } else {
      overlay.querySelector('#friends-list-container').innerHTML = '<p class="fr-empty">جاري التحميل…</p>';
    }
    await Promise.all([this.loadFriends(), this.loadRequests()]);
    this._render();
  },

  /* ── الرسم ── */
  _render() {
    const overlay = this._sheet;
    if (!overlay) return;
    const reqDiv = overlay.querySelector('#friend-requests-container');
    const listDiv = overlay.querySelector('#friends-list-container');
    if (!reqDiv || !listDiv) return;

    /* الطلبات الواردة */
    reqDiv.innerHTML = '';
    const incoming = this._requests.incoming || [];
    if (incoming.length) {
      const h = document.createElement('h4');
      h.className = 'fr-heading';
      h.textContent = `طلبات صداقة (${incoming.length})`;
      reqDiv.appendChild(h);
      incoming.forEach(r => reqDiv.appendChild(this._requestRow(r)));
    }

    /* الأصدقاء */
    listDiv.innerHTML = '';
    if (!this._friends.length) {
      listDiv.innerHTML = '<p class="fr-empty">لسه مفيش أصدقاء. دوّر على صاحبك من تبويب «إضافة صديق».</p>';
      return;
    }
    const h2 = document.createElement('h4');
    h2.className = 'fr-heading';
    const online = this._friends.filter(f => f.online).length;
    h2.textContent = online ? `أصدقاؤك — ${online} متصل` : 'أصدقاؤك';
    listDiv.appendChild(h2);
    this._friends.forEach(f => listDiv.appendChild(this._friendRow(f)));
  },

  /* سطر أساسي: أفاتار + اسم + حالة. الأسماء بـtextContent دايمًا. */
  _baseRow(user, statusText, statusClass) {
    const row = document.createElement('div');
    row.className = 'fr-row';
    row.dataset.uid = String(user.id);

    const av = document.createElement('span');
    av.className = 'fr-row__av';
    av.setAttribute('aria-hidden', 'true');
    const label = String(user.display_name || user.username || '؟').trim();
    const initial = label.slice(0, 1).toUpperCase();
    /* أفاتار حقيقي لو الخادم رجّع صورة (data URL للمستخدم العادي أو رابط
       جوجل)، وإلا الحرف الأول. أي فشل تحميل يرجع للحرف تلقائيًا. */
    if (user.avatar_url) {
      const img = document.createElement('img');
      img.className = 'fr-row__av-img';
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.remove(); av.textContent = initial; };
      img.src = user.avatar_url;
      av.appendChild(img);
    } else {
      av.textContent = initial;
    }
    row.appendChild(av);

    const info = document.createElement('div');
    info.className = 'fr-row__info';
    /* صف الاسم: الاسم (يتقصّ لو طويل) + شارة التقييم كعنصر شقيق له مساحته
       الخاصة، عشان الاسم الطويل مايبلعش التقييم زي ما كان بيحصل. */
    const nmRow = document.createElement('div');
    nmRow.className = 'fr-row__nmrow';
    const nm = document.createElement('span');
    nm.className = 'fr-row__name';
    nm.textContent = label;
    nmRow.appendChild(nm);
    /* شارة تقييم صغيرة جنب الاسم — بتظهر لكل مستخدم زي chess.com */
    if (user && isFinite(user.rating)) {
      const rt = document.createElement('span');
      rt.className = 'fr-row__rating';
      rt.textContent = String(Math.round(user.rating));
      nmRow.appendChild(rt);
    }
    const st = document.createElement('span');
    st.className = 'fr-row__status' + (statusClass ? ' ' + statusClass : '');
    st.textContent = statusText;
    info.appendChild(nmRow);
    info.appendChild(st);
    row.appendChild(info);

    const acts = document.createElement('div');
    acts.className = 'fr-row__acts';
    row.appendChild(acts);
    return { row, acts, status: st };
  },

  _statusLabel(f) {
    if (f.status === 'in-game') return { text: 'في مباراة', cls: 'is-ingame' };
    if (f.online) return { text: 'متصل', cls: 'is-online' };
    return { text: this._ago(f.last_seen_at), cls: '' };
  },

  _friendRow(f) {
    const U = window.amkhUI;
    const s = this._statusLabel(f);
    const { row, acts } = this._baseRow(f, s.text, s.cls);

    /* دردشة: شات دائم مع الصديق (chat-client.js) */
    const chatBtn = document.createElement('button');
    chatBtn.type = 'button';
    chatBtn.className = 'ds-btn ds-btn--ghost ds-btn--sm fr-row__chat';
    chatBtn.setAttribute('aria-label', 'دردشة');
    if (window.amkhChat && window.amkhChat.ICONS) chatBtn.innerHTML = window.amkhChat.ICONS.chat;
    else chatBtn.textContent = '✉';
    chatBtn.onclick = () => {
      U.sfx();
      if (window.amkhChat) window.amkhChat.openChat(f);
    };
    acts.appendChild(chatBtn);

    /* دعوة: متاحة لو متصل ومش في مباراة */
    const inviteBtn = document.createElement('button');
    inviteBtn.type = 'button';
    inviteBtn.className = 'ds-btn ds-btn--primary ds-btn--sm';
    inviteBtn.textContent = 'العب';
    inviteBtn.disabled = !f.online || f.status === 'in-game';
    inviteBtn.onclick = async () => {
      U.sfx();
      /* اختيار اللون ونوع المباراة قبل الدعوة — نافذة متخصصة بالثيم */
      const choice = await this._colorChoice(f.display_name || f.username);
      if (!choice) return;
      if (this.inviteFriend(f.id, f.display_name || f.username, choice.color, choice.rated, choice.tc)) {
        inviteBtn.disabled = true;
        inviteBtn.textContent = 'مستني…';
        setTimeout(() => { inviteBtn.disabled = !f.online; inviteBtn.textContent = 'العب'; }, 90000);
      }
    };
    acts.appendChild(inviteBtn);

    /* قائمة صغيرة: إزالة / حظر */
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ds-btn ds-btn--ghost ds-btn--sm fr-row__more';
    more.setAttribute('aria-label', 'خيارات');
    more.textContent = '⋯';
    more.onclick = async () => {
      U.sfx();
      const name = f.display_name || f.username;
      const choice = await this._menu(more, [
        { key: 'remove', label: 'إزالة من الأصدقاء' },
        { key: 'block', label: 'حظر' },
      ]);
      if (choice === 'remove') this.removeFriend(f.id, name);
      if (choice === 'block') this.blockUser(f.id, name);
    };
    acts.appendChild(more);
    return row;
  },

  _requestRow(r) {
    const U = window.amkhUI;
    const { row, acts } = this._baseRow(r, 'عايز يضيفك صديق', '');
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'ds-btn ds-btn--primary ds-btn--sm';
    yes.textContent = 'قبول';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'ds-btn ds-btn--ghost ds-btn--sm';
    no.textContent = 'رفض';
    const lock = () => { yes.disabled = no.disabled = true; };
    yes.onclick = () => { U.sfx(); lock(); this.respondRequest(r.request_id, 'accept'); };
    no.onclick = () => { U.sfx(); lock(); this.respondRequest(r.request_id, 'decline'); };
    acts.appendChild(yes);
    acts.appendChild(no);
    return row;
  },

  _searchRow(u) {
    const U = window.amkhUI;
    const s = this._statusLabel(u);
    /* في البحث اسم المستخدم هو المهم — هو اللي بيميّز لاعبين بنفس الاسم */
    const sub = u.username ? '@' + u.username : s.text;
    const { row, acts } = this._baseRow(u, sub, u.online ? 'is-online' : '');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ds-btn ds-btn--sm';
    if (u.relation === 'friend') {
      btn.className += ' ds-btn--ghost';
      btn.textContent = 'صديقك';
      btn.disabled = true;
    } else if (u.relation === 'sent') {
      btn.className += ' ds-btn--ghost';
      btn.textContent = 'تم الإرسال';
      btn.disabled = true;
    } else if (u.relation === 'incoming') {
      btn.className += ' ds-btn--primary';
      btn.textContent = 'قبول';
      btn.onclick = async () => {
        U.sfx(); btn.disabled = true;
        await this.loadRequests();
        const req = (this._requests.incoming || []).find(x => x.user_id === u.id);
        if (req) await this.respondRequest(req.request_id, 'accept');
        btn.textContent = 'صديقك';
      };
    } else {
      btn.className += ' ds-btn--secondary';
      btn.textContent = 'إضافة';
      btn.onclick = async () => {
        U.sfx(); btn.disabled = true; btn.textContent = '…';
        const ok = await this.sendRequest(u.id);
        btn.textContent = ok ? 'تم الإرسال' : 'إضافة';
        btn.disabled = ok;
      };
    }
    acts.appendChild(btn);
    return row;
  },

  /* تعديل سطر واحد بدل إعادة رسم القائمة كلها — عشان الحضور بيتغيّر
     كتير والقائمة مايرفّش شكلها كل شوية */
  _patchRow(f) {
    if (!this._sheet) return;
    const row = this._sheet.querySelector(`.fr-row[data-uid="${Number(f.id)}"]`);
    if (!row) return;
    const s = this._statusLabel(f);
    const st = row.querySelector('.fr-row__status');
    if (st) { st.textContent = s.text; st.className = 'fr-row__status' + (s.cls ? ' ' + s.cls : ''); }
    const btn = row.querySelector('.ds-btn--primary');
    if (btn && btn.textContent !== 'مستني…') btn.disabled = !f.online || f.status === 'in-game';
  },

  /* قائمة صغيرة جانب زر. بترجّع مفتاح الاختيار أو null */
  _menu(anchor, items) {
    return new Promise((resolve) => {
      const old = document.getElementById('fr-menu');
      if (old) old.remove();
      const menu = document.createElement('div');
      menu.id = 'fr-menu';
      menu.className = 'fr-menu';
      items.forEach(it => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fr-menu__item';
        b.textContent = it.label;
        b.onclick = (e) => { e.stopPropagation(); cleanup(); resolve(it.key); };
        menu.appendChild(b);
      });
      /* القياس بعد الإضافة للشجرة، وبعدها التثبيت جوه الشاشة.
         النسخة القديمة كانت بتحسب الموضع من مكان الزر وخلاص من غير أي
         فحص، فالقائمة كانت بتخرج من تحت الشاشة (زي ما في صورة المستخدم)
         أو من الجانب لما الزر يكون قريب من الحرف. */
      menu.style.visibility = 'hidden';
      document.body.appendChild(menu);

      const r = anchor.getBoundingClientRect();
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      const PAD = 8;

      /* رأسيًا: تحت الزر لو فيه مكان، وإلا فوقه */
      let top = r.bottom + 6;
      if (top + mh > window.innerHeight - PAD) {
        top = r.top - mh - 6;
        if (top < PAD) top = Math.max(PAD, window.innerHeight - mh - PAD);
      }

      /* أفقيًا: بنستخدم left عشان الحساب يبقى صريح في RTL كمان */
      let left = r.right - mw;
      if (left + mw > window.innerWidth - PAD) left = window.innerWidth - mw - PAD;
      if (left < PAD) left = PAD;

      menu.style.top = Math.round(top) + 'px';
      menu.style.left = Math.round(left) + 'px';
      menu.style.insetInlineEnd = 'auto';
      menu.style.visibility = '';

      const onDoc = (e) => {
        /* ضغطة جوه القائمة = اختيار عنصر، سيبها توصل لزر العنصر.
           الـlistener ده على الـdocument بـcapture=true، يعني بيمسك أي
           ضغطة قبل ما توصل لهدفها. من غير الفحص ده كان بيمسك حتى الضغط
           على أزرار القائمة نفسها، يقفلها ويرجّع null قبل ما ينفّذ b.onclick
           — وده كان السبب إن اختيار اللون والإزالة والحظر مبيعملوش أي حاجة. */
        if (e && e.target && menu.contains(e.target)) return;
        cleanup(); resolve(null);
      };
      const cleanup = () => {
        document.removeEventListener('click', onDoc, true);
        window.removeEventListener('resize', onDoc);
        menu.remove();
      };
      setTimeout(() => {
        document.addEventListener('click', onDoc, true);
        window.addEventListener('resize', onDoc, { once: true });
      }, 0);
    });
  },

  /* وقت نسبي بالعربي — نفس صيغ الشاشة الرئيسية */
  _ago(iso) {
    if (!iso) return 'غير متصل';
    const t = this._parseTs(iso);
    if (!t) return 'غير متصل';
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'كان هنا الآن';
    if (m === 1) return 'منذ دقيقة';
    if (m < 60) return `منذ ${m} د`;
    const h = Math.floor(m / 60);
    if (h === 1) return 'منذ ساعة';
    if (h < 24) return `منذ ${h} س`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'أمس';
    if (d < 30) return `منذ ${d} يوم`;
    return 'مش متصل من فترة';
  },

  /* توقيت SQLite (datetime('now')) بيرجع UTC ساذج "YYYY-MM-DD HH:MM:SS" من غير Z،
     فالمتصفح بيفسّره كتوقيت محلّي → فرق ساعات وهمي في "آخر ظهور".
     نكشف الصيغة الساذجة ونعتبرها UTC. أما ISO اللي فيه Z/T فبيتفسّر صح. */
  _parseTs(s) {
    if (!s) return NaN;
    s = String(s).trim();
    if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(s);
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(s);
    if (m) return Date.parse(`${m[1]}T${m[2]}Z`);
    return Date.parse(s);
  },
};

window.amkhFriends = amkhFriends;
