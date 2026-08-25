/* ══════════════════════════════════════════════════════════════════════
   call-client.js — مكالمة صوتية WebRTC (#135)
   ──────────────────────────────────────────────────────────────────────
   مكالمة صوتية فردية (1:1) وجماعية (حفلة) بتقنية WebRTC. السيرفر وسيط
   إشارات بس (offer/answer/ice) على سوكت الحضور المُصادَق عليه — الصوت
   نفسه P2P عبر STUN/TURN. المكالمة الجماعية = شبكة كاملة (mesh): كل زوج
   بيتبادل اتصال مستقل، والبادئ بالعرض هو صاحب الـid الأصغر (يمنع التصادم).

   الأذونات: RECORD_AUDIO معرّف في المانيفست وCapacitor بيطلبه تلقائيًا
   أول getUserMedia. تشغيل الصوت في WebView محتاج إيماءة مستخدم — فبنجيب
   الميكروفون وقت نقرة الاتصال/القبول، ونشغّل عنصر <audio> بعد نفس النقرة.
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const RING_TIMEOUT = 45000;   // مهلة الرنين قبل الإلغاء التلقائي
  const ICE_TTL = 50 * 60 * 1000; // إعادة جلب إعداد ICE كل ~50 دقيقة

  const CALL = {
    _ice: null, _iceAt: 0,
    _mic: null,
    _call: null,          // حالة المكالمة الحالية (أو null)
    _ringTimer: null,
    _ringSfxTimer: null,
    _durTimer: null,
    _dom: null,

    /* ── مساعدات ── */
    me() { try { return Number(window.amkhAuth && window.amkhAuth.user && window.amkhAuth.user.id) || null; } catch (e) { return null; } },
    _socket() {
      const p = window.amkhAuth && window.amkhAuth._presWs;
      if (p && p.readyState === 1) return p;
      const a = window.chessWs;
      if (a && a.readyState === 1) return a;
      return null;
    },
    _send(obj) {
      const ws = this._socket();
      if (!ws) return false;
      try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    },
    _notify(msg, title, icon) {
      try { window.amkhUI && window.amkhUI.notify(msg, title || 'المكالمة', icon || '◈'); } catch (e) {}
    },

    /* ── إعداد ICE (STUN + TURN) ── */
    async _getIce() {
      const now = Date.now();
      if (this._ice && (now - this._iceAt) < ICE_TTL) return this._ice;
      const fallback = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
      try {
        if (window.amkhEnsureServer) await window.amkhEnsureServer();
        const base = window.getApiBase ? window.getApiBase() : '/api';
        const res = await fetch(base + '/webrtc-config', { headers: { 'ngrok-skip-browser-warning': '1' } });
        if (res.ok) {
          const j = await res.json();
          if (j && Array.isArray(j.iceServers) && j.iceServers.length) { this._ice = j.iceServers; this._iceAt = now; return this._ice; }
        }
      } catch (e) {}
      this._ice = fallback; this._iceAt = now;
      return fallback;
    },

    /* ── الميكروفون (مرّة واحدة لكل مكالمة، وقت إيماءة المستخدم) ── */
    async _getMic() {
      if (this._mic && this._mic.active) return this._mic;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this._notify('جهازك مايدعمش المكالمات الصوتية', 'غير متاح', '◈');
        throw new Error('no-getusermedia');
      }
      this._mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      /* لو المكالمة اتقفلت كتم مبدئيًا */
      if (this._call && this._call.muted) this._mic.getAudioTracks().forEach(t => t.enabled = false);
      return this._mic;
    },

    /* ── إنشاء اتصال نظير (RTCPeerConnection) لطرف واحد ── */
    async _makePeer(peerId, name, avatar, initiator) {
      const call = this._call; if (!call) return null;
      if (call.peers.has(peerId)) return call.peers.get(peerId);
      const iceServers = await this._getIce();
      const pc = new RTCPeerConnection({ iceServers });
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', '');
      document.body.appendChild(audioEl);
      const remote = new MediaStream();
      audioEl.srcObject = remote;

      const peer = { pc, audioEl, remote, name: name || 'صديق', avatar: avatar || null, connected: false, pendingIce: [] };
      call.peers.set(peerId, peer);

      /* مساراتنا الصوتية */
      const mic = await this._getMic();
      mic.getTracks().forEach(t => pc.addTrack(t, mic));

      pc.ontrack = (e) => {
        (e.streams && e.streams[0] ? e.streams[0].getTracks() : [e.track]).forEach(tr => { try { remote.addTrack(tr); } catch (x) {} });
        try { audioEl.play().catch(() => {}); } catch (x) {}
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) this._send({ type: 'call:ice', to: peerId, callId: call.id, group: call.group || null, candidate: e.candidate });
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') { peer.connected = true; this._onPeerConnected(); }
        else if (st === 'failed' || st === 'closed' || st === 'disconnected') { this._onPeerGone(peerId, false); }
      };

      if (initiator) {
        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          this._send({ type: 'call:offer', to: peerId, callId: call.id, group: call.group || null, sdp: JSON.stringify(pc.localDescription) });
        } catch (e) {}
      }
      return peer;
    },

    /* البادئ بالعرض = صاحب id الأصغر (قاعدة حتمية تمنع التصادم) */
    async _connectPeer(peerId, name, avatar) {
      const call = this._call; if (!call) return;
      if (call.peers.has(peerId)) return;
      const initiator = this.me() < peerId;
      await this._makePeer(peerId, name, avatar, initiator);
    },

    _flushIce(peer) {
      if (!peer || !peer.pendingIce.length) return;
      const list = peer.pendingIce.splice(0);
      list.forEach(c => { try { peer.pc.addIceCandidate(c); } catch (e) {} });
    },

    /* ── بدء مكالمة فردية (الداعي) ── */
    async startCall(peerId, name, avatar) {
      peerId = Number(peerId);
      if (!this.me()) { this._notify('سجّل الدخول عشان تتصل', 'غير متصل', '◈'); return; }
      if (this._call) { this._notify('في مكالمة شغّالة بالفعل', 'المكالمة', '◈'); return; }
      if (!this._socket()) { this._notify('مفيش اتصال بالسيرفر دلوقتي', 'غير متصل', '◈'); return; }
      const callId = 'c' + this.me() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      this._call = {
        id: callId, group: null, isCaller: true, status: 'outgoing',
        peers: new Map(), members: [peerId], muted: false, speaker: false,
        title: name || 'صديق', avatar: avatar || null, startedAt: 0,
      };
      try { await this._getMic(); }
      catch (e) { this._call = null; this._notify('مقدرناش نفتح الميكروفون — فعّل إذن الميكروفون', 'الميكروفون', '◈'); return; }
      this._send({ type: 'call:invite', to: peerId, callId, group: null, members: [this.me(), peerId] });
      this._showActive();
      this._startRing('out');
      this._armRingTimeout();
    },

    /* ── بدء مكالمة حفلة (جماعية) ── */
    async startGroupCall(groupId, name, memberIds) {
      groupId = Number(groupId);
      if (!this.me()) { this._notify('سجّل الدخول عشان تتصل', 'غير متصل', '◈'); return; }
      if (this._call) { this._notify('في مكالمة شغّالة بالفعل', 'المكالمة', '◈'); return; }
      if (!this._socket()) { this._notify('مفيش اتصال بالسيرفر دلوقتي', 'غير متصل', '◈'); return; }
      const others = (memberIds || []).map(Number).filter(id => id && id !== this.me());
      if (!others.length) { this._notify('مفيش أعضاء تانيين في الحفلة', 'المكالمة', '◈'); return; }
      const callId = 'g' + groupId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const members = [this.me(), ...others];
      this._call = {
        id: callId, group: groupId, isCaller: true, status: 'outgoing',
        peers: new Map(), members, muted: false, speaker: false,
        title: name || 'حفلة', avatar: null, startedAt: 0,
      };
      try { await this._getMic(); }
      catch (e) { this._call = null; this._notify('مقدرناش نفتح الميكروفون — فعّل إذن الميكروفون', 'الميكروفون', '◈'); return; }
      others.forEach(id => this._send({ type: 'call:invite', to: id, callId, group: groupId, members }));
      this._showActive();
      this._startRing('out');
      this._armRingTimeout();
    },

    /* ── قبول مكالمة واردة ── */
    async accept() {
      const call = this._call; if (!call || call.status !== 'incoming') return;
      try { SFX.btn(); } catch (e) {}
      try { await this._getMic(); }
      catch (e) { this.reject(); this._notify('مقدرناش نفتح الميكروفون — فعّل إذن الميكروفون', 'الميكروفون', '◈'); return; }
      call.status = 'connecting';
      this._stopRing();
      this._clearRingTimeout();
      /* بلّغ كل الأعضاء (في الفردي = الداعي بس) إني دخلت */
      const targets = call.group ? call.members.filter(id => id !== this.me()) : [call.callerId];
      targets.forEach(id => this._send({ type: 'call:accept', to: id, callId: call.id, group: call.group || null }));
      this._showActive();
    },

    /* ── رفض مكالمة واردة ── */
    reject() {
      const call = this._call; if (!call) return;
      try { SFX.btn(); } catch (e) {}
      const targets = call.group ? call.members.filter(id => id !== this.me()) : [call.callerId];
      targets.forEach(id => this._send({ type: 'call:reject', to: id, callId: call.id, group: call.group || null }));
      this._end('rejected-self');
    },

    /* ── إنهاء/قطع المكالمة ── */
    hangup() {
      const call = this._call; if (!call) return;
      try { SFX.btn(); } catch (e) {}
      const targets = call.group ? call.members.filter(id => id !== this.me()) : [...call.peers.keys(), ...(call.isCaller ? [call.members[1]] : [call.callerId])];
      [...new Set(targets)].filter(Boolean).forEach(id => this._send({ type: 'call:end', to: id, callId: call.id, group: call.group || null }));
      this._end('hangup');
    },

    toggleMute() {
      const call = this._call; if (!call) return;
      call.muted = !call.muted;
      if (this._mic) this._mic.getAudioTracks().forEach(t => t.enabled = !call.muted);
      try { SFX.btn(); } catch (e) {}
      this._updateControls();
    },

    /* ── استقبال إشارات المكالمة من السوكت ── */
    handleSocketMessage(d) {
      if (!d || typeof d.type !== 'string' || d.type.indexOf('call:') !== 0) return;
      const from = Number(d.from);
      const call = this._call;

      switch (d.type) {
        case 'call:invite': {
          /* مكالمة واردة. لو أنا في مكالمة تانية → مشغول. */
          if (call) { this._send({ type: 'call:busy', to: from, callId: d.callId, group: d.group || null }); return; }
          if (!from) return;
          const u = d.fromUser || {};
          this._call = {
            id: d.callId, group: d.group ? Number(d.group) : null, isCaller: false, status: 'incoming',
            peers: new Map(),
            members: Array.isArray(d.members) && d.members.length ? d.members.map(Number) : [from, this.me()],
            callerId: from, muted: false, speaker: false,
            title: u.display_name || u.username || 'صديق', avatar: u.avatar_url || null, startedAt: 0,
          };
          this._showIncoming();
          this._startRing('in');
          this._armRingTimeout();
          break;
        }
        case 'call:accept': {
          /* طرف دخل المكالمة → ابدأ اتصال النظير معاه */
          if (!call || call.id !== d.callId) return;
          if (call.status === 'outgoing') { call.status = 'connecting'; this._stopRing(); this._clearRingTimeout(); this._updateControls(); }
          const u = d.fromUser || {};
          this._connectPeer(from, u.display_name || u.username || call.title, u.avatar_url || call.avatar);
          break;
        }
        case 'call:reject': {
          if (!call || call.id !== d.callId) return;
          if (call.group) { /* عضو رفض — كمّل مع الباقيين */ this._removeMember(from); }
          else { this._end('rejected'); this._notify('رفض المكالمة', 'المكالمة', '◈'); }
          break;
        }
        case 'call:busy': {
          if (!call || call.id !== d.callId) return;
          if (call.group) { this._removeMember(from); }
          else { this._end('busy'); this._notify('الطرف الآخر مشغول', 'المكالمة', '◈'); }
          break;
        }
        case 'call:cancel': {
          if (!call || call.id !== d.callId) return;
          this._end('cancelled');
          break;
        }
        case 'call:end': {
          if (!call || call.id !== d.callId) return;
          if (call.group) { this._onPeerGone(from, true); }
          else { this._end('remote-hangup'); }
          break;
        }
        case 'call:offer': {
          if (!call || call.id !== d.callId) return;
          this._onOffer(from, d);
          break;
        }
        case 'call:answer': {
          if (!call || call.id !== d.callId) return;
          this._onAnswer(from, d);
          break;
        }
        case 'call:ice': {
          if (!call || call.id !== d.callId) return;
          this._onIce(from, d);
          break;
        }
        case 'call:error': {
          if (call && (!d.callId || d.callId === call.id) && call.status === 'outgoing') { this._end('error'); this._notify('تعذّر إجراء المكالمة', 'المكالمة', '◈'); }
          break;
        }
      }
    },

    async _onOffer(from, d) {
      const call = this._call; if (!call) return;
      if (call.status === 'outgoing') { call.status = 'connecting'; this._stopRing(); this._clearRingTimeout(); }
      let peer = call.peers.get(from);
      const u = d.fromUser || {};
      if (!peer) peer = await this._makePeer(from, u.display_name || u.username || call.title, u.avatar_url || call.avatar, false);
      if (!peer) return;
      try {
        await peer.pc.setRemoteDescription(JSON.parse(d.sdp));
        this._flushIce(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this._send({ type: 'call:answer', to: from, callId: call.id, group: call.group || null, sdp: JSON.stringify(peer.pc.localDescription) });
      } catch (e) {}
    },
    async _onAnswer(from, d) {
      const call = this._call; if (!call) return;
      const peer = call.peers.get(from); if (!peer) return;
      try { await peer.pc.setRemoteDescription(JSON.parse(d.sdp)); this._flushIce(peer); } catch (e) {}
    },
    _onIce(from, d) {
      const call = this._call; if (!call || !d.candidate) return;
      const peer = call.peers.get(from);
      if (!peer) return;
      if (peer.pc.remoteDescription && peer.pc.remoteDescription.type) { try { peer.pc.addIceCandidate(d.candidate); } catch (e) {} }
      else peer.pendingIce.push(d.candidate);
    },

    _removeMember(id) {
      const call = this._call; if (!call) return;
      call.members = call.members.filter(m => m !== id);
      this._onPeerGone(id, true);
    },
    _onPeerConnected() {
      const call = this._call; if (!call) return;
      if (call.status !== 'active') {
        call.status = 'active';
        call.startedAt = Date.now();
        this._stopRing();
        this._clearRingTimeout();
        try { SFX.callConnected(); } catch (e) {}
        this._startDuration();
      }
      this._updateControls();
    },
    _onPeerGone(peerId, fromRemote) {
      const call = this._call; if (!call) return;
      const peer = call.peers.get(peerId);
      if (peer) { try { peer.pc.close(); } catch (e) {} try { peer.audioEl.srcObject = null; peer.audioEl.remove(); } catch (e) {} call.peers.delete(peerId); }
      if (call.group) {
        /* الحفلة تفضل شغّالة طول ما فيه طرف واحد على الأقل */
        if (call.peers.size === 0 && call.status === 'active') this._end('all-left');
        else this._updateControls();
      } else {
        this._end(fromRemote ? 'remote-hangup' : 'peer-lost');
      }
    },

    /* ── مؤقّت الرنين ── */
    _armRingTimeout() { this._clearRingTimeout(); this._ringTimer = setTimeout(() => { const c = this._call; if (!c) return; if (c.isCaller) this.hangup(); else this.reject(); this._notify('انتهت مهلة الرنين', 'المكالمة', '◈'); }, RING_TIMEOUT); },
    _clearRingTimeout() { if (this._ringTimer) { clearTimeout(this._ringTimer); this._ringTimer = null; } },

    /* ── حلقة صوت الرنين ── */
    _startRing(dir) {
      this._stopRing();
      try { SFX.callRing(dir); } catch (e) {}
      this._ringSfxTimer = setInterval(() => { try { SFX.callRing(dir); } catch (e) {} }, dir === 'out' ? 3200 : 1800);
    },
    _stopRing() { if (this._ringSfxTimer) { clearInterval(this._ringSfxTimer); this._ringSfxTimer = null; } },

    _startDuration() {
      if (this._durTimer) clearInterval(this._durTimer);
      this._durTimer = setInterval(() => this._updateTimer(), 1000);
      this._updateTimer();
    },

    /* ══ واجهة المكالمة (نافذة تتبع ثيم التطبيق) ══ */
    _fmtDur(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      const m = Math.floor(s / 60), r = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
    },
    _icon(name) {
      const ICONS = {
        mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/></svg>',
        micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="21" y2="21"/><path d="M9 5a3 3 0 0 1 6 0v4"/><path d="M15 11.5V11"/><path d="M5 10v1a7 7 0 0 0 10.5 6.06"/><path d="M19 10v1a7 7 0 0 1-.18 1.58"/><line x1="12" y1="18" x2="12" y2="22"/></svg>',
        phone: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.5 15.5c-1.3 0-2.6-.2-3.8-.6-.4-.1-.8 0-1.1.3l-2 2a15.3 15.3 0 0 1-6.6-6.6l2-2c.3-.3.4-.7.3-1.1-.4-1.2-.6-2.5-.6-3.8 0-.6-.4-1-1-1H4.2c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.2c0-.6-.4-1-1-1z"/></svg>',
        hangup: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 9c-1.6 0-3.2.2-4.7.6v3.1c0 .5-.3.9-.7 1.1-.9.4-1.7.9-2.5 1.5-.2.2-.5.3-.8.3-.3 0-.6-.1-.8-.3l-2-2a1.1 1.1 0 0 1 0-1.6C4 8.8 7.8 7 12 7s8 1.8 11.5 4.7c.4.4.4 1.1 0 1.6l-2 2c-.2.2-.5.3-.8.3-.3 0-.6-.1-.8-.3-.8-.6-1.6-1.1-2.5-1.5-.4-.2-.7-.6-.7-1.1V9.6C15.2 9.2 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>',
      };
      return ICONS[name] || '';
    },
    _ensureDom() {
      if (this._dom) return this._dom;
      const style = document.createElement('style');
      style.textContent = `
      #amkhc-overlay{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;padding:20px;
        background:rgba(0,0,0,.6);backdrop-filter:blur(10px) saturate(120%);-webkit-backdrop-filter:blur(10px) saturate(120%);opacity:0;transition:opacity .25s;}
      #amkhc-overlay.on{display:flex;opacity:1;}
      #amkhc-overlay .amkhc-card{background:var(--color-surface,#1e2030);border:1px solid var(--color-border,rgba(255,255,255,.1));
        border-radius:var(--radius-lg,24px);padding:28px 22px;width:100%;max-width:340px;text-align:center;
        box-shadow:0 25px 60px rgba(0,0,0,.55);transform:translateY(18px) scale(.96);transition:transform .3s cubic-bezier(.175,.885,.32,1.275);}
      #amkhc-overlay.on .amkhc-card{transform:translateY(0) scale(1);}
      #amkhc-avatar{width:96px;height:96px;margin:0 auto 16px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;
        font-size:38px;font-weight:800;color:var(--color-text-primary,#fff);background:var(--color-surface-raised,#28304b);
        border:2px solid var(--color-primary,#7aa2f7);box-shadow:0 0 0 8px rgba(122,162,247,.08);}
      #amkhc-avatar img{width:100%;height:100%;object-fit:cover;}
      #amkhc-avatar.ring{animation:amkhc-pulse 1.6s ease-out infinite;}
      @keyframes amkhc-pulse{0%{box-shadow:0 0 0 0 rgba(122,162,247,.35);}100%{box-shadow:0 0 0 22px rgba(122,162,247,0);}}
      #amkhc-title{color:var(--color-text-primary,#fff);font-size:20px;font-weight:800;margin:0 0 6px;}
      #amkhc-status{color:var(--color-text-secondary,#a9b1d6);font-size:14px;margin:0 0 4px;min-height:18px;}
      #amkhc-timer{color:var(--color-primary,#7aa2f7);font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;min-height:20px;margin-bottom:20px;}
      #amkhc-actions{display:flex;gap:18px;justify-content:center;align-items:center;}
      .amkhc-btn{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;
        transition:transform .15s,background .2s;color:#fff;}
      .amkhc-btn:active{transform:scale(.9);}
      .amkhc-btn svg{width:26px;height:26px;}
      .amkhc-btn.neutral{background:var(--color-surface-raised,#28304b);color:var(--color-text-primary,#fff);}
      .amkhc-btn.neutral.active{background:var(--color-primary,#7aa2f7);color:#12131c;}
      .amkhc-btn.accept{background:#2ecc71;}
      .amkhc-btn.reject,.amkhc-btn.hangup{background:#e74c3c;}
      .amkhc-lbl{display:block;font-size:11px;color:var(--color-text-secondary,#a9b1d6);margin-top:6px;}
      .amkhc-act{display:flex;flex-direction:column;align-items:center;}
      `;
      document.head.appendChild(style);
      const ov = document.createElement('div');
      ov.id = 'amkhc-overlay';
      ov.innerHTML = `<div class="amkhc-card">
        <div id="amkhc-avatar">◈</div>
        <div id="amkhc-title">صديق</div>
        <div id="amkhc-status"></div>
        <div id="amkhc-timer"></div>
        <div id="amkhc-actions"></div>
      </div>`;
      document.body.appendChild(ov);
      this._dom = {
        overlay: ov,
        avatar: ov.querySelector('#amkhc-avatar'),
        title: ov.querySelector('#amkhc-title'),
        status: ov.querySelector('#amkhc-status'),
        timer: ov.querySelector('#amkhc-timer'),
        actions: ov.querySelector('#amkhc-actions'),
      };
      return this._dom;
    },
    _paintHead() {
      const call = this._call; if (!call) return;
      const dom = this._ensureDom();
      if (call.avatar) dom.avatar.innerHTML = `<img src="${call.avatar}" alt="">`;
      else dom.avatar.textContent = (call.title || '◈').trim().charAt(0) || '◈';
      dom.title.textContent = call.title || 'صديق';
    },
    _btn(cls, icon, label, handler) {
      const wrap = document.createElement('div');
      wrap.className = 'amkhc-act';
      const b = document.createElement('button');
      b.className = 'amkhc-btn ' + cls;
      b.innerHTML = this._icon(icon);
      b.onclick = handler;
      wrap.appendChild(b);
      if (label) { const l = document.createElement('span'); l.className = 'amkhc-lbl'; l.textContent = label; wrap.appendChild(l); }
      return { wrap, btn: b };
    },
    _showIncoming() {
      const call = this._call; if (!call) return;
      const dom = this._ensureDom();
      this._paintHead();
      dom.avatar.classList.add('ring');
      dom.status.textContent = call.group ? 'حفلة صوتية واردة…' : 'مكالمة واردة…';
      dom.timer.textContent = '';
      dom.actions.innerHTML = '';
      dom.actions.appendChild(this._btn('reject', 'hangup', 'رفض', () => this.reject()).wrap);
      dom.actions.appendChild(this._btn('accept', 'phone', 'قبول', () => this.accept()).wrap);
      dom.overlay.classList.add('on');
    },
    _showActive() {
      const call = this._call; if (!call) return;
      const dom = this._ensureDom();
      this._paintHead();
      dom.overlay.classList.add('on');
      this._updateControls();
    },
    _updateControls() {
      const call = this._call; if (!call) { return; }
      const dom = this._dom; if (!dom) return;
      const st = call.status;
      if (st === 'active') { dom.avatar.classList.remove('ring'); dom.status.textContent = call.group ? 'حفلة صوتية' : 'في مكالمة'; }
      else if (st === 'connecting') { dom.avatar.classList.add('ring'); dom.status.textContent = 'جارٍ الاتصال…'; dom.timer.textContent = ''; }
      else { dom.avatar.classList.add('ring'); dom.status.textContent = call.isCaller ? 'جارٍ الرنين…' : 'مكالمة واردة…'; dom.timer.textContent = ''; }
      /* أعد بناء أزرار التحكم (كتم/إنهاء) */
      if (st !== 'incoming') {
        dom.actions.innerHTML = '';
        const mute = this._btn('neutral', call.muted ? 'micOff' : 'mic', call.muted ? 'مكتوم' : 'ميكروفون', () => this.toggleMute());
        if (call.muted) mute.btn.classList.add('active');
        dom.actions.appendChild(mute.wrap);
        dom.actions.appendChild(this._btn('hangup', 'hangup', 'إنهاء', () => this.hangup()).wrap);
      }
    },
    _updateTimer() {
      const call = this._call, dom = this._dom;
      if (!call || !dom || !call.startedAt) return;
      dom.timer.textContent = this._fmtDur(Date.now() - call.startedAt);
    },

    /* ── تفكيك المكالمة وإغلاق النافذة ── */
    _end(reason) {
      const call = this._call;
      this._stopRing();
      this._clearRingTimeout();
      if (this._durTimer) { clearInterval(this._durTimer); this._durTimer = null; }
      if (call) {
        call.peers.forEach(peer => {
          try { peer.pc.close(); } catch (e) {}
          try { peer.audioEl.srcObject = null; peer.audioEl.remove(); } catch (e) {}
        });
        call.peers.clear();
      }
      if (this._mic) { try { this._mic.getTracks().forEach(t => t.stop()); } catch (e) {} this._mic = null; }
      this._call = null;
      if (this._dom) this._dom.overlay.classList.remove('on');
      /* صوت إنهاء المكالمة (ماعدا رفضي أنا — القرار كان مني) */
      if (reason && reason !== 'rejected-self') { try { SFX.callEnded(); } catch (e) {} }
    },




  };

  window.amkhCall = CALL;
})();
