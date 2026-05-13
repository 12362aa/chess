/**
 * ♟ شطرنج Am-Kh — WebSocket Game Server with API
 * Node.js + ws + Express + SQLite
 * يرفع على Back4app (Container)
 */

'use strict';

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const PORT = process.env.PORT || 8081;

// No database needed for authless version

// Express app for API
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','ngrok-skip-browser-warning']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const TOKENS_PATH = path.join(__dirname, 'tokens.json');

function safeReadTokens() {
  try {
    if (!fs.existsSync(TOKENS_PATH)) return [];
    const raw = fs.readFileSync(TOKENS_PATH, 'utf8');
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function safeWriteTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (e) {}
}

let _adminReady = false;
try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    _adminReady = true;
  }
} catch (e) {
  _adminReady = false;
}

const FRONTEND_URL = String(process.env.FRONTEND_URL || '').trim();
function _absUrl(p) {
  const pathPart = String(p || '');
  if (!pathPart) return '';
  if (/^https?:\/\//i.test(pathPart)) return pathPart;
  const base = FRONTEND_URL ? FRONTEND_URL.replace(/\/$/, '') : '';
  if (!base) return pathPart;
  const pp = pathPart.startsWith('/') ? pathPart : '/' + pathPart;
  return base + pp;
}

function _buildLink(payload) {
  const raw = payload && payload.link ? String(payload.link).trim() : '';
  if (raw) return raw;
  const base = FRONTEND_URL ? FRONTEND_URL.replace(/\/$/, '') : '';
  if (!base) return '';
  const room = payload && payload.data && payload.data.room ? String(payload.data.room).trim() : '';
  if (room) return base + '/index.html#online?room=' + encodeURIComponent(room);
  return base + '/index.html';
}

function sendPushToTokens(tokens, payload) {
  if (!_adminReady) return Promise.resolve({ ok: false, reason: 'admin-not-ready' });
  if (!tokens || !tokens.length) return Promise.resolve({ ok: false, reason: 'no-tokens' });

  const title = String(payload?.title || 'شطرنج Am-Kh');
  const body = String(payload?.body || 'تنبيه جديد');
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const link = _buildLink(payload);

  const message = {
    tokens,
    notification: { title, body },
    data: Object.fromEntries(Object.entries({ ...data, link }).map(([k, v]) => [String(k), String(v)])),
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        title,
        body,
        icon: _absUrl('/icon_v2.png?v=2'),
        badge: _absUrl('/icon_v2.png?v=2'),
        tag: payload?.tag ? String(payload.tag) : 'nour-daily',
        requireInteraction: false,
      },
      fcmOptions: link ? { link } : undefined,
    },
  };

  return admin.messaging().sendEachForMulticast(message)
    .then(resp => ({ ok: true, successCount: resp.successCount, failureCount: resp.failureCount, responses: resp.responses }))
    .catch(e => ({ ok: false, reason: 'send-failed', error: String(e && e.message ? e.message : e) }));
}

const _dailySent = new Set();
function _todayKey(token, slot) {
  const d = new Date();
  const keyDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return keyDate + '|' + slot + '|' + token;
}

function scheduleDailyNourPushes() {
  const windows = [
    { slot: 'morning', startHour: 10, endHour: 12, title: 'تحدي نور الصباح ♟', bodies: ['تحدي سريع: حاول تكسب المرحلة اليوم بـ 3 نجوم!', 'نور يقول: افتح اللعبة وخليّنا نتمرّن 5 دقايق بس.', 'جاهز لنقلة ذكية؟ نور ينتظرك 👀'] },
    { slot: 'afternoon', startHour: 16, endHour: 18, title: 'تحدي نور العصر ♟', bodies: ['معلومة سريعة: ركّز على الأمان قبل الهجوم… وجربها الآن.', 'نور: تعال نعمل مباراة تدريب قصيرة 💬', 'تحدي: افوز على نور بدون ما تخسر وزيرك 😄'] },
    { slot: 'night', startHour: 21, endHour: 23, title: 'تحدي نور الليلي ♟', bodies: ['قبل النوم… نقلة واحدة صح ممكن تغيّر كل شيء. افتح اللعبة!', 'نور: دقيقة تدريب = فرق كبير بكرة ✨', 'تحدي الليلة: العب أونلاين مباراة واحدة بس!'] },
  ];

  function msUntil(hourMin) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hourMin.h, hourMin.m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }

  function pickTime(startHour, endHour) {
    const h = startHour + Math.floor(Math.random() * Math.max(1, (endHour - startHour)));
    const m = Math.floor(Math.random() * 60);
    return { h, m };
  }

  async function runSlot(win) {
    const all = safeReadTokens();
    const tokens = all.map(t => t && t.token).filter(Boolean);
    if (!tokens.length) return;

    const body = win.bodies[Math.floor(Math.random() * win.bodies.length)];
    const toSend = tokens.filter(tk => !_dailySent.has(_todayKey(tk, win.slot)));
    if (!toSend.length) return;

    const resp = await sendPushToTokens(toSend, {
      title: win.title,
      body,
      tag: 'nour-daily-' + win.slot,
      data: { kind: 'nour_daily', slot: win.slot },
    });

    if (resp && resp.ok && Array.isArray(resp.responses)) {
      resp.responses.forEach((r, i) => {
        if (r && r.success) _dailySent.add(_todayKey(toSend[i], win.slot));
      });
    }
  }

  windows.forEach(win => {
    const t = pickTime(win.startHour, win.endHour);
    setTimeout(() => {
      runSlot(win).catch(() => {});
      setInterval(() => runSlot(win).catch(() => {}), 24 * 60 * 60 * 1000);
    }, msUntil(t));
  });
}

function getTokensForDeviceId(deviceId) {
  if (!deviceId) return [];
  const all = safeReadTokens();
  return all
    .filter(t => t && t.deviceId && String(t.deviceId) === String(deviceId) && t.token)
    .map(t => t.token);
}

async function sendPushToDevice(deviceId, payload) {
  if (!_adminReady) return { ok: false, reason: 'admin-not-ready' };
  const tokens = getTokensForDeviceId(deviceId);
  if (!tokens.length) return { ok: false, reason: 'no-tokens' };

  const title = String(payload?.title || 'شطرنج Am-Kh');
  const body = String(payload?.body || 'تنبيه جديد');
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const link = _buildLink(payload);

  const message = {
    tokens,
    notification: { title, body },
    data: Object.fromEntries(Object.entries({ ...data, link }).map(([k, v]) => [String(k), String(v)])),
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        title,
        body,
        icon: _absUrl('/icon_v2.png?v=2'),
        badge: _absUrl('/icon_v2.png?v=2'),
        tag: payload?.tag ? String(payload.tag) : 'chess-auto',
        requireInteraction: false,
      },
      fcmOptions: link ? { link } : undefined,
    },
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(message);

    const badTokens = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          badTokens.push(tokens[i]);
        }
      }
    });

    if (badTokens.length) {
      const all = safeReadTokens();
      const filtered = all.filter(t => t && !badTokens.includes(t.token));
      safeWriteTokens(filtered);
    }
    return { ok: true, successCount: resp.successCount, failureCount: resp.failureCount };
  } catch (e) {
    return { ok: false, reason: 'send-failed', error: String(e && e.message ? e.message : e) };
  }
}

// Add ngrok-skip-browser-warning header
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// API Routes removed - no authentication needed
// Only health check endpoints remain

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Groq proxy (keep API key off the frontend)
app.post('/api/groq/chat', async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'meta-llama/llama-4-scout-17b-16e-instruct';
    const messages = Array.isArray(body.messages) ? body.messages : null;
    const max_tokens = Number.isFinite(body.max_tokens) ? body.max_tokens : undefined;
    const temperature = Number.isFinite(body.temperature) ? body.temperature : undefined;

    if (!messages || !messages.length) return res.status(400).json({ error: 'Missing messages[]' });

    const payload = {
      model,
      messages,
    };
    if (typeof max_tokens === 'number') payload.max_tokens = Math.max(1, Math.min(2048, Math.floor(max_tokens)));
    if (typeof temperature === 'number') payload.temperature = Math.max(0, Math.min(2, temperature));

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).send(text || JSON.stringify({ error: 'Groq request failed' }));
    }
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(500).json({ error: 'Groq proxy error', detail: String(e && e.message ? e.message : e) });
  }
});

// Root health check (for Back4app)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/save-token', (req, res) => {
  try {
    const token = (req.body && req.body.token) ? String(req.body.token).trim() : '';
    if (!token) return res.status(400).json({ ok: false, error: 'Missing token' });

    const deviceId = req.body && req.body.deviceId ? String(req.body.deviceId).trim() : '';
    const platform = req.body && req.body.platform ? String(req.body.platform).trim() : '';
    const userAgent = req.body && req.body.userAgent ? String(req.body.userAgent).trim() : '';

    const tokens = safeReadTokens();
    const now = new Date().toISOString();

    const idx = tokens.findIndex(t => (t && t.token) === token);
    const entry = { token, deviceId, platform, userAgent, updatedAt: now };
    if (idx >= 0) tokens[idx] = { ...tokens[idx], ...entry };
    else tokens.push({ ...entry, createdAt: now });

    safeWriteTokens(tokens);
    res.json({ ok: true, count: tokens.length });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post('/send-notification', async (req, res) => {
  if (!_adminReady) return res.status(500).json({ ok: false, error: 'Firebase admin not configured' });

  const tokens = safeReadTokens();
  const tokenList = tokens.map(t => t && t.token).filter(Boolean);
  if (!tokenList.length) return res.status(200).json({ ok: true, sent: 0, errorCount: 0 });

  const title = (req.body && req.body.title) ? String(req.body.title) : 'نور يناديك ♟';
  const body = (req.body && req.body.body) ? String(req.body.body) : 'افتح اللعبة… عندي لك نقلة ذكية ومرحلة جديدة!';
  const data = (req.body && typeof req.body.data === 'object' && req.body.data) ? req.body.data : { kind: 'nour', vibe: 'coach' };
  const link = _buildLink({ data, link: req.body && req.body.link ? String(req.body.link) : '' });

  const message = {
    tokens: tokenList,
    notification: { title, body },
    data: Object.fromEntries(Object.entries({ ...data, link }).map(([k, v]) => [String(k), String(v)])),
    android: { priority: 'high', notification: { channelId: 'chess-amkh' } },
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        title,
        body,
        icon: _absUrl('/icon_v2.png?v=2'),
        badge: _absUrl('/icon_v2.png?v=2'),
        tag: 'nour-push',
        requireInteraction: false,
      },
      fcmOptions: link ? { link } : undefined,
    },
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(message);

    const badTokens = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          badTokens.push(tokenList[i]);
        }
      }
    });

    if (badTokens.length) {
      const filtered = tokens.filter(t => t && !badTokens.includes(t.token));
      safeWriteTokens(filtered);
    }

    res.json({
      ok: true,
      sent: resp.successCount,
      errorCount: resp.failureCount,
      removed: badTokens.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
});

/* ══════════════════════════════════════
   ROOM MANAGER
══════════════════════════════════════ */
/*
  كل غرفة:
  {
    code: 'ABCD',
    host: { ws, color, name, pimg },
    guest: { ws, color, name, pimg } | null,
    createdAt: Date.now()
  }
*/
const rooms = new Map(); /* code → room */
const clientRoom = new Map(); /* ws → code */

const mmQueue = new Map(); /* ws -> { name, deviceId, createdAt } */

function makeMember(ws, color, name, deviceId) {
  return {
    ws,
    color,
    name: (name || '').slice(0, 20),
    pimg: null,
    deviceId: (deviceId || '').slice(0, 80) || null,
    connected: true,
    disconnectTimer: null,
    lastSeen: Date.now(),
  };
}

function clearDisconnectTimer(member) {
  if (!member || !member.disconnectTimer) return;
  clearTimeout(member.disconnectTimer);
  member.disconnectTimer = null;
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  ['host', 'guest'].forEach((side) => {
    const member = room[side];
    if (!member) return;
    clearDisconnectTimer(member);
    if (member.ws) clientRoom.delete(member.ws);
    member.ws = null;
    member.connected = false;
  });
  rooms.delete(code);
}

function sendStart(room) {
  if (!room || !room.host || !room.guest) return;
  room.started = true;
  room.ended = false;
  send(room.host.ws, {
    type: 'start',
    yourColor: room.host.color,
    oppName: room.guest.name || 'الخصم',
    room: room.code,
  });
  send(room.guest.ws, {
    type: 'start',
    yourColor: room.guest.color,
    oppName: room.host.name || 'الخصم',
    room: room.code,
  });
}

function finalizeLanDisconnect(code, side) {
  const room = rooms.get(code);
  if (!room) return;
  const member = room[side];
  if (!member || member.connected) return;

  const oppSide = side === 'host' ? 'guest' : 'host';
  const opp = room[oppSide];
  if (opp && opp.connected && opp.ws) {
    send(opp.ws, { type: 'resign' });
  }
  cleanupRoom(code);
}

function handleLanDisconnect(ws) {
  const info = getRoomAndSide(ws);
  if (!info || info.room.kind !== 'lan') return false;

  const { room, code, side } = info;
  const member = room[side];
  if (!member) return true;

  clientRoom.delete(ws);
  member.ws = null;
  member.connected = false;
  member.lastSeen = Date.now();
  clearDisconnectTimer(member);

  if (room.ended) {
    if (!room.host?.connected && (!room.guest || !room.guest.connected)) {
      cleanupRoom(code);
    }
    return true;
  }

  const oppSide = side === 'host' ? 'guest' : 'host';
  const opp = room[oppSide];
  if (opp && opp.connected && opp.ws) {
    send(opp.ws, { type: 'peer-disconnected', side });
  }

  member.disconnectTimer = setTimeout(() => finalizeLanDisconnect(code, side), 45000);
  return true;
}

function mmRemove(ws) {
  try { mmQueue.delete(ws); } catch (e) {}
}

function mmPickOpponent(ws) {
  for (const [ows, entry] of mmQueue) {
    if (ows !== ws) return { ws: ows, entry };
  }
  return null;
}

function mmStartGame(aWs, aInfo, bWs, bInfo) {
  const code = genCode();
  const aColor = Math.random() < 0.5 ? 'w' : 'b';
  const bColor = aColor === 'w' ? 'b' : 'w';

  const room = {
    kind: 'online',
    code,
    host: makeMember(aWs, aColor, aInfo?.name || '', aInfo?.deviceId || ''),
    guest: makeMember(bWs, bColor, bInfo?.name || '', bInfo?.deviceId || ''),
    guestColor: bColor,
    createdAt: Date.now(),
    started: true,
    ended: false,
    state: null,
  };
  rooms.set(code, room);
  clientRoom.set(aWs, code);
  clientRoom.set(bWs, code);

  sendStart(room);
}

function getRoomAndSide(ws) {
  const code = clientRoom.get(ws);
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  const side = room.host?.ws === ws ? 'host' : (room.guest?.ws === ws ? 'guest' : null);
  if (!side) return null;
  return { room, code, side };
}

/* توليد كود 6 حروف عشوائي */
function genCode(kind = 'online') {
  if (kind === 'lan') {
    const num = String(1000 + Math.floor(Math.random() * 9000));
    return rooms.has(num) ? genCode(kind) : num;
  }
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genCode(kind) : code;
}

/* إرسال JSON آمن */
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

/* تنظيف الغرف القديمة كل 5 دقائق (أكثر من 30 دقيقة) */
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 30 * 60 * 1000) {
      cleanupRoom(code);
    }
  }
}, 5 * 60 * 1000);

/* ══════════════════════════════════════
   HTTP SERVER (Express + WebSocket)
══════════════════════════════════════ */
const server = http.createServer(app);

/* ══════════════════════════════════════
   WEBSOCKET SERVER
══════════════════════════════════════ */
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log(`[+] client connected | total: ${wss.clients.size}`);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      /* ══ Matchmaking ══ */
      case 'mm-find': {
        leaveRoom(ws);
        mmRemove(ws);

        const entry = {
          name: (msg.name || '').slice(0, 20),
          deviceId: (msg.deviceId || '').slice(0, 80) || null,
          createdAt: Date.now(),
        };
        mmQueue.set(ws, entry);

        const opp = mmPickOpponent(ws);
        if (!opp) {
          send(ws, { type: 'mm-wait' });
          break;
        }

        mmQueue.delete(ws);
        mmQueue.delete(opp.ws);
        mmStartGame(ws, entry, opp.ws, opp.entry);
        break;
      }

      case 'mm-cancel': {
        mmRemove(ws);
        send(ws, { type: 'mm-cancelled' });
        break;
      }

      /* ══ إنشاء غرفة ══ */
      case 'create': {
        /* لو العميل عنده غرفة قديمة ننظفها */
        leaveRoom(ws);

        const roomKind = msg.scope === 'lan' ? 'lan' : 'online';
        const code = genCode(roomKind);
        const hostColor = msg.color === 'b' ? 'b' : 'w';
        const guestColor = hostColor === 'w' ? 'b' : 'w';

        const room = {
          kind: roomKind,
          code,
          host: makeMember(ws, hostColor, msg.name || '', msg.deviceId || ''),
          guest: null,
          guestColor,
          createdAt: Date.now(),
          started: false,
          ended: false,
          state: null,
        };
        rooms.set(code, room);
        clientRoom.set(ws, code);

        send(ws, { type: 'room-created', code });
        console.log(`[room] created ${code} | host=${hostColor}`);
        break;
      }

      /* ══ الانضمام لغرفة ══ */
      case 'join': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        const requestedKind = msg.scope === 'lan' ? 'lan' : 'online';

        if (!room) {
          send(ws, { type: 'room-error', msg: 'الكود غير صحيح أو انتهت صلاحية الغرفة' });
          return;
        }
        if (room.kind !== requestedKind) {
          send(ws, { type: 'room-error', msg: 'هذه الغرفة ليست من نفس نوع الاتصال' });
          return;
        }
        if (room.guest) {
          send(ws, { type: 'room-error', msg: 'الغرفة ممتلئة' });
          return;
        }
        if (room.host.ws === ws) {
          send(ws, { type: 'room-error', msg: 'لا يمكنك الانضمام لغرفتك الخاصة' });
          return;
        }

        leaveRoom(ws);

        room.guest = makeMember(ws, room.guestColor, msg.name || '', msg.deviceId || '');
        clientRoom.set(ws, code);

        /* أبلغ الضيف */
        send(ws, { type: 'room-joined', code });

        /* ابدأ اللعبة للاثنين */
        sendStart(room);

        // Replay cached profile images (if they were sent before the opponent connected)
        if (room.host.pimg) send(room.guest.ws, { type: 'pimg', img: room.host.pimg });
        if (room.guest.pimg) send(room.host.ws, { type: 'pimg', img: room.guest.pimg });

        console.log(`[room] ${code} started | host=${room.host.color} guest=${room.guest.color}`);
        break;
      }

      case 'resume': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        const deviceId = (msg.deviceId || '').slice(0, 80) || null;

        if (!room || room.kind !== 'lan' || !deviceId) {
          send(ws, { type: 'resume-failed', msg: 'تعذر استعادة غرفة LAN' });
          return;
        }

        let side = null;
        if (room.host?.deviceId && room.host.deviceId === deviceId) side = 'host';
        else if (room.guest?.deviceId && room.guest.deviceId === deviceId) side = 'guest';

        if (!side || !room[side]) {
          send(ws, { type: 'resume-failed', msg: 'لم يتم العثور على جلسة مطابقة' });
          return;
        }

        const member = room[side];
        const oppSide = side === 'host' ? 'guest' : 'host';
        const opp = room[oppSide];

        clearDisconnectTimer(member);
        member.ws = ws;
        member.connected = true;
        member.lastSeen = Date.now();
        clientRoom.set(ws, code);

        send(ws, {
          type: 'resume-ok',
          code,
          yourColor: member.color,
          oppName: opp?.name || 'الخصم',
          oppImg: opp?.pimg || null,
          started: !!room.started,
        });

        if (opp?.name) send(ws, { type: 'name', name: opp.name });
        if (opp?.pimg) send(ws, { type: 'pimg', img: opp.pimg });
        if (room.state) send(ws, { type: 'resume-state', state: room.state });

        if (opp && opp.connected && opp.ws) {
          send(opp.ws, {
            type: 'peer-reconnected',
            side,
            name: member.name || '',
            pimg: member.pimg || null,
          });
        }
        break;
      }

      /* ══ رسائل اللعبة — بتتنقل للخصم مباشرة ══ */
      case 'move':
      case 'assist':
      case 'resign':
      case 'chat':
      case 'voice':
      case 'name':
      case 'pimg': {
        // Persist latest name/pimg in the room so late joiners get it.
        const info = getRoomAndSide(ws);
        if (info) {
          const { room, side } = info;
          if (msg.type === 'resign') room.ended = true;
          if (msg.type === 'name') {
            const nm = (msg.name || '').slice(0, 20);
            if (room[side]) room[side].name = nm;
          } else if (msg.type === 'pimg') {
            const img = msg.img || null;
            if (room[side]) room[side].pimg = img;
          } else if (msg.deviceId) {
            const did = String(msg.deviceId).slice(0, 80);
            if (room[side]) room[side].deviceId = did;
          }

          const oppSide = side === 'host' ? 'guest' : 'host';
          const oppDeviceId = room[oppSide]?.deviceId;

          if (oppDeviceId && (msg.type === 'move' || msg.type === 'chat' || msg.type === 'voice')) {
            const fromName = (room[side]?.name || (side === 'host' ? 'المضيف' : 'الضيف')).slice(0, 20);

            let title = 'شطرنج Am-Kh';
            let body = 'حدث جديد في المباراة';
            let tag = 'chess-online';

            if (msg.type === 'move') {
              title = 'دورك الآن ♟';
              body = `${fromName} لعب نقلة. افتح المباراة ورد بسرعة!`;
              tag = 'your-turn';
            } else if (msg.type === 'chat') {
              title = 'رسالة جديدة 💬';
              body = `${fromName}: ${(msg.text || 'رسالة').toString().slice(0, 70)}`;
              tag = 'chat';
            } else if (msg.type === 'voice') {
              title = 'رسالة صوتية 🎙';
              body = `${fromName} أرسل لك ريكورد… افتح الشات واسمعها!`;
              tag = 'voice';
            }

            sendPushToDevice(oppDeviceId, {
              title,
              body,
              tag,
              data: {
                kind: msg.type,
                room: room.code,
                from: fromName,
              },
            }).catch(() => {});
          }
        }
        relay(ws, msg);
        if (msg.type === 'resign' && info?.room?.kind === 'lan') {
          setTimeout(() => cleanupRoom(info.code), 1000);
        }
        break;
      }

      case 'state-sync': {
        const info = getRoomAndSide(ws);
        if (!info || info.room.kind !== 'lan') break;
        info.room.state = msg.state && typeof msg.state === 'object' ? msg.state : null;
        if (msg.deviceId && info.room[info.side]) {
          info.room[info.side].deviceId = String(msg.deviceId).slice(0, 80);
        }
        break;
      }

      /* ══ Ping ══ */
      case 'ping': {
        send(ws, { type: 'pong' });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[-] client disconnected | total: ${wss.clients.size - 1}`);
    mmRemove(ws);
    const info = getRoomAndSide(ws);
    if (info && info.room.kind === 'lan') {
      handleLanDisconnect(ws);
    } else {
      leaveRoom(ws);
      clientRoom.delete(ws);
    }
  });

  ws.on('error', () => {});
});

/* ══ Relay — يبعت الرسالة للخصم في نفس الغرفة ══ */
function relay(ws, msg) {
  const code = clientRoom.get(ws);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  const opp = room.host.ws === ws ? room.guest?.ws : room.host.ws;
  if (opp) send(opp, msg);
}

/* ══ مغادرة الغرفة ══ */
function leaveRoom(ws) {
  const code = clientRoom.get(ws);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  /* أبلغ الخصم باستسلام اللاعب */
  const opp = room.host.ws === ws ? room.guest?.ws : room.host.ws;
  if (opp && opp.readyState === WebSocket.OPEN) {
    send(opp, { type: 'resign' });
  }

  /* لو المضيف غادر نحذف الغرفة */
  if (room.host.ws === ws) {
    rooms.delete(code);
    if (room.guest) clientRoom.delete(room.guest.ws);
  } else {
    /* الضيف غادر — نرجع الغرفة لانتظار ضيف جديد */
    room.guest = null;
  }
  clientRoom.delete(ws);
}

/* ══ Heartbeat — نكتشف العملاء المنقطعين ══ */
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

/* ══ Start ══ */
server.listen(PORT, () => {
  console.log(`♟ Chess server running on port ${PORT}`);
  try{
    if (_adminReady) scheduleDailyNourPushes();
  }catch(e){}
});
