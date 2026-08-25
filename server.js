
/**
 * ♟ شطرنج Am-Kh — WebSocket Game Server with API
 * Node.js + ws + Express + SQLite
 * يرفع على Back4app (Container)
 */

'use strict';

require('dotenv').config();

/* إصلاح دائم لاتصال الذكاء الاصطناعي (نور) عبر Groq:
   على البيئة دي مفيش مسار IPv6 شغّال لـ api.groq.com (Cloudflare)، فـ fetch
   بتاع Node كان بيحاول IPv6 ويعلّق لحد ETIMEDOUT رغم إن IPv4 شغّال (curl ينجح).
   بنجبر Node يفضّل IPv4 ويوقف happy-eyeballs عشان كل النداءات الصادرة
   (Groq + Firebase…) تمشي على IPv4 مباشرة من غير تعليق. اتأكدنا حيًّا: allam-2-7b
   بيرجّع 200 بعد الإصلاح، وكان بيرجّع "fetch failed / ETIMEDOUT" قبله. */
try { require('dns').setDefaultResultOrder('ipv4first'); } catch (e) {}
try { require('net').setDefaultAutoSelectFamily(false); } catch (e) {}

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
const ratingStore = require('./rating-store');

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
let _adminError = null;
try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  /* المفتاح ممكن يتخزّن بطرق مختلفة في .env:
     • بـ \n حرفية (backslash-n) — الشائع → نحوّلها أسطر حقيقية.
     • أو Base64 للمفتاح كله (FIREBASE_PRIVATE_KEY_B64) — أنضف وبيتفادى
       مشاكل الاقتباس متعدد الأسطر اللي بتبوّظ الـPEM.
     لو الاتنين موجودين نفضّل الـBase64. */
  if (process.env.FIREBASE_PRIVATE_KEY_B64) {
    try { privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_B64, 'base64').toString('utf8'); } catch (e) {}
  } else {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    _adminReady = true;
  } else {
    _adminError = 'missing FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY';
  }
} catch (e) {
  _adminReady = false;
  _adminError = e && e.message ? e.message : 'init failed';
  console.error('[push] Firebase admin init failed:', _adminError);
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
    android: {
      priority: 'high',
      notification: { channelId: 'chess-amkh', sound: 'default', defaultSound: true },
    },
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
    .then(resp => {
      /* نظّف التوكِنات الميتة (NotRegistered/invalid) عشان ما تفضلش تتحسب
         وتبوّظ العدّاد وتخلي الدفع يبان إنه «نجح» وهو مايوصلش. */
      try {
        const bad = [];
        resp.responses.forEach((r, i) => {
          if (!r.success) {
            const code = r.error && r.error.code;
            if (code === 'messaging/registration-token-not-registered'
             || code === 'messaging/invalid-registration-token') bad.push(tokens[i]);
          }
        });
        if (bad.length) {
          const allTok = safeReadTokens();
          safeWriteTokens(allTok.filter(t => t && !bad.includes(t.token)));
        }
        console.log('[push] sent title="%s" tokens=%d ok=%d fail=%d%s',
          title, tokens.length, resp.successCount, resp.failureCount,
          bad.length ? ' cleaned=' + bad.length : '');
        resp.responses.forEach((r, i) => {
          if (!r.success) console.log('[push]   FAIL tok=%s code=%s',
            String(tokens[i]).slice(0, 10), r.error && r.error.code);
        });
      } catch (e) {}
      return { ok: true, successCount: resp.successCount, failureCount: resp.failureCount, responses: resp.responses };
    })
    .catch(e => {
      console.log('[push] send THREW:', e && e.message ? e.message : e);
      return { ok: false, reason: 'send-failed', error: String(e && e.message ? e.message : e) };
    });
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

/* توكِنات FCM المرتبطة بحساب مستخدم (للإشعارات على الرسايل وهو غير متصل). */
function getTokensForUser(userId) {
  if (!userId) return [];
  const all = safeReadTokens();
  return all
    .filter(t => t && t.userId != null && String(t.userId) === String(userId) && t.token)
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
    android: {
      priority: 'high',
      notification: { channelId: 'chess-amkh', sound: 'default', defaultSound: true },
    },
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
const chatRouter = require('./chat');
app.use('/api/chat', chatRouter);
const groupsRouter = require('./groups');
app.use('/api/groups', groupsRouter);
const privacyRouter = require('./privacy');
app.use('/api/privacy', privacyRouter);
// Health check
/* ══ إعداد WebRTC (STUN + TURN) للمكالمة الصوتية (#135) ══
   بنرجّع iceServers للعميل. STUN مجاني دايمًا. TURN اختياري: لو
   متظبّط في البيئة (TURN_HOST + TURN_SECRET) بنولّد بيانات اعتماد
   مؤقتة بأسلوب coturn REST (use-auth-secret): username = "انتهاء:اسم"
   وcredential = base64(HMAC-SHA1(secret, username)). كده مفيش سر
   بيتسرّب للعميل، والبيانات بتنتهي تلقائيًا. من غير TURN بترجع STUN بس
   (المكالمة تنفع على WiFi/الشبكات المنزلية، وممكن تفشل خلف NAT متماثل). */
app.get('/api/webrtc-config', (req, res) => {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const host = process.env.TURN_HOST;
  const secret = process.env.TURN_SECRET;
  if (host && secret) {
    try {
      const ttl = 3600; // ساعة
      const username = `${Math.floor(Date.now() / 1000) + ttl}:amkh`;
      const credential = require('crypto').createHmac('sha1', secret).update(username).digest('base64');
      const udpPort = process.env.TURN_PORT || '3478';
      const tlsPort = process.env.TURN_TLS_PORT || '5349';
      const urls = [
        `turn:${host}:${udpPort}?transport=udp`,
        `turn:${host}:${udpPort}?transport=tcp`,
      ];
      if (process.env.TURN_TLS === '1') urls.push(`turns:${host}:${tlsPort}?transport=tcp`);
      iceServers.push({ urls, username, credential });
    } catch (e) { console.error('[webrtc] turn cred error:', e.message); }
  }
  res.json({ iceServers, ttl: 3600, turn: !!(host && secret) });
});

/* ══ إصدار التطبيق (#136) ══
   العميل بيسأل عن أحدث إصدار منشور وقت الإقلاع، ولو الإصدار المثبّت
   أقدم بيظهر إشعار «فيه تحديث» بستايل الثيم وصوت خاص. الرابط دائم:
   دايمًا tag v3.10 واسم الملف chess-amkh-3.10.apk (نبني فوقه كل مرة)،
   وبنرفع versionCode بس. نبمب LATEST_* هنا مع كل إصدار جديد. */
const LATEST_VERSION = '3.10';
const LATEST_CODE = 16;
const APK_URL = 'https://github.com/12362aa/chess/releases/download/v3.10/chess-amkh-3.10.apk';
app.get('/api/version', (req, res) => {
  res.json({
    version: LATEST_VERSION,
    versionCode: LATEST_CODE,
    url: APK_URL,
    mandatory: false,
    notes: 'مكالمات صوتية (فردي + حفلة)، توقيت للمباريات الأونلاين، وتحسينات الشات.',
  });
});


app.get('/api/health', (req, res) => {
  /* تشخيص الإشعارات بدون أي أسرار: هل Firebase admin متهيّأ؟ وكام توكِن
     متخزّن؟ وكام منهم مربوط بحساب فعلاً؟ ده بيخلّينا نعرف سبب عدم وصول
     الإشعار (admin مش متهيّأ / مفيش توكِن مربوط) من غير ما نكشف مفاتيح. */
  let tokenCount = 0, linkedCount = 0, nativeCount = 0;
  try {
    const toks = safeReadTokens();
    tokenCount = toks.length;
    linkedCount = toks.filter(t => t && t.userId != null).length;
    nativeCount = toks.filter(t => t && t.platform === 'android-native').length;
  } catch (e) {}
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    push: { adminReady: _adminReady, adminError: _adminError, tokens: tokenCount, linked: linkedCount, native: nativeCount },
  });
});

/* ══ لوحة الصدارة العالمية ══
   ترتيب حسب "التقييم المتحفّظ" (r − 2·RD) بين اللي لعبوا مباراة مصنّفة واحدة على الأقل،
   وده بيدفع التقييمات المبدئية (RD عالي) لتحت تلقائيًا. حساب-مربوط: الاسم + الأفاتار +
   التقييم + علَم الدولة (اختيار يدوي). التصميم فاخر وثابت (مش تابع للثيم) على العميل. */
app.get('/api/leaderboard', (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!isFinite(limit) || limit <= 0) limit = 100;
    limit = Math.min(limit, 200);
    const rows = db.prepare(`
      SELECT id, display_name, username, avatar_url, country,
             rating, rating_rd, rating_games, rating_peak, wins, losses, draws
      FROM users
      WHERE rating_games >= 1
      ORDER BY (rating - 2 * rating_rd) DESC, rating_games DESC
      LIMIT ?`).all(limit);
    const out = rows.map((u, i) => {
      const rd = isFinite(u.rating_rd) ? u.rating_rd : 350;
      return {
        rank: i + 1,
        id: u.id,
        name: u.display_name || u.username || 'لاعب',
        avatar_url: u.avatar_url || null,
        country: u.country || null,
        rating: Math.round(isFinite(u.rating) ? u.rating : 1500),
        provisional: rd > 110,
        peak: Math.round(isFinite(u.rating_peak) ? u.rating_peak : 1500),
        games: u.rating_games || 0,
        wins: u.wins || 0,
        losses: u.losses || 0,
        draws: u.draws || 0,
      };
    });
    res.json({ players: out, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[leaderboard] failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Groq proxy (keep API key off the frontend)
app.post('/api/groq/chat', async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const messages = Array.isArray(body.messages) ? body.messages : null;
    const max_tokens = Number.isFinite(body.max_tokens) ? body.max_tokens : undefined;
    const temperature = Number.isFinite(body.temperature) ? body.temperature : undefined;
    if (!messages || !messages.length) return res.status(400).json({ error: 'Missing messages[]' });

    /* سلسلة موديلات نجرّبها بالترتيب.
       allam-2-7b هو الوحيد على Groq اللي بيرد عربي موثوق — اتأكدنا حيًّا:
       gpt-oss بيرد كوري/إنجليزي، qwen بيرد روسي، رغم الأمر الصريح بالعربية.
       بس allam مش مُدرج في التوثيق الرسمي، والموديل القديم
       (llama-4-scout) اتشال فجأة وبقى model_not_found — فبنحصّن نفسنا:
       لو الموديل المطلوب رجّع خطأ (اتشال/404) أو رجّع محتوى فاضي (موديلات
       التفكير بتضيّع التوكنز)، بنجرّب البديل تلقائيًا فالميزة ماتقفش. */
    const requested = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'allam-2-7b';
    const chain = [requested, 'allam-2-7b', 'openai/gpt-oss-120b'].filter((m, i, a) => a.indexOf(m) === i);

    let lastDetail = 'no attempt';
    for (const model of chain) {
      const payload = { model, messages };
      if (typeof max_tokens === 'number') payload.max_tokens = Math.max(1, Math.min(2048, Math.floor(max_tokens)));
      if (typeof temperature === 'number') payload.temperature = Math.max(0, Math.min(2, temperature));
      /* gpt-oss بيضيّع كل التوكنز في «التفكير» ويرجّع محتوى فاضي —
         reasoning_effort:low بيخلّيه يرجّع نص فعلي */
      if (model.indexOf('gpt-oss') !== -1) payload.reasoning_effort = 'low';

      let resp;
      try {
        resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(payload),
        });
      } catch (netErr) { lastDetail = `[${model}] network: ${netErr.message}`; continue; }

      const text = await resp.text();
      if (!resp.ok) { lastDetail = `[${model}] ${resp.status}: ${text.slice(0, 160)}`; continue; }

      /* رد 200 بمحتوى فاضي (كل التوكنز راحت في التفكير) نعتبره فشل */
      let content = '';
      try { const j = JSON.parse(text); content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''; }
      catch (e) { lastDetail = `[${model}] bad json`; continue; }
      if (!content.trim()) { lastDetail = `[${model}] empty content`; continue; }

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(text);
    }
    return res.status(502).json({ error: 'كل موديلات الذكاء الاصطناعي فشلت', detail: lastDetail });
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

    /* لو فيه JWT في الهيدر، بنربط التوكِن بحساب المستخدم عشان نقدر نبعتله
       إشعار وهو غير متصل. بدون تسجيل دخول بيتخزّن بالجهاز بس (زي الأول). */
    let userId = null;
    try {
      const auth = req.headers['authorization'] || '';
      const m = /^Bearer\s+(.+)$/i.exec(auth);
      if (m) { const d = jwt.verify(m[1], JWT_SECRET); if (d && d.id) userId = Number(d.id); }
    } catch (e) { userId = null; }

    const tokens = safeReadTokens();
    const now = new Date().toISOString();

    const idx = tokens.findIndex(t => (t && t.token) === token);
    const entry = { token, deviceId, platform, userAgent, updatedAt: now };
    if (userId != null) entry.userId = userId;
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
  stopClock(room);
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
  const ratingOf = (id) => {
    if (!id) return null;
    try { const row = ratingStore.getUserRating.get(id); return row ? ratingStore.publicRating(row) : null; }
    catch (e) { return null; }
  };
  send(room.host.ws, {
    type: 'start',
    yourColor: room.host.color,
    oppName: room.guest.name || 'الخصم',
    room: room.code,
    rated: !!room.rated,
    tc: room.tc || null,
    oppRating: ratingOf(room.guestId),
    myRating: ratingOf(room.hostId),
  });
  send(room.guest.ws, {
    type: 'start',
    yourColor: room.guest.color,
    oppName: room.host.name || 'الخصم',
    room: room.code,
    rated: !!room.rated,
    tc: room.tc || null,
    oppRating: ratingOf(room.hostId),
    myRating: ratingOf(room.guestId),
  });
  startClock(room);
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

function mmSameType(selfEntry, entry) {
  /* نوع المباراة لازم يتطابق: مصنّفة مع مصنّفة، وودّية مع ودّية.
     والمصنّفة تتطلب تسجيل دخول الطرفين. ونفس التحكّم بالوقت (#134). */
  const selfRated = !!(selfEntry && selfEntry.rated);
  const oppRated = !!(entry && entry.rated);
  if (selfRated !== oppRated) return false;
  if (selfRated && !(selfEntry.userId && entry.userId)) return false;
  if (!tcEqual(selfEntry && selfEntry.tc, entry && entry.tc)) return false;
  return true;
}

function mmPickOpponent(ws, selfEntry) {
  for (const [ows, entry] of mmQueue) {
    if (ows === ws) continue;
    if (!mmSameType(selfEntry, entry)) continue;
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
    if (!mmSameType(selfEntry, entry)) continue;   /* بس الطوابير من نفس النوع */
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

  const aId = aInfo?.userId || socketUser.get(aWs) || null;
  const bId = bInfo?.userId || socketUser.get(bWs) || null;
  const room = {
    kind: 'online',
    code,
    hostId: aId,
    guestId: bId,
    rated: !!(aInfo?.rated && bInfo?.rated && aId && bId),   // مصنّفة بس لو الطرفين اختاروا "مصنّفة" واتسجّلوا
    host: makeMember(aWs, aColor, aInfo?.name || '', aInfo?.deviceId || ''),
    guest: makeMember(bWs, bColor, bInfo?.name || '', bInfo?.deviceId || ''),
    guestColor: bColor,
    createdAt: Date.now(),
    started: true,
    ended: false,
    state: null,
  };
  room.tc = (aInfo && aInfo.tc) || (bInfo && bInfo.tc) || null;   /* الطرفان بنفس النوع (mmSameType) */
  initClock(room);
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
  let side = room.host?.ws === ws ? 'host' : (room.guest?.ws === ws ? 'guest' : null);
  if (!side) {
    /* السوكت اتربط بالغرفة (في beginFriendGame بنربط كل سوكتات الطرف) بس
       مش هو الـws المخزّن في room.host/guest — ده بيحصل لما السوكت اللي
       بدأ عليه بدء المباراة كان ميت والحي بعت أول نقلة. نتبنّى الحي هنا
       حسب هوية المستخدم عشان النقلات/الاستسلام يتوجّهوا صح. */
    const uid = socketUser.get(ws);
    if (uid && room.hostId === uid && room.host) { room.host.ws = ws; side = 'host'; }
    else if (uid && room.guestId === uid && room.guest) { room.guest.ws = ws; side = 'guest'; }
  }
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
   التحكّم بالوقت (#134) — ساعة موثوقة من السيرفر
   ──────────────────────────────────────────────────────────────────────
   • room.tc = { base, inc } بالثواني، أو null = مباراة بدون توقيت.
   • room.clock = { w, b (ميلي ثانية), turn, lastTs, running, timer }.
   • السيرفر بيشوف كل نقلة (relay) فبيقدر يمشّي الساعة من فرق التوقيت:
     وقت ما يوصل بلاغ نقلة، بيخصم اللي فات من ساعة اللي لعب ويزوّد الـinc
     ويقلب الدور ويسلّح مؤقّت السقوط للطرف التاني.
   • لما ساعة توصل صفر بيبعت game:flag؛ النتيجة النهائية بتتحسب في العميل
     (الفايز بالنقاط) وتتبعت على مسار game:over الموجود — عشان منطق
     التقييم (finalizeRatedGame) مايتلمسش خالص. */

/* بيقبل { base, inc } من العميل ويطبّعه لثواني صحيحة أو null. */
function parseTC(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = Math.round(Number(raw.base));
  const inc = Math.round(Number(raw.inc));
  if (!Number.isFinite(base) || base < 10 || base > 10800) return null; /* 10ث .. 3 ساعات */
  if (!Number.isFinite(inc) || inc < 0 || inc > 180) return null;
  return { base, inc };
}

/* تساوي إعدادَي وقت (للماتش‑ميكينج: نفس النوع لازم يتقابل بنفس النوع). */
function tcEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.base === b.base && a.inc === b.inc;
}

function initClock(room) {
  if (!room || !room.tc) return;
  const base = room.tc.base * 1000;
  room.clock = { w: base, b: base, turn: 'w', lastTs: 0, running: false, timer: null };
}

/* الوقت المتبقّي للون معيّن دلوقتي (بيخصم اللي بيجري لو الدور عليه). */
function clockRemaining(room, color, now) {
  const c = room.clock;
  let ms = c[color];
  if (c.running && c.turn === color && c.lastTs) ms -= (now - c.lastTs);
  return ms < 0 ? 0 : ms;
}

function sendBoth(room, obj) {
  if (room.host && room.host.ws) send(room.host.ws, obj);
  if (room.guest && room.guest.ws) send(room.guest.ws, obj);
}

function broadcastClock(room, extra) {
  const c = room.clock; if (!c) return;
  const now = Date.now();
  sendBoth(room, Object.assign({
    type: 'clock',
    w: clockRemaining(room, 'w', now),
    b: clockRemaining(room, 'b', now),
    turn: c.turn,
    running: c.running,
    ts: now,
  }, extra || {}));
}

function armFlagTimer(room) {
  const c = room.clock; if (!c) return;
  if (c.timer) { clearTimeout(c.timer); c.timer = null; }
  if (!c.running) return;
  const remaining = clockRemaining(room, c.turn, Date.now());
  const loser = c.turn;
  c.timer = setTimeout(() => onFlag(room, loser), Math.max(0, remaining));
}

function startClock(room) {
  const c = room.clock; if (!c || c.running) return;
  c.turn = 'w';                 /* ساعة الأبيض بتبدأ مع بداية المباراة */
  c.lastTs = Date.now();
  c.running = true;
  broadcastClock(room);
  armFlagTimer(room);
}

function stopClock(room) {
  const c = room && room.clock; if (!c) return;
  if (c.timer) { clearTimeout(c.timer); c.timer = null; }
  if (c.running && c.lastTs) {
    const now = Date.now();
    let ms = c[c.turn] - (now - c.lastTs);
    if (ms < 0) ms = 0;
    c[c.turn] = ms;              /* ثبّت المتبقّي للطرف اللي كان دوره */
  }
  c.running = false;
  broadcastClock(room);          /* العملاء يوقفوا عدّادهم المحلي */
}

/* نقلة اتلعبت: moverColor لازم يساوي الدور الحالي (نتجاهل أي نقلة برّه الدور). */
function onClockMove(room, moverColor) {
  const c = room && room.clock; if (!c || !c.running) return;
  if (moverColor !== c.turn) return;
  const now = Date.now();
  let ms = c[moverColor] - (c.lastTs ? (now - c.lastTs) : 0);
  if (ms < 0) ms = 0;
  ms += room.tc.inc * 1000;      /* الزيادة بعد النقلة */
  c[moverColor] = ms;
  c.turn = moverColor === 'w' ? 'b' : 'w';
  c.lastTs = now;
  broadcastClock(room);
  armFlagTimer(room);
}

function onFlag(room, loserColor) {
  const c = room && room.clock; if (!c) return;
  stopClock(room);
  c[loserColor] = 0;
  room.flagged = loserColor;
  broadcastClock(room, { flagged: loserColor });
  sendBoth(room, { type: 'game:flag', loser: loserColor });
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

/* ══ تصريح إشارات المكالمة (#135) ══
   إشارات WebRTC (offer/answer/ice/invite…) لازم تتصرّح قبل ما تتنقل:
   • مكالمة فردية (من غير group): لازم الطرفين أصدقاء ومش متحاظرين.
   • مكالمة حفلة (group موجود): لازم الطرفين أعضاء في نفس الحفلة.
   بترجّع true لو مسموح. ده بيمنع أي حد يبعت إشارة لأي مستخدم عشوائي. */
function callPeerAllowed(meId, peerId, groupId) {
  if (!meId || !peerId || meId === peerId) return false;
  try {
    if (groupId) {
      const gid = Number(groupId);
      const a = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(gid, meId);
      const b = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(gid, peerId);
      return !!(a && b);
    }
    const friend = db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(meId, peerId);
    if (!friend) return false;
    const blocked = db.prepare(`SELECT 1 FROM friend_blocks
                                WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
      .get(meId, peerId, peerId, meId);
    return !blocked;
  } catch (e) { return false; }
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

/* الدردشة بتستخدم نفس statusOf عشان قائمة المحادثات تعرض الحضور الحقيقي. */
chatRouter.setRealtime({ statusOf: liveStatus });

/* جروبات الأصدقاء: بتحتاج توزيع رسالة/إشعار على كل الأعضاء المتصلين،
   وتبليغ عضو باقي (مثلاً جروب جديد). server.js بيحقن الأدوات زي chat. */
groupsRouter.setRealtime({
  statusOf: liveStatus,
  /* بلّغ كل أعضاء الجروب (ما عدا exceptId اختياريًا) بحمولة. */
  notifyGroup(groupId, payload, exceptId) {
    try {
      for (const uid of groupsRouter.memberIds(groupId)) {
        if (exceptId && uid === exceptId) continue;
        for (const s of socketsOf(uid)) send(s, payload);
      }
    } catch (e) {}
  },
  /* بلّغ مستخدم واحد بعينه (مثلاً اللي اتشال من الحفلة). */
  notifyUser(userId, payload) {
    try { for (const s of socketsOf(userId)) send(s, payload); } catch (e) {}
  },
});

/* إرسال رسالة جروب: بتخزّن الأول وبعدين بتوزّع على كل الأعضاء المتصلين،
   ولأي عضو غير متصل بتبعتله إشعار دفع. spec زي رسالة الدردشة الفردية. */
/* لقطة مختصرة للرسالة الأصل عند الرد عليها (#130): اسم صاحبها + معاينة.
   scope='chat' يقرأ من messages، scope='group' من group_messages. */
function replySnippet(scope, id) {
  try {
    const tbl = scope === 'group' ? 'group_messages' : 'messages';
    const r = db.prepare(`SELECT id, sender_id, body, kind FROM ${tbl} WHERE id = ?`).get(id);
    if (!r) return null;
    const u = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(r.sender_id) || {};
    const preview = r.kind === 'voice' ? 'رسالة صوتية'
                  : r.kind === 'image' ? 'صورة'
                  : r.kind === 'video' ? 'فيديو'
                  : String(r.body || '').slice(0, 120);
    return { id: r.id, from: r.sender_id, name: u.display_name || u.username || 'صديق', kind: r.kind || 'text', preview };
  } catch (e) { return null; }
}

function pushGroupMessage(groupId, fromId, spec, clientId) {
  const kind = spec && ['voice', 'image', 'video'].includes(spec.kind) ? spec.kind : 'text';
  const hasMedia = kind !== 'text';
  const body = typeof (spec && spec.body) === 'string' ? spec.body : '';
  const audio = hasMedia ? String((spec && spec.audio) || '') : null;
  const duration = kind === 'voice' ? (parseInt(spec && spec.duration) || 0) : null;
  const mime = hasMedia ? String((spec && spec.mime) || '') : null;
  /* رد على رسالة (#130): نتحقق إن الرسالة الأصل من نفس الحفلة قبل ما نخزّنها. */
  let replyTo = null;
  const rt = parseInt(spec && spec.reply_to);
  if (Number.isInteger(rt) && rt > 0) {
    const orig = db.prepare('SELECT id FROM group_messages WHERE id = ? AND group_id = ?').get(rt, groupId);
    if (orig) replyTo = rt;
  }
  const info = db.prepare(`INSERT INTO group_messages (group_id, sender_id, kind, body, audio_data, duration, mime, reply_to)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
                 .run(groupId, fromId, kind, body, audio, duration, mime, replyTo);
  const row = db.prepare(`SELECT id, created_at FROM group_messages WHERE id = ?`).get(info.lastInsertRowid);
  const sender = db.prepare('SELECT display_name, username, avatar_url FROM users WHERE id = ?').get(fromId) || {};
  const senderName = sender.display_name || sender.username || 'صديق';
  const payload = {
    type: 'group:message', id: row.id, group_id: groupId,
    from: fromId, sender_name: senderName, sender_avatar: sender.avatar_url || null,
    kind, body, created_at: row.created_at, client_id: clientId || null,
    reply_to: replyTo, reply: replyTo ? replySnippet('group', replyTo) : null,
  };
  if (hasMedia) { payload.audio = audio; payload.duration = duration || 0; payload.mime = mime; }

  const members = groupsRouter.memberIds(groupId);
  const offline = [];
  const deliveredTo = [];
  for (const uid of members) {
    const socks = socketsOf(uid).filter(s => s.readyState === WebSocket.OPEN);
    if (socks.length) { for (const s of socks) send(s, payload); if (uid !== fromId) deliveredTo.push(uid); }
    else if (uid !== fromId) offline.push(uid);
  }
  /* إشعار دفع للأعضاء غير المتصلين (#64 للجروبات). */
  if (offline.length) {
    try { sendGroupPushToUsers(groupId, fromId, senderName, kind, body, offline); } catch (e) {}
  }
  /* تثبيت الوصول (✓✓) للأعضاء المتصلين بنظام high-water عشان مايختفيش بعد
     إعادة فتح الحفلة، وبعدين نبثّ لقطة الإيصالات لكل الأعضاء. */
  if (deliveredTo.length) {
    const up = db.prepare(`INSERT INTO group_reads (group_id, user_id, last_delivered_id) VALUES (?, ?, ?)
                           ON CONFLICT(group_id, user_id) DO UPDATE SET last_delivered_id = MAX(last_delivered_id, excluded.last_delivered_id)`);
    for (const uid of deliveredTo) { try { up.run(groupId, uid, row.id); } catch (e) {} }
  }
  try { broadcastGroupReceipts(groupId); } catch (e) {}
  return { row };
}

/* بثّ لقطة إيصالات الجروب لكل الأعضاء المتصلين. كل عميل بيحسب منها ✓/✓✓
   وصور القراء المكدّسة (نمط ماسنجر) على رسايله. */
function broadcastGroupReceipts(groupId) {
  const reads = groupsRouter.receiptsSnapshot(groupId);
  const payload = { type: 'group:receipts', group_id: groupId, reads };
  for (const uid of groupsRouter.memberIds(groupId)) {
    for (const s of socketsOf(uid)) send(s, payload);
  }
}

/* إشعار دفع برسالة جروب لأعضاء غير متصلين. العنوان = اسم الجروب،
   والسطر = «اسم المُرسِل: المعاينة» زي واتساب. */
function sendGroupPushToUsers(groupId, fromId, senderName, kind, body, userIds) {
  if (!_adminReady) return;
  const g = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId) || {};
  const groupName = g.name || 'حفلة شطرنجية';
  const preview = (kind === 'voice' ? 'رسالة صوتية'
                : kind === 'image' ? 'صورة'
                : kind === 'video' ? 'فيديو'
                : String(body || '').slice(0, 100));
  let tokens = [];
  for (const uid of userIds) tokens = tokens.concat(getTokensForUser(uid));
  if (!tokens.length) return;
  sendPushToTokens(tokens, {
    title: groupName,
    body: senderName + ': ' + preview,
    tag: 'group-' + groupId,
    data: { kind: 'group', group_id: String(groupId), from_id: String(fromId) },
  });
}

/* دالة موحّدة لإرسال رسالة دردشة: بتخزّن الأول (store-and-forward) وبعدين
   بتبعت لكل سوكتات الطرفين المفتوحة. بترجّع الرسالة المخزّنة.
   spec: { kind:'text'|'voice', body, audio, duration, mime }. */
function pushChatMessage(fromId, toId, spec, clientId) {
  const kind = spec && ['voice', 'image', 'video'].includes(spec.kind) ? spec.kind : 'text';
  const hasMedia = kind !== 'text';
  const body = typeof (spec && spec.body) === 'string' ? spec.body : '';
  const audio = hasMedia ? String((spec && spec.audio) || '') : null;
  const duration = kind === 'voice' ? (parseInt(spec && spec.duration) || 0) : null;
  const mime = hasMedia ? String((spec && spec.mime) || '') : null;
  const key = chatRouter.convoKey(fromId, toId);
  /* رد على رسالة (#130): لازم الأصل يكون من نفس المحادثة. */
  let replyTo = null;
  const rt = parseInt(spec && spec.reply_to);
  if (Number.isInteger(rt) && rt > 0) {
    const orig = db.prepare('SELECT id FROM messages WHERE id = ? AND convo_key = ?').get(rt, key);
    if (orig) replyTo = rt;
  }
  const info = db.prepare(`INSERT INTO messages (convo_key, sender_id, recipient_id, body, kind, audio_data, duration, mime, reply_to)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                 .run(key, fromId, toId, body, kind, audio, duration, mime, replyTo);
  const row = db.prepare(`SELECT id, created_at FROM messages WHERE id = ?`).get(info.lastInsertRowid);
  const payload = {
    type: 'chat:message', id: row.id, convo_key: key,
    from: fromId, to: toId, kind, body, created_at: row.created_at, client_id: clientId || null,
    reply_to: replyTo, reply: replyTo ? replySnippet('chat', replyTo) : null,
  };
  if (hasMedia) { payload.audio = audio; payload.duration = duration || 0; payload.mime = mime; }
  /* نسلّم للمستقبِل الأول عشان نعرف إذا وصلت (delivered) قبل ما نصدّي للمُرسِل،
     فالصدى بيوصل للمُرسِل ومعاه علامة ✓✓ صح من أول لحظة. */
  let delivered = false;
  for (const s of socketsOf(toId)) {
    if (s.readyState === WebSocket.OPEN) { send(s, payload); delivered = true; }
  }
  if (delivered) {
    /* تثبيت الوصول دائمًا: قبل كده كان بيتحسب لحظيًا ومايتخزّنش، فبترجع ✓
       واحدة بعد إعادة فتح الشات (اختفاء الـ✓✓). دلوقتي متخزّنة للأبد. */
    db.prepare(`UPDATE messages SET delivered_at = datetime('now') WHERE id = ? AND delivered_at IS NULL`).run(row.id);
  }
  payload.delivered = delivered;
  for (const s of socketsOf(fromId)) send(s, payload);   /* صدى لكل أجهزة المُرسِل */
  /* لو الطرف التاني مش متصل بأي سوكت مفتوح — إشعار دفع لهاتفه (#64). */
  if (!delivered) { try { sendChatPushToUser(fromId, toId, kind, body); } catch (e) {} }
  else { console.log('[push] SKIP chat push: user %s has an OPEN socket (delivered live)', toId); }
  return { row, key, delivered };
}

/* إشعار دفع برسالة دردشة لمستخدم غير متصل. بنجيب اسم المُرسِل ونبعت
   FCM لكل توكِنات المستقبِل المرتبطة بحسابه. */
function sendChatPushToUser(fromId, toId, kind, body) {
  if (!_adminReady) return;
  const tokens = getTokensForUser(toId);
  console.log('[push] chat push -> user %s : %d linked token(s)', toId, tokens.length);
  if (!tokens.length) return;
  const sender = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(fromId) || {};
  const name = sender.display_name || sender.username || 'صديق';
  const preview = kind === 'voice' ? 'رسالة صوتية'
                : kind === 'image' ? 'صورة'
                : kind === 'video' ? 'فيديو'
                : String(body || '').slice(0, 120);
  sendPushToTokens(tokens, {
    title: name,
    body: preview,
    tag: 'chat-' + fromId,
    data: { kind: 'chat', from_id: String(fromId) },
  });
}

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
    hostId: invite.from_id,
    guestId: invite.to_id,
    rated: !!invite.rated,
    host: makeMember(hostWs, hostColor, hostRow.display_name || hostRow.username || 'صديق', ''),
    guest: makeMember(guestWs, guestColor, guestRow.display_name || guestRow.username || 'صديق', ''),
    guestColor,
    createdAt: Date.now(),
    started: false,
    ended: false,
    state: null,
  };
  room.tc = (invite.tc_base != null) ? { base: invite.tc_base, inc: invite.tc_inc || 0 } : null;
  initClock(room);
  rooms.set(code, room);

  /* الكارثة القديمة: كنا بنبعت start لسوكت واحد بس (socketsOf(...).find(OPEN)).
     لكن سوكت الحضور بيعيد الاتصال مع أي رعشة في الشبكة/النفق، والسوكت الميت
     بيفضل في المجموعة لحد ما الـheartbeat يقتله بعد ~30ث وهو لسه بيبلّغ OPEN.
     فالـ.find كان بياخد السوكت الميت والرسالة تروح في الفاضي → الداعي
     مايدخلش المباراة إلا بعد كذا محاولة. الحل: نبعت لكل سوكتات كل طرف
     المفتوحة، ونربط clientRoom لكلها؛ الميت بيسقط الرسالة بلا ضرر، والحي
     بياخدها أكيد. أول رسالة حقيقية من الطرف بتصحّح room.host.ws/guest.ws
     عبر getRoomAndSide. */
  const hostSockets = socketsOf(invite.from_id).filter(s => s.readyState === WebSocket.OPEN);
  const guestSockets = socketsOf(invite.to_id).filter(s => s.readyState === WebSocket.OPEN);
  for (const s of hostSockets) clientRoom.set(s, code);
  for (const s of guestSockets) clientRoom.set(s, code);

  db.prepare('UPDATE game_invites SET room_code = ? WHERE id = ?').run(code, invite.id);
  for (const s of hostSockets) send(s, { type: 'friend:invite-room', code, role: 'host' });
  for (const s of guestSockets) send(s, { type: 'friend:invite-room', code, role: 'guest' });

  room.started = true;
  room.ended = false;
  const frRating = (id) => { if (!id) return null; try { const row = ratingStore.getUserRating.get(id); return row ? ratingStore.publicRating(row) : null; } catch (e) { return null; } };
  const hR = frRating(room.hostId), gR = frRating(room.guestId);
  for (const s of hostSockets) send(s, { type: 'start', yourColor: room.host.color, oppName: room.guest.name || 'الخصم', room: code, rated: !!room.rated, tc: room.tc || null, oppRating: gR, myRating: hR });
  for (const s of guestSockets) send(s, { type: 'start', yourColor: room.guest.color, oppName: room.host.name || 'الخصم', room: code, rated: !!room.rated, tc: room.tc || null, oppRating: hR, myRating: gR });
  startClock(room);
  console.log(`[friends] invite ${invite.id} -> room ${code} (host socks ${hostSockets.length}, guest socks ${guestSockets.length})`);

  /* الاتنين بقوا جوه مباراة، فأصدقاؤهم يشوفوا الحالة الجديدة */
  broadcastPresence(invite.from_id, 'in-game');
  broadcastPresence(invite.to_id, 'in-game');
  return code;
}

/* ══════════════════════════════════════════════════════════════
   تقييم Glicko-2 لمباريات الأونلاين المصنّفة
   ──────────────────────────────────────────────────────────────
   السيرفر مش عارف الفايز بنفسه (النقلات بتتحسب على الأجهزة)، فالنموذج
   اللي اختاره المستخدم: الطرفين بيبلّغا النتيجة (game:over)، والتقييم
   يتعدّل بس لما يتفقوا؛ والاستسلام/قطع الاتصال = خسارة للطرف صاحبه.
   بنثبّت هوية اللاعبين على كل غرفة أونلاين وقت البدء، وبنجمّع النقلات
   للأرشفة. finalizeRatedGame بيتنفّذ مرة واحدة بس لكل غرفة.
══════════════════════════════════════════════════════════════ */

// سجّل نقلة في الغرفة (للأرشفة + إعادة الحساب لاحقًا). سقف معقول.
function recordMove(room, mv) {
  if (!room) return;
  if (!room.moves) room.moves = [];
  if (room.moves.length < 600 && mv != null) room.moves.push(mv);
}

// طبّع نتيجة أبلغ بها طرف: بيرجّع لون الفايز 'w'|'b'|'draw' من منظور مطلق
function reportToWinnerColor(room, side, result) {
  const myColor = room[side] && room[side].color;
  const oppColor = myColor === 'w' ? 'b' : 'w';
  if (result === 'draw') return 'draw';
  if (result === 'win') return myColor;
  if (result === 'loss') return oppColor;
  return null;
}

/* نفّذ التقييم فعليًا. winnerColor: 'w'|'b'|'draw'. */
function finalizeRatedGame(room, winnerColor, reason) {
  if (!room || room.ratingDone) return;
  if (!room.rated || !room.hostId || !room.guestId) return;
  if (room.hostId === room.guestId) return;
  if (!['w', 'b', 'draw'].includes(winnerColor)) return;
  room.ratingDone = true;

  // اربط اللون بهوية اللاعب + سوكت الغرفة لكل لون
  const hostIsWhite = room.host.color === 'w';
  const whiteId = hostIsWhite ? room.hostId : room.guestId;
  const blackId = hostIsWhite ? room.guestId : room.hostId;
  const whiteWs = hostIsWhite ? room.host?.ws : room.guest?.ws;
  const blackWs = hostIsWhite ? room.guest?.ws : room.host?.ws;
  const winner = winnerColor === 'draw' ? 'draw' : (winnerColor === 'w' ? 'white' : 'black');

  let res;
  try {
    res = ratingStore.applyResult(whiteId, blackId, winner, reason, room.moves);
  } catch (e) {
    console.error('[rating] applyResult failed:', e.message);
    return;
  }
  if (!res) return;

  // ابعت لكل لاعب تغييره بشفافية (على سوكت الغرفة + سوكتات الحضور)
  pushRatingUpdate(whiteId, blackId, res.white, winner === 'draw' ? 'draw' : (winner === 'white' ? 'win' : 'loss'), reason, whiteWs);
  pushRatingUpdate(blackId, whiteId, res.black, winner === 'draw' ? 'draw' : (winner === 'black' ? 'win' : 'loss'), reason, blackWs);
  console.log(`[rating] room ${room.code} rated: white ${whiteId} ${res.white.delta>=0?'+':''}${res.white.delta}, black ${blackId} ${res.black.delta>=0?'+':''}${res.black.delta} (${reason})`);
}

function pushRatingUpdate(userId, oppId, change, outcome, reason, directWs) {
  const oppRow = ratingStore.getUserRating.get(oppId);
  const payload = {
    type: 'rating:update',
    outcome,             // win | loss | draw
    reason: reason || '',
    before: change.before,
    after: change.after,
    delta: change.delta,
    rating: change.after,
    rd: change.rd,
    provisional: change.provisional,
    opp: oppRow ? ratingStore.publicRating(oppRow) : null,
  };
  const seen = new Set();
  const out = (s) => { if (s && !seen.has(s) && s.readyState === WebSocket.OPEN) { seen.add(s); send(s, payload); } };
  // سوكت الغرفة (ماتش‑ميكينج/كود ممكن مايكونش على سوكت الحضور)
  out(directWs);
  // كل سوكتات الحضور المصادَق عليها
  for (const s of socketsOf(userId)) out(s);
  // حدّث حالة الحضور عشان التقييم الجديد يبان لأصدقائه
  try { broadcastPresence(userId); } catch (e) {}
}

/* استقبل JWT من رسالة لعب على سوكت غير مصادَق (ماتش‑ميكينج/كود) */
function userIdFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const id = Number(payload && (payload.uid || payload.id || payload.sub));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch (e) { return null; }
}

/* استقبال بلاغ نتيجة من أحد الطرفين. بنطبّق التقييم لما يتفقوا. */
function handleGameResult(ws, msg) {
  const info = getRoomAndSide(ws);
  if (!info) return;
  const { room, side } = info;
  if (room.kind !== 'online' || room.ratingDone) return;

  const winnerColor = reportToWinnerColor(room, side, msg.result);
  if (!winnerColor) return;

  room.reports = room.reports || {};
  room.reports[side] = winnerColor;
  room.ended = true;
  stopClock(room);

  const other = side === 'host' ? 'guest' : 'host';
  const reason = (msg.reason || '').toString().slice(0, 40) || 'game-over';

  if (room.reports[other]) {
    // الطرفان أبلغا: نصنّف بس لو اتفقوا
    if (room.reports[other] === winnerColor) {
      finalizeRatedGame(room, winnerColor, reason);
    } else {
      console.warn(`[rating] room ${room.code} disputed result — not rated`);
      room.ratingDone = true; // نزاع: نتجنّب التصنيف عشان ماحدش يغش
    }
  }
  // طرف واحد لسه: نستنّى تأكيد الطرف التاني (أو انسحاب/قطع اتصال)
}

/* استسلام أو قطع اتصال = خسارة للطرف ده (سلطة كافية، بلا انتظار). */
function finalizeOnLeave(room, side, reason) {
  if (!room || room.kind !== 'online' || room.ratingDone) return;
  stopClock(room);
  const other = side === 'host' ? 'guest' : 'host';
  // لو الطرف التاني أبلغ نتيجة قبل كده، نحترمها بدل ما نفترض خسارة
  if (room.reports && room.reports[other]) {
    finalizeRatedGame(room, room.reports[other], reason || 'reported');
    return;
  }
  const loserColor = room[side] && room[side].color;
  const winnerColor = loserColor === 'w' ? 'b' : 'w';
  finalizeRatedGame(room, winnerColor, reason || 'resign');
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

            /* عدّاد رسايل الدردشة غير المقروءة أول ما يتصل، عشان الشارة
               تبقى صح لحظة الفتح على أي جهاز. */
            try {
              const rows = db.prepare(`SELECT sender_id AS friend_id, COUNT(*) AS count FROM messages
                                       WHERE recipient_id = ? AND read_at IS NULL GROUP BY sender_id`).all(userId);
              const total = rows.reduce((s, r) => s + r.count, 0);
              send(ws, { type: 'chat:unread', total, by_friend: rows });
            } catch (e) {}

            /* ✓✓ للوصول المؤجّل: الرسايل اللي اتبعتت والمستخدم ده كان
               مقفول (delivered_at IS NULL) — دلوقتي اتصل يبقى وصلت. نثبّت
               الوصول ونبلّغ كل مُرسِل (لو متصل) عشان علامته تقلب ✓✓ فورًا،
               زي واتساب لما الطرف يفتح النت. */
            try {
              const undel = db.prepare(`SELECT id, sender_id, convo_key FROM messages
                                        WHERE recipient_id = ? AND delivered_at IS NULL`).all(userId);
              if (undel.length) {
                db.prepare(`UPDATE messages SET delivered_at = datetime('now')
                            WHERE recipient_id = ? AND delivered_at IS NULL`).run(userId);
                /* نجمّع الـids حسب المُرسِل + مفتاح المحادثة */
                const bySender = new Map();   /* senderId -> { convo_key, ids:[] } */
                for (const m of undel) {
                  if (!bySender.has(m.sender_id)) bySender.set(m.sender_id, { convo_key: m.convo_key, ids: [] });
                  bySender.get(m.sender_id).ids.push(m.id);
                }
                for (const [senderId, g] of bySender) {
                  for (const s of socketsOf(senderId)) {
                    send(s, { type: 'chat:delivered', convo_key: g.convo_key, ids: g.ids });
                  }
                }
              }
            } catch (e) {}

            /* ✓✓ للجروبات كمان: أول ما يتصل، كل رسايل الحفلات اللي هو عضو
               فيها تعتبر وصلته (delivered high-water = آخر رسالة). بنبثّ
               الإيصالات لكل حفلة عشان علامات باقي الأعضاء تتحدّث فورًا. */
            try {
              const myGroups = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId).map(r => r.group_id);
              for (const gid of myGroups) {
                const maxId = (db.prepare('SELECT MAX(id) AS m FROM group_messages WHERE group_id = ?').get(gid) || {}).m || 0;
                if (maxId > 0) {
                  db.prepare(`INSERT INTO group_reads (group_id, user_id, last_delivered_id) VALUES (?, ?, ?)
                              ON CONFLICT(group_id, user_id) DO UPDATE SET last_delivered_id = MAX(last_delivered_id, excluded.last_delivered_id)`).run(gid, userId, maxId);
                }
                try { broadcastGroupReceipts(gid); } catch (e) {}
              }
            } catch (e) {}

            /* لو الطرف كان جوه مباراة صداقة والسوكت اتقطع لحظة القبول: نعيد
               ربطه بالغرفة الشغّالة ونبعتله start تاني. ده بيضمن إن الداعي
               يدخل المباراة حتى لو سوكته كان بيعيد الاتصال وقت القبول. */
            for (const [code, room] of rooms) {
              if (!room || room.ended || room.kind !== 'online') continue;
              let side = null;
              if (room.hostId === userId) side = 'host';
              else if (room.guestId === userId) side = 'guest';
              if (!side || !room[side]) continue;
              clientRoom.set(ws, code);
              room[side].ws = ws;
              const oppName = side === 'host' ? (room.guest?.name || 'الخصم') : (room.host?.name || 'الخصم');
              send(ws, { type: 'friend:invite-room', code, role: side });
              send(ws, { type: 'start', yourColor: room[side].color, oppName, room: code });
              break;
            }
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
          const rated = msg.rated === true ? 1 : 0;
          const tc = parseTC(msg.tc);
          const info = db.prepare(`INSERT INTO game_invites (from_id, to_id, color, rated, tc_base, tc_inc, expires_at)
                                   VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+90 seconds'))`)
                         .run(senderId, friendId, color, rated, tc ? tc.base : null, tc ? tc.inc : null);
          const inviteId = info.lastInsertRowid;
          const sender = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(senderId);

          let delivered = false;
          for (const fws of socketsOf(friendId)) {
            send(fws, { type: 'friend:invite-received', invite: { id: inviteId, from: sender, color, rated: !!rated, tc: tc || null, expires_in: 90 } });
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

          const hostSockets = socketsOf(inv.from_id).filter(s => s.readyState === WebSocket.OPEN);
          if (!hostSockets.length) {
            db.prepare(`UPDATE game_invites SET status = 'expired', responded_at = datetime('now') WHERE id = ?`).run(inviteId);
            send(ws, { type: 'friend:invite-error', reason: 'host-offline' });
            break;
          }
          db.prepare(`UPDATE game_invites SET status = 'accepted', responded_at = datetime('now') WHERE id = ?`).run(inviteId);
          /* beginFriendGame بيعيد اشتقاق كل سوكتات الطرفين بنفسه ويبعت
             start لكلها؛ بنمرّر أول سوكت حي كبداية بس. */
          beginFriendGame(inv, hostSockets[0], ws);
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

      /* ══════════════════════════════════════════════════════════════
         إشارات المكالمة الصوتية (WebRTC) — #135
         السيرفر بيتصرّف كوسيط إشارات بس: بينقل SDP/ICE بين مستخدمين
         متصلين بعد التحقق (أصدقاء/نفس الحفلة). الوسائط نفسها P2P
         (STUN/TURN) ومابتعدّيش على السيرفر. كل رسالة فيها:
           to      = userId الطرف الآخر
           callId  = معرّف المكالمة (يولّده الطرف الداعي)
           group   = (اختياري) معرّف الحفلة لمكالمة جماعية
         مكالمة الحفلة = شبكة كاملة: كل زوج بيتبادل offer/answer/ice
         مستقل بنفس الرسائل دي والـ to بيبقى الطرف المحدّد.
      ══════════════════════════════════════════════════════════════ */
      case 'call:invite':
      case 'call:accept':
      case 'call:reject':
      case 'call:cancel':
      case 'call:end':
      case 'call:busy':
      case 'call:offer':
      case 'call:answer':
      case 'call:ice': {
        const me = socketUser.get(ws);
        const to = Number(msg.to);
        if (!me) { send(ws, { type: 'call:error', reason: 'auth', callId: msg.callId || null }); break; }
        if (!Number.isInteger(to) || to <= 0) break;
        const groupId = msg.group != null ? Number(msg.group) : null;
        if (!callPeerAllowed(me, to, groupId)) {
          send(ws, { type: 'call:error', reason: 'not-allowed', callId: msg.callId || null });
          break;
        }
        /* حد أقصى لحجم الحمولة (SDP بيبقى بضع كيلوبايت؛ ICE أصغر) */
        const sdp = typeof msg.sdp === 'string' ? msg.sdp.slice(0, 100000) : null;
        const cand = (msg.candidate && typeof msg.candidate === 'object') ? msg.candidate : null;

        const sender = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(me);
        /* نوع الرسالة الواصلة للطرف الآخر = نفس نوع الإشارة (السيرفر شفّاف) */
        const out = {
          type: msg.type,
          from: me,
          fromUser: sender || null,
          callId: msg.callId || null,
          group: groupId || null,
        };
        if (msg.type === 'call:invite') { out.kind = 'audio'; out.members = Array.isArray(msg.members) ? msg.members.slice(0, 12).map(Number) : null; }
        if (sdp) out.sdp = sdp;
        if (cand) out.candidate = cand;

        let delivered = false;
        for (const s of socketsOf(to)) {
          if (s.readyState === WebSocket.OPEN) { send(s, out); delivered = true; }
        }
        /* رجّع للداعي حالة التوصيل عشان يعرف الطرف متصل ولا لأ */
        if (msg.type === 'call:invite') send(ws, { type: 'call:invite-ack', to, callId: msg.callId || null, delivered });
        break;
      }

      /* ══ دردشة الأصدقاء ══ */
      case 'chat:send': {
        const me = socketUser.get(ws);
        const to = Number(msg.to);
        const clientId = typeof msg.client_id === 'string' ? msg.client_id.slice(0, 64) : null;
        const kind = ['voice', 'image', 'video'].includes(msg.kind) ? msg.kind : 'text';
        let body = typeof msg.body === 'string' ? msg.body.trim() : '';
        if (!me) { send(ws, { type: 'chat:error', reason: 'auth', client_id: clientId }); break; }
        if (!Number.isInteger(to) || to <= 0) break;
        let spec;
        if (kind !== 'text') {
          const audio = typeof msg.audio === 'string' ? msg.audio : '';
          if (!audio) { send(ws, { type: 'chat:error', reason: 'server', client_id: clientId }); break; }
          if (audio.length > 8_000_000) { send(ws, { type: 'chat:error', reason: 'too-big', client_id: clientId }); break; }   /* حد أقصى ~6MB base64 */
          spec = { kind, body: '', audio, duration: kind === 'voice' ? (parseInt(msg.duration) || 0) : 0, mime: String(msg.mime || '').slice(0, 60) };
        } else {
          if (!body) break;
          spec = { kind: 'text', body: body.slice(0, 4000) };
        }
        if (msg.reply_to != null) spec.reply_to = msg.reply_to;
        try {
          if (!chatRouter.areFriends(me, to) || chatRouter.blockedBetween(me, to)) {
            send(ws, { type: 'chat:error', reason: 'not-friend', client_id: clientId });
            break;
          }
          const { row, delivered } = pushChatMessage(me, to, spec, clientId);
          send(ws, { type: 'chat:sent', client_id: clientId, id: row.id, created_at: row.created_at, to, delivered });
        } catch (e) {
          console.error('[chat] send failed:', e.message);
          send(ws, { type: 'chat:error', reason: 'server', client_id: clientId });
        }
        break;
      }

      case 'chat:read': {
        const me = socketUser.get(ws);
        const from = Number(msg.from);
        if (!me || !Number.isInteger(from) || from <= 0) break;
        try {
          const key = chatRouter.convoKey(me, from);
          const info = db.prepare(`UPDATE messages SET read_at = datetime('now')
                                   WHERE convo_key = ? AND recipient_id = ? AND sender_id = ? AND read_at IS NULL`)
                         .run(key, me, from);
          if (info.changes > 0) {
            for (const s of socketsOf(from)) send(s, { type: 'chat:read-receipt', by: me, convo_key: key });
          }
        } catch (e) {}
        break;
      }

      /* ══ تثبيت/فك تثبيت رسالة 1:1 (#132): الطرفان يقدروا ══ */
      case 'chat:pin': {
        const me = socketUser.get(ws);
        const to = Number(msg.to);
        const id = Number(msg.id);
        const pin = !!msg.pin;
        if (!me || !Number.isInteger(to) || to <= 0 || !Number.isInteger(id) || id <= 0) break;
        try {
          if (!chatRouter.areFriends(me, to) || chatRouter.blockedBetween(me, to)) break;
          const key = chatRouter.convoKey(me, to);
          const m = db.prepare('SELECT id FROM messages WHERE id = ? AND convo_key = ?').get(id, key);
          if (!m) break;
          db.prepare(`UPDATE messages SET pinned_at = ${pin ? "datetime('now')" : 'NULL'} WHERE id = ?`).run(id);
          const payload = { type: 'chat:pinned', convo_key: key, with: me, id, pinned: pin, by: me };
          for (const s of socketsOf(me)) send(s, Object.assign({}, payload, { with: to }));
          for (const s of socketsOf(to)) send(s, Object.assign({}, payload, { with: me }));
        } catch (e) {}
        break;
      }

      case 'chat:typing': {
        const me = socketUser.get(ws);
        const to = Number(msg.to);
        if (!me || !Number.isInteger(to) || to <= 0) break;
        for (const s of socketsOf(to)) send(s, { type: 'chat:typing', from: me });
        break;
      }

      /* الطرف بيسجّل رسالة صوتية — نبلّغ الصديق زي مؤشّر الكتابة */
      case 'chat:recording': {
        const me = socketUser.get(ws);
        const to = Number(msg.to);
        if (!me || !Number.isInteger(to) || to <= 0) break;
        for (const s of socketsOf(to)) send(s, { type: 'chat:recording', from: me, on: !!msg.on });
        break;
      }

      /* ══ شات الجروبات ══ */
      case 'group:send': {
        const me = socketUser.get(ws);
        const gid = Number(msg.group_id);
        const clientId = typeof msg.client_id === 'string' ? msg.client_id.slice(0, 64) : null;
        const kind = ['voice', 'image', 'video'].includes(msg.kind) ? msg.kind : 'text';
        let body = typeof msg.body === 'string' ? msg.body.trim() : '';
        if (!me) { send(ws, { type: 'group:error', reason: 'auth', client_id: clientId }); break; }
        if (!Number.isInteger(gid) || gid <= 0) break;
        let spec;
        if (kind !== 'text') {
          const audio = typeof msg.audio === 'string' ? msg.audio : '';
          if (!audio) { send(ws, { type: 'group:error', reason: 'server', client_id: clientId }); break; }
          if (audio.length > 8_000_000) { send(ws, { type: 'group:error', reason: 'too-big', client_id: clientId }); break; }   /* حد أقصى ~6MB base64 */
          spec = { kind, body: '', audio, duration: kind === 'voice' ? (parseInt(msg.duration) || 0) : 0, mime: String(msg.mime || '').slice(0, 60) };
        } else {
          if (!body) break;
          spec = { kind: 'text', body: body.slice(0, 4000) };
        }
        if (msg.reply_to != null) spec.reply_to = msg.reply_to;
        try {
          if (!groupsRouter.isMember(gid, me)) {
            send(ws, { type: 'group:error', reason: 'not-member', client_id: clientId });
            break;
          }
          /* حفلة مقفولة (send_policy='admins'): المشرفون بس يقدروا يبعتوا. */
          const gpol = (db.prepare('SELECT send_policy FROM groups WHERE id = ?').get(gid) || {}).send_policy;
          if (gpol === 'admins' && !groupsRouter.isAdmin(gid, me)) {
            send(ws, { type: 'group:error', reason: 'closed', client_id: clientId, group_id: gid });
            break;
          }
          const { row } = pushGroupMessage(gid, me, spec, clientId);
          send(ws, { type: 'group:sent', client_id: clientId, id: row.id, created_at: row.created_at, group_id: gid });
        } catch (e) {
          console.error('[groups] send failed:', e.message);
          send(ws, { type: 'group:error', reason: 'server', client_id: clientId });
        }
        break;
      }

      case 'group:typing': {
        const me = socketUser.get(ws);
        const gid = Number(msg.group_id);
        if (!me || !Number.isInteger(gid) || gid <= 0) break;
        try {
          if (!groupsRouter.isMember(gid, me)) break;
          const sender = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(me) || {};
          const name = sender.display_name || sender.username || '';
          for (const uid of groupsRouter.memberIds(gid)) {
            if (uid === me) continue;
            for (const s of socketsOf(uid)) send(s, { type: 'group:typing', group_id: gid, from: me, name });
          }
        } catch (e) {}
        break;
      }

      case 'group:recording': {
        const me = socketUser.get(ws);
        const gid = Number(msg.group_id);
        if (!me || !Number.isInteger(gid) || gid <= 0) break;
        try {
          if (!groupsRouter.isMember(gid, me)) break;
          const sender = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(me) || {};
          const name = sender.display_name || sender.username || '';
          for (const uid of groupsRouter.memberIds(gid)) {
            if (uid === me) continue;
            for (const s of socketsOf(uid)) send(s, { type: 'group:recording', group_id: gid, from: me, name, on: !!msg.on });
          }
        } catch (e) {}
        break;
      }

      case 'group:read': {
        const me = socketUser.get(ws);
        const gid = Number(msg.group_id);
        if (!me || !Number.isInteger(gid) || gid <= 0) break;
        try {
          if (!groupsRouter.isMember(gid, me)) break;
          const last = db.prepare('SELECT MAX(id) AS m FROM group_messages WHERE group_id = ?').get(gid).m || 0;
          /* القراءة بتثبّت الوصول كمان (لو قريت يبقى وصلتك) — high-water للاتنين. */
          db.prepare(`INSERT INTO group_reads (group_id, user_id, last_read_id, last_delivered_id) VALUES (?, ?, ?, ?)
                      ON CONFLICT(group_id, user_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id),
                                                                   last_delivered_id = MAX(last_delivered_id, excluded.last_delivered_id)`).run(gid, me, last, last);
          try { broadcastGroupReceipts(gid); } catch (e) {}
        } catch (e) {}
        break;
      }

      /* ══ تثبيت/فك تثبيت رسالة حفلة (#132): المشرفون بس ══ */
      case 'group:pin': {
        const me = socketUser.get(ws);
        const gid = Number(msg.group_id);
        const id = Number(msg.id);
        const pin = !!msg.pin;
        if (!me || !Number.isInteger(gid) || gid <= 0 || !Number.isInteger(id) || id <= 0) break;
        try {
          if (!groupsRouter.isAdmin(gid, me)) { send(ws, { type: 'group:error', reason: 'admins-only', group_id: gid }); break; }
          const m = db.prepare('SELECT id FROM group_messages WHERE id = ? AND group_id = ?').get(id, gid);
          if (!m) break;
          db.prepare(`UPDATE group_messages SET pinned_at = ${pin ? "datetime('now')" : 'NULL'} WHERE id = ?`).run(id);
          const payload = { type: 'group:pinned', group_id: gid, id, pinned: pin, by: me };
          for (const uid of groupsRouter.memberIds(gid)) for (const s of socketsOf(uid)) send(s, payload);
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
          /* الماتش‑ميكينج بيجري على سوكت اللعب اللي مش مصادَق عليه بالضرورة،
             فبنقبل التوكن في الرسالة كمصدر بديل للهوية عشان الغرفة تتصنّف. */
          userId: socketUser.get(ws) || userIdFromToken(msg.token) || null,
          rated: !!msg.rated,
          tc: parseTC(msg.tc),
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

        const hostId = socketUser.get(ws) || userIdFromToken(msg.token) || null;
        const room = {
          kind: roomKind,
          code,
          hostId,
          rated: roomKind === 'online' && msg.rated === true && !!hostId,
          host: makeMember(ws, hostColor, msg.name || '', msg.deviceId || ''),
          guest: null,
          guestColor,
          createdAt: Date.now(),
          started: false,
          ended: false,
          state: null,
        };
        room.tc = roomKind === 'online' ? parseTC(msg.tc) : null;   /* #134 توقيت اختياري (أونلاين بس) */
        initClock(room);
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
        room.guestId = socketUser.get(ws) || userIdFromToken(msg.token) || null;
        // مباراة مصنّفة تحتاج الطرفين مسجّلين
        if (room.rated && !(room.hostId && room.guestId)) room.rated = false;
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

      /* ══ بلاغ نتيجة مباراة (للتقييم المصنّف) ══ */
      case 'game:over': {
        try { handleGameResult(ws, msg); } catch (e) { console.error('[rating] game:over:', e.message); }
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
          if (msg.type === 'resign') {
            room.ended = true;
            stopClock(room);
            finalizeOnLeave(room, side, 'resign');   // المنسحب يخسر (لو مصنّفة)
          }
          if (msg.type === 'move') {
            recordMove(room, msg.move != null ? msg.move : (msg.san || msg.uci || null));
            if (room.clock) onClockMove(room, room[side] && room[side].color);
          }
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
              title = 'دورك الآن';
              body = `${fromName} لعب نقلة. افتح المباراة ورد بسرعة!`;
              tag = 'your-turn';
            } else if (msg.type === 'chat') {
              title = 'رسالة جديدة';
              body = `${fromName}: ${(msg.text || 'رسالة').toString().slice(0, 70)}`;
              tag = 'chat';
            } else if (msg.type === 'voice') {
              title = 'رسالة صوتية';
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
      /* قطع الاتصال في مباراة أونلاين مصنّفة لسه شغّالة = خسارة للمنقطع،
         بس بشرط إنه اتفصل فعلاً (مش لسه فاتح على جهاز تاني). */
      if (info && info.room.kind === 'online' && !info.room.ratingDone
          && userId && !userSockets.has(userId)) {
        try { finalizeOnLeave(info.room, info.side, 'disconnect'); } catch (e) {}
      }
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
/* عند إقلاع السيرفر مفيش أي سوكت متصل، فأي صف حضوره is_online=1 هو
   بقايا قديمة من قبل آخر ريستارت. من غير المسح ده صاحبك يفضل يبان
   «متصل» و«آخر ظهور» متجمّد على وقت الريستارت (مشكلة «متصل منذ 3 ساعات»).
   بنصفّرهم كلهم offline؛ اللي يتصل فعلاً يرجع online من presence:hello. */
try {
  db.prepare(`UPDATE presence SET is_online = 0, status = 'offline', in_game = 0`).run();
} catch (e) { console.error('[presence] startup reset failed:', e.message); }

server.listen(PORT, () => {
  console.log(`♟ Chess server running on port ${PORT}`);
  try{
    if (_adminReady) scheduleDailyNourPushes();
  }catch(e){}
});
