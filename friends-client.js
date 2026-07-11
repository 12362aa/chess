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
      const res = await fetch(`${API_BASE}/friends`, { headers });
      if (res.ok) {
        this.friends = await res.json();
      }
    } catch (e) {}
  },

  async loadRequests() {
    const headers = await this.getAuthHeader();
    if (!headers) return;
    try {
      const res = await fetch(`${API_BASE}/friends/requests`, { headers });
      if (res.ok) {
        this.requests = await res.json();
      }
    } catch (e) {}
  },

  async sendRequest(receiver_id) {
    const headers = await this.getAuthHeader();
    if (!headers) return;
    try {
      await fetch(`${API_BASE}/friends/request`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id })
      });
      alert('تم إرسال الطلب!');
      this.loadRequests();
    } catch (e) {}
  },

  async respondRequest(request_id, action) {
    const headers = await this.getAuthHeader();
    if (!headers) return;
    try {
      await fetch(`${API_BASE}/friends/respond`, {
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
      const res = await fetch(`${API_BASE}/friends/search?q=${encodeURIComponent(query)}`, { headers });
      if (res.ok) return await res.json();
    } catch (e) {}
    return [];
  },

  inviteFriend(friend_id) {
    const ws = window.chessWs || window.socket || (window.getWs && window.getWs());
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'friend:invite', friend_id }));
      alert('تم إرسال الدعوة!');
    } else {
      alert('يجب أن تكون متصلاً بخادم الأونلاين لإرسال دعوة.');
    }
  },

  async showFriendsModal() {
    await this.loadFriends();
    await this.loadRequests();

    const existing = document.getElementById('amkh-friends-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'amkh-friends-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);z-index:10000;display:flex;justify-content:center;align-items:center;direction:rtl;';
    
    overlay.innerHTML = \`
      <div style="background:#222;color:#fff;padding:20px;border-radius:10px;width:350px;max-height:80vh;overflow-y:auto;font-family:sans-serif;">
        <h2 style="margin-top:0;border-bottom:1px solid #444;padding-bottom:10px;">الأصدقاء</h2>
        
        <!-- Search -->
        <div style="display:flex;margin-bottom:15px;">
          <input type="text" id="friend-search-input" placeholder="ابحث بالإيميل أو الاسم..." style="flex:1;padding:8px;">
          <button id="btn-friend-search" style="padding:8px;background:#2196F3;color:#fff;border:none;">بحث</button>
        </div>
        <div id="friend-search-results" style="margin-bottom:15px;"></div>

        <!-- Requests -->
        <div id="friend-requests-container" style="margin-bottom:15px;"></div>

        <!-- Friends List -->
        <div id="friends-list-container"></div>

        <button id="btn-close-friends" style="width:100%;margin-top:15px;padding:10px;background:#f44336;color:#fff;border:none;border-radius:5px;cursor:pointer;">إغلاق</button>
      </div>
    \`;

    document.body.appendChild(overlay);

    document.getElementById('btn-close-friends').onclick = () => overlay.remove();

    document.getElementById('btn-friend-search').onclick = async () => {
      const q = document.getElementById('friend-search-input').value;
      if (q.length < 3) return alert('اكتب 3 حروف على الأقل');
      const results = await this.searchUsers(q);
      const resDiv = document.getElementById('friend-search-results');
      resDiv.innerHTML = '';
      if (results.length === 0) {
        resDiv.innerHTML = '<div style="color:#aaa;font-size:12px;">لم يتم العثور على أحد</div>';
        return;
      }
      results.forEach(u => {
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#333;padding:8px;margin-bottom:5px;border-radius:4px;';
        d.innerHTML = \`<span>\${u.display_name || u.email}</span>\`;
        const btn = document.createElement('button');
        btn.innerText = 'إضافة';
        btn.style.cssText = 'background:#4CAF50;color:#fff;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;';
        btn.onclick = () => this.sendRequest(u.id);
        d.appendChild(btn);
        resDiv.appendChild(d);
      });
    };

    this.renderFriendsUI();
  },

  renderFriendsUI() {
    const reqDiv = document.getElementById('friend-requests-container');
    const listDiv = document.getElementById('friends-list-container');
    if (!reqDiv || !listDiv) return;

    // Requests
    reqDiv.innerHTML = '';
    if (this.requests.incoming && this.requests.incoming.length > 0) {
      reqDiv.innerHTML += '<h4 style="margin:0 0 10px 0;color:#FFA500;">طلبات واردة:</h4>';
      this.requests.incoming.forEach(r => {
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#333;padding:8px;margin-bottom:5px;border-radius:4px;font-size:14px;';
        d.innerHTML = \`<span>\${r.display_name || r.email}</span>\`;
        
        const acts = document.createElement('div');
        const accept = document.createElement('button');
        accept.innerText = '✓';
        accept.style.cssText = 'background:#4CAF50;color:#fff;border:none;padding:5px;margin-left:5px;cursor:pointer;';
        accept.onclick = () => this.respondRequest(r.id, 'accept');

        const reject = document.createElement('button');
        reject.innerText = '✗';
        reject.style.cssText = 'background:#f44336;color:#fff;border:none;padding:5px;cursor:pointer;';
        reject.onclick = () => this.respondRequest(r.id, 'decline');

        acts.appendChild(accept);
        acts.appendChild(reject);
        d.appendChild(acts);
        reqDiv.appendChild(d);
      });
    }

    // List
    listDiv.innerHTML = '<h4 style="margin:0 0 10px 0;color:#4CAF50;">الأصدقاء:</h4>';
    if (this.friends.length === 0) {
      listDiv.innerHTML += '<div style="color:#aaa;font-size:12px;">لا يوجد أصدقاء بعد.</div>';
    } else {
      this.friends.forEach(f => {
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#333;padding:10px;margin-bottom:5px;border-radius:4px;';
        
        const statusColor = f.is_online ? '#4CAF50' : '#888';
        const statusText = f.is_online ? 'أونلاين' : 'أوفلاين';

        d.innerHTML = \`
          <div>
            <div style="font-weight:bold;">\${f.display_name || f.email}</div>
            <div style="font-size:11px;color:\${statusColor}">● \${statusText}</div>
          </div>
        \`;
        
        if (f.is_online) {
          const invBtn = document.createElement('button');
          invBtn.innerText = '⚔ لعب';
          invBtn.style.cssText = 'background:#FF9800;color:#fff;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;';
          invBtn.onclick = () => {
            this.inviteFriend(f.id);
            document.getElementById('amkh-friends-modal').remove();
          };
          d.appendChild(invBtn);
        }

        listDiv.appendChild(d);
      });
    }
  },

  listenForInvites() {
    // Intercept WebSocket messages globally if possible
    const originalSend = WebSocket.prototype.send;
    // We actually need to intercept incoming messages.
    // The easiest way without modifying core game logic too much is to hook into window.ws onmessage.
    // If the main app parses messages, we can just add a global listener or intercept JSON.parse.
    
    // Instead of hooking WebSocket directly, we assume the server sends 'friend:invite-received'
    // Let's monkey-patch WebSocket constructor to catch onmessage
    const OriginalWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      const ws = new OriginalWS(url, protocols);
      
      // We need to wait for the main app to set ws.onmessage, then we wrap it
      setTimeout(() => {
        const originalOnMessage = ws.onmessage;
        ws.onmessage = function(event) {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'friend:invite-received') {
              amkhFriends.handleInvite(msg);
              return; // don't pass to main app
            }
            if (msg.type === 'friend:presence-update') {
              if (document.getElementById('amkh-friends-modal')) {
                amkhFriends.loadFriends().then(() => amkhFriends.renderFriendsUI());
              }
              return;
            }
          } catch(e) {}
          
          if (originalOnMessage) {
            originalOnMessage.call(ws, event);
          }
        };
      }, 1000);

      // Authenticate WebSocket connection for presence
      ws.addEventListener('open', () => {
        if (window.amkhAuth && window.amkhAuth.token) {
          ws.send(JSON.stringify({ type: 'presence:hello', token: window.amkhAuth.token }));
        }
      });

      return ws;
    };
  },

  handleInvite(msg) {
    const wantsToPlay = confirm(\`\${msg.from_user} دعاك للعب مباراة أونلاين! هل تقبل؟\`);
    if (wantsToPlay) {
      // Auto join room
      window.location.hash = 'online?room=' + msg.room_code;
      window.location.reload(); // Quick way to force join logic in the main app
    }
  }
};

window.amkhFriends = amkhFriends;
amkhFriends.listenForInvites();
