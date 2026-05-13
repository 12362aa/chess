// ═══════════════════════════════════════════════════════════
// LAN Mode using Firebase Realtime Database - SIMPLE VERSION
// ═══════════════════════════════════════════════════════════
// استبدل كود LAN القديم بهذا الكود البسيط

const LAN = (() => {
  const SESSION_KEY = 'chess-lan-session-v1';
  let _myCol = 'w';
  let _roomCode = '';
  let _roomRef = null;
  let _messagesRef = null;
  let _unsubscribe = null;

  function setSt(tab, msg, tp = '') {
    const el = document.getElementById('lan-st-' + tab);
    if (el) {
      el.className = 'ost' + (tp ? ' ' + tp : '');
      el.textContent = msg;
    }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(extra = {}) {
    try {
      const next = { code: _roomCode, myCol: _myCol, active: true, ...extra };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch (e) {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function disconnect() {
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
    _roomRef = null;
    _messagesRef = null;
  }

  function send(obj) {
    if (!_messagesRef || !rtdb) return;
    try {
      _messagesRef.push({
        ...obj,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        from: _myCol
      });
    } catch (e) {
      console.error('[LAN] Send error:', e);
    }
  }

  function handleMessage(data) {
    if (!data || data.from === _myCol) return; // تجاهل رسائلي

    switch (data.type) {
      case 'start':
        _go(data.yourColor, data.oppName || '', _roomCode, false);
        break;

      case 'move':
        if (S.mode === 'lan') {
          S.sel = [];
          S.legal = [];
          SFX.init();
          G.applyMove(data.fr, data.to, data.promo || null);
          if (document.hidden) Notifications.yourTurn();
        }
        break;

      case 'assist':
        if (S.mode === 'lan') {
          S.oppUsingAssist = !!data.on;
          updateAssistIndicators();
        }
        break;

      case 'resign':
        if (S.mode === 'lan' && !S.over) {
          S.over = true;
          const winner = S.myCol === 'w' ? 'الأبيض' : 'الأسود';
          showGameOver(`${winner} فاز! الخصم استسلم`, S.myCol);
        }
        break;

      case 'chat':
        try {
          CHAT._addMsg(data.text || '', 'opp');
        } catch (e) {}
        break;

      case 'voice':
        try {
          CHAT._addVoiceMsg(data.audio, data.duration || 0, 'opp');
        } catch (e) {}
        break;

      case 'name':
        const oc = E.opp(S.myCol || _myCol || 'w');
        const oppEl = document.getElementById(oc === 'w' ? 'nm-w' : 'nm-b');
        if (oppEl) oppEl.textContent = normName(data.name, 'الخصم');
        break;

      case 'pimg':
        S.oppImg = data.img || null;
        updatePlayerImages();
        break;
    }
  }

  function _go(myCol, oppName, code, isResume) {
    S.mode = 'lan';
    S.myCol = myCol;
    S.oppName = oppName;
    _myCol = myCol;
    _roomCode = code;
    saveSession({ code, myCol, active: true });

    Nav.game();
    document.getElementById('s-game').classList.add('mode-lan');
    fixBars(myCol);

    const myName = normName(Cfg.data.playerName, 'أنا');
    document.getElementById(myCol === 'w' ? 'nm-w' : 'nm-b').textContent = myName;
    document.getElementById(E.opp(myCol) === 'w' ? 'nm-w' : 'nm-b').textContent = normName(oppName, 'الخصم');

    document.getElementById('gmode').textContent = `LAN: ${code}`;
    document.getElementById('btn-chat').style.display = 'flex';

    if (!isResume) {
      G.newGame();
      try {
        send({ type: 'name', name: myName });
        if (Cfg.data.playerImage) send({ type: 'pimg', img: Cfg.data.playerImage });
      } catch (e) {}
    }

    updatePlayerImages();
  }

  return {
    pc: 'w',
    init() {
      setSt('c', '');
      setSt('j', '');
      document.getElementById('lan-rbox').style.display = 'none';
      document.getElementById('lan-btn-create').disabled = false;
      document.getElementById('lan-jinp').value = '';
    },
    tab(t) {
      SFX.btn();
      ['c', 'j'].forEach(x => {
        document.getElementById('lan-tb-' + x).classList.toggle('on', x === t);
        document.getElementById('lan-tc-' + x).classList.toggle('on', x === t);
      });
    },
    col(c) {
      SFX.btn();
      this.pc = c;
      ['w', 'b', 'r'].forEach(x => {
        document.getElementById('lan-co-' + x).classList.toggle('on', x === c);
      });
    },
    async create() {
      if (!rtdb) {
        setSt('c', '◆ Firebase غير متاح - تحقق من الاتصال بالإنترنت', 'err');
        return;
      }

      SFX.btn();
      setSt('c', '◌ جاري إنشاء غرفة...', 'conn');

      try {
        // توليد كود عشوائي
        const code = String(1000 + Math.floor(Math.random() * 9000));
        
        // إنشاء الغرفة في Firebase
        _roomCode = code;
        _roomRef = rtdb.ref(`lan_rooms/${code}`);
        _messagesRef = rtdb.ref(`lan_rooms/${code}/messages`);

        const hostColor = this.pc === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : this.pc;
        _myCol = hostColor;

        await _roomRef.set({
          host: {
            color: hostColor,
            name: Cfg.data.playerName || 'اللاعب 1',
            joined: firebase.database.ServerValue.TIMESTAMP
          },
          guest: null,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        // الاستماع للضيف
        _unsubscribe = _roomRef.child('guest').on('value', (snapshot) => {
          const guest = snapshot.val();
          if (guest && guest.name) {
            setSt('c', '◉ بدأت المباراة!', 'ok');
            _go(_myCol, guest.name, code, false);
            
            // إرسال رسالة البداية للضيف
            send({
              type: 'start',
              yourColor: guest.color,
              oppName: Cfg.data.playerName || 'اللاعب 1'
            });
          }
        });

        // الاستماع للرسائل
        _messagesRef.on('child_added', (snapshot) => {
          const data = snapshot.val();
          if (data) handleMessage(data);
        });

        document.getElementById('lan-rcode').textContent = code;
        document.getElementById('lan-rbox').style.display = 'block';
        document.getElementById('lan-btn-create').disabled = true;
        setSt('c', '◍ في انتظار الجهاز الآخر...', 'wait');

      } catch (e) {
        console.error('[LAN] Create error:', e);
        setSt('c', '◆ فشل إنشاء الغرفة: ' + e.message, 'err');
      }
    },
    async join() {
      if (!rtdb) {
        setSt('j', '◆ Firebase غير متاح - تحقق من الاتصال بالإنترنت', 'err');
        return;
      }

      const code = document.getElementById('lan-jinp').value.trim();
      if (!code || code.length !== 4) {
        setSt('j', '◆ أدخل كود صحيح (4 أرقام)', 'err');
        return;
      }

      SFX.btn();
      setSt('j', '◌ جاري الانضمام...', 'conn');

      try {
        _roomCode = code;
        _roomRef = rtdb.ref(`lan_rooms/${code}`);
        _messagesRef = rtdb.ref(`lan_rooms/${code}/messages`);

        // التحقق من وجود الغرفة
        const snapshot = await _roomRef.once('value');
        const room = snapshot.val();

        if (!room || !room.host) {
          setSt('j', '◆ الكود غير صحيح أو انتهت صلاحية الغرفة', 'err');
          return;
        }

        if (room.guest) {
          setSt('j', '◆ الغرفة ممتلئة', 'err');
          return;
        }

        const guestColor = room.host.color === 'w' ? 'b' : 'w';
        _myCol = guestColor;

        // الانضمام كضيف
        await _roomRef.child('guest').set({
          color: guestColor,
          name: Cfg.data.playerName || 'اللاعب 2',
          joined: firebase.database.ServerValue.TIMESTAMP
        });

        // الاستماع للرسائل
        _messagesRef.on('child_added', (snapshot) => {
          const data = snapshot.val();
          if (data) handleMessage(data);
        });

        setSt('j', '◉ تم الانضمام! جاري بدء المباراة...', 'ok');
        _go(guestColor, room.host.name || 'اللاعب 1', code, false);

      } catch (e) {
        console.error('[LAN] Join error:', e);
        setSt('j', '◆ فشل الانضمام: ' + e.message, 'err');
      }
    },
    leave() {
      SFX.btn();
      clearSession();
      disconnect();
      _roomCode = '';
      document.getElementById('lan-rcode').textContent = '—';
      document.getElementById('lan-rbox').style.display = 'none';
      document.getElementById('lan-btn-create').disabled = false;
      if (S.mode === 'lan') {
        S.mode = '';
        Nav.lan();
        setSt('c', '◎ تم مغادرة غرفة LAN', '');
      }
    },
    copy() {
      SFX.btn();
      const code = _roomCode || document.getElementById('lan-rcode').textContent;
      if (!code || code === '—') return;
      navigator.clipboard.writeText(code).then(() => {
        const b = document.querySelector('#lan-rbox .rb-cp');
        if (b) {
          b.textContent = '◉ تم النسخ!';
          setTimeout(() => (b.textContent = '⧉ نسخ الكود'), 2000);
        }
      }).catch(() => {});
    },
    sendMove(mv) {
      send({ type: 'move', fr: mv.fr, to: mv.to, promo: mv.promo });
    },
    sendAssist(on) {
      send({ type: 'assist', on });
    },
    sendChat(txt) {
      send({ type: 'chat', text: txt });
    },
    sendVoice(audioData, durationSec) {
      send({ type: 'voice', audio: audioData, duration: durationSec });
    },
    sendPimg(img) {
      send({ type: 'pimg', img });
    },
    sendProfileImage(img) {
      send({ type: 'pimg', img });
    },
    sendResign() {
      send({ type: 'resign' });
      clearSession();
      setTimeout(() => disconnect(), 400);
    },
    dc() {
      clearSession();
      disconnect();
    },
    syncState() {} // لا حاجة له مع Firebase
  };
})();
