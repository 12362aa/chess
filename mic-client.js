/* ═══════════════════════════════════════════════════════════════════
   mic-client.js — «مايك المباراة» (البند ٧): تحدّثٌ صوتيّ داخل المباراة
   على الإنترنت وعلى البلوتوث، على نهج PUBG.

   القواعد كما طلبها أحمد:
   - أيقونة مايك **مرسومة** على شريط اللاعب تحت الاسم.
   - ضغطها تبعث طلب إذنٍ للطرف الآخر يحمل اسم الطالب.
   - القبول ← لكلٍّ منهما أن يفتح مايكه ويغلقه بقيّة المباراة.
   - الرفض ← لا يُعاد الطلب قبل ثلاث دقائق، وتظهر إشارةٌ حمراء.
   - البلوتوث: بلا تلك القيود — الطرفان متجاوران فعلًا، فالجهاز الآخر
     يوافق تلقائيًّا بلا نافذةٍ ولا مهلة، والمايك يفتح من الضغطة الأولى.

   ── النقل ──────────────────────────────────────────────────────────
   الصوت WebRTC في الحالتين. إشاراته تمشي على قناة المباراة القائمة:
   سوكت اللعب (mic:* يرحّلها السيرفر) أونلاين، وبايتات Nearby بالبادئة
   "MIC:" على البلوتوث — فلا تحتاج البلوتوث إنترنتًا للتفاوض، وتلتقط
   مساراتٍ محليّة (host candidates) لأن الجهازين متجاوران.

   ── لا تفاوضَ متكرّر ────────────────────────────────────────────────
   لحظة منح الإذن يركّب الطرفان مسارَيهما **مكتومَين** ويتفاوضان مرّة
   واحدة؛ بعدها فتحُ المايك وإغلاقه مجرّد track.enabled. ولأن الطرف
   الباذل للعرض ثابتٌ (صاحبُ الطلب) لا يقع تصادمُ عرضين أبدًا.

   قاعدتا الرسم المتوارثتان: الحركة transform/opacity فقط (#140)،
   وداخل الـSVG إزاحةٌ فقط.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MIC = (function () {

    const COOLDOWN_MS = 3 * 60 * 1000;   /* الرفض يقفل الطلب ثلاث دقائق */
    const REQ_TTL_MS = 30 * 1000;        /* عمر الطلب قبل أن ينتهي وحده */

    const L = (ar, en) => (typeof LP === 'function' ? LP(ar, en) : ar);
    const el = (tag, cls, txt) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    };
    const sfx = (name) => { try { if (window.SFX && SFX[name]) SFX[name](); } catch (e) { } };

    /* ── الحالة ─────────────────────────────────────────────────────
       phase: 'idle' | 'asking' (طلبتُ وأنتظر) | 'asked' (وصلني طلب) */
    const S = {
      on: false,          /* القسم مركّبٌ على الشاشة */
      mode: null,         /* 'online' | 'bluetooth' */
      phase: 'idle',
      granted: false,     /* الإذن ممنوحٌ لهذه المباراة */
      micOn: false,       /* مايكي مفتوحٌ الآن */
      peerMicOn: false,   /* مايك الخصم مفتوحٌ الآن */
      blockedUntil: 0,    /* رفضني، فلا أطلب قبل هذا الوقت */
      peerName: '',
      myBar: '', peerBar: '',
      pc: null, stream: null, audioEl: null,
      offerer: false,     /* أنا الباذل للعرض (صاحب الطلب) */
      wantOn: false,      /* نيّتي فتحُ المايك فور منح الإذن */
      pendingIce: [],
      reqTimer: null, cdTimer: null,
    };

    /* ═══ الرسم ═══════════════════════════════════════════════════ */

    /* مايكروفون مرسوم: كبسولةٌ وقوسٌ وساق. حالةُ الكتم يحملها خطٌّ
       مائل، فتُقرأ من الشكل لا من اللون وحده. */
    function micSVG(off) {
      return '<svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<rect x="9" y="2.5" width="6" height="10.5" rx="3" fill="currentColor"/>'
        + '<path d="M5.5 11a6.5 6.5 0 0 0 13 0" fill="none" stroke="currentColor"'
        + ' stroke-width="2" stroke-linecap="round"/>'
        + '<path d="M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round"/>'
        + '<path d="M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round"/>'
        + (off ? '<path d="M4 3.2L20.2 20.4" fill="none" stroke="currentColor"'
          + ' stroke-width="2.2" stroke-linecap="round"/>' : '')
        + '</svg>';
    }

    /* ثلاثُ شُرَطٍ تتراقص حين يتكلّم الخصم — إزاحةٌ فقط */
    const WAVE = '<span class="mic__wv" aria-hidden="true"><i></i><i></i><i></i></span>';

    /* ── الزرّ في شريط اللاعب ───────────────────────────────────── */
    function mountFor(barId, mine) {
      const bar = document.getElementById(barId);
      if (!bar) return null;
      const nm = bar.querySelector('.pb-nm');
      const host = nm && nm.parentElement;
      if (!host) return null;
      let row = host.querySelector('.mic');
      if (row) return row;
      row = el('div', 'mic' + (mine ? '' : ' is-peer'));
      row.setAttribute('data-no-i18n', '');
      const btn = el('button', 'mic__b');
      btn.type = 'button';
      btn.innerHTML = micSVG(true);
      row.appendChild(btn);
      row.appendChild(el('span', 'mic__t'));
      host.appendChild(row);
      if (mine) btn.addEventListener('click', onBtn);
      else btn.disabled = true;
      return row;
    }

    const rowOf = (barId) => (barId ? document.querySelector('#' + barId + ' .mic') : null);

    /* ═══ العرض ═══════════════════════════════════════════════════ */
    function paint() {
      const cooling = Date.now() < S.blockedUntil && !S.granted;

      const mine = rowOf(S.myBar);
      if (mine) {
        const btn = mine.querySelector('.mic__b');
        const lab = mine.querySelector('.mic__t');
        mine.classList.toggle('is-live', S.micOn);
        mine.classList.toggle('is-wait', S.phase === 'asking');
        mine.classList.toggle('is-no', cooling);
        btn.innerHTML = micSVG(!S.micOn);
        btn.disabled = S.phase === 'asking' || cooling;
        let txt;
        if (S.granted) txt = S.micOn ? L('مايكك مفتوح', 'Your mic is on')
          : L('اضغط للتحدّث', 'Tap to talk');
        else if (S.phase === 'asking') txt = L('بانتظار الموافقة…', 'Waiting for approval…');
        else if (cooling) txt = L('رُفض · ' + fmtLeft(), 'Declined · ' + fmtLeft());
        else txt = L('اطلب التحدّث', 'Ask to talk');
        lab.textContent = txt;
        btn.setAttribute('aria-label', txt);
        btn.title = txt;
      }

      const peer = rowOf(S.peerBar);
      if (peer) {
        const btn = peer.querySelector('.mic__b');
        const lab = peer.querySelector('.mic__t');
        peer.classList.toggle('is-live', S.peerMicOn);
        btn.innerHTML = micSVG(!S.peerMicOn);
        if (S.peerMicOn) {
          lab.innerHTML = '';
          lab.appendChild(document.createTextNode(L('يتحدّث', 'Talking')));
          lab.insertAdjacentHTML('beforeend', WAVE);
        } else {
          lab.textContent = S.granted ? L('مايكه مغلق', 'Mic off') : '';
        }
        /* قبل منح الإذن لا معنى لأيقونةٍ على شريط الخصم */
        peer.classList.toggle('is-idle', !S.granted);
      }
    }

    function fmtLeft() {
      const ms = Math.max(0, S.blockedUntil - Date.now());
      return Math.floor(ms / 60000) + ':' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    }

    function tickCooldown() {
      clearInterval(S.cdTimer);
      S.cdTimer = setInterval(() => {
        if (Date.now() >= S.blockedUntil) { clearInterval(S.cdTimer); S.cdTimer = null; }
        paint();
      }, 1000);
    }

    /* ═══ النقل ═══════════════════════════════════════════════════ */
    /* حدّ Nearby لحمولة BYTES هو 32768 بايت، وPayload.fromBytes بترمي
       استثناءً لو اتعدّى — استثناءٌ في جافا مابيرجعش للجافاسكربت، فالإشارة
       كانت هتضيع بصمت. أكبر إشارةٍ عندنا فعليًّا هي mic:offer بـ1573 بايت
       (قياسٌ حقيقيّ: SDP صوتٍ أحاديّ بترشيحٍ متدفّق، بلا مرشّحات داخله)،
       يعني عُشر الحدّ تقريبًا. فالحارس هنا شبكةُ أمانٍ لا أكثر: لو خرجت
       إشارةٌ عن الحدّ يومًا، نفشل صراحةً بدل ما نبعت ما لا يصل. */
    const BLE_MAX = 30000;

    function wire(o) {
      try {
        if (S.mode === 'bluetooth') {
          if (typeof BLEManager === 'undefined' || !BLEManager.sendRaw) return false;
          const raw = 'MIC:' + JSON.stringify(o);
          if (new TextEncoder().encode(raw).length > BLE_MAX) return false;
          BLEManager.sendRaw(raw);
          return true;
        }
        if (window.OL && OL.sendMic) return OL.sendMic(o);
      } catch (e) { }
      return false;
    }

    function notify(msg) {
      try {
        if (window.amkhUI && amkhUI.notify) amkhUI.notify(msg, L('المايك', 'Mic'), '◈');
      } catch (e) { }
    }

    /* توجيه الصوت للمكبّر لا سمّاعة الأذن (بلاجن AudioRoute، أندرويد فقط):
       اللاعب ناظرٌ إلى الرقعة والهاتف بعيدٌ عن أذنه — فصوت الخصم لازم
       يخرج من المكبّر كما في PUBG، لا من سمّاعة المكالمات. */
    function audioRoute() {
      try { return (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.AudioRoute) || null; }
      catch (e) { return null; }
    }
    function routeToSpeaker() {
      const AR = audioRoute();
      if (!AR || !AR.startCallAudio) return;
      try { const p = AR.startCallAudio({ speaker: true }); if (p && p.catch) p.catch(() => { }); }
      catch (e) { }
    }
    function routeRelease() {
      const AR = audioRoute();
      /* المكالمة الصوتيّة قد تكون شغّالة بالتوازي — لا نسحب مسارها */
      try { if (window.amkhCall && amkhCall._call) return; } catch (e) { }
      if (!AR || !AR.reset) return;
      try { const p = AR.reset(); if (p && p.catch) p.catch(() => { }); } catch (e) { }
    }

    /* ═══ الطلب والإذن ════════════════════════════════════════════ */
    function onBtn() {
      sfx('btn');
      if (S.granted) { setMic(!S.micOn); return; }
      if (S.phase === 'asking') return;
      if (Date.now() < S.blockedUntil) return;
      S.wantOn = true;       /* نيّتي أن أتكلّم فور الموافقة */
      askPeer();
    }

    function myName() {
      let v = '';
      try { v = ((Cfg && Cfg.data && Cfg.data.playerName) || '').trim(); } catch (e) { }
      return v || L('خصمك', 'Your opponent');
    }

    /* اسم الخصم كما يعرضه شريطه — لا كما بعثه هو.
       الاسم في المباراة الأونلاين يحلّه السيرفر (resolveOnlineNameById)
       ويُرسَم في .pb-nm-text، فقراءته من هناك تمنع أن ينتحل أحدٌ اسمًا
       في حمولة الطلب. حمولةُ الطلب احتياطٌ أخير لا أكثر. */
    function peerName(sent) {
      let v = '';
      try {
        const bar = document.getElementById(S.peerBar);
        const nm = bar && bar.querySelector('.pb-nm');
        const t = nm && (nm.querySelector('.pb-nm-text') || nm);
        v = t ? (t.textContent || '').trim() : '';
      } catch (e) { }
      if (!v) v = String(sent || '').trim().slice(0, 24);
      return v || L('خصمك', 'Your opponent');
    }

    function askPeer() {
      if (!wire({ t: 'mic:req', name: myName() })) {
        notify(L('لا يوجد اتصالٌ بالخصم الآن', 'No connection to your opponent right now'));
        S.wantOn = false;
        return;
      }
      S.phase = 'asking';
      paint();
      clearTimeout(S.reqTimer);
      /* البلوتوث يوافق تلقائيًّا فلا معنى لمهلةٍ هناك */
      if (S.mode === 'bluetooth') return;
      S.reqTimer = setTimeout(() => {
        if (S.phase !== 'asking') return;
        S.phase = 'idle'; S.wantOn = false;
        paint();
        notify(L('لم يردّ خصمك على طلب التحدّث',
          'Your opponent did not answer your talk request'));
      }, REQ_TTL_MS);
    }

    /* نافذة الإذن — على ثيم التطبيق، بصوتها الخاص، وتحمل اسم الطالب */
    function askDialog(name) {
      const ov = dlgHost();
      const body = ov.firstChild;
      body.innerHTML = '';

      const art = el('div', 'mica__art');
      art.innerHTML = micSVG(false);
      body.appendChild(art);

      body.appendChild(el('span', 'mica__k', L('طلبُ تحدّث', 'Talk request')));
      body.appendChild(el('h3', 'mica__h', name));
      body.appendChild(el('p', 'mica__p',
        L('يطلب فتح المايك بينكما لبقيّة المباراة. إن وافقتَ صار لكلٍّ منكما أن '
          + 'يفتح مايكه ويغلقه متى شاء. وإن رفضتَ فلن يستطيع معاودة الطلب قبل ثلاث دقائق.',
          'wants to open the mic between you for the rest of the game. If you accept, each '
          + 'of you can turn your own mic on and off at will. If you decline, they cannot '
          + 'ask again for three minutes.')));

      const row = el('div', 'mica__r');
      const no = el('button', 'mica__no', L('رفض', 'Decline'));
      no.type = 'button';
      no.onclick = () => { sfx('btn'); closeDlg(); decline(); };
      const yes = el('button', 'mica__ok', L('موافقة', 'Accept'));
      yes.type = 'button';
      yes.onclick = () => { sfx('btn'); closeDlg(); accept(); };
      row.appendChild(no); row.appendChild(yes);
      body.appendChild(row);

      ov.dataset.sfx = 'micAsk';
      try { DSOverlay.open(ov); } catch (e) { ov.classList.add('is-open'); }
    }

    function dlgHost() {
      let ov = document.getElementById('mic-ask');
      if (ov) return ov;
      ov = document.createElement('div');
      ov.id = 'mic-ask';
      ov.className = 'ds-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      const d = el('div', 'ds-dialog mica');
      d.setAttribute('data-no-i18n', '');
      ov.appendChild(d);
      /* لا إغلاقَ بالنقر على الخلفية: الطلب يستحقّ ردًّا صريحًا */
      document.body.appendChild(ov);
      return ov;
    }

    function closeDlg() {
      const ov = document.getElementById('mic-ask');
      if (!ov) return;
      try { DSOverlay.close(ov); } catch (e) { ov.classList.remove('is-open'); }
    }

    async function accept() {
      clearTimeout(S.reqTimer);
      S.granted = true; S.phase = 'idle'; S.offerer = false;
      wire({ t: 'mic:accept' });
      paint();
      /* المُجيب يركّب مساره مكتومًا وينتظر عرض الطالب */
      await setupMedia();
      if (S.mode !== 'bluetooth') {
        /* المُجيب لم يضغط شيئًا، فسطرٌ واحدٌ يخبره أن القناة صارت مفتوحة
           وأن الكرة في ملعبه — والشريط نفسه يقول الباقي. */
        notify(L('فُتحت قناة الصوت — اضغط المايك لتتحدّث',
          'Voice channel is open — tap the mic to talk'));
      }
      sfx('micOpen');
      paint();
    }

    function decline() {
      clearTimeout(S.reqTimer);
      S.phase = 'idle';
      wire({ t: 'mic:decline' });
      paint();
    }

    /* ═══ WebRTC ═══════════════════════════════════════════════════ */
    async function iceServers() {
      const fallback = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
      /* البلوتوث لا إنترنت فيه بالضرورة: المرشّحات المحليّة تكفي لأن
         الجهازين على نفس الشبكة القريبة، وجلبُ TURN سيعلّق بلا داعٍ. */
      if (S.mode === 'bluetooth') return [];
      try {
        if (window.amkhEnsureServer) await window.amkhEnsureServer();
        const base = window.getApiBase ? window.getApiBase() : '/api';
        const r = await fetch(base + '/webrtc-config', {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        });
        if (r.ok) {
          const j = await r.json();
          if (j && Array.isArray(j.iceServers) && j.iceServers.length) return j.iceServers;
        }
      } catch (e) { }
      return fallback;
    }

    async function ensurePc() {
      if (S.pc) return S.pc;
      const pc = new RTCPeerConnection({ iceServers: await iceServers() });
      S.pc = pc;
      pc.onicecandidate = (e) => { if (e.candidate) wire({ t: 'mic:ice', c: e.candidate }); };
      pc.ontrack = (e) => {
        if (!S.audioEl) {
          const a = document.createElement('audio');
          a.autoplay = true; a.playsInline = true;
          a.style.display = 'none';
          document.body.appendChild(a);
          S.audioEl = a;
        }
        try {
          S.audioEl.srcObject = e.streams[0];
          const p = S.audioEl.play();
          if (p && p.catch) p.catch(() => { });
        } catch (x) { }
      };
      pc.onconnectionstatechange = () => {
        if (pc !== S.pc) return;
        if (pc.connectionState === 'failed') {
          notify(L('تعذّر إيصال الصوت بينكما', 'Could not route the voice between you'));
          dropRtc();
          paint();
        }
      };
      return pc;
    }

    async function ensureStream() {
      if (S.stream && S.stream.active) return S.stream;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('no-gum');
      }
      S.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, noiseSuppression: true,
          autoGainControl: true, channelCount: { ideal: 1 },
        },
        video: false,
      });
      /* يبدأ مكتومًا: الإذن لا يعني أن أحدهم يتكلّم */
      S.stream.getAudioTracks().forEach(t => { t.enabled = false; });
      return S.stream;
    }

    /* يُنادى مرّةً واحدةً لحظةَ منح الإذن: مايكٌ مكتومٌ ومسارٌ مركَّب
       وتفاوضٌ واحدٌ من الباذل. بعده لا تفاوضَ أبدًا. */
    async function setupMedia() {
      try {
        const stream = await ensureStream();
        const pc = await ensurePc();
        if (!pc.getSenders().length) stream.getTracks().forEach(t => pc.addTrack(t, stream));
        if (S.offerer && pc.signalingState === 'stable') {
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          /* لو العرض ما خرجش، مافيش قناةَ صوتٍ أصلًا — فنقولها صراحةً
             بدل ما يفضل اللاعب ضاغطًا على زرٍّ لا يسمعه أحد. */
          if (!wire({ t: 'mic:offer', sdp: pc.localDescription })) {
            dropRtc();
            S.granted = false;
            notify(L('تعذّر فتح قناة الصوت — لا يوجد اتصالٌ بالخصم الآن',
              'Could not open the voice channel — no connection to your opponent right now'));
            paint();
            return false;
          }
        }
        routeToSpeaker();
        return true;
      } catch (e) {
        notify(L('تعذّر تشغيل المايك — تأكّد من إذن الميكروفون لدى جهازك',
          'Could not start the mic — check your device microphone permission'));
        return false;
      }
    }

    async function setMic(on) {
      if (!S.granted) return;
      if (on && (!S.stream || !S.stream.active)) {
        if (!await setupMedia()) return;
      }
      if (S.stream) S.stream.getAudioTracks().forEach(t => { t.enabled = !!on; });
      S.micOn = !!on;
      sfx(on ? 'micOpen' : 'micClose');
      wire({ t: 'mic:toggle', on: S.micOn });
      paint();
    }

    function dropRtc() {
      const had = !!(S.pc || S.stream);
      try { if (S.pc) S.pc.close(); } catch (e) { }
      S.pc = null;
      S.pendingIce = [];
      try { if (S.stream) S.stream.getTracks().forEach(t => t.stop()); } catch (e) { }
      S.stream = null;
      try { if (S.audioEl) { S.audioEl.srcObject = null; S.audioEl.remove(); } } catch (e) { }
      S.audioEl = null;
      S.micOn = false;
      S.peerMicOn = false;
      if (had) routeRelease();
    }

    function flushIce() {
      if (!S.pc) return;
      S.pendingIce.splice(0).forEach(c => {
        try { S.pc.addIceCandidate(c); } catch (e) { }
      });
    }

    /* ═══ استقبال الإشارات ═══════════════════════════════════════ */
    async function onSignal(d) {
      if (!d || !S.on) return false;
      switch (d.t || d.type) {

        case 'mic:req': {
          /* ممنوحٌ أصلًا (أو طلبنا في نفس اللحظة) → موافقةٌ صامتة */
          if (S.granted) { wire({ t: 'mic:accept' }); return true; }
          S.peerName = peerName(d.name);
          /* البلوتوث: الطرفان متجاوران فعلًا — موافقةٌ فوريّة بلا نافذةٍ
             ولا مهلةٍ ولا حظر، كما طلب أحمد. */
          if (S.mode === 'bluetooth') { await accept(); return true; }
          S.phase = 'asked';
          askDialog(S.peerName);
          try { if (navigator.vibrate) navigator.vibrate([30, 60, 30]); } catch (e) { }
          return true;
        }

        case 'mic:accept': {
          clearTimeout(S.reqTimer);
          if (!S.granted) { S.granted = true; S.offerer = true; }
          S.phase = 'idle';
          paint();
          const ok = await setupMedia();
          if (ok && S.wantOn) { S.wantOn = false; await setMic(true); }
          else { S.wantOn = false; if (ok) sfx('micOpen'); }
          paint();
          return true;
        }

        case 'mic:decline': {
          clearTimeout(S.reqTimer);
          S.phase = 'idle'; S.wantOn = false;
          /* البلوتوث معفًى من قاعدة الثلاث دقائق: القناة هناك بين جهازين
             متجاورين يراهما صاحباهما، فلا بابَ لإزعاجٍ يستحقّ حظرًا. */
          if (S.mode !== 'bluetooth') {
            S.blockedUntil = Date.now() + COOLDOWN_MS;
            tickCooldown();
          }
          /* لا نافذةَ هنا: الردّ يظهر على الشريط نفسه إشارةً حمراء مع
             عدّادٍ تنازليّ للدقائق الثلاث، وصوتُ رفضٍ قصير. نافذةٌ تغطّي
             الرقعة وسط المباراة أثقل من الخبر الذي تحمله. */
          sfx('err');
          paint();
          return true;
        }

        case 'mic:offer': {
          if (!d.sdp) return true;
          const pc = await ensurePc();
          if (pc.signalingState !== 'stable') return true;   /* لا تفاوضَ متزاحم */
          await pc.setRemoteDescription(d.sdp);
          try {
            const stream = await ensureStream();
            if (!pc.getSenders().length) stream.getTracks().forEach(t => pc.addTrack(t, stream));
            else if (S.micOn) stream.getAudioTracks().forEach(t => { t.enabled = true; });
          } catch (e) { }
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          wire({ t: 'mic:answer', sdp: pc.localDescription });
          flushIce();
          return true;
        }

        case 'mic:answer': {
          if (!S.pc || !d.sdp) return true;
          if (S.pc.signalingState !== 'have-local-offer') return true;
          await S.pc.setRemoteDescription(d.sdp);
          flushIce();
          return true;
        }

        case 'mic:ice': {
          if (!d.c) return true;
          if (!S.pc || !S.pc.remoteDescription) { S.pendingIce.push(d.c); return true; }
          try { await S.pc.addIceCandidate(d.c); } catch (e) { }
          return true;
        }

        case 'mic:toggle': {
          S.peerMicOn = !!d.on;
          paint();
          return true;
        }

        case 'mic:end':
        case 'mic:leave': {
          dropRtc();
          S.granted = false; S.phase = 'idle'; S.offerer = false; S.wantOn = false;
          paint();
          return true;
        }
      }
      return false;
    }

    /* ═══ الدورة مع المباراة ═════════════════════════════════════ */
    function start(mode, myCol) {
      if (mode !== 'online' && mode !== 'bluetooth') return;
      stop();
      S.on = true;
      S.mode = mode;
      S.phase = 'idle';
      S.granted = false; S.offerer = false; S.wantOn = false;
      S.micOn = false; S.peerMicOn = false;
      S.blockedUntil = 0;
      const my = (myCol === 'b') ? 'b' : 'w';
      S.myBar = my === 'w' ? 'bar-w' : 'bar-b';
      S.peerBar = my === 'w' ? 'bar-b' : 'bar-w';
      mountFor(S.myBar, true);
      mountFor(S.peerBar, false);
      paint();
    }

    function stop() {
      if (S.on) { try { wire({ t: 'mic:leave' }); } catch (e) { } }
      dropRtc();
      clearTimeout(S.reqTimer); clearInterval(S.cdTimer);
      S.reqTimer = S.cdTimer = null;
      S.on = false; S.mode = null; S.granted = false;
      S.phase = 'idle'; S.offerer = false; S.wantOn = false;
      S.myBar = S.peerBar = '';
      document.querySelectorAll('.mic').forEach(n => n.remove());
      closeDlg();
    }

    /* البلوتوث بيوصل بايتات خام — البادئة "MIC:" تخصّنا */
    function onBleRaw(msg) {
      if (typeof msg !== 'string' || msg.indexOf('MIC:') !== 0) return false;
      try { onSignal(JSON.parse(msg.slice(4))); } catch (e) { }
      return true;
    }

    function relang() { if (S.on) paint(); }

    return { start, stop, onSignal, onBleRaw, relang, paint, _S: S };
  })();

  window.MIC = MIC;
  try {
    window.addEventListener('amkh:lang', () => { try { MIC.relang(); } catch (e) { } });
  } catch (e) { }
})();
