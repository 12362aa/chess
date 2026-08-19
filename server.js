
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

const db = require('./db');
const jwt = require('jsonwebtoken');

// Maps for presence and invites
const userSockets = new Map(); // userId -> Set of WebSockets
const socketUser = new Map(); // WebSocket -> userId
const JWT_SECRET = process.env.JWT_SECRET || 'amkh_fallback_secret_key_123';
// Express app for API
const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,ngrok-skip-browser-warning,x-requested-with');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
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

// Rate limiting for auth
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

const authModule = require('./auth');
app.use('/api', authModule.router);
// Apply rate limiter specifically to login and register (if they are under /api/login and /api/register)
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

const friendsRouter = require('./friends');
app.use('/api/friends', friendsRouter);
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

const mmQueue = new Map(); /* ws -> { name, deviceId, color, createdAt } */

function normalizeMatchColor(color) {
  if (color === 'b') return 'b';
  if (color === 'r') return 'r';
  return 'w';
}

function resolveMatchColors(aPref, bPref) {
  const a = normalizeMatchColor(aPref);
  const b = normalizeMatchColor(bPref);
  if (a === 'r' && b === 'r') {
    const aColor = Math.random() < 0.5 ? 'w' : 'b';
    return { aColor, bColor: aColor === 'w' ? 'b' : 'w' };
  }
  if (a === 'r') {
    return { aColor: b === 'w' ? 'b' : 'w', bColor: b };
  }
  if (b === 'r') {
    return { aColor: a, bColor: a === 'w' ? 'b' : 'w' };
  }
  if (a === b) return null;
  return { aColor: a, bColor: b };
}

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

function mmPickOpponent(ws, selfEntry) {
  for (const [ows, entry] of mmQueue) {
    if (ows === ws) continue;
    const colors = resolveMatchColors(selfEntry?.color, entry?.color);
    if (colors) return { ws: ows, entry, colors };
  }
  return null;
}

function mmRequiredColor(ws, selfEntry) {
  const selfColor = normalizeMatchColor(selfEntry?.color);
  if (selfColor === 'r') return null;
  let hasConflict = false;
  for (const [ows, entry] of mmQueue) {
    if (ows === ws) continue;
    const oppColor = normalizeMatchColor(entry?.color);
    if (oppColor === 'r') return null;
    if (oppColor !== selfColor) return null;
    hasConflict = true;
  }
  if (!hasConflict) return null;
  return selfColor === 'w' ? 'b' : 'w';
}

function mmStartGame(aWs, aInfo, aColor, bWs, bInfo, bColor) {
  const code = genCode();

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

/* ══════════════════════════════════════════════════════════════════════
   جسر الوقت الحقيقي لنظام الأصدقاء
   ──────────────────────────────────────────────────────────────────────
   friends.js بيتعامل مع HTTP بس، ومحتاج يوصّل حاجة لمستخدم متصل
   (وصل طلب، وصلت دعوة، اتقبلت). الاتجاه مقصود: server.js بيحقن الأدوات
   في friends.js، مش العكس — لأن server.js أصلاً بيعمل require ليه،
   فأي require عكسي كان هيعمل حلقة.
══════════════════════════════════════════════════════════════════════ */

/* كل سوكتات المستخدم — ممكن يكون فاتح التطبيق على أكتر من جهاز */
function socketsOf(userId) {
  const set = userSockets.get(Number(userId));
  return set ? [...set] : [];
}

/* حالة المستخدم من السوكت مباشرة: أدق من العمود في القاعدة لأن القاعدة
   ممكن تكون فايتها آخر قطع اتصال. */
function liveStatus(userId) {
  const socks = socketsOf(userId).filter(s => s.readyState === WebSocket.OPEN);
  if (!socks.length) return null;
  /* جوه مباراة = عنده سوكت مرتبط بغرفة شغّالة */
  const inGame = socks.some(s => {
    const code = clientRoom.get(s);
    if (!code) return false;
    const room = rooms.get(code);
    return !!(room && room.started && !room.ended);
  });
  return inGame ? 'in-game' : 'online';
}

friendsRouter.setRealtime({
  push(userId, payload) {
    const socks = socketsOf(userId);
    let delivered = false;
    for (const s of socks) {
      if (s.readyState === WebSocket.OPEN) { send(s, payload); delivered = true; }
    }
    return delivered;
  },
  statusOf: liveStatus,
});

/* بثّ الحضور لأصدقاء مستخدم. بيبعت الحالة الغنية (online / in-game /
   offline) وكمان is_online عشان أي عميل قديم يفضل شغّال. */
function broadcastPresence(userId, statusOverride) {
  try {
    const status = statusOverride || liveStatus(userId) || 'offline';
    const inGame = status === 'in-game';
    db.prepare(`UPDATE presence SET is_online = ?, status = ?, in_game = ?, last_seen_at = datetime('now')
                WHERE user_id = ?`).run(status === 'offline' ? 0 : 1, status, inGame ? 1 : 0, userId);
    const payload = {
      type: 'friend:presence-update',
      friend_id: userId,
      status,
      is_online: status === 'offline' ? 0 : 1,
      in_game: inGame ? 1 : 0,
      last_seen_at: new Date().toISOString(),
    };
    for (const f of db.prepare('SELECT friend_id FROM friendships WHERE user_id = ?').all(userId)) {
      for (const fws of socketsOf(f.friend_id)) send(fws, payload);
    }
  } catch (e) {
    console.error('[presence] broadcast failed:', e.message);
  }
}

/* بدء مباراة بين صديقين بعد قبول الدعوة.
   الغرفة بتتولّد هنا وقت القبول — مش وقت الدعوة — عشان دعوة مارضيهاش
   حد ماتسيبش غرفة فاضية معلّقة في الذاكرة. */
function beginFriendGame(invite, hostWs, guestWs) {
  let hostColor = invite.color;
  if (hostColor !== 'w' && hostColor !== 'b') hostColor = Math.random() < 0.5 ? 'w' : 'b';
  const guestColor = hostColor === 'w' ? 'b' : 'w';

  const hostRow = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(invite.from_id) || {};
  const guestRow = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(invite.to_id) || {};

  leaveRoom(hostWs);
  leaveRoom(guestWs);

  const code = genCode('online');
  const room = {
    kind: 'online',
    code,
    host: makeMember(hostWs, hostColor, hostRow.display_name || hostRow.username || 'صديق', ''),
    guest: makeMember(guestWs, guestColor, guestRow.display_name || guestRow.username || 'صديق', ''),
    guestColor,
    createdAt: Date.now(),
    started: false,
    ended: false,
    state: null,
  };
  rooms.set(code, room);
  clientRoom.set(hostWs, code);
  clientRoom.set(guestWs, code);

  db.prepare('UPDATE game_invites SET room_code = ? WHERE id = ?').run(code, invite.id);
  send(hostWs, { type: 'friend:invite-room', code, role: 'host' });
  send(guestWs, { type: 'friend:invite-room', code, role: 'guest' });
  sendStart(room);
  console.log(`[friends] invite ${invite.id} -> room ${code}`);

  /* الاتنين بقوا جوه مباراة، فأصدقاؤهم يشوفوا الحالة الجديدة */
  broadcastPresence(invite.from_id, 'in-game');
  broadcastPresence(invite.to_id, 'in-game');
  return code;
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

  /* بثّ الحضور بقى في broadcastPresence فوق. النسخة القديمة
     (notifyFriendsPresence) كانت معرّفة جوه معالج الاتصال، يعني
     بتتعرّف من أول ما أي حد يتصل، وكانت بتبعت is_online بس بدون
     التفريق بين «متصل» و«جوه مباراة». */

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      /* ══ Presence & Friends ══ */
      case 'presence:hello': {
        const { token } = msg;
        if (!token) break;
        jwt.verify(token, JWT_SECRET, (err, user) => {
          if (err) return;
          const userId = user.id;
          socketUser.set(ws, userId);
          if (!userSockets.has(userId)) userSockets.set(userId, new Set());
          userSockets.get(userId).add(ws);

          try {
            db.prepare('INSERT OR IGNORE INTO presence (user_id) VALUES (?)').run(userId);
            broadcastPresence(userId);

            /* أول ما يتصل بيلاقي اللي فاته وهو مقفول: طلبات صداقة
               ودعوات لسه صالحة. من غير كده الدعوة اللي وصلت وهو مش
               متصل بتضيع خالص. */
            db.prepare(`UPDATE game_invites SET status = 'expired'
                        WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < datetime('now')`).run();
            const invites = db.prepare(`
              SELECT i.id, i.color, i.expires_at, u.id AS uid, u.username, u.display_name, u.avatar_url
              FROM game_invites i JOIN users u ON u.id = i.from_id
              WHERE i.to_id = ? AND i.status = 'pending'`).all(userId);
            for (const iv of invites) {
              send(ws, {
                type: 'friend:invite-received',
                invite: {
                  id: iv.id, color: iv.color, expires_at: iv.expires_at,
                  from: { id: iv.uid, username: iv.username, display_name: iv.display_name, avatar_url: iv.avatar_url },
                },
              });
            }
            const pending = db.prepare(`SELECT COUNT(*) AS c FROM friend_requests WHERE receiver_id = ? AND status = 'pending'`).get(userId);
            if (pending && pending.c) send(ws, { type: 'friend:requests-pending', count: pending.c });
          } catch (e) {
            console.error('[presence] hello failed:', e.message);
          }
        });
        break;
      }

      case 'presence:ping': {
        const userId = socketUser.get(ws);
        if (userId) {
          try {
            db.prepare(`UPDATE presence SET is_online = 1, last_seen_at = datetime('now') WHERE user_id = ?`).run(userId);
          } catch (e) {}
        }
        break;
      }
      
      /* ══ دعوة صديق لمباراة ══
         النسخة الأولى كانت بتعمل الغرفة وقت الدعوة وتبعت الكود على طول.
         مشاكلها: غرفة بتتولد لكل دعوة حتى لو محدش قبل (تفضل معلّقة في
         الذاكرة لـ30 دقيقة)، والدعوة تضيع لو السيرفر رستر، ومافيش دعوة
         لصاحب مش متصل دلوقتي.
         النسخة دي بتسجّل الدعوة في القاعدة وليها عمر، والغرفة بتتولد
         وقت القبول بس (beginFriendGame). */
      case 'friend:invite': {
        const senderId = socketUser.get(ws);
        const friendId = Number(msg.friend_id);
        if (!senderId || !friendId) break;
        try {
          const isFriend = db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(senderId, friendId);
          if (!isFriend) { send(ws, { type: 'friend:invite-error', reason: 'not-friend' }); break; }
          const blocked = db.prepare(`SELECT 1 FROM friend_blocks
                                      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
            .get(senderId, friendId, friendId, senderId);
          if (blocked) { send(ws, { type: 'friend:invite-error', reason: 'blocked' }); break; }

          db.prepare(`UPDATE game_invites SET status = 'expired'
                      WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < datetime('now')`).run();
          const live = db.prepare(`SELECT id FROM game_invites WHERE from_id = ? AND to_id = ? AND status = 'pending'`).get(senderId, friendId);
          if (live) { send(ws, { type: 'friend:invite-sent', invite_id: live.id, already: true }); break; }

          const color = ['w', 'b', 'r'].includes(msg.color) ? msg.color : 'r';
          const info = db.prepare(`INSERT INTO game_invites (from_id, to_id, color, expires_at)
                                   VALUES (?, ?, ?, datetime('now', '+90 seconds'))`).run(senderId, friendId, color);
          const inviteId = info.lastInsertRowid;
          const sender = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(senderId);

          let delivered = false;
          for (const fws of socketsOf(friendId)) {
            send(fws, { type: 'friend:invite-received', invite: { id: inviteId, from: sender, color, expires_in: 90 } });
            delivered = true;
          }
          send(ws, { type: 'friend:invite-sent', invite_id: inviteId, delivered, expires_in: 90 });
        } catch (e) {
          console.error('[friends] invite error:', e.message);
          send(ws, { type: 'friend:invite-error', reason: 'server' });
        }
        break;
      }

      /* ══ الرد على دعوة ══
         القبول بيبدأ المباراة فورًا: الداعي مضيف والمدعو ضيف. لو الداعي
         قفل التطبيق في الوقت ده بنقول للمدعو إنه مش متاح بدل ما نفتح
         غرفة نصّها فاضي. */
      case 'friend:invite-respond': {
        const me = socketUser.get(ws);
        const inviteId = Number(msg.invite_id);
        const accept = msg.action === 'accept';
        if (!me || !inviteId) break;
        try {
          const inv = db.prepare(`SELECT * FROM game_invites WHERE id = ? AND to_id = ? AND status = 'pending'`).get(inviteId, me);
          if (!inv) { send(ws, { type: 'friend:invite-error', reason: 'expired' }); break; }

          if (!accept) {
            db.prepare(`UPDATE game_invites SET status = 'declined', responded_at = datetime('now') WHERE id = ?`).run(inviteId);
            for (const s of socketsOf(inv.from_id)) send(s, { type: 'friend:invite-declined', invite_id: inviteId, by: me });
            send(ws, { type: 'friend:invite-closed', invite_id: inviteId });
            break;
          }

          const hostWs = socketsOf(inv.from_id).find(s => s.readyState === WebSocket.OPEN);
          if (!hostWs) {
            db.prepare(`UPDATE game_invites SET status = 'expired', responded_at = datetime('now') WHERE id = ?`).run(inviteId);
            send(ws, { type: 'friend:invite-error', reason: 'host-offline' });
            break;
          }
          db.prepare(`UPDATE game_invites SET status = 'accepted', responded_at = datetime('now') WHERE id = ?`).run(inviteId);
          beginFriendGame(inv, hostWs, ws);
        } catch (e) {
          console.error('[friends] invite-respond error:', e.message);
          send(ws, { type: 'friend:invite-error', reason: 'server' });
        }
        break;
      }

      /* إلغاء دعوة من الداعي قبل ما ترد */
      case 'friend:invite-cancel': {
        const me = socketUser.get(ws);
        const inviteId = Number(msg.invite_id);
        if (!me || !inviteId) break;
        try {
          const inv = db.prepare(`SELECT to_id FROM game_invites WHERE id = ? AND from_id = ? AND status = 'pending'`).get(inviteId, me);
          if (!inv) break;
          db.prepare(`UPDATE game_invites SET status = 'cancelled', responded_at = datetime('now') WHERE id = ?`).run(inviteId);
          for (const s of socketsOf(inv.to_id)) send(s, { type: 'friend:invite-cancelled', invite_id: inviteId });
        } catch (e) {}
        break;
      }

      /* ══ Matchmaking ══ */
      case 'mm-find': {
        leaveRoom(ws);
        mmRemove(ws);

        const entry = {
          name: (msg.name || '').slice(0, 20),
          deviceId: (msg.deviceId || '').slice(0, 80) || null,
          color: normalizeMatchColor(msg.color),
          createdAt: Date.now(),
        };
        mmQueue.set(ws, entry);

        const opp = mmPickOpponent(ws, entry);
        if (!opp) {
          const requiredColor = mmRequiredColor(ws, entry);
          if (requiredColor && requiredColor !== entry.color) {
            mmQueue.delete(ws);
            send(ws, { type: 'mm-color-required', color: requiredColor });
            break;
          }
          send(ws, { type: 'mm-wait' });
          break;
        }

        mmQueue.delete(ws);
        mmQueue.delete(opp.ws);
        mmStartGame(ws, entry, opp.colors.aColor, opp.ws, opp.entry, opp.colors.bColor);
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
    
    // Presence Offline Logic
    const userId = socketUser.get(ws);
    if (userId) {
      socketUser.delete(ws);
      const userSocketsSet = userSockets.get(userId);
      if (userSocketsSet) {
        userSocketsSet.delete(ws);
        if (userSocketsSet.size === 0) {
          userSockets.delete(userId);
          try {
            /* آخر سوكت للمستخدم قفل → بقى offline. broadcastPresence
               بيحسب الحالة من السوكتات الفعلية ويحدّث القاعدة ويبثّ. */
            broadcastPresence(userId, 'offline');
            /* أي دعوة كان باعتها ولسه معلّقة بتتلغي: الداعي مش موجود
               يستقبل القبول، فمافيش فايدة إنها تفضل حيّة. */
            const stale = db.prepare(`SELECT id, to_id FROM game_invites WHERE from_id = ? AND status = 'pending'`).all(userId);
            for (const iv of stale) {
              db.prepare(`UPDATE game_invites SET status = 'cancelled', responded_at = datetime('now') WHERE id = ?`).run(iv.id);
              for (const s of socketsOf(iv.to_id)) send(s, { type: 'friend:invite-cancelled', invite_id: iv.id });
            }
          } catch (e) {}
        } else {
          /* لسه فاتح على جهاز تاني — الحالة تتحدّث مش تبقى offline */
          try { broadcastPresence(userId); } catch (e) {}
        }
      }
    }

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
