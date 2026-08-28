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
    _facing: 'user',      // اتجاه الكاميرا في مكالمة الفيديو: user=أمامية، environment=خلفية (#160)
    _switchingCam: false, // قفل أثناء تبديل الكاميرا يمنع التكرار المتزامن
    _pendingAnswer: null, // نية «الرد» من إشعار مكالمة والتطبيق كان مقفول (#159)
    _ringTimer: null,
    _reinviteTimer: null, // إعادة إرسال الدعوة كل شوية طول ما بننادي (#147)
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
    _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

    /* بلاجن توجيه الصوت الأصلي (#158): سبيكر/سماعة أذن عبر AudioManager.
       متاح على أندرويد بس — على الويب يرجع null فنخفي زر السبيكر (مش وهمي). */
    _audioRoute() {
      try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AudioRoute) || null; }
      catch (e) { return null; }
    },
    /* بلاجن نغمة النظام (#157): يشغّل نغمة الرنين المختارة داخل التطبيق زيّ واتساب. */
    _sysRing() {
      try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Ringtone) || null; }
      catch (e) { return null; }
    },
    /* بلاجن جسر نية «الرد» من الإشعار (#159): متاح على أندرويد بس. */
    _callIntent() {
      try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CallIntent) || null; }
      catch (e) { return null; }
    },

    /* ── #159: الرد التلقائي على مكالمة فُتِح التطبيق من إشعارها ──
       لما التطبيق يكون مقفول ويضغط المستخدم «رد»، بيفتح بـintent فيها هوية
       المكالمة. بنلقط النية (consumePending عند الإقلاع، وحدث callAnswer لو
       كان مفتوح)، ونخزّنها. أول ما توصل الدعوة المعادة من الداعي بنقبل
       تلقائيًا بدل ما نسيبها بترنّ ونطالبه يضغط «رد» تاني. */
    _armAutoAnswer(tries) {
      tries = tries || 0;
      const CI = this._callIntent();
      if (!CI) { if (tries < 25) setTimeout(() => this._armAutoAnswer(tries + 1), 300); return; }
      if (this._autoAnswerArmed) return;
      this._autoAnswerArmed = true;
      const apply = (info) => {
        if (!info || !info.from) return;
        this._pendingAnswer = { from: Number(info.from), callId: info.callId || null, type: info.type || null, acceptToken: info.acceptToken || null, at: Date.now() };
        /* #159: بلّغ الداعي فورًا إني رادّ (قبل ما سوكت الحضور يتصل) عشان
           ما يقفلش مهلته قبل ما أجهز — عبر توكِن القبول الموقّع في الإشعار. */
        this._sendAnswering();
        this._maybeAutoAnswer();
      };
      try { if (CI.consumePending) CI.consumePending().then(apply).catch(() => {}); } catch (e) {}
      try { if (CI.addListener) CI.addListener('callAnswer', apply); } catch (e) {}
    },
    _maybeAutoAnswer() {
      const pa = this._pendingAnswer; if (!pa) return;
      if (Date.now() - pa.at > 60000) { this._pendingAnswer = null; return; }
      const call = this._call;
      if (!call || call.status !== 'incoming') return;
      /* لو الإشعار حمل callId طابقه بدقّة، وإلا طابق الداعي */
      const match = pa.callId ? (call.id === pa.callId) : (Number(call.callerId) === pa.from);
      if (!match) return;
      this._pendingAnswer = null;
      /* #160: الإشعار هو مصدر النوع الأصلي اللي بدأ به الداعي — لو قال «فيديو»
         نضبط المكالمة فيديو حتى لو دعوة قديمة كانت لسه واصلة صوتيًا (تحصين تداخل). */
      if (pa.type === 'video' && call && !call.video) { call.video = true; call.speaker = true; }
      /* تأخير بسيط عشان الـDOM/الميديا تجهز بعد فتح التطبيق من الإشعار */
      setTimeout(() => { try { if (this._call && this._call.status === 'incoming') this.accept(); } catch (e) {} }, 400);
    },

    /* #159: يبلّغ الداعي فورًا إن المستقبِل ضغط «رد» (والتطبيق كان مقفول) عبر
       توكِن قبول موقّع (POST) مش محتاج سوكت جاهز — فالداعي يعيد ضبط مهلته
       ويفضل يعيد الدعوة لحد ما سوكت المستقبِل يتصل ويقبل فعليًا (نظير الرفض). */
    _sendAnswering() {
      const pa = this._pendingAnswer;
      if (!pa || !pa.acceptToken) return;
      const token = pa.acceptToken;
      (async () => {
        try {
          if (window.amkhEnsureServer) await window.amkhEnsureServer();
          const base = window.getApiBase ? window.getApiBase() : '/api';
          await fetch(base + '/call/answering', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
            body: JSON.stringify({ token }),
          });
        } catch (e) {}
      })();
    },

    /* ── ضبط ترميز الصوت (Opus): تعطيل DTX اللي بيعمل أصوات غريبة وقت الصمت،
       تفعيل FEC لتعويض فقد الحزم، أحادي القناة ببِت-ريت ثابت لصوت نضيف ── */
    _tuneOpus(sdp) {
      try {
        if (!sdp || sdp.indexOf('opus') < 0) return sdp;
        const m = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
        if (!m) return sdp;
        const pt = m[1];
        const want = { minptime: '10', useinbandfec: '1', usedtx: '0', stereo: '0', 'sprop-stereo': '0', maxaveragebitrate: '48000', maxplaybackrate: '48000' };
        const lines = sdp.split(/\r?\n/);
        let touched = false;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].indexOf('a=fmtp:' + pt) === 0) {
            const cur = {};
            lines[i].substring(('a=fmtp:' + pt + ' ').length).split(';').forEach(kv => {
              const p = kv.split('='); if (p[0]) cur[p[0].trim()] = (p[1] || '').trim();
            });
            Object.keys(want).forEach(k => { cur[k] = want[k]; });
            lines[i] = 'a=fmtp:' + pt + ' ' + Object.keys(cur).map(k => k + '=' + cur[k]).join(';');
            touched = true;
            break;
          }
        }
        if (!touched) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf('a=rtpmap:' + pt + ' opus') === 0) {
              lines.splice(i + 1, 0, 'a=fmtp:' + pt + ' ' + Object.keys(want).map(k => k + '=' + want[k]).join(';'));
              break;
            }
          }
        }
        return lines.join('\r\n');
      } catch (e) { return sdp; }
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

    /* ── الميديا المحلية: صوت دائمًا، وفيديو لو المكالمة فيديو (#160) ──
       (الاسم تاريخي «_getMic»؛ بقت تجيب الكاميرا كمان حسب call.video) */
    async _getMic() {
      const call = this._call;
      const wantVideo = !!(call && call.video);
      if (this._mic && this._mic.active) {
        const hasVid = this._mic.getVideoTracks().length > 0;
        if (wantVideo === hasVid) return this._mic;
        /* تغيّر المطلوب (نادر) → أعد الجلب من الصفر */
        try { this._mic.getTracks().forEach(t => t.stop()); } catch (e) {}
        this._mic = null;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this._notify(wantVideo ? 'جهازك لا يدعم مكالمات الفيديو' : 'جهازك لا يدعم المكالمات الصوتية', 'غير متاح', '◈');
        throw new Error('no-getusermedia');
      }
      const audio = {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        /* سيبنا معدّل العيّنات والقنوات للجهاز (قيَم مثالية مش إجبارية):
           فرض sampleRate:48000/channelCount:1 كان بيجبر WebView أندرويد على
           إعادة عيّنة بتعمل طقطقة/تشويش في المكالمة. */
        channelCount: { ideal: 1 },
      };
      const video = wantVideo
        ? { facingMode: this._facing || 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        : false;
      this._mic = await navigator.mediaDevices.getUserMedia({ audio, video });
      /* لو المكالمة اتقفلت كتم مبدئيًا، ولو الكاميرا مقفولة عطّلها */
      if (call && call.muted) this._mic.getAudioTracks().forEach(t => t.enabled = false);
      if (call && call.camOff) this._mic.getVideoTracks().forEach(t => t.enabled = false);
      if (wantVideo && this._dom) this._attachLocalVideo();
      return this._mic;
    },

    /* يوصّل مجرى الكاميرا المحلي بعنصر المعاينة (PiP)، مع مرآة للأمامية */
    _attachLocalVideo() {
      const dom = this._dom; if (!dom || !dom.localVideo) return;
      try { dom.localVideo.srcObject = this._mic; dom.localVideo.play().catch(() => {}); } catch (e) {}
      dom.localVideo.classList.toggle('mirror', (this._facing || 'user') === 'user');
      dom.localVideo.classList.toggle('off', !!(this._call && this._call.camOff));
    },

    /* ── إنشاء اتصال نظير (RTCPeerConnection) لطرف واحد ── */
    async _makePeer(peerId, name, avatar, initiator) {
      const call = this._call; if (!call) return null;
      if (call.peers.has(peerId)) return call.peers.get(peerId);
      const iceServers = await this._getIce();
      const pc = new RTCPeerConnection({ iceServers });
      const isVideo = !!call.video;
      /* عنصر الوسائط: <video> لمكالمة الفيديو و<audio> للصوت. للفيديو بنحطّه
         في حاوية الواجهة (بيترتّب بـCSS: فردي=ملء الشاشة، حفلة=شبكة)؛ للصوت
         بيفضل مخفيًا في body زيّ ما كان. الاسم audioEl محفوظ للتوافق. */
      const mediaEl = document.createElement(isVideo ? 'video' : 'audio');
      mediaEl.autoplay = true;
      mediaEl.setAttribute('playsinline', '');
      mediaEl.playsInline = true;
      const remote = new MediaStream();
      mediaEl.srcObject = remote;
      if (isVideo) {
        mediaEl.className = 'amkhc-rv';
        const dom = this._ensureDom();
        if (dom.remoteWrap) dom.remoteWrap.appendChild(mediaEl);
      } else {
        document.body.appendChild(mediaEl);
      }

      const peer = { pc, audioEl: mediaEl, mediaEl, remote, name: name || 'صديق', avatar: avatar || null, connected: false, muted: false, pendingIce: [] };
      call.peers.set(peerId, peer);

      /* مساراتنا (صوت + فيديو لو مكالمة فيديو) */
      const mic = await this._getMic();
      mic.getTracks().forEach(t => pc.addTrack(t, mic));

      pc.ontrack = (e) => {
        (e.streams && e.streams[0] ? e.streams[0].getTracks() : [e.track]).forEach(tr => {
          try { if (!remote.getTracks().some(x => x.id === tr.id)) remote.addTrack(tr); } catch (x) {}
        });
        try { mediaEl.play().catch(() => {}); } catch (x) {}
        if (isVideo) this._applyLayout();
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
          const offer = await pc.createOffer(isVideo ? { offerToReceiveAudio: true, offerToReceiveVideo: true } : { offerToReceiveAudio: true });
          offer.sdp = this._tuneOpus(offer.sdp);
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
    async startCall(peerId, name, avatar, opts) {
      peerId = Number(peerId);
      const video = !!(opts && opts.video);
      if (!this.me()) { this._notify('سجّل الدخول لتتمكّن من الاتصال', 'غير متصل', '◈'); return; }
      if (this._call) { this._notify('هناك مكالمة جارية بالفعل', 'المكالمة', '◈'); return; }
      if (!this._socket()) { this._notify('لا يوجد اتصال بالخادم حاليًا', 'غير متصل', '◈'); return; }
      const callId = 'c' + this.me() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      this._call = {
        id: callId, group: null, isCaller: true, status: 'outgoing', video, camOff: false,
        peers: new Map(), members: [peerId], muted: false, speaker: video,
        title: name || 'صديق', avatar: avatar || null, startedAt: 0,
      };
      if (video) this._facing = 'user';
      try { await this._getMic(); }
      catch (e) { this._call = null; this._notify(video ? 'تعذّر تشغيل الكاميرا أو الميكروفون — فعّل الأذونات' : 'تعذّر تشغيل الميكروفون — فعّل إذن الميكروفون', video ? 'الكاميرا' : 'الميكروفون', '◈'); return; }
      this._send({ type: 'call:invite', to: peerId, callId, group: null, members: [this.me(), peerId], callType: video ? 'video' : 'audio' });
      this._showActive();
      this._startRing('out');
      this._armRingTimeout();
      this._startReinvite();
    },
    /* مكالمة فيديو فردية (#160) — نفس المسار بعلَم الفيديو */
    startVideoCall(peerId, name, avatar) { return this.startCall(peerId, name, avatar, { video: true }); },

    /* ── بدء مكالمة حفلة (جماعية) ── */
    async startGroupCall(groupId, name, memberIds, opts) {
      groupId = Number(groupId);
      const video = !!(opts && opts.video);
      if (!this.me()) { this._notify('سجّل الدخول لتتمكّن من الاتصال', 'غير متصل', '◈'); return; }
      if (this._call) { this._notify('هناك مكالمة جارية بالفعل', 'المكالمة', '◈'); return; }
      if (!this._socket()) { this._notify('لا يوجد اتصال بالخادم حاليًا', 'غير متصل', '◈'); return; }
      const others = (memberIds || []).map(Number).filter(id => id && id !== this.me());
      if (!others.length) { this._notify('لا يوجد أعضاء آخرون في الحفلة', 'المكالمة', '◈'); return; }
      const callId = 'g' + groupId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const members = [this.me(), ...others];
      this._call = {
        id: callId, group: groupId, isCaller: true, status: 'outgoing', video, camOff: false,
        peers: new Map(), members, muted: false, speaker: video,
        title: name || 'حفلة', avatar: null, startedAt: 0,
      };
      if (video) this._facing = 'user';
      try { await this._getMic(); }
      catch (e) { this._call = null; this._notify(video ? 'تعذّر تشغيل الكاميرا أو الميكروفون — فعّل الأذونات' : 'تعذّر تشغيل الميكروفون — فعّل إذن الميكروفون', video ? 'الكاميرا' : 'الميكروفون', '◈'); return; }
      others.forEach(id => this._send({ type: 'call:invite', to: id, callId, group: groupId, members, callType: video ? 'video' : 'audio' }));
      this._showActive();
      this._startRing('out');
      this._armRingTimeout();
      this._startReinvite();
    },
    /* مكالمة فيديو حفلة (#160) */
    startGroupVideoCall(groupId, name, memberIds) { return this.startGroupCall(groupId, name, memberIds, { video: true }); },

    /* ── قبول مكالمة واردة ── */
    async accept() {
      const call = this._call; if (!call || call.status !== 'incoming') return;
      try { SFX.btn(); } catch (e) {}
      try { await this._getMic(); }
      catch (e) { this.reject(); this._notify('تعذّر تشغيل الميكروفون — فعّل إذن الميكروفون', 'الميكروفون', '◈'); return; }
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
      const me = this.me();
      /* كل الأطراف المقصودة: النظائر المتصلين + كل الأعضاء المدعوّين + الداعي (لو أنا مستقبِل).
         بيصلّح باج المكالمة الفردية: members=[peerId] بس، فـ members[1] كان undefined ومكانش بيتبعت أي إشعار. */
      const targets = [...new Set([
        ...call.peers.keys(),
        ...(Array.isArray(call.members) ? call.members : []),
        call.callerId,
      ])].map(Number).filter(id => id && id !== me);
      /* قبل ما المكالمة توصل لمرحلة "متصل" → إلغاء (عشان تقفل نافذة الوارد عند الطرف التاني)؛ بعدها → إنهاء */
      const type = (call.status === 'active') ? 'call:end' : 'call:cancel';
      targets.forEach(id => this._send({ type, to: id, callId: call.id, group: call.group || null }));
      this._end('hangup');
    },

    toggleMute() {
      const call = this._call; if (!call) return;
      call.muted = !call.muted;
      if (this._mic) this._mic.getAudioTracks().forEach(t => t.enabled = !call.muted);
      try { SFX.btn(); } catch (e) {}
      /* في الحفلة: بلّغ باقي الأعضاء بحالة الكتم عشان تتحدّث الشبكة عندهم */
      if (call.group) {
        const me = this.me();
        call.peers.forEach((peer, id) => { if (Number(id) !== me) this._send({ type: 'call:mute', to: Number(id), callId: call.id, group: call.group, muted: call.muted }); });
      }
      this._updateControls();
    },

    /* ── تبديل مكبر الصوت/سماعة الأذن (#158) عبر البلاجن الأصلي ──
       WebView مابيدعمش setSinkId، فالتوجيه أصلي عبر AudioManager. زر السبيكر
       بيظهر بس لما البلاجن موجود (أندرويد) عشان مايبقاش وهمي على الويب. */
    async toggleSpeaker() {
      const call = this._call; if (!call) return;
      const AR = this._audioRoute(); if (!AR || !AR.setSpeaker) return;
      call.speaker = !call.speaker;
      try { SFX.btn(); } catch (e) {}
      try { await AR.setSpeaker({ on: call.speaker }); }
      catch (e) { call.speaker = !call.speaker; /* رجّع الحالة لو فشل التوجيه */ }
      this._updateControls();
    },

    /* ── تشغيل/إيقاف الكاميرا في مكالمة الفيديو (#160) ──
       بنعطّل مسار الفيديو (enabled=false) بدل ما نوقفه، عشان النظير يفضل
       شايف الاتصال (شاشة سوداء) ونقدر نرجّعه فورًا بدون تفاوض جديد. */
    toggleCamera() {
      const call = this._call; if (!call || !call.video) return;
      call.camOff = !call.camOff;
      try { SFX.btn(); } catch (e) {}
      if (this._mic) this._mic.getVideoTracks().forEach(t => t.enabled = !call.camOff);
      if (this._dom && this._dom.localVideo) this._dom.localVideo.classList.toggle('off', call.camOff);
      this._updateControls();
    },

    /* ── تبديل الكاميرا أمامية/خلفية (#160) ──
       أفضل ممارسة (MDN): نجيب مسار الكاميرا التانية، نستبدله في كل النظائر
       عبر sender.replaceTrack (نفس النوع = بدون إعادة تفاوض)، وبعدين نوقف
       المسار القديم. بعض أجهزة الموبايل ماتفتحش الكاميرا التانية والأولى
       شغّالة، فلو فشلنا نوقف القديمة الأول ونجرّب تاني. */
    async switchCamera() {
      const call = this._call; if (!call || !call.video) return;
      if (this._switchingCam) return;
      this._switchingCam = true;
      try { SFX.btn(); } catch (e) {}
      const next = (this._facing === 'environment') ? 'user' : 'environment';
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next } }, audio: false });
      } catch (e) {
        try { if (this._mic) this._mic.getVideoTracks().forEach(t => t.stop()); } catch (x) {}
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next } }, audio: false }); }
        catch (x) { this._switchingCam = false; return; }
      }
      const newTrack = stream.getVideoTracks()[0];
      if (!newTrack) { this._switchingCam = false; return; }
      this._facing = next;
      newTrack.enabled = !call.camOff;
      /* استبدل المسار في كل النظائر بدون تفاوض */
      call.peers.forEach(peer => {
        try {
          const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) { try { sender.replaceTrack(newTrack); } catch (e) {} }
        } catch (e) {}
      });
      /* بدّل المسار في مجرانا المحلي (وقّف القديم بعد الاستبدال لتحرير الكاميرا) */
      if (this._mic) {
        const old = this._mic.getVideoTracks()[0];
        if (old) { try { this._mic.removeTrack(old); old.stop(); } catch (e) {} }
        try { this._mic.addTrack(newTrack); } catch (e) {}
      }
      this._attachLocalVideo();
      this._switchingCam = false;
    },

    /* ── استقبال إشارات المكالمة من السوكت ── */
    handleSocketMessage(d) {
      if (!d || typeof d.type !== 'string' || d.type.indexOf('call:') !== 0) return;
      const from = Number(d.from);
      const call = this._call;

      switch (d.type) {
        case 'call:invite': {
          /* مكالمة واردة. لو أنا في مكالمة تانية → مشغول.
             لكن لو نفس الـcallId (إعادة دعوة #147 عشان الإشعار وصل والتطبيق
             كان مقفول) → تجاهل بدون رد "مشغول"، وإلا الداعي يفهمها انشغال
             ويقفل. لو المكالمة لسه بترنّ عندي (وارد) سيبها زي ما هي. */
          if (call) {
            if (call.id === d.callId) return;
            this._send({ type: 'call:busy', to: from, callId: d.callId, group: d.group || null });
            return;
          }
          if (!from) return;
          const u = d.fromUser || {};
          const isVideo = d.kind === 'video';
          this._call = {
            id: d.callId, group: d.group ? Number(d.group) : null, isCaller: false, status: 'incoming',
            video: isVideo, camOff: false,
            peers: new Map(),
            members: Array.isArray(d.members) && d.members.length ? d.members.map(Number) : [from, this.me()],
            callerId: from, muted: false, speaker: isVideo,
            title: u.display_name || u.username || 'صديق', avatar: u.avatar_url || null, startedAt: 0,
          };
          this._showIncoming();
          this._startRing('in');
          this._armRingTimeout();
          /* #159: لو التطبيق اتفتح من زر «رد» في الإشعار، اقبل تلقائيًا */
          this._maybeAutoAnswer();
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
        case 'call:answering': {
          /* #159: المستقبِل ضغط «رد» من الإشعار وجايّ — لسه سوكته بيتصل.
             نعيد ضبط مهلة الرنين ونضمن إعادة الدعوة شغّالة عشان أول ما سوكته
             يتصل يلقط الدعوة ويقبل، من غير ما مهلتنا تخلص قبلها. */
          if (!call || call.id !== d.callId || !call.isCaller) return;
          if (call.status === 'outgoing' || call.status === 'connecting') { this._armRingTimeout(); this._startReinvite(); }
          break;
        }
        case 'call:reject': {
          if (!call || call.id !== d.callId) return;
          if (call.group) { /* عضو رفض — كمّل مع الباقيين ومتعيدش نداءه */ (call._declined || (call._declined = new Set())).add(from); this._removeMember(from); }
          else { this._end('rejected'); this._notify('رفض المكالمة', 'المكالمة', '◈'); }
          break;
        }
        case 'call:busy': {
          if (!call || call.id !== d.callId) return;
          if (call.group) { (call._declined || (call._declined = new Set())).add(from); this._removeMember(from); }
          else { this._end('busy'); this._notify('الطرف الآخر مشغول', 'المكالمة', '◈'); }
          break;
        }
        case 'call:cancel': {
          if (!call || call.id !== d.callId) return;
          const wasRinging = call.status === 'incoming';
          this._end('cancelled');
          if (wasRinging) {
            const who = call.title || 'صديق';
            this._notify(call.group ? ('مكالمة حفلة فائتة — ' + who) : ('مكالمة فائتة من ' + who), 'مكالمة فائتة', '◈');
            /* التسجيل في الشات بيتم مركزيًا في _end('cancelled') */
          }
          break;
        }
        case 'call:end': {
          if (!call || call.id !== d.callId) return;
          if (call.group) { this._onPeerGone(from, true); }
          else { this._end('remote-hangup'); }
          break;
        }
        case 'call:mute': {
          if (!call || call.id !== d.callId) return;
          const p = call.peers.get(from);
          if (p) { p.muted = !!d.muted; this._renderGrid(); }
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
        answer.sdp = this._tuneOpus(answer.sdp);
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
        /* #158: فعّل وضع مكالمة VoIP (سماعة أذن افتراضيًا + معالجة صدى عتادية).
           بعد توقّف الرنين مباشرة عشان مايتعارضش مع مجرى نغمة الرنين. */
        const AR = this._audioRoute();
        if (AR && AR.startCallAudio) { try { AR.startCallAudio(); } catch (e) {} }
        /* #160: مكالمة الفيديو تبدأ على مكبر الصوت زيّ واتساب */
        if (call.video && AR && AR.setSpeaker) { try { AR.setSpeaker({ on: true }); call.speaker = true; } catch (e) {} }
        this._startDuration();
      }
      this._updateControls();
      this._applyLayout();
    },
    _onPeerGone(peerId, fromRemote) {
      const call = this._call; if (!call) return;
      const peer = call.peers.get(peerId);
      if (peer) { try { peer.pc.close(); } catch (e) {} try { peer.audioEl.srcObject = null; peer.audioEl.remove(); } catch (e) {} call.peers.delete(peerId); }
      if (call.group) {
        /* الحفلة تفضل شغّالة طول ما فيه طرف واحد على الأقل */
        if (call.peers.size === 0 && call.status === 'active') this._end('all-left');
        else { this._updateControls(); this._applyLayout(); }
      } else {
        this._end(fromRemote ? 'remote-hangup' : 'peer-lost');
      }
    },

    /* ── مؤقّت الرنين ── */
    _armRingTimeout() { this._clearRingTimeout(); this._ringTimer = setTimeout(() => { const c = this._call; if (!c) return; if (c.isCaller) this.hangup(); else this.reject(); this._notify('انتهت مهلة الرنين', 'المكالمة', '◈'); }, RING_TIMEOUT); },
    _clearRingTimeout() { if (this._ringTimer) { clearTimeout(this._ringTimer); this._ringTimer = null; } },

    /* إعادة إرسال الدعوة كل 3ث للأعضاء اللي لسه ماردّوش، طول ما إحنا بننادي.
       ده اللي بيخلّي إشعار المكالمة يشتغل زي واتساب: لو المستقبِل كان قافل
       التطبيق وفتحه من إشعار FCM (#147)، أول ما سوكت الحضور يتصل هيلقط
       دعوة جديدة فتظهرله واجهة الوارد — من غير ما الداعي يعمل أي حاجة. */
    _startReinvite() {
      this._stopReinvite();
      const startedAt = Date.now();
      this._reinviteTimer = setInterval(() => {
        const c = this._call;
        if (!c || !c.isCaller || (c.status !== 'outgoing' && c.status !== 'connecting')) { this._stopReinvite(); return; }
        /* بس خلال مهلة الرنين — بعد كده بطّل نداء */
        if (Date.now() - startedAt > RING_TIMEOUT) { this._stopReinvite(); return; }
        const me = this.me();
        const declined = c._declined || (c._declined = new Set());
        const all = (c.group ? c.members.filter(id => Number(id) !== me) : c.members).map(Number);
        const pending = all.filter(id => !c.peers.has(id) && !declined.has(id));
        if (!pending.length) { this._stopReinvite(); return; }
        const members = c.group ? c.members.slice() : [me, ...all];
        /* #160: لازم نبعت نوع المكالمة (فيديو/صوتي) في كل إعادة دعوة — من
           غيره السيرفر بيفترض «صوتي» فتوصل مكالمة الفيديو للطرف الآخر صوتية
           (وإشعارها كمان صوتي). ده اللي بدأ به الداعي، وده اللي بيعتمده الرد. */
        pending.forEach(id => this._send({ type: 'call:invite', to: id, callId: c.id, group: c.group || null, members, callType: c.video ? 'video' : 'audio' }));
      }, 3000);
    },
    _stopReinvite() { if (this._reinviteTimer) { clearInterval(this._reinviteTimer); this._reinviteTimer = null; } },

    /* ── حلقة صوت الرنين ── */
    _startRing(dir) {
      this._stopRing();
      if (dir === 'in') {
        /* مكالمة واردة: نغمة رنين النظام (زيّ واتساب) بدل نغمة Web Audio.
           الصوت الأصلي مش خاضع لسياسة WebView في منع التشغيل التلقائي فبيشتغل
           دايمًا؛ نفس النغمة اللي بيستخدمها FcmService والتطبيق مقفول → تجربة متّسقة. */
        const R = this._sysRing();
        if (R && R.start) { try { R.start({ vibrate: true }); this._sysRinging = true; return; } catch (e) {} }
      }
      /* صادرة (ringback) أو fallback على المتصفح: نغمة Web Audio زيّ ما هي */
      try { SFX.callRing(dir); } catch (e) {}
      this._ringSfxTimer = setInterval(() => { try { SFX.callRing(dir); } catch (e) {} }, dir === 'out' ? 3200 : 1800);
    },
    _stopRing() {
      if (this._sysRinging) { const R = this._sysRing(); if (R && R.stop) { try { R.stop(); } catch (e) {} } this._sysRinging = false; }
      if (this._ringSfxTimer) { clearInterval(this._ringSfxTimer); this._ringSfxTimer = null; }
    },

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
        speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
        video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
        videoOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
        flipCam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l2-3h6l1 1.5"/><path d="M14.5 9.5 17 12l2.5-2.5"/><path d="M17 12a5 5 0 0 0-9-3"/><path d="M13 22a5 5 0 0 0 9-3"/><circle cx="12" cy="13" r="3"/></svg>',
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
      /* شبكة مشاركي الحفلة — واجهة مختلفة تمامًا عن كارت المكالمة الفردية */
      #amkhc-grid{display:none;flex-wrap:wrap;gap:14px 10px;justify-content:center;margin:2px 0 20px;max-height:46vh;overflow-y:auto;}
      #amkhc-grid.on{display:flex;}
      .amkhc-tile{width:82px;display:flex;flex-direction:column;align-items:center;gap:7px;}
      .amkhc-tile .av{position:relative;width:62px;height:62px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;
        font-size:24px;font-weight:800;color:var(--color-text-primary,#fff);background:var(--color-surface-raised,#28304b);
        border:2px solid var(--color-border,rgba(255,255,255,.12));transition:border-color .2s,box-shadow .2s;}
      .amkhc-tile .av img{width:100%;height:100%;object-fit:cover;}
      .amkhc-tile.talk .av{border-color:var(--color-primary,#7aa2f7);box-shadow:0 0 0 4px rgba(122,162,247,.18);}
      .amkhc-tile.ringing .av{animation:amkhc-pulse 1.6s ease-out infinite;}
      .amkhc-tile .nm{font-size:11px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-text-secondary,#a9b1d6);}
      .amkhc-tile .mz{position:absolute;right:-2px;bottom:-2px;width:22px;height:22px;border-radius:50%;background:#e74c3c;
        display:none;align-items:center;justify-content:center;border:2px solid var(--color-surface,#1e2030);}
      .amkhc-tile.muted .mz{display:flex;}
      .amkhc-tile .mz svg{width:12px;height:12px;color:#fff;}
      /* ── وضع مكالمة الفيديو ملء الشاشة (#160) ── */
      #amkhc-overlay.video-mode{padding:0;background:#0b0d14;backdrop-filter:none;-webkit-backdrop-filter:none;align-items:stretch;justify-content:stretch;}
      #amkhc-overlay.video-mode .amkhc-card{display:none;}
      #amkhc-stage{display:none;position:relative;width:100%;height:100%;overflow:hidden;background:#0b0d14;}
      #amkhc-overlay.video-mode #amkhc-stage{display:block;}
      #amkhc-remote-wrap{position:absolute;inset:0;background:#0b0d14;}
      #amkhc-remote-wrap.solo .amkhc-rv{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#0b0d14;}
      #amkhc-remote-wrap.party{display:grid;gap:3px;padding:3px;grid-template-columns:repeat(2,1fr);align-content:center;height:100%;box-sizing:border-box;}
      #amkhc-remote-wrap.party .amkhc-rv{width:100%;height:100%;min-height:0;object-fit:cover;border-radius:12px;background:#151827;}
      #amkhc-local-video{position:absolute;right:14px;top:84px;width:104px;height:150px;object-fit:cover;border-radius:14px;
        border:2px solid rgba(255,255,255,.5);background:#000;z-index:4;box-shadow:0 6px 18px rgba(0,0,0,.5);}
      #amkhc-local-video.mirror{transform:scaleX(-1);}
      #amkhc-local-video.off{display:none;}
      #amkhc-vhead{position:absolute;top:0;left:0;right:0;z-index:3;text-align:center;
        padding:calc(18px + env(safe-area-inset-top,0)) 18px 22px;background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent);}
      #amkhc-vtitle{color:#fff;font-size:19px;font-weight:800;text-shadow:0 1px 5px rgba(0,0,0,.7);}
      #amkhc-vsub{color:rgba(255,255,255,.85);font-size:13px;margin-top:3px;font-variant-numeric:tabular-nums;text-shadow:0 1px 5px rgba(0,0,0,.7);min-height:16px;}
      #amkhc-vbar{position:absolute;left:0;right:0;bottom:0;z-index:4;display:flex;gap:16px;justify-content:center;align-items:flex-start;
        padding:18px 14px calc(26px + env(safe-area-inset-bottom,0));background:linear-gradient(to top,rgba(0,0,0,.6),transparent);}
      #amkhc-overlay.video-mode .amkhc-lbl{color:rgba(255,255,255,.9);text-shadow:0 1px 3px rgba(0,0,0,.6);}
      `;
      document.head.appendChild(style);
      const ov = document.createElement('div');
      ov.id = 'amkhc-overlay';
      ov.innerHTML = `<div class="amkhc-card">
        <div id="amkhc-avatar">◈</div>
        <div id="amkhc-title">صديق</div>
        <div id="amkhc-status"></div>
        <div id="amkhc-grid" class="amkhc-grid"></div>
        <div id="amkhc-timer"></div>
        <div id="amkhc-actions"></div>
      </div>
      <div id="amkhc-stage">
        <div id="amkhc-remote-wrap" class="amkhc-remote-wrap"></div>
        <video id="amkhc-local-video" muted playsinline autoplay></video>
        <div id="amkhc-vhead"><div id="amkhc-vtitle"></div><div id="amkhc-vsub"></div></div>
        <div id="amkhc-vbar"></div>
      </div>`;
      document.body.appendChild(ov);
      this._dom = {
        overlay: ov,
        card: ov.querySelector('.amkhc-card'),
        avatar: ov.querySelector('#amkhc-avatar'),
        title: ov.querySelector('#amkhc-title'),
        status: ov.querySelector('#amkhc-status'),
        grid: ov.querySelector('#amkhc-grid'),
        timer: ov.querySelector('#amkhc-timer'),
        actions: ov.querySelector('#amkhc-actions'),
        stage: ov.querySelector('#amkhc-stage'),
        remoteWrap: ov.querySelector('#amkhc-remote-wrap'),
        localVideo: ov.querySelector('#amkhc-local-video'),
        vtitle: ov.querySelector('#amkhc-vtitle'),
        vsub: ov.querySelector('#amkhc-vsub'),
        vbar: ov.querySelector('#amkhc-vbar'),
      };
      return this._dom;
    },
    _paintHead() {
      const call = this._call; if (!call) return;
      const dom = this._ensureDom();
      if (call.avatar) dom.avatar.innerHTML = `<img src="${call.avatar}" alt="">`;
      else dom.avatar.textContent = (call.title || '◈').trim().charAt(0) || '◈';
      dom.title.textContent = call.title || 'صديق';
      if (dom.vtitle) dom.vtitle.textContent = call.title || 'صديق';
    },
    _selfAvatar() {
      try { return (window.amkhAuth && window.amkhAuth.user && window.amkhAuth.user.avatar_url) || null; } catch (e) { return null; }
    },
    /* بلاطة مشارك واحد في شبكة الحفلة */
    _gridTile(name, avatar, muted, talking, ringing) {
      const tile = document.createElement('div');
      tile.className = 'amkhc-tile' + (muted ? ' muted' : '') + (talking && !muted ? ' talk' : '') + (ringing ? ' ringing' : '');
      const av = document.createElement('div');
      av.className = 'av';
      if (avatar) av.innerHTML = `<img src="${this._esc(avatar)}" alt="">`;
      else av.textContent = (name || '◈').trim().charAt(0) || '◈';
      const mz = document.createElement('span');
      mz.className = 'mz';
      mz.innerHTML = this._icon('micOff');
      av.appendChild(mz);
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = name || 'صديق';
      tile.appendChild(av); tile.appendChild(nm);
      return tile;
    },
    /* شبكة مشاركي الحفلة (تختلف عن كارت المكالمة الفردية) */
    _renderGrid() {
      const call = this._call; if (!call || !call.group) return;
      const dom = this._dom; if (!dom) return;
      const grid = dom.grid;
      grid.innerHTML = '';
      const active = call.status === 'active';
      const me = this.me();
      grid.appendChild(this._gridTile('أنت', this._selfAvatar(), call.muted, active, false));
      const connected = new Set();
      call.peers.forEach((peer, id) => {
        connected.add(Number(id));
        grid.appendChild(this._gridTile(peer.name, peer.avatar, !!peer.muted, peer.connected, !peer.connected));
      });
      /* أعضاء مدعوّون لسه ماتصلوش → بلاطات رنين */
      (Array.isArray(call.members) ? call.members : []).forEach(id => {
        id = Number(id);
        if (id === me || connected.has(id)) return;
        grid.appendChild(this._gridTile('…', null, false, false, true));
      });
    },
    /* يبدّل واجهة العرض حسب نوع المكالمة وحالتها:
       فردي صوتي=كارت وجه، حفلة صوتية=شبكة مشاركين، فيديو=مسرح ملء الشاشة */
    _applyLayout() {
      const call = this._call, dom = this._dom;
      if (!call || !dom) return;
      const videoMode = !!call.video && call.status !== 'incoming';
      const useGrid = !call.video && !!call.group && call.status !== 'incoming';
      dom.overlay.classList.toggle('video-mode', videoMode);
      dom.avatar.style.display = (videoMode || useGrid) ? 'none' : '';
      dom.grid.classList.toggle('on', useGrid);
      if (useGrid) this._renderGrid();
      if (videoMode) this._renderVideo();
    },
    /* رتّب عناصر فيديو النظائر: فردي=عنصر واحد ملء الشاشة، حفلة=شبكة (#160).
       عناصر الفيديو نفسها بتتضاف في _makePeer وتتشال في _onPeerGone، فهنا
       بنضبط بس نمط الحاوية والمعاينة المحلية — من غير إعادة بناء (بلا وميض). */
    _renderVideo() {
      const call = this._call, dom = this._dom;
      if (!call || !dom || !call.video) return;
      dom.remoteWrap.classList.toggle('solo', !call.group);
      dom.remoteWrap.classList.toggle('party', !!call.group);
      if (this._mic && dom.localVideo) this._attachLocalVideo();
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
      dom.status.textContent = call.group
        ? (call.video ? 'حفلة فيديو واردة…' : 'حفلة صوتية واردة…')
        : (call.video ? 'مكالمة فيديو واردة…' : 'مكالمة واردة…');
      dom.timer.textContent = '';
      dom.actions.innerHTML = '';
      dom.actions.appendChild(this._btn('reject', 'hangup', 'رفض', () => this.reject()).wrap);
      dom.actions.appendChild(this._btn('accept', call.video ? 'video' : 'phone', 'قبول', () => this.accept()).wrap);
      dom.overlay.classList.add('on');
    },
    _showActive() {
      const call = this._call; if (!call) return;
      const dom = this._ensureDom();
      this._paintHead();
      dom.overlay.classList.add('on');
      this._updateControls();
      this._applyLayout();
    },
    _updateControls() {
      const call = this._call; if (!call) { return; }
      const dom = this._dom; if (!dom) return;
      const st = call.status;
      /* نص الحالة (موحّد بين الكارت الصوتي وترويسة الفيديو) */
      let statusText;
      if (st === 'active') statusText = call.group ? (call.video ? 'حفلة فيديو' : 'حفلة صوتية') : (call.video ? 'مكالمة فيديو' : 'في مكالمة');
      else if (st === 'connecting') statusText = 'جارٍ الاتصال…';
      else statusText = call.isCaller ? 'جارٍ الرنين…' : (call.video ? 'مكالمة فيديو واردة…' : 'مكالمة واردة…');
      if (st === 'active') dom.avatar.classList.remove('ring'); else dom.avatar.classList.add('ring');
      dom.status.textContent = statusText;
      if (st !== 'active') { dom.timer.textContent = ''; if (dom.vsub) dom.vsub.textContent = statusText; }

      if (st === 'incoming') return; /* أزرار الوارد تُبنى في _showIncoming */

      /* حاوية الأزرار: شريط الفيديو السفلي أو أزرار الكارت الصوتي */
      const bar = call.video ? dom.vbar : dom.actions;
      const other = call.video ? dom.actions : dom.vbar;
      if (other) other.innerHTML = '';
      if (!bar) return;
      bar.innerHTML = '';

      const mute = this._btn('neutral', call.muted ? 'micOff' : 'mic', call.muted ? 'مكتوم' : 'ميكروفون', () => this.toggleMute());
      if (call.muted) mute.btn.classList.add('active');
      bar.appendChild(mute.wrap);

      /* أزرار الفيديو: تشغيل/إغلاق الكاميرا + تبديل أمامية/خلفية (#160) */
      if (call.video) {
        const cam = this._btn('neutral', call.camOff ? 'videoOff' : 'video', call.camOff ? 'الكاميرا مغلقة' : 'الكاميرا', () => this.toggleCamera());
        if (call.camOff) cam.btn.classList.add('active');
        bar.appendChild(cam.wrap);
        bar.appendChild(this._btn('neutral', 'flipCam', 'تبديل', () => this.switchCamera()).wrap);
      }

      /* زر مكبر الصوت — فردي وحفلة سواء؛ يظهر فقط لو التوجيه الأصلي متاح (أندرويد) */
      if (this._audioRoute()) {
        const spk = this._btn('neutral', 'speaker', call.speaker ? 'مكبر الصوت' : 'سماعة', () => this.toggleSpeaker());
        if (call.speaker) spk.btn.classList.add('active');
        bar.appendChild(spk.wrap);
      }
      bar.appendChild(this._btn('hangup', 'hangup', 'إنهاء', () => this.hangup()).wrap);
    },
    _updateTimer() {
      const call = this._call, dom = this._dom;
      if (!call || !dom || !call.startedAt) return;
      const t = this._fmtDur(Date.now() - call.startedAt);
      dom.timer.textContent = t;
      if (call.video && dom.vsub) dom.vsub.textContent = t;
    },

    /* ── تفكيك المكالمة وإغلاق النافذة ── */
    _end(reason) {
      const call = this._call;
      this._stopRing();
      this._clearRingTimeout();
      this._stopReinvite();
      if (this._durTimer) { clearInterval(this._durTimer); this._durTimer = null; }
      if (call) {
        call.peers.forEach(peer => {
          try { peer.pc.close(); } catch (e) {}
          try { peer.audioEl.srcObject = null; peer.audioEl.remove(); } catch (e) {}
        });
        call.peers.clear();
      }
      if (this._mic) { try { this._mic.getTracks().forEach(t => t.stop()); } catch (e) {} this._mic = null; }
      /* #158: رجّع وضع الصوت للطبيعي (يلغي MODE_IN_COMMUNICATION وتوجيه السبيكر) */
      { const AR = this._audioRoute(); if (AR && AR.reset) { try { AR.reset(); } catch (e) {} } }
      /* سجّل المكالمة في الشات (مرّة واحدة) قبل ما نمسح الحالة — زي واتساب */
      if (call && !call._logged) { call._logged = true; try { this._logCall(call, reason); } catch (e) {} }
      this._call = null;
      if (this._dom) {
        this._dom.overlay.classList.remove('on');
        this._dom.overlay.classList.remove('video-mode');
        /* #160: نظّف مسرح الفيديو (المعاينة + أي عناصر بعيدة متبقية) */
        try { this._dom.localVideo.srcObject = null; } catch (e) {}
        this._dom.localVideo.classList.remove('off', 'mirror');
        if (this._dom.remoteWrap) { this._dom.remoteWrap.innerHTML = ''; this._dom.remoteWrap.classList.remove('solo', 'party'); }
        if (this._dom.vbar) this._dom.vbar.innerHTML = '';
        if (this._dom.vsub) this._dom.vsub.textContent = '';
      }
      this._facing = 'user';
      this._switchingCam = false;
      /* صوت إنهاء المكالمة (ماعدا رفضي أنا — القرار كان مني) */
      if (reason && reason !== 'rejected-self') { try { SFX.callEnded(); } catch (e) {} }
    },

    /* ── تسجيل المكالمة كرسالة في الشات (فردي + حفلة) #153 ──
       نُحدّد الحالة من reason + هل اتوصلت فعلاً (startedAt). كل طرف يسجّل
       نسخته المحلية بمنظوره (mine = أنا اللي اتصلت). */
    _logCall(call, reason) {
      const chat = window.amkhChat;
      if (!chat || typeof chat.logCall !== 'function') return;
      const connected = !!call.startedAt;
      let status;
      if (connected) status = 'ended';
      else if (reason === 'rejected' || reason === 'rejected-self') status = 'declined';
      else if (reason === 'cancelled' || reason === 'hangup' || reason === 'busy' || reason === 'timeout') status = 'missed';
      else if (reason === 'error' || reason === 'peer-lost' || reason === 'remote-hangup' || reason === 'all-left') status = 'failed';
      else return; /* سبب مش معروف → متسجّلش */
      const duration = connected ? Math.max(0, Math.round((Date.now() - call.startedAt) / 1000)) : 0;
      const mine = !!call.isCaller;
      if (call.group) {
        chat.logCall({ scope: 'group', groupId: Number(call.group), mine, status, duration, title: call.title, video: !!call.video });
      } else {
        const peerId = mine ? Number((call.members || [])[0]) : Number(call.callerId);
        if (!peerId) return;
        chat.logCall({ scope: 'friend', peerId, mine, status, duration, title: call.title, avatar: call.avatar, video: !!call.video });
      }
    },




  };

  window.amkhCall = CALL;
  /* #159: جهّز التقاط نية «الرد» من إشعار المكالمة (والتطبيق كان مقفول) */
  try { CALL._armAutoAnswer(); } catch (e) {}
})();
