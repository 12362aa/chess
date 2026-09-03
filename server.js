
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
  const dataOnly = !!payload?.dataOnly;

  let message;
  if (dataOnly) {
    /* رسالة data-only (#151): من غير أي notification block خالص، عشان
       onMessageReceived يشتغل والتطبيق في الخلفية/مقفول فتقدر خدمتنا المخصّصة
       (FcmService) تبني إشعار المكالمة بأزرار رد/رفض + ملء الشاشة زيّ واتساب.
       بنطوي العنوان/النص جوه data عشان الخدمة تقراهم. ttl قصير: المكالمة
       لحظية مالهاش أي لازمة بعد دقيقة. */
    message = {
      tokens,
      data: Object.fromEntries(Object.entries({ ...data, link, title, body }).map(([k, v]) => [String(k), String(v)])),
      android: { priority: 'high', ttl: 60000 },
    };
  } else {
    message = {
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
  }

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

/* ══════════════════════════════════════════════════════════════════════
   نظام الإشعارات التكيّفي (#173)
   ──────────────────────────────────────────────────────────────────────
   بديل نظام النوافذ الثابتة القديم اللي كان بيبعت نفس الجُمل المعلّبة
   للكل. هنا مفيش أي نص ثابت خالص: كل إشعار (العنوان + النص) بيتبني لحظة
   الإرسال من حالة المستخدم الحيّة في القاعدة — اسمه، تقييمه، نجوم نور،
   أصحابه المتصلين دلوقتي، غيابه بالأيام، رسايله غير المقروءة، دعواته،
   نتيجة آخر مباراة... فكل رسالة فيها قيمة حيّة على الأقل ومفيش رسالتين
   متطابقتين. بيغطّي كل أوضاع اللعب: أونلاين، StockFish، ونور.

   بيعيد استخدام sendPushToTokens نفسها (آلية FCM الموجودة، مافيش آلية
   تانية). التوقيت ذكي: لكل مستخدم فتحات موزّعة عبر اليوم بأحزمة متساوية
   (مشتقّة بهاش ثابت من id+اليوم عشان ماتتكدّسش ولا تتطابق بين المستخدمين)،
   بحدّ أقصى NOTIF.maxPerDay/يوم وفجوة دنيا بين أي إشعارين، وبنتجاهل
   المستخدم لو هو أصلاً متصل/جوه مباراة دلوقتي (مش محتاج نداء). المستخدم
   المجهول (بدون حساب) بياخد «نبضة مجتمعية» حيّة (عدد المتصلين/المتصدّر). */

const NOTIF = {
  activeStartHour: 9,             // مانبعتش قبلها (صبح بدري)
  activeEndHour: 23,              // ولا بعدها (بالليل متأخّر)
  tickMs: 17 * 60 * 1000,         // نفحص الحالة كل ~17 دقيقة
  minGapMs: 100 * 60 * 1000,      // ساعة و40 دقيقة على الأقل بين إشعارين لنفس الحساب
  maxPerDay: 5,                   // سقف الإشعارات المخصّصة للمستخدم/يوم (زدنا العدد)
  communityPerDay: 3,             // نبضات مجتمعية للمجهول/يوم
  communityMinOnline: 2,          // ماننادّيش المجهول إلا لو فيه ناس بتلعب فعلًا
  lapsedDays: 3,                  // بعد كام يوم غياب نعتبره «راجع»
};

/* حالة الإرسال لكل حساب (والمجتمع تحت مفتاح 'community') لليوم الحالي */
const _notif = new Map(); // key -> { day, fired:Set<slotIndex>, lastMs }

function _firstName(s) {
  const t = String(s || '').trim();
  if (!t) return 'صديقي';
  return t.split(/\s+/)[0].slice(0, 20);
}

/* رقم اليوم المحلي (يتغيّر منتصف الليل) — أساس توزيع الفتحات وتصفير العدّاد */
function _dayNum(d) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

/* هاش ثابت 32-bit (FNV-1a) — يدّينا فتحات/تنويعات ثابتة لنفس (المستخدم، اليوم) */
function _hash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* فتحات الإرسال (دقيقة-في-اليوم) موزّعة على نطاق النشاط بأحزمة متساوية عشان
   تحترم الفجوة الدنيا ومتتكدّسش، مع إزاحة عشوائية-ثابتة جوه كل حزمة */
function _slotMinutes(userKey, day, count) {
  const startMin = NOTIF.activeStartHour * 60;
  const windowMin = (NOTIF.activeEndHour - NOTIF.activeStartHour) * 60;
  const band = Math.floor(windowMin / Math.max(1, count));
  const out = [];
  for (let i = 0; i < count; i++) {
    const jitter = band > 1 ? (_hash(userKey + ':' + day + ':' + i) % band) : 0;
    out.push(startMin + i * band + jitter);
  }
  return out;
}

/* فرق الأيام من طابع زمني SQLite (UTC) لحد دلوقتي */
function _daysSince(sqliteTs) {
  if (!sqliteTs) return null;
  const t = Date.parse(String(sqliteTs).replace(' ', 'T') + 'Z');
  if (!isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/* لقطة حالة المستخدم من القاعدة — كل الأرقام حيّة لحظة النداء */
function buildUserSnapshot(userId) {
  const u = db.prepare(`SELECT display_name, username, rating, rating_games, rating_peak,
                               wins, losses, draws, last_login_at
                        FROM users WHERE id = ?`).get(userId);
  if (!u) return null;

  const nour = db.prepare(`SELECT COUNT(*) AS done, COALESCE(SUM(stars),0) AS stars,
                                  COALESCE(MAX(stage_number),0) AS maxStage, MAX(completed_at) AS lastAt
                           FROM nour_progress WHERE user_id = ? AND completed = 1`).get(userId) || {};

  const pres = db.prepare(`SELECT is_online, in_game, last_seen_at FROM presence WHERE user_id = ?`).get(userId) || {};

  const friendsOnline = (db.prepare(`SELECT COUNT(*) AS c FROM friendships f
                                     JOIN presence p ON p.user_id = f.friend_id
                                     WHERE f.user_id = ? AND p.is_online = 1`).get(userId) || {}).c || 0;

  const unread = (db.prepare(`SELECT COUNT(*) AS c FROM messages
                              WHERE recipient_id = ? AND read_at IS NULL`).get(userId) || {}).c || 0;

  const invites = (db.prepare(`SELECT COUNT(*) AS c FROM game_invites
                               WHERE to_id = ? AND status = 'pending'
                                 AND (expires_at IS NULL OR expires_at > datetime('now'))`).get(userId) || {}).c || 0;

  const last = db.prepare(`SELECT winner, white_id, black_id FROM rated_games
                           WHERE white_id = ? OR black_id = ? ORDER BY id DESC LIMIT 1`).get(userId, userId);
  let lastResult = null;
  if (last) {
    if (last.winner === 'draw') lastResult = 'draw';
    else {
      const isWhite = Number(last.white_id) === Number(userId);
      const won = (last.winner === 'white' && isWhite) || (last.winner === 'black' && !isWhite);
      lastResult = won ? 'win' : 'loss';
    }
  }

  const rating = Math.round(isFinite(u.rating) ? u.rating : 1500);
  const peak = Math.round(isFinite(u.rating_peak) ? u.rating_peak : rating);
  const awayLogin = _daysSince(u.last_login_at);
  const awaySeen = _daysSince(pres.last_seen_at);
  const away = Math.min(awayLogin == null ? 9999 : awayLogin, awaySeen == null ? 9999 : awaySeen);

  return {
    userId,
    name: _firstName(u.display_name || u.username),
    rating, peak,
    ratingGames: u.rating_games || 0,
    wins: u.wins || 0, losses: u.losses || 0, draws: u.draws || 0,
    nourStars: nour.stars || 0,
    nourStages: nour.done || 0,
    nourNext: (nour.maxStage || 0) + 1,
    isOnline: !!pres.is_online,
    inGame: !!pres.in_game,
    friendsOnline, unread, invites,
    lastResult,
    daysAway: away === 9999 ? null : away,
  };
}

/* مستوى StockFish مقترح على قدّ تقييم اللاعب */
function _sfLevel(r) {
  r = r || 1500;
  if (r < 1000) return 3;
  if (r < 1200) return 5;
  if (r < 1400) return 7;
  if (r < 1600) return 9;
  if (r < 1800) return 12;
  if (r < 2000) return 15;
  return 18;
}

/* كام إشعار للمستخدم ده النهارده — أذكى: فيه سبب فوري = أكتر، غايب = أقل */
function _plannedCount(s) {
  if (s.friendsOnline > 0 || s.unread > 0 || s.invites > 0) return NOTIF.maxPerDay;
  if (s.daysAway != null && s.daysAway >= NOTIF.lapsedDays) return 2; // راجع: مانلحّش
  if (s.ratingGames === 0 && s.nourStars === 0) return 3;             // جديد
  return 4;                                                          // نشِط
}

/* ترتيب الفئات المتاحة حسب الحالة؛ بنختار بالترتيب (index=عدد اللي اتبعت)
   عشان نلفّ على أنواع مختلفة خلال اليوم بدل تكرار نفس النوع */
function _categories(s) {
  const cats = [];
  if (s.daysAway != null && s.daysAway >= NOTIF.lapsedDays) cats.push('comeback');
  if (s.friendsOnline > 0) cats.push('friends');
  if (s.invites > 0) cats.push('invite');
  if (s.unread > 0) cats.push('unread');
  if (s.ratingGames > 0) cats.push('rating');
  if (s.nourStars === 0 || s.nourStages < 30) cats.push('nour');
  cats.push('stockfish'); // تدريب ضد المحرّك متاح دايمًا
  return cats.length ? cats : ['stockfish'];
}

/* يبني {title, body} من الفئة + اللقطة. كل صيغة فيها قيمة حيّة على الأقل،
   والتنويع مشتقّ بهاش من (المستخدم، اليوم، الفتحة، الفئة) فمفيش تكرار حرفي.
   كل النصوص عربية فصحى — التطبيق عربي لكل الناطقين بالعربية، مش مصري. */
const _nDays    = n => n === 1 ? 'يومًا واحدًا' : n === 2 ? 'يومين' : (n <= 10 ? `${n} أيام` : `${n} يومًا`);
const _nMsgs    = n => n === 1 ? 'رسالة واحدة' : n === 2 ? 'رسالتان' : (n <= 10 ? `${n} رسائل` : `${n} رسالة`);
const _nInvites = n => n === 1 ? 'دعوة واحدة' : n === 2 ? 'دعوتان' : (n <= 10 ? `${n} دعوات` : `${n} دعوة`);
const _nPlayers = n => n === 1 ? 'لاعب واحد' : n === 2 ? 'لاعبان' : (n <= 10 ? `${n} لاعبين` : `${n} لاعبًا`);
const _nFriends = n => n === 1 ? 'صديق واحد' : n === 2 ? 'صديقان' : (n <= 10 ? `${n} أصدقاء` : `${n} صديقًا`);
const _nStars   = n => n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتين' : (n <= 10 ? `${n} نجوم` : `${n} نجمة`);
const _nPoints  = n => n === 1 ? 'نقطة واحدة' : n === 2 ? 'نقطتان' : (n <= 10 ? `${n} نقاط` : `${n} نقطة`);
const _nStages  = n => n === 1 ? 'مرحلة واحدة' : n === 2 ? 'مرحلتين' : (n <= 10 ? `${n} مراحل` : `${n} مرحلة`);
function _renderNotif(cat, s, slotIndex, day) {
  const nm = s.name;
  const pick = (arr) => arr[_hash(s.userId + ':' + day + ':' + slotIndex + ':' + cat) % arr.length];

  switch (cat) {
    case 'comeback': {
      const d = s.daysAway || 1;
      return {
        title: `${nm}.. غِبتَ ${_nDays(d)}`,
        body: pick([
          `${nm}، غِبتَ ${_nDays(d)} — وتقييمك ${s.rating} ما زال ينتظر عودتك ♟`,
          `${_nDays(d)} بلا شطرنج يا ${nm}؟ سجلّك: ${s.wins} فوز، ولن يزداد من تلقاء نفسه 😉`,
          `عودتك تُحدث فرقًا يا ${nm}: آخر ظهور لك منذ ${_nDays(d)}، والرقعة تخلو منك`,
        ]),
        data: { kind: 'adaptive', cat, days: String(d) }, tag: 'amkh-comeback',
      };
    }
    case 'friends': {
      const f = s.friendsOnline;
      return {
        title: `${_nFriends(f)} على الشبكة`,
        body: pick([
          `${nm}، عدد أصدقائك المتصلين الآن ${f} — تحدَّ أحدهم في مباراة ♟`,
          `أصدقاؤك على الشبكة الآن (${f}) يا ${nm} — مباراة سريعة قبل أن ينصرفوا؟`,
        ]),
        data: { kind: 'adaptive', cat, friends: String(f) }, tag: 'amkh-friends',
      };
    }
    case 'invite': {
      const p = s.invites;
      return {
        title: `لديك ${_nInvites(p)} للعب`,
        body: pick([
          `${nm}، لديك ${_nInvites(p)} للعب — افتح التطبيق واقبل التحدّي ♟`,
          `تحدٍّ جاهز لك يا ${nm} — عدد الدعوات ${p}، وخصمك ينتظر بدء المباراة`,
        ]),
        data: { kind: 'adaptive', cat, invites: String(p) }, tag: 'amkh-invite',
      };
    }
    case 'unread': {
      const c = s.unread;
      return {
        title: `${_nMsgs(c)} بانتظارك`,
        body: pick([
          `${nm}، لديك ${c} من الرسائل غير المقروءة — ردّ وابدأ مباراة ♟`,
          `رسائل جديدة تنتظرك يا ${nm} (${c}) — أصدقاؤك يحدّثونك، تفضّل بالردّ`,
        ]),
        data: { kind: 'adaptive', cat, unread: String(c) }, tag: 'amkh-unread',
      };
    }
    case 'rating': {
      const next = (Math.floor(s.rating / 100) + 1) * 100;
      const gap = next - s.rating;
      const variants = [
        `${nm}، تقييمك ${s.rating} — تفصلك ${_nPoints(gap)} فقط عن ${next}. مباراة مصنّفة واحدة تكفي ♟`,
        `سجلّك: ${s.wins} فوز · ${s.losses} خسارة يا ${nm} — زِد رصيد انتصاراتك اليوم`,
      ];
      if (s.peak > s.rating)
        variants.push(`أعلى تقييم بلغته ${s.peak} يا ${nm}، وتقييمك الآن ${s.rating} — استعِده اليوم`);
      if (s.lastResult === 'win')
        variants.push(`آخر مباراة انتهت بفوزك يا ${nm} (تقييمك الآن ${s.rating}) — واصل، مباراة أخرى؟`);
      if (s.lastResult === 'loss')
        variants.push(`${nm}، خسرت مباراتك الأخيرة — استردّ اعتبارك، وتقييمك ${s.rating} ينتظر التعويض`);
      return {
        title: `تقييمك ${s.rating} ♟`,
        body: pick(variants),
        data: { kind: 'adaptive', cat, rating: String(s.rating) }, tag: 'amkh-rating',
      };
    }
    case 'nour': {
      if (s.nourStars === 0) {
        return {
          title: `نور ينتظر ${nm} ♟`,
          body: pick([
            `${nm}، لم تبدأ رحلتك مع نور بعد — المرحلة الأولى وثلاث نجوم تنتظرك`,
            `نور مستعدّ لتعليمك يا ${nm} — ابدأ المرحلة الأولى، وكل نجمة تقرّبك من الاحتراف`,
          ]),
          data: { kind: 'adaptive', cat, stage: '1' }, tag: 'amkh-nour',
        };
      }
      const n = s.nourNext;
      return {
        title: `${nm}.. المرحلة ${n} مع نور`,
        body: pick([
          `${nm}، جمعت ${_nStars(s.nourStars)} مع نور — والمرحلة ${n} تنتظر إكمالك`,
          `أنجزت ${_nStages(s.nourStages)} يا ${nm}؛ والمرحلة ${n} أصعب قليلًا، هل تجرّبها؟`,
        ]),
        data: { kind: 'adaptive', cat, stage: String(n), stars: String(s.nourStars) }, tag: 'amkh-nour',
      };
    }
    case 'stockfish':
    default: {
      const lvl = _sfLevel(s.rating);
      const variants = [
        `${nm}، تقييمك ${s.rating} — جرّب StockFish بالمستوى ${lvl} اليوم، تحدٍّ في مستواك ♟`,
        `تدريب سريع يا ${nm}: StockFish بالمستوى ${lvl} يصقل حساباتك قبل مباراة مصنّفة`,
      ];
      if (s.ratingGames === 0)
        variants.push(`${nm}، جرّب اللعب ضد StockFish — ابدأ بالمستوى ${lvl} واكتشف مستواك`);
      return {
        title: `تحدّي StockFish ${lvl}`,
        body: pick(variants),
        data: { kind: 'adaptive', cat: 'stockfish', level: String(lvl) }, tag: 'amkh-stockfish',
      };
    }
  }
}

/* لقطة مجتمعية حيّة للمستخدم المجهول (بدون حساب) */
function _communitySnapshot() {
  const online = (db.prepare(`SELECT COUNT(*) AS c FROM presence WHERE is_online = 1`).get() || {}).c || 0;
  const inGame = (db.prepare(`SELECT COUNT(*) AS c FROM presence WHERE in_game = 1`).get() || {}).c || 0;
  const top = db.prepare(`SELECT display_name, username, rating FROM users
                          WHERE rating_games > 0 ORDER BY rating DESC LIMIT 1`).get();
  return {
    online, inGame,
    topName: top ? _firstName(top.display_name || top.username) : null,
    topRating: top ? Math.round(top.rating) : null,
  };
}

function _renderCommunity(c, day, slot) {
  const variants = [];
  if (c.online >= NOTIF.communityMinOnline)
    variants.push({ title: `${_nPlayers(c.online)} على الشبكة`,
                    body: `يوجد ${_nPlayers(c.online)} على الشبكة الآن — ادخل والعب مباراة سريعة ♟` });
  if (c.inGame >= 2)
    variants.push({ title: `${_nPlayers(c.inGame)} في مباراة`,
                    body: `عدد اللاعبين في مباريات الآن ${c.inGame} — حان دورك لدخول الحلبة ♟` });
  if (c.topName && c.topRating)
    variants.push({ title: `أعلى تقييم: ${c.topRating}`,
                    body: `${c.topName} يتصدّر بتقييم ${c.topRating} — هل تستطيع الوصول إليه؟ ابدأ الآن` });
  if (!variants.length) return null;
  const v = variants[_hash('community:' + day + ':' + slot) % variants.length];
  return { title: v.title, body: v.body, data: { kind: 'community' }, tag: 'amkh-community' };
}

async function _notifTick() {
  if (!_adminReady) return;
  const now = new Date();
  const hour = now.getHours();
  if (hour < NOTIF.activeStartHour || hour >= NOTIF.activeEndHour) return;
  const day = _dayNum(now);
  const nowMin = hour * 60 + now.getMinutes();
  const nowMs = now.getTime();

  let all;
  try { all = safeReadTokens(); } catch (e) { return; }
  if (!all || !all.length) return;

  // جمّع التوكِنات حسب المستخدم؛ اللي من غير حساب = مجتمع
  const byUser = new Map();
  const anon = [];
  for (const t of all) {
    if (!t || !t.token) continue;
    if (t.userId != null) {
      const k = String(t.userId);
      if (!byUser.has(k)) byUser.set(k, []);
      byUser.get(k).push(t.token);
    } else anon.push(t.token);
  }

  const getRec = (key) => {
    let r = _notif.get(key);
    if (!r || r.day !== day) { r = { day, fired: new Set(), lastMs: 0 }; _notif.set(key, r); }
    return r;
  };
  // الفتحة الأولى اللي عدّى وقتها ولسه ماتبعتش
  const dueSlot = (slots, fired) => {
    for (let i = 0; i < slots.length; i++) if (!fired.has(i) && nowMin >= slots[i]) return i;
    return -1;
  };

  // ── مستخدمون مسجّلون: محتوى مخصّص ──
  for (const [uid, toks] of byUser) {
    let snap;
    try { snap = buildUserSnapshot(Number(uid)); } catch (e) { snap = null; }
    if (!snap) continue;
    if (snap.isOnline || snap.inGame) continue;        // شغّال دلوقتي، مانزعجوش

    const rec = getRec('u' + uid);
    const planned = _plannedCount(snap);
    if (rec.fired.size >= planned) continue;
    if (nowMs - rec.lastMs < NOTIF.minGapMs) continue;

    const si = dueSlot(_slotMinutes('u' + uid, day, planned), rec.fired);
    if (si < 0) continue;

    const cats = _categories(snap);
    const cat = cats[rec.fired.size % cats.length];
    const msg = _renderNotif(cat, snap, si, day);
    try { await sendPushToTokens(toks, msg); } catch (e) {}
    rec.fired.add(si);
    rec.lastMs = nowMs;
  }

  // ── مجهولون (بدون حساب): نبضة مجتمعية حيّة ──
  if (anon.length) {
    const rec = getRec('community');
    if (rec.fired.size < NOTIF.communityPerDay && nowMs - rec.lastMs >= NOTIF.minGapMs) {
      const si = dueSlot(_slotMinutes('community', day, NOTIF.communityPerDay), rec.fired);
      if (si >= 0) {
        let csnap; try { csnap = _communitySnapshot(); } catch (e) { csnap = null; }
        const msg = csnap ? _renderCommunity(csnap, day, si) : null;
        if (msg) {
          try { await sendPushToTokens(anon, msg); } catch (e) {}
          rec.fired.add(si);
          rec.lastMs = nowMs;
        }
      }
    }
  }
}

function startAdaptiveNotifications() {
  // فحص أول بعد 45 ثانية من الإقلاع، وبعدين كل NOTIF.tickMs
  setTimeout(() => { _notifTick().catch(() => {}); }, 45 * 1000);
  setInterval(() => { _notifTick().catch(() => {}); }, NOTIF.tickMs);
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

/* مُدد التثبيت المؤقّت المسموحة للرسائل (#7) — بالأيام. أي قيمة غيرها
   تُعامَل كتثبيت دائم، فلا يستطيع عميل مُعدَّل أن يثبّت لمدة اعتباطية. */
const PIN_DAYS = [3, 7, 30];

// Health check
/* ══ إعداد WebRTC (STUN + TURN) للمكالمة الصوتية (#135) ══
   بنرجّع iceServers للعميل عشان المكالمة تشتغل على أي شبكة زي واتساب.

   الأولوية 1 — Cloudflare Realtime TURN (المُوصى به): ريلاي عالمي، أول
   1000GB/شهر مجانًا، ونفس حساب Cloudflare بتاع النفق. بنولّد بيانات
   اعتماد مؤقتة من السيرفر (السر مايتسربش للعميل) وبنكاشها ~50 دقيقة.
   محتاج متغيّرين بس: CF_TURN_KEY_ID + CF_TURN_API_TOKEN.

   الأولوية 2 — coturn ذاتي (TURN_HOST + TURN_SECRET) بأسلوب REST
   (use-auth-secret): username="انتهاء:اسم"، credential=base64(HMAC-SHA1).

   من غير أي من الاتنين → STUN بس (يشتغل على نفس الشبكة، وممكن يفشل خلف
   NAT متماثل). STUN من Cloudflare وGoogle. */
let _cfIceCache = null; // { at, servers }
async function cfGenerateIceServers(keyId, apiToken, ttl) {
  const resp = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl }),
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`cloudflare ${resp.status}: ${txt.slice(0, 200)}`);
  const j = JSON.parse(txt);
  let servers = Array.isArray(j.iceServers) ? j.iceServers : [];
  // بورت 53 محجوب من المتصفحات → نشيله عشان مايعلّقش ICE
  servers = servers
    .map(s => {
      if (!s || !s.urls) return s;
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => !/:53(\?|$)/.test(u));
      return Object.assign({}, s, { urls });
    })
    .filter(s => !s.urls || s.urls.length);
  return servers;
}
app.get('/api/webrtc-config', async (req, res) => {
  const stun = [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const ttl = 3600; // ساعة

  // (1) Cloudflare TURN
  const cfKey = process.env.CF_TURN_KEY_ID;
  const cfTok = process.env.CF_TURN_API_TOKEN;
  if (cfKey && cfTok) {
    try {
      if (_cfIceCache && (Date.now() - _cfIceCache.at) < 50 * 60 * 1000) {
        return res.json({ iceServers: _cfIceCache.servers, ttl, turn: true, provider: 'cloudflare' });
      }
      const servers = await cfGenerateIceServers(cfKey, cfTok, ttl);
      _cfIceCache = { at: Date.now(), servers };
      return res.json({ iceServers: servers, ttl, turn: true, provider: 'cloudflare' });
    } catch (e) {
      console.error('[webrtc] cloudflare turn error:', e.message);
      _cfIceCache = null; // نجرّب تاني في الطلب الجاي
    }
  }

  // (2) بيانات اعتماد TURN ثابتة من أي مزوّد مجاني بدون كارت
  //     (ExpressTURN أو Metered static): بنمرّرها زي ما هي.
  //     TURN_STATIC_URLS = قائمة مفصولة بفواصل، + USERNAME + CREDENTIAL
  const sUrls = process.env.TURN_STATIC_URLS;
  const sUser = process.env.TURN_STATIC_USERNAME;
  const sCred = process.env.TURN_STATIC_CREDENTIAL;
  if (sUrls && sUser && sCred) {
    const urls = sUrls.split(',').map(u => u.trim()).filter(Boolean);
    if (urls.length) {
      return res.json({ iceServers: stun.concat([{ urls, username: sUser, credential: sCred }]), ttl, turn: true, provider: 'static' });
    }
  }

  // (3) coturn ذاتي
  const host = process.env.TURN_HOST;
  const secret = process.env.TURN_SECRET;
  if (host && secret) {
    try {
      const username = `${Math.floor(Date.now() / 1000) + ttl}:amkh`;
      const credential = require('crypto').createHmac('sha1', secret).update(username).digest('base64');
      const udpPort = process.env.TURN_PORT || '3478';
      const tlsPort = process.env.TURN_TLS_PORT || '5349';
      const urls = [
        `turn:${host}:${udpPort}?transport=udp`,
        `turn:${host}:${udpPort}?transport=tcp`,
      ];
      if (process.env.TURN_TLS === '1') urls.push(`turns:${host}:${tlsPort}?transport=tcp`);
      return res.json({ iceServers: stun.concat([{ urls, username, credential }]), ttl, turn: true, provider: 'coturn' });
    } catch (e) { console.error('[webrtc] turn cred error:', e.message); }
  }

  // (4) STUN بس
  res.json({ iceServers: stun, ttl, turn: false, provider: 'stun' });
});

/* ══ رفض المكالمة والتطبيق مقفول (#159) ══
   لما المستخدم يضغط «رفض» في إشعار المكالمة والتطبيق مقفول، مفيش سوكت
   مفتوح عنده يبعت call:reject للداعي — فكان الداعي يفضل رانن لحد المهلة.
   الإشعار بيحمل reject_token موقّعًا (JWT قصير العمر 120ث) بيثبت هوية
   المكالمة (الداعي/المستقبِل/معرّف المكالمة)، والتطبيق بيعمل POST هنا،
   فنرحّل call:reject لسوكتات الداعي فورًا فيتوقف الرنين عنده حالًا. */
app.post('/api/call/reject', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const token = req.body && req.body.token;
    if (!token || typeof token !== 'string') return res.status(400).json({ ok: false, error: 'no-token' });
    let d;
    try { d = jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(401).json({ ok: false, error: 'bad-token' }); }
    if (!d || d.t !== 'cr') return res.status(400).json({ ok: false, error: 'bad-type' });
    const caller = Number(d.f), me = Number(d.u);
    const callId = d.c || null;
    const grp = d.g ? Number(d.g) : null;
    if (!Number.isInteger(caller) || caller <= 0) return res.status(400).json({ ok: false, error: 'bad-caller' });
    let sent = 0;
    for (const s of socketsOf(caller)) {
      if (s.readyState === WebSocket.OPEN) { send(s, { type: 'call:reject', from: me, callId, group: grp }); sent++; }
    }
    return res.json({ ok: true, sent });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server' });
  }
});

/* ══ قبول المكالمة من إشعارها والتطبيق مقفول (#159) ══
   زر «رد» بيفتح التطبيق، بس سوكت الحضور بياخد لحظات يتصل وممكن الداعي يكون
   قرّب يخلّص مهلته. فأول ما يُضغط «رد» التطبيق بيعمل POST هنا بتوكيع قبول
   موقّع (JWT قصير 120ث)، فنرحّل call:answering لسوكتات الداعي فورًا — فيعيد
   ضبط مهلته ويفضل يعيد الدعوة لحد ما سوكت المستقبِل يتصل ويقبل فعليًا. نظير
   الرفض بالظبط، بس بدل ما يوقف الرنين بيمدّه لحد ما الرد الحقيقي يوصل. */
app.post('/api/call/answering', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const token = req.body && req.body.token;
    if (!token || typeof token !== 'string') return res.status(400).json({ ok: false, error: 'no-token' });
    let d;
    try { d = jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(401).json({ ok: false, error: 'bad-token' }); }
    if (!d || d.t !== 'ca') return res.status(400).json({ ok: false, error: 'bad-type' });
    const caller = Number(d.f), me = Number(d.u);
    const callId = d.c || null;
    const grp = d.g ? Number(d.g) : null;
    if (!Number.isInteger(caller) || caller <= 0) return res.status(400).json({ ok: false, error: 'bad-caller' });
    let sent = 0;
    for (const s of socketsOf(caller)) {
      if (s.readyState === WebSocket.OPEN) { send(s, { type: 'call:answering', from: me, callId, group: grp }); sent++; }
    }
    return res.json({ ok: true, sent });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server' });
  }
});

/* ══ إصدار التطبيق (#136) ══
   العميل بيسأل عن أحدث إصدار منشور وقت الإقلاع، ولو الإصدار المثبّت
   أقدم بيظهر إشعار «فيه تحديث» بستايل الثيم وصوت خاص. الوسم واسم الملف
   بيتبعوا رقم الإصدار (v3.11 / chess-amkh-3.11.apk) عشان اللي بينزّل
   يدويًا من الموقع يعرف إيه اللي معاه. نبمب LATEST_* هنا مع كل إصدار. */
const LATEST_VERSION = '3.11';
const LATEST_CODE = 27;
const APK_URL = 'https://github.com/12362aa/chess/releases/download/v3.11/chess-amkh-3.11.apk';
app.get('/api/version', (req, res) => {
  res.json({
    version: LATEST_VERSION,
    versionCode: LATEST_CODE,
    url: APK_URL,
    mandatory: false,
    notes: 'أسماء الأصدقاء تظهر كاملة، ومزامنة الاسم والصورة بعد التثبيت، ولوحة مفاتيح مستقرّة على الأجهزة اللوحية، ومحادثة بملء الشاشة على الهاتف واللوحي. صار بإمكانك مشاهدة مباريات أصدقائك المحلية أيضًا — أمام نور أو المحرّك أو لاعبين على جهاز واحد. وأُضيف تثبيت المحادثات لمدّة محدّدة يُلغى تلقائيًا، وظهور فوري لرسائل الحفلات مع إرسال مؤجَّل يعمل دون اتصال، وقائمة رسالة أنيقة بالضغط المطوّل، وإعدادات خصوصية مُنفَّذة فعليًا.',
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
   التقييم + علَم الدولة (اختيار يدوي). التصميم فاخر وثابت (مش تابع للثيم) على العميل.

   #12 — «لوحة التصنيف يجب أن تكون متكاملة»: الأرقام كانت ناقصة لسببين:
   (أ) الشرط كان rating_games >= 1 فاللي لعبوا مباريات ودّية بس ماكانوش
       بيظهروا خالص رغم إن عندهم انتصارات حقيقية.
   (ب) العمود «مباريات» كان rating_games (المصنّفة بس) بينما
       فوز/خسارة/تعادل بتحسب كل المباريات، فالمجموع مايطابقش العدد.
   دلوقتي: games = فوز+خسارة+تعادل (كل المباريات)، وrated_games منفصل،
   ونسبة الفوز محسوبة على السيرفر، وترتيب اختياري (sort). */
app.get('/api/leaderboard', (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!isFinite(limit) || limit <= 0) limit = 100;
    limit = Math.min(limit, 200);
    const sort = ['rating', 'wins', 'games'].includes(String(req.query.sort || '')) ? String(req.query.sort) : 'rating';
    const order = sort === 'wins'
      ? 'wins DESC, (rating - 2 * rating_rd) DESC'
      : sort === 'games'
        ? '(wins + losses + draws) DESC, (rating - 2 * rating_rd) DESC'
        : '(rating - 2 * rating_rd) DESC, rating_games DESC, wins DESC';
    const rows = db.prepare(`
      SELECT id, display_name, username, provider, avatar_url, country,
             rating, rating_rd, rating_games, rating_peak, wins, losses, draws
      FROM users
      WHERE rating_games >= 1 OR (COALESCE(wins,0) + COALESCE(losses,0) + COALESCE(draws,0)) >= 1
      ORDER BY ${order}
      LIMIT ?`).all(limit);
    const out = rows.map((u, i) => {
      const rd = isFinite(u.rating_rd) ? u.rating_rd : 350;
      const wins = u.wins || 0, losses = u.losses || 0, draws = u.draws || 0;
      const games = wins + losses + draws;
      return {
        rank: i + 1,
        id: u.id,
        name: resolveOnlineName(u),
        avatar_url: u.avatar_url || null,
        country: u.country || null,
        rating: Math.round(isFinite(u.rating) ? u.rating : 1500),
        provisional: rd > 110 || !(u.rating_games > 0),
        peak: Math.round(isFinite(u.rating_peak) ? u.rating_peak : 1500),
        games,
        rated_games: u.rating_games || 0,
        wins, losses, draws,
        win_rate: games ? Math.round((wins / games) * 100) : 0,
      };
    });
    res.json({ players: out, sort, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[leaderboard] failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ══ ملف لاعب عام (#17) ══
   بيغذّي صفحة «الملف الشخصي» جوه المباراة على نمط chess.com: التقييم
   والأعلى والسلسلة الحالية وتوزيع الألوان وآخر المباريات. عام (بدون
   توكن) لأنه بيانات لعب مش بيانات خاصة — ومافيهوش إيميل ولا أي هوية
   خاصة، بالضبط زي بقية الواجهات العامة. */
app.get('/api/profile/:id', (req, res) => {
  const uid = parseInt(req.params.id, 10);
  if (!Number.isInteger(uid) || uid <= 0) return res.status(400).json({ error: 'لاعب غير صالح' });
  try {
    const u = db.prepare(`SELECT id, display_name, username, provider, avatar_url, country, created_at,
                                 rating, rating_rd, rating_vol, rating_games, rating_peak, wins, losses, draws
                            FROM users WHERE id = ?`).get(uid);
    if (!u) return res.status(404).json({ error: 'لاعب غير موجود' });
    const stats = ratingStore.statsOf(uid);
    const games = ratingStore.recentGames(uid, 12);
    /* الترتيب العالمي: عدد اللي أمامه بالتقييم المتحفّظ + 1 */
    let rank = null;
    try {
      const rd = isFinite(u.rating_rd) ? u.rating_rd : 350;
      const me = (isFinite(u.rating) ? u.rating : 1500) - 2 * rd;
      const ahead = db.prepare(`SELECT COUNT(*) AS c FROM users
                                 WHERE (rating_games >= 1 OR (COALESCE(wins,0)+COALESCE(losses,0)+COALESCE(draws,0)) >= 1)
                                   AND (rating - 2 * rating_rd) > ?`).get(me).c;
      rank = ahead + 1;
    } catch (e) {}
    res.json({
      player: {
        id: u.id,
        name: resolveOnlineName(u),
        avatar_url: u.avatar_url || null,
        country: u.country || null,
        joined_at: u.created_at || null,
        status: liveStatus(u.id) || 'offline',
      },
      rating: ratingStore.publicRating(u),
      rank,
      stats,
      games,
    });
  } catch (e) {
    console.error('[profile] failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Groq proxy (keep API key off the frontend)
/* مولّد نصّي عام عبر Groq — allam-2-7b هو الوحيد اللي بيرد عربي موثوق
   (اتأكدنا حيًّا: gpt-oss بيرد كوري/إنجليزي وqwen روسي). بنحصّن بسلسلة
   بدائل: لو الموديل اتشال (404/model_not_found) أو رجّع محتوى فاضي
   (موديلات التفكير بتضيّع التوكنز) نجرّب اللي بعده فالميزة ماتقفش.
   مستخدَم من /api/groq/chat (شات نور) ومن محرّك الإشعارات الذكي (#173). */
async function groqComplete(messages, opts = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { content: null, raw: null, detail: 'no-key' };
  const requested = typeof opts.model === 'string' && opts.model.trim() ? opts.model.trim() : 'allam-2-7b';
  const chain = [requested, 'allam-2-7b', 'openai/gpt-oss-120b'].filter((m, i, a) => a.indexOf(m) === i);
  let lastDetail = 'no attempt';
  for (const model of chain) {
    const payload = { model, messages };
    if (Number.isFinite(opts.max_tokens)) payload.max_tokens = Math.max(1, Math.min(2048, Math.floor(opts.max_tokens)));
    if (Number.isFinite(opts.temperature)) payload.temperature = Math.max(0, Math.min(2, opts.temperature));
    /* gpt-oss بيضيّع كل التوكنز في «التفكير» ويرجّع فاضي — reasoning_effort:low بيخلّيه يرجّع نص */
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
    let content = '';
    try { const j = JSON.parse(text); content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''; }
    catch (e) { lastDetail = `[${model}] bad json`; continue; }
    if (!content.trim()) { lastDetail = `[${model}] empty content`; continue; }
    return { content, raw: text, model, detail: 'ok' };
  }
  return { content: null, raw: null, detail: lastDetail };
}

app.post('/api/groq/chat', async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || !messages.length) return res.status(400).json({ error: 'Missing messages[]' });
    const r = await groqComplete(messages, { model: body.model, max_tokens: body.max_tokens, temperature: body.temperature });
    if (r.content && r.raw) { res.setHeader('Content-Type', 'application/json'); return res.status(200).send(r.raw); }
    return res.status(502).json({ error: 'كل موديلات الذكاء الاصطناعي فشلت', detail: r.detail });
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
  /* مباريات الأصدقاء بتربط كل سوكتات الطرفين بالكود (مش سوكت واحد)،
     فحذف member.ws لوحده كان بيسيب ربطات شبح تخلّي liveStatus ترجّع
     «في مباراة» بعد ما الغرفة تتحذف — أصل الباج التدميري. */
  for (const [s, c] of [...clientRoom]) if (c === code) clientRoom.delete(s);
  try { endSpectating(room); } catch (e) {}
  rooms.delete(code);
  for (const uid of [room.hostId, room.guestId]) {
    if (uid) { try { broadcastPresence(uid); } catch (e) {} }
  }
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
    /* #17: هوية الخصم عشان شريط اللاعب يفتح بطاقته الكاملة جوّه المباراة */
    oppId: room.guestId || null,
    myId: room.hostId || null,
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
    oppId: room.hostId || null,
    myId: room.guestId || null,
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
    host: makeMember(aWs, aColor, resolveOnlineNameById(aId, aInfo?.name), aInfo?.deviceId || ''),
    guest: makeMember(bWs, bColor, resolveOnlineNameById(bId, bInfo?.name), bInfo?.deviceId || ''),
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
  toSpectators(room, { type: 'spectate:flag', loser: loserColor });
  /* سقوط الراية = نهاية مؤكّدة من السيرفر نفسه: نحسمها فورًا (إحصاء
     وتقييم وتحرير حالة «في مباراة») بدل ما نستنّى بلاغ من الأجهزة. */
  finalizeGame(room, loserColor === 'w' ? 'b' : 'w', 'timeout');
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
  /* جوه مباراة = عنده سوكت مرتبط بغرفة شغّالة، أو أبلّغ إنه في مباراة
     محلية (نور/المحرّك/بلوتوث) عبر presence:activity — الأصدقاء لازم
     يشوفوا «في مباراة» في الحالتين، مش «متصل» فقط. */
  const inGame = socks.some(s => {
    if (s._localGame) return true;
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

/* الدردشة بتستخدم نفس statusOf عشان قائمة المحادثات تعرض الحضور الحقيقي،
   و push عشان التفاعلات (#3) توصل للطرف التاني لحظيًا. */
chatRouter.setRealtime({
  statusOf: liveStatus,
  push(userId, payload) {
    let delivered = false;
    for (const s of socketsOf(userId)) {
      if (s.readyState === WebSocket.OPEN) { send(s, payload); delivered = true; }
    }
    return delivered;
  },
});

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
/* الاسم الظاهر للأصدقاء في الأونلاين (#145): مستخدم داخل بجوجل → اسم جوجل
   (display_name)؛ غير كده → الاسم المستعار (username) اللي بيتعدّل من الإعدادات
   ("اسمك للأصدقاء"). الاسم المستعار للعرض في الأونلاين بس. مفيش رجوع لـ"صديق"
   إلا لو مفيش أي اسم أصلًا. */
function resolveOnlineName(row) {
  if (!row) return 'صديق';
  if (row.provider === 'google') return row.display_name || row.username || 'صديق';
  return row.username || row.display_name || 'صديق';
}

/* نفس القاعدة لكن بالـ id: للأونلاين (لاعب مسجَّل) نجيب الاسم من قاعدة البيانات
   عشان اسم الخصم على الشريط يبقى صحيح مهما بعت العميل. لو مش مسجَّل (LAN/ضيف)
   نرجع للاسم اللي بعته العميل. */
function resolveOnlineNameById(userId, fallbackName) {
  if (userId) {
    try {
      const row = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(userId);
      if (row) return resolveOnlineName(row);
    } catch (e) {}
  }
  return fallbackName || 'لاعب';
}

/* لقطة مختصرة للرسالة الأصل عند الرد عليها (#130): اسم صاحبها + معاينة.
   scope='chat' يقرأ من messages، scope='group' من group_messages. */
function replySnippet(scope, id) {
  try {
    const tbl = scope === 'group' ? 'group_messages' : 'messages';
    const r = db.prepare(`SELECT id, sender_id, body, kind FROM ${tbl} WHERE id = ?`).get(id);
    if (!r) return null;
    const u = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(r.sender_id) || {};
    const preview = r.kind === 'voice' ? 'رسالة صوتية'
                  : r.kind === 'image' ? 'صورة'
                  : r.kind === 'video' ? 'فيديو'
                  : String(r.body || '').slice(0, 120);
    return { id: r.id, from: r.sender_id, name: resolveOnlineName(u), kind: r.kind || 'text', preview };
  } catch (e) { return null; }
}

/* ── منشِن (@) — #2 ──
   العميل بيبعت مصفوفة هويات المذكورين مع الرسالة؛ إحنا مانثقش فيها:
   بنصفّيها على القائمة المسموحة (صاحب المحادثة الفردية أو أعضاء الحفلة)،
   وبنشيل التكرار وصاحب الرسالة نفسه. النتيجة بتتخزّن JSON في عمود
   mentions عشان التمييز وعدّاد «ذكروك» يفضلوا بعد إعادة فتح الشات. */
function sanitizeMentions(raw, allowed, selfId) {
  if (!Array.isArray(raw) || !raw.length) return [];
  const ok = new Set((allowed || []).map(Number));
  const me = Number(selfId);
  const out = [];
  for (const v of raw.slice(0, 60)) {
    const id = Number(v);
    if (!Number.isInteger(id) || id <= 0 || id === me) continue;
    if (!ok.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= 30) break;
  }
  return out;
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
  const members = groupsRouter.memberIds(groupId);
  const mentions = sanitizeMentions(spec && spec.mentions, members, fromId);
  const info = db.prepare(`INSERT INTO group_messages (group_id, sender_id, kind, body, audio_data, duration, mime, reply_to, mentions)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                 .run(groupId, fromId, kind, body, audio, duration, mime, replyTo,
                      mentions.length ? JSON.stringify(mentions) : null);
  const row = db.prepare(`SELECT id, created_at FROM group_messages WHERE id = ?`).get(info.lastInsertRowid);
  const sender = db.prepare('SELECT display_name, username, avatar_url, provider FROM users WHERE id = ?').get(fromId) || {};
  const senderName = resolveOnlineName(sender);
  const payload = {
    type: 'group:message', id: row.id, group_id: groupId,
    from: fromId, sender_name: senderName, sender_avatar: sender.avatar_url || null,
    kind, body, created_at: row.created_at, client_id: clientId || null,
    reply_to: replyTo, reply: replyTo ? replySnippet('group', replyTo) : null,
    mentions,
  };
  if (hasMedia) { payload.audio = audio; payload.duration = duration || 0; payload.mime = mime; }

  const offline = [];
  const offlineMentioned = [];
  const deliveredTo = [];
  for (const uid of members) {
    const socks = socketsOf(uid).filter(s => s.readyState === WebSocket.OPEN);
    if (socks.length) { for (const s of socks) send(s, payload); if (uid !== fromId) deliveredTo.push(uid); }
    else if (uid !== fromId) (mentions.includes(uid) ? offlineMentioned : offline).push(uid);
  }
  /* إشعار دفع للأعضاء غير المتصلين (#64 للجروبات). */
  if (offline.length) {
    try { sendGroupPushToUsers(groupId, fromId, senderName, kind, body, offline); } catch (e) {}
  }
  /* المذكور بالاسم بياخد إشعارًا أوضح («ذكرك») عشان مايفوتهوش (#2). */
  if (offlineMentioned.length) {
    try { sendGroupPushToUsers(groupId, fromId, senderName, kind, body, offlineMentioned, true); } catch (e) {}
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
function sendGroupPushToUsers(groupId, fromId, senderName, kind, body, userIds, mentioned) {
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
    body: senderName + (mentioned ? ' ذكرك: ' : ': ') + preview,
    tag: 'group-' + groupId,
    data: { kind: 'group', group_id: String(groupId), from_id: String(fromId), group_name: groupName },
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
  const mentions = sanitizeMentions(spec && spec.mentions, [toId], fromId);
  const info = db.prepare(`INSERT INTO messages (convo_key, sender_id, recipient_id, body, kind, audio_data, duration, mime, reply_to, mentions)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                 .run(key, fromId, toId, body, kind, audio, duration, mime, replyTo,
                      mentions.length ? JSON.stringify(mentions) : null);
  const row = db.prepare(`SELECT id, created_at FROM messages WHERE id = ?`).get(info.lastInsertRowid);
  const senderRow = db.prepare('SELECT display_name, username, avatar_url, provider FROM users WHERE id = ?').get(fromId) || {};
  const payload = {
    type: 'chat:message', id: row.id, convo_key: key,
    from: fromId, sender_name: resolveOnlineName(senderRow), sender_avatar: senderRow.avatar_url || null,
    to: toId, kind, body, created_at: row.created_at, client_id: clientId || null,
    reply_to: replyTo, reply: replyTo ? replySnippet('chat', replyTo) : null,
    mentions,
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
  if (!delivered) { try { sendChatPushToUser(fromId, toId, kind, body, mentions.includes(Number(toId))); } catch (e) {} }
  else { console.log('[push] SKIP chat push: user %s has an OPEN socket (delivered live)', toId); }
  return { row, key, delivered };
}

/* إشعار دفع برسالة دردشة لمستخدم غير متصل. بنجيب اسم المُرسِل ونبعت
   FCM لكل توكِنات المستقبِل المرتبطة بحسابه. */
function sendChatPushToUser(fromId, toId, kind, body, mentioned) {
  if (!_adminReady) return;
  const tokens = getTokensForUser(toId);
  console.log('[push] chat push -> user %s : %d linked token(s)', toId, tokens.length);
  if (!tokens.length) return;
  const sender = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(fromId) || {};
  const name = resolveOnlineName(sender);
  const preview = kind === 'voice' ? 'رسالة صوتية'
                : kind === 'image' ? 'صورة'
                : kind === 'video' ? 'فيديو'
                : String(body || '').slice(0, 120);
  sendPushToTokens(tokens, {
    title: name,
    body: mentioned ? ('ذكرك: ' + preview) : preview,
    tag: 'chat-' + fromId,
    /* from_name: عشان التطبيق يفتح الشات باسم المرسِل فورًا لما يُنقر
       الإشعار، من غير ما يستنى قائمة الأصدقاء تتحمّل. */
    data: { kind: 'chat', from_id: String(fromId), from_name: name },
  });
}

/* إشعار دفع بمكالمة واردة لمستخدم غير متصل بأي سوكت (التطبيق/التلفون مقفول) — #147.
   بيستعمل نفس مسار FCM الشغّال بأولوية عالية وصوت. الوسم فريد لكل داعٍ عشان
   إشعار المكالمة ما يستبدلش إشعارات الرسايل. */
const _callPushAt = new Map();   // آخر وقت بعتنا فيه إشعار مكالمة لكل (داعٍ→مستقبِل)
function sendCallPushToUser(fromId, toId, group, callId, callType) {
  if (!_adminReady) return;
  /* الداعي بيعيد الدعوة كل ~3ث (#147) — منخنق إشعار الدفع لمرة كل 25ث لكل
     زوج (داعٍ→مستقبِل) عشان ما نغرقش المستخدم بإشعارات مكررة لنفس المكالمة. */
  const now = Date.now();
  const key = fromId + ':' + toId;
  if (now - (_callPushAt.get(key) || 0) < 25000) return;
  _callPushAt.set(key, now);
  if (_callPushAt.size > 200) { for (const [k, t] of _callPushAt) { if (now - t > 60000) _callPushAt.delete(k); } }
  const tokens = getTokensForUser(toId);
  console.log('[push] call push -> user %s : %d linked token(s)', toId, tokens.length);
  if (!tokens.length) return;
  const sender = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(fromId) || {};
  const name = resolveOnlineName(sender);
  const isVideo = callType === 'video';
  const body = isVideo
    ? (group ? 'يدعوك لمكالمة فيديو في حفلة…' : 'مكالمة فيديو واردة…')
    : (group ? 'يدعوك لمكالمة صوتية في حفلة…' : 'مكالمة صوتية واردة…');
  /* توكيع رفض قصير العمر: يثبت هوية المكالمة عشان زر «رفض» في الإشعار
     يقدر يرحّل call:reject للداعي حتى والتطبيق مقفول (#159). */
  let rejectToken = '';
  try {
    rejectToken = jwt.sign(
      { t: 'cr', f: fromId, u: toId, c: callId ? String(callId) : '', g: group ? String(group) : '' },
      JWT_SECRET, { expiresIn: '120s' }
    );
  } catch (e) {}
  /* توكيع قبول قصير العمر: زر «رد» يبلّغ الداعي فورًا إن المستقبِل جايّ
     (POST /api/call/answering) فيعيد ضبط مهلته ويفضل ينادي لحد ما يتصل (#159). */
  let acceptToken = '';
  try {
    acceptToken = jwt.sign(
      { t: 'ca', f: fromId, u: toId, c: callId ? String(callId) : '', g: group ? String(group) : '' },
      JWT_SECRET, { expiresIn: '120s' }
    );
  } catch (e) {}
  sendPushToTokens(tokens, {
    title: name,
    body,
    tag: 'call-' + fromId,
    dataOnly: true,
    data: {
      kind: 'call',
      from_id: String(fromId),
      from_name: name,
      group: group ? String(group) : '',
      call_id: callId ? String(callId) : '',
      call_type: isVideo ? 'video' : 'audio',
      reject_token: rejectToken,
      accept_token: acceptToken,
    },
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

/* ══════════════════════════════════════════════════════════════════════
   وضع المشاهدة (متفرّج على مباراة صديق)
   ──────────────────────────────────────────────────────────────────────
   المتفرّج مش عضو في الغرفة: مايبعتش نقلات ومايقدرش يأثّر على المباراة.
   بنسجّله في مجموعة متفرّجين للغرفة، ونبعتله لقطة كاملة عند الدخول
   (الأسماء، الألوان، كل النقلات من البداية، الساعة) وبعدين كل نقلة
   لحظيًا. اللاعبين بيتبلّغوا بعدد المتفرّجين — مفيش مشاهدة سرّية.
   الأمان: لازم يكون صديق لأحد اللاعبين، ومش متحاظر، والخصوصية بتسمح.
══════════════════════════════════════════════════════════════════════ */
const roomSpectators = new Map();   /* code → Set<ws> */
const spectatorRoom = new Map();    /* ws → code */

function spectatorsOf(code) {
  const set = roomSpectators.get(code);
  return set ? [...set] : [];
}

function spectatorSnapshot(room) {
  const nameOf = (side) => (room[side] && room[side].name) || 'لاعب';
  const hostIsWhite = room.host && room.host.color === 'w';
  return {
    type: 'spectate:started',
    room: room.code,
    rated: !!room.rated,
    white: hostIsWhite ? nameOf('host') : nameOf('guest'),
    black: hostIsWhite ? nameOf('guest') : nameOf('host'),
    white_id: hostIsWhite ? room.hostId : room.guestId,
    black_id: hostIsWhite ? room.guestId : room.hostId,
    moves: (room.mvLog || []).slice(),
    tc: room.tc || null,
    clock: room.clock ? { w: room.clock.w, b: room.clock.b, turn: room.clock.turn, running: !!room.clock.running } : null,
    ended: !!room.ended,
  };
}

/* عدد المتفرّجين للاعبين (شفافية) وللمتفرّجين نفسهم */
function pushWatcherCount(room) {
  if (!room) return;
  const count = spectatorsOf(room.code).length;
  const payload = { type: 'spectate:watchers', count };
  const seen = new Set();
  for (const side of ['host', 'guest']) {
    const uid = side === 'host' ? room.hostId : room.guestId;
    const list = uid ? socketsOf(uid) : [room[side] && room[side].ws];
    for (const w of list) {
      if (!w || seen.has(w) || w.readyState !== WebSocket.OPEN) continue;
      seen.add(w); send(w, payload);
    }
  }
  for (const s of spectatorsOf(room.code)) {
    if (s.readyState === WebSocket.OPEN) send(s, payload);
  }
}

function toSpectators(room, payload) {
  if (!room) return;
  for (const s of spectatorsOf(room.code)) {
    if (s.readyState === WebSocket.OPEN) send(s, payload);
    else removeSpectator(s);
  }
}

function removeSpectator(ws) {
  const code = spectatorRoom.get(ws);
  if (!code) return null;
  spectatorRoom.delete(ws);
  const set = roomSpectators.get(code);
  if (set) { set.delete(ws); if (!set.size) roomSpectators.delete(code); }
  return code;
}

function endSpectating(room) {
  if (!room) return;
  const code = room.code;
  for (const s of spectatorsOf(code)) {
    if (s.readyState === WebSocket.OPEN) send(s, { type: 'spectate:end', reason: 'game-over' });
    spectatorRoom.delete(s);
  }
  roomSpectators.delete(code);
}

/* الغرفة الشغّالة اللي المستخدم ده جواها دلوقتي (لو موجودة) */
function activeRoomOfUser(userId) {
  for (const room of rooms.values()) {
    if (room.kind !== 'online' || !room.started || room.ended) continue;
    if (room.hostId === Number(userId) || room.guestId === Number(userId)) return room;
  }
  /* مافيش غرفة أونلاين؟ يمكن يكون في مباراة محلية بيبثّها (#5) */
  const g = localGames.get(Number(userId));
  if (g && !g.ended && Date.now() - (g.at || 0) < LOCAL_STALE_MS) return g;
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   بثّ المباريات المحلية للمتفرّجين (#5)
   ──────────────────────────────────────────────────────────────────────
   نور والمحرّك واللاعبان على جهاز واحد والبلوتوث مش غرف على السيرفر،
   فالصديق كان يشوف زرّ «مشاهدة» (لأن الحضور بيقول «في مباراة») وبعدين
   ياخد «صديقك ليس في مباراة الآن» — وده اللي أزعج المستخدم.

   الحل: اللاعب نفسه بيسجّل «غرفة خفيفة» بنفس شكل غرفة الأونلاين
   (أسماء + ألوان + سجل نقلات)، فكل مواسير المشاهدة الموجودة (اللقطة،
   النقلة اللحظية، عدّاد المتفرّجين، النهاية) تشتغل عليها بلا أي تغيير
   في العميل المتفرّج. السيرفر ناقل بس: مايحسبش نقلات ومايثّرش على
   المباراة، والمتفرّج قراءة فقط زي الأونلاين بالظبط.

   الكود ثابت لكل لاعب (L<id>) فأي مباراة جديدة على نفس الجهاز بتلاقي
   المتفرّجين مستنيين وتبعتلهم لقطة الجديدة من غير ما يعملوا حاجة.
══════════════════════════════════════════════════════════════════════ */
const localGames = new Map();    /* userId → غرفة خفيفة */
const localByCode = new Map();   /* code → نفس الغرفة */
const LOCAL_MOVES_MAX = 600;     /* سقف السجل عشان الذاكرة */
const LOCAL_STALE_MS = 6 * 3600 * 1000;

function localCode(userId) { return 'L' + Number(userId); }

/* غرفة بالكود: أونلاين أو محلية */
function roomByCode(code) {
  if (!code) return null;
  return rooms.get(code) || localByCode.get(code) || null;
}

/* نقلة نظيفة من العميل — أي حاجة غلط تترمي بدل ما تخرّب لوح المتفرّج */
function sanitizeLocalMove(m) {
  if (!m) return null;
  const sq = (v) => Array.isArray(v) && v.length === 2
    && [0, 1].every(i => Number.isInteger(Number(v[i])) && Number(v[i]) >= 0 && Number(v[i]) <= 7);
  if (!sq(m.fr) || !sq(m.to)) return null;
  const promo = /^[QRBN]$/.test(String(m.promo || '')) ? String(m.promo) : null;
  return { fr: [Number(m.fr[0]), Number(m.fr[1])], to: [Number(m.to[0]), Number(m.to[1])], promo };
}

function endLocalGame(userId, reason, text) {
  const g = localGames.get(Number(userId));
  if (!g) return false;
  g.ended = true;
  for (const s of spectatorsOf(g.code)) {
    if (s.readyState === WebSocket.OPEN) send(s, { type: 'spectate:end', reason: reason || 'game-over', text: text || '' });
    spectatorRoom.delete(s);
  }
  roomSpectators.delete(g.code);
  localGames.delete(Number(userId));
  localByCode.delete(g.code);
  /* خلصت المباراة وهو لسه على الشاشة؟ حالته ترجع «متصل» فورًا، وإلا
     الصديق يفضل شايف زرّ «مشاهدة» على مباراة مانتهت — نفس الطريق
     المسدود بالظبط. البثّ هو مصدر الحقيقة لحالة «في مباراة» المحلية. */
  if (g.ws && g.ws._localGame) {
    g.ws._localGame = false;
    g.ws._localKind = '';
    try { broadcastPresence(Number(userId)); } catch (e) {}
  }
  return true;
}

/* ══════════════════════════════════════════════════════════════════════
   تحرير حالة «في مباراة» عند نهاية المباراة
   ──────────────────────────────────────────────────────────────────────
   الباج التدميري: beginFriendGame بيربط كل سوكتات الطرفين بكود الغرفة
   (clientRoom)، والغرفة بتفضل في الذاكرة، ومحدّش كان بيبثّ الحضور عند
   نهاية المباراة إلا داخل pushRatingUpdate — واللي مابيتنفّذش أصلًا في
   المباريات الودّية (غير المصنّفة)، وهي الافتراضي. النتيجة: عمود
   presence.in_game بيفضل 1 وعملاء الأصدقاء بيفضلوا شايفين «في مباراة»
   بعد ما المباراة تخلص، فزرّ الدعوة بيقعد مقفول ومايقدروش يلعبوا تاني.

   endOnlineRoom بتقفل الدايرة في كل مسارات النهاية: تعلّم الغرفة منتهية،
   توقف الساعة، تفكّ ربط كل سوكت مربوط بالكود (عشان liveStatus ماترجّعش
   'in-game' تاني ولو الغرفة فضلت في الذاكرة)، وتبثّ الحضور الجديد
   للطرفين. releaseSockets=false بتسيب الربط عشان الشات داخل المباراة
   والمراجعة يفضلوا شغّالين لحد ما اللاعب يسيب الشاشة. */
function endOnlineRoom(room, opts) {
  if (!room) return;
  const releaseSockets = !!(opts && opts.releaseSockets);
  try {
    room.ended = true;
    if (!room.endedAt) room.endedAt = Date.now();
    try { stopClock(room); } catch (e) {}
    if (releaseSockets && room.code) {
      for (const [s, c] of [...clientRoom]) if (c === room.code) clientRoom.delete(s);
    }
    /* المتفرّجين: المباراة خلصت فبنبلّغهم ونفضّهم. */
    try { endSpectating(room); } catch (e) {}
    /* البثّ لازم يحصل ولو الغرفة كانت معلّمة منتهية قبل كده — لأن اللي
       كان ناقص هو البثّ نفسه مش العلامة. */
    for (const uid of [room.hostId, room.guestId]) {
      if (uid) { try { broadcastPresence(uid); } catch (e) {} }
    }
  } catch (e) {
    console.error('[presence] endOnlineRoom failed:', e.message);
  }
}

/* ── مسّاح ذاتي الإصلاح للحضور ──
   خط الدفاع الأخير: أي مستخدم مكتوب في القاعدة إنه in_game=1 لكن
   السوكتات الحقيقية بتقول غير كده (أو مفيش سوكتات خالص) بيتصلّح ويُبثّ
   من تاني. ده بيصلّح الحسابات المعلّقة من قبل التحديث كمان، بلا أي
   تدخّل من المستخدم. */
setInterval(() => {
  try {
    const rows = db.prepare(`SELECT user_id, status FROM presence
                             WHERE in_game = 1 OR is_online = 1`).all();
    for (const r of rows) {
      const live = liveStatus(r.user_id) || 'offline';
      if (live !== r.status) broadcastPresence(r.user_id, live);
    }
  } catch (e) {}
}, 40 * 1000);


function beginFriendGame(invite, hostWs, guestWs) {
  let hostColor = invite.color;
  if (hostColor !== 'w' && hostColor !== 'b') hostColor = Math.random() < 0.5 ? 'w' : 'b';
  const guestColor = hostColor === 'w' ? 'b' : 'w';

  const hostRow = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(invite.from_id) || {};
  const guestRow = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(invite.to_id) || {};

  leaveRoom(hostWs);
  leaveRoom(guestWs);

  const code = genCode('online');
  const room = {
    kind: 'online',
    code,
    hostId: invite.from_id,
    guestId: invite.to_id,
    rated: !!invite.rated,
    host: makeMember(hostWs, hostColor, resolveOnlineName(hostRow), ''),
    guest: makeMember(guestWs, guestColor, resolveOnlineName(guestRow), ''),
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
  for (const s of hostSockets) send(s, { type: 'start', yourColor: room.host.color, oppName: room.guest.name || 'الخصم', room: code, rated: !!room.rated, tc: room.tc || null, oppRating: gR, myRating: hR, oppId: room.guestId || null, myId: room.hostId || null });
  for (const s of guestSockets) send(s, { type: 'start', yourColor: room.guest.color, oppName: room.host.name || 'الخصم', room: code, rated: !!room.rated, tc: room.tc || null, oppRating: hR, myRating: gR, oppId: room.hostId || null, myId: room.guestId || null });
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
  const myRow = ratingStore.getUserRating.get(userId);
  /* عدد المباريات المصنّفة بعد دي وكام باقي على نهاية مرحلة المعايرة.
     اللاعب لازم يعرف إن حركة أول 10 مباريات أكبر عن قصد — ده اللي
     كان مربكه لما التقييم بيقفز فجأة. */
  const games = myRow ? (myRow.rating_games || 0) : 0;
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
    games,
    calib_left: Math.max(0, ratingStore.CALIB_GAMES - games),
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

/* ══════════════════════════════════════════════════════════════════════
   إغلاق المباراة: إحصاء + تقييم + تحرير الحضور — نقطة واحدة لكل المسارات
   ──────────────────────────────────────────────────────────────────────
   كان في مسارَي نهاية منفصلين (اتفاق الطرفين / استسلام‑قطع اتصال) وكل
   واحد بينادي التقييم لوحده، والتقييم بيرجع فورًا لو المباراة ودّية —
   فلا إحصاء ولا بثّ حضور. finalizeGame بتوحّدهم:
     1) recordPlayed: تسجّل النتيجة في game_log وتزوّد ف/خ/ت (#12).
     2) finalizeRatedGame: تقييم Glicko للمصنّفة بس (النزاهة زي ما هي).
     3) endOnlineRoom: تحرّر حالة «في مباراة» وتبلّغ المتفرّجين (#7).
══════════════════════════════════════════════════════════════════════ */
function finalizeGame(room, winnerColor, reason) {
  if (!room) return;
  if (!['w', 'b', 'draw'].includes(winnerColor)) { endOnlineRoom(room); return; }

  /* الإحصاء أولًا (مرة واحدة لكل غرفة) */
  if (!room.statsDone && room.kind === 'online' && room.hostId && room.guestId
      && room.hostId !== room.guestId) {
    room.statsDone = true;
    const hostIsWhite = room.host && room.host.color === 'w';
    const whiteId = hostIsWhite ? room.hostId : room.guestId;
    const blackId = hostIsWhite ? room.guestId : room.hostId;
    const winner = winnerColor === 'draw' ? 'draw' : (winnerColor === 'w' ? 'white' : 'black');
    try {
      const st = ratingStore.recordPlayed(whiteId, blackId, winner, reason, {
        rated: !!room.rated, tc: room.tc || null, moves: room.mvLog || room.moves,
      });
      /* المباريات الودّية مالهاش rating:update، فبنبعت تحديث إحصاء
         عشان أرقام الملف الشخصي ولوحة التصنيف تتجدّد فورًا. */
      if (st && !room.rated) {
        pushStatsUpdate(whiteId, st.white, winner === 'draw' ? 'draw' : (winner === 'white' ? 'win' : 'loss'));
        pushStatsUpdate(blackId, st.black, winner === 'draw' ? 'draw' : (winner === 'black' ? 'win' : 'loss'));
      }
    } catch (e) { console.error('[stats] finalizeGame failed:', e.message); }
  }

  finalizeRatedGame(room, winnerColor, reason);
  endOnlineRoom(room);
}

function pushStatsUpdate(userId, stats, outcome) {
  if (!userId || !stats) return;
  const payload = { type: 'stats:update', outcome, stats };
  for (const s of socketsOf(userId)) {
    if (s.readyState === WebSocket.OPEN) send(s, payload);
  }
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
  if (room.kind !== 'online') return;
  if (room.ratingDone && room.statsDone) return;

  const winnerColor = reportToWinnerColor(room, side, msg.result);
  if (!winnerColor) return;

  room.reports = room.reports || {};
  room.reports[side] = winnerColor;

  const other = side === 'host' ? 'guest' : 'host';
  const reason = (msg.reason || '').toString().slice(0, 40) || 'game-over';

  if (room.reports[other]) {
    // الطرفان أبلغا: نصنّف بس لو اتفقوا
    if (room.reports[other] === winnerColor) {
      finalizeGame(room, winnerColor, reason);
    } else {
      console.warn(`[rating] room ${room.code} disputed result — not rated`);
      room.ratingDone = true; // نزاع: نتجنّب التصنيف عشان ماحدش يغش
      room.statsDone = true;  // ولا إحصاء كمان — النتيجة نفسها مش موثوقة
      endOnlineRoom(room);    // بس الحضور لازم يتحرّر في كل الأحوال (#7)
    }
  } else {
    /* طرف واحد لسه: نستنّى تأكيد الطرف التاني (أو انسحاب/قطع اتصال).
       بس المباراة خلصت فعلًا على شاشته، فلازم نوقف الساعة ونعلّمها
       منتهية — والحضور يتحرّر لأن ده كان بيخلّي الاتنين «في مباراة»
       للأبد لو الطرف التاني قفل التطبيق قبل ما يبلّغ. */
    stopClock(room);
    endOnlineRoom(room);
  }
}

/* استسلام أو قطع اتصال = خسارة للطرف ده (سلطة كافية، بلا انتظار). */
function finalizeOnLeave(room, side, reason) {
  if (!room || room.kind !== 'online') return;
  if (room.ratingDone && room.statsDone) { endOnlineRoom(room); return; }
  stopClock(room);
  const other = side === 'host' ? 'guest' : 'host';
  // لو الطرف التاني أبلغ نتيجة قبل كده، نحترمها بدل ما نفترض خسارة
  if (room.reports && room.reports[other]) {
    finalizeGame(room, room.reports[other], reason || 'reported');
    return;
  }
  const loserColor = room[side] && room[side].color;
  const winnerColor = loserColor === 'w' ? 'b' : 'w';
  finalizeGame(room, winnerColor, reason || 'resign');
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
               تبقى صح لحظة الفتح على أي جهاز. الحفلات كانت ناقصة تمامًا
               (#1): مافيش by_group، فشارة الجروب ماكانتش تظهر غير بعد
               ما تفتح المحادثة. */
            try {
              const rows = db.prepare(`SELECT sender_id AS friend_id, COUNT(*) AS count,
                                              SUM(CASE WHEN mentions LIKE ? THEN 1 ELSE 0 END) AS mentions
                                       FROM messages
                                       WHERE recipient_id = ? AND read_at IS NULL GROUP BY sender_id`)
                                .all(`%"${userId}"%`, userId);
              let total = rows.reduce((s, r) => s + r.count, 0);
              let groupRows = [];
              try {
                groupRows = db.prepare(`
                  SELECT m.group_id,
                         COUNT(*) AS count,
                         SUM(CASE WHEN m.mentions LIKE ? THEN 1 ELSE 0 END) AS mentions
                    FROM group_messages m
                    JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = ?
                    LEFT JOIN group_reads gr ON gr.group_id = m.group_id AND gr.user_id = ?
                   WHERE m.sender_id <> ?
                     AND m.id > COALESCE(gr.last_read_id, 0)
                   GROUP BY m.group_id`).all(`%"${userId}"%`, userId, userId, userId);
                total += groupRows.reduce((s, r) => s + r.count, 0);
              } catch (e) {}
              send(ws, { type: 'chat:unread', total, by_friend: rows, by_group: groupRows });
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

      /* ══ نشاط محلي: نور / المحرّك / بلوتوث (#13) ══
         الأوضاع دي مش غرف على السيرفر، فالصديق كان بيبان «متصل» وهو
         أصلاً وسط مباراة. العميل بيبلّغ بنفسه، والسيرفر بيعلّم السوكت
         فـliveStatus ترجّع «في مباراة». العلامة على السوكت نفسه فبتتنظّف
         تلقائيًا مع أي قطع اتصال. */
      case 'presence:activity': {
        const userId = socketUser.get(ws);
        if (!userId) break;
        const on = !!msg.in_game;
        const kind = (msg.kind || '').toString().slice(0, 16);
        if (ws._localGame === on && ws._localKind === kind) break;
        ws._localGame = on;
        ws._localKind = on ? kind : '';
        /* خرج من الشاشة → البثّ المحلي يقف والمتفرّجين يعرفوا (#5) */
        if (!on) { try { endLocalGame(userId, 'player-left'); } catch (e) {} }
        try { broadcastPresence(userId); } catch (e) {}
        break;
      }

      /* ══ اللاعب سبب شاشة المباراة (#7) ══
         أهم رسالة في إصلاح الباج التدميري: قبل كده الغرفة كانت تفضل
         مربوطة بسوكتات الطرفين لحد ما السوكت يقفل — وسوكت الحضور
         مابيقفلش لأنه مشترك مع الأصدقاء والدردشة. فالاتنين يفضلوا
         «في مباراة» للأبد. دلوقتي الخروج من الشاشة بيفكّ الربط فورًا. */
      case 'game:leave': {
        const code = clientRoom.get(ws);
        const userId = socketUser.get(ws);
        const room = code ? rooms.get(code) : null;
        /* غرف LAN ليها بروتوكول استعادة خاص (resume) فمانلمسهاش */
        if (room && room.kind === 'lan') break;
        clientRoom.delete(ws);
        if (userId && code) {
          for (const s of socketsOf(userId)) if (clientRoom.get(s) === code) clientRoom.delete(s);
        }
        if (room && room.kind === 'online') {
          /* المباراة خلصت فعلًا؟ نسيبها تنتهي بهدوء. لسه شغّالة؟ يبقى
             ده انسحاب صريح فبنحسمه لصالح الخصم. */
          if (room.started && !room.ended && (!room.ratingDone || !room.statsDone)) {
            const side = room.hostId === userId ? 'host' : (room.guestId === userId ? 'guest' : null);
            if (side) { try { finalizeOnLeave(room, side, 'leave'); } catch (e) {} }
            else endOnlineRoom(room, { releaseSockets: true });
          } else {
            endOnlineRoom(room, { releaseSockets: true });
          }
        }
        if (userId) { try { broadcastPresence(userId); } catch (e) {} }
        break;
      }

      /* ══ وضع المشاهدة (#14) ══
         المتفرّج بيتفرّج على مباراة صديقه من غير ما يأثّر عليها.
         الشروط: مسجّل، صديق لأحد اللاعبين، مش متحاظر، والمباراة شغّالة،
         وخصوصية اللاعب بتسمح. ومحدّش بيتفرّج في السرّ: الطرفين بياخدوا
         عدد المتفرّجين. */
      case 'spectate:start': {
        const me = socketUser.get(ws);
        if (!me) { send(ws, { type: 'spectate:error', error: 'سجّل الدخول أولًا' }); break; }
        const target = Number(msg.friend_id || msg.user_id || 0);
        if (!target) { send(ws, { type: 'spectate:error', error: 'صديق غير صحيح' }); break; }
        if (target === me) { send(ws, { type: 'spectate:error', error: 'لا يمكنك مشاهدة نفسك' }); break; }
        let ok = false;
        try {
          ok = !!db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(me, target);
          if (ok) {
            const blocked = db.prepare(`SELECT 1 FROM friend_blocks
                                        WHERE (blocker_id = ? AND blocked_id = ?)
                                           OR (blocker_id = ? AND blocked_id = ?)`).get(me, target, target, me);
            if (blocked) ok = false;
          }
        } catch (e) { ok = false; }
        if (!ok) { send(ws, { type: 'spectate:error', error: 'يمكنك مشاهدة أصدقائك فقط' }); break; }
        const room = activeRoomOfUser(target);
        if (!room) { send(ws, { type: 'spectate:error', error: 'صديقك ليس في مباراة الآن' }); break; }
        /* اللاعب التاني لازم يكون مسموح كمان: لو محاظر المتفرّج مانوريهوش */
        const otherId = room.hostId === target ? room.guestId : room.hostId;
        if (otherId && otherId !== me) {
          try {
            const b2 = db.prepare(`SELECT 1 FROM friend_blocks
                                   WHERE (blocker_id = ? AND blocked_id = ?)
                                      OR (blocker_id = ? AND blocked_id = ?)`).get(me, otherId, otherId, me);
            if (b2) { send(ws, { type: 'spectate:error', error: 'لا يمكن مشاهدة هذه المباراة' }); break; }
          } catch (e) {}
        }
        if (room.hostId === me || room.guestId === me) {
          send(ws, { type: 'spectate:error', error: 'أنت أحد لاعبي هذه المباراة' }); break;
        }
        removeSpectator(ws);
        if (!roomSpectators.has(room.code)) roomSpectators.set(room.code, new Set());
        roomSpectators.get(room.code).add(ws);
        spectatorRoom.set(ws, room.code);
        send(ws, spectatorSnapshot(room));
        pushWatcherCount(room);
        /* بلاغ لطيف للاعبين بمين دخل يتفرّج */
        try {
          const meRow = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(me) || {};
          const nm = meRow.display_name || meRow.username || 'صديق';
          for (const uid of [room.hostId, room.guestId]) {
            if (!uid) continue;
            for (const s of socketsOf(uid)) send(s, { type: 'spectate:joined', name: nm, user_id: me });
          }
        } catch (e) {}
        break;
      }

      case 'spectate:stop': {
        const code = removeSpectator(ws);
        if (code) pushWatcherCount(roomByCode(code));
        break;
      }

      /* ══ بثّ مباراة محلية (#5) ══
         العميل بيبلّغ ببداية المباراة (نور/المحرّك/لاعبان/بلوتوث) وبعدين
         بكل نقلة. السيرفر بيحفظ سجل النقلات وبيوزّعه على المتفرّجين بنفس
         رسائل الأونلاين. مافيش أي تحقّق من قانونية النقلة هنا — المباراة
         محلية بالكامل والمتفرّج عنده نفس محرّك القواعد فأي نقلة غلط
         بيتجاهلها بدل ما يخرّب لوحه. */
      case 'local:begin': {
        const userId = socketUser.get(ws);
        if (!userId) break;
        const clean = (v, d) => {
          const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 48);
          return s || d;
        };
        const color = msg.color === 'b' ? 'b' : 'w';
        const code = localCode(userId);
        const g = {
          code, kind: 'local', localKind: String(msg.kind || 'local').slice(0, 16),
          started: true, ended: false, rated: false, tc: null, clock: null,
          host: { name: clean(msg.white, 'الأبيض'), color: 'w' },
          guest: { name: clean(msg.black, 'الأسود') },
          hostId: color === 'b' ? null : userId,
          guestId: color === 'b' ? userId : null,
          owner: userId, ws, mvLog: [], at: Date.now(),
        };
        const prev = localGames.get(userId);
        if (prev) localByCode.delete(prev.code);
        localGames.set(userId, g);
        localByCode.set(code, g);
        /* البثّ نفسه بيثبّت حالة «في مباراة»: العميل بيبعت presence:activity
           مرة واحدة لكل نوع (مابيكرّرهاش لو أعاد نفس النوع)، فلو اعتمدنا
           عليها لوحدها كانت مباراة تانية على نفس الجهاز تفضل بلا حالة.
           هنا الحالة بتتولد من واقع مباراة مسجّلة فعلًا — فالزرّ عند
           الصديق يظهر لو فيه حاجة تتشاهد بس. */
        if (!ws._localGame || ws._localKind !== g.localKind) {
          ws._localGame = true;
          ws._localKind = g.localKind;
          try { broadcastPresence(userId); } catch (e) {}
        }
        /* متفرّج كان على المباراة اللي خلصت؟ ياخد لقطة الجديدة فورًا */
        for (const s of spectatorsOf(code)) {
          if (s.readyState === WebSocket.OPEN) send(s, spectatorSnapshot(g));
        }
        pushWatcherCount(g);
        break;
      }

      case 'local:move': {
        const userId = socketUser.get(ws);
        const g = userId ? localGames.get(userId) : null;
        if (!g || g.ended) break;
        const mv = sanitizeLocalMove(msg);
        if (!mv) break;
        g.at = Date.now();
        if (g.mvLog.length < LOCAL_MOVES_MAX) g.mvLog.push(mv);
        toSpectators(g, Object.assign({ type: 'spectate:move' }, mv));
        break;
      }

      /* تراجع أو أي تصحيح: العميل بيبعت السجل كامل والمتفرّج يبني اللوح
         من الأول — أضمن من محاولة تتبّع التراجع نقلة بنقلة. */
      case 'local:sync': {
        const userId = socketUser.get(ws);
        const g = userId ? localGames.get(userId) : null;
        if (!g || g.ended) break;
        if (!Array.isArray(msg.moves)) break;
        g.mvLog = msg.moves.slice(0, LOCAL_MOVES_MAX).map(sanitizeLocalMove).filter(Boolean);
        g.at = Date.now();
        for (const s of spectatorsOf(g.code)) {
          if (s.readyState === WebSocket.OPEN) send(s, spectatorSnapshot(g));
        }
        break;
      }

      case 'local:end': {
        const userId = socketUser.get(ws);
        if (!userId) break;
        endLocalGame(userId, String(msg.reason || 'game-over').slice(0, 24), String(msg.text || '').slice(0, 90));
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
        if (msg.type === 'call:invite') { out.kind = (msg.callType === 'video') ? 'video' : 'audio'; out.members = Array.isArray(msg.members) ? msg.members.slice(0, 12).map(Number) : null; }
        if (sdp) out.sdp = sdp;
        if (cand) out.candidate = cand;

        let delivered = false;
        for (const s of socketsOf(to)) {
          if (s.readyState === WebSocket.OPEN) { send(s, out); delivered = true; }
        }
        /* رجّع للداعي حالة التوصيل عشان يعرف الطرف متصل ولا لأ */
        if (msg.type === 'call:invite') {
          send(ws, { type: 'call:invite-ack', to, callId: msg.callId || null, delivered });
          /* الطرف مش متصل بأي سوكت (تطبيق مقفول) → إشعار دفع بمكالمة واردة (#147)
             مع نوع المكالمة + توكيع رفض عشان أزرار الإشعار تشتغل فعليًا (#159/#160) */
          if (!delivered) { try { sendCallPushToUser(me, to, groupId, msg.callId, msg.callType); } catch (e) {} }
        }
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
        if (Array.isArray(msg.mentions)) spec.mentions = msg.mentions;
        try {
          if (!chatRouter.areFriends(me, to) || chatRouter.blockedBetween(me, to)) {
            send(ws, { type: 'chat:error', reason: 'not-friend', client_id: clientId });
            break;
          }
          /* إعداد «من يمكنه مراسلتي» بيتنفّذ هنا — مش في الواجهة بس. لو
             المستلم مقفّل المراسلة، الرسالة ماتتخزّنش من الأصل. */
          if (!privacyRouter.canMessage(me, to)) {
            send(ws, { type: 'chat:error', reason: 'privacy', client_id: clientId });
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
            /* إيصالات القراءة زي واتساب بالظبط: لو طرف قافلها، مايبعتش
               إيصال ومايستقبلش. فالإيصال بيوصل لو الاتنين مفتوحين. */
            if (privacyRouter.readReceiptsOn(me) && privacyRouter.readReceiptsOn(from)) {
              for (const s of socketsOf(from)) send(s, { type: 'chat:read-receipt', by: me, convo_key: key });
            }
          }
        } catch (e) {}
        break;
      }

      /* ══ تثبيت/فك تثبيت رسالة 1:1 (#132 + #7): الطرفان يقدروا ══
         msg.days: ٣ أو ٧ أو ٣٠ = تثبيت مؤقّت ينتهي وحده، وأي شيء آخر
         (٠/غياب) = دائم. القيمة تُقصَر على الخيارات المسموحة فقط. */
      case 'chat:pin': {
        const me = socketUser.get(ws);
        const to = Number(msg.to);
        const id = Number(msg.id);
        const pin = !!msg.pin;
        const days = PIN_DAYS.includes(Number(msg.days)) ? Number(msg.days) : 0;
        if (!me || !Number.isInteger(to) || to <= 0 || !Number.isInteger(id) || id <= 0) break;
        try {
          if (!chatRouter.areFriends(me, to) || chatRouter.blockedBetween(me, to)) break;
          const key = chatRouter.convoKey(me, to);
          const m = db.prepare('SELECT id FROM messages WHERE id = ? AND convo_key = ?').get(id, key);
          if (!m) break;
          if (!pin) {
            db.prepare(`UPDATE messages SET pinned_at = NULL, pinned_until = NULL WHERE id = ?`).run(id);
          } else if (days) {
            db.prepare(`UPDATE messages SET pinned_at = datetime('now'),
                        pinned_until = datetime('now', '+' || ? || ' days') WHERE id = ?`).run(days, id);
          } else {
            db.prepare(`UPDATE messages SET pinned_at = datetime('now'), pinned_until = NULL WHERE id = ?`).run(id);
          }
          const until = pin ? (db.prepare('SELECT pinned_until AS u FROM messages WHERE id = ?').get(id) || {}).u : null;
          const payload = { type: 'chat:pinned', convo_key: key, with: me, id, pinned: pin, pinned_until: until || null, by: me };
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
        if (Array.isArray(msg.mentions)) spec.mentions = msg.mentions;
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
          const sender = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(me) || {};
          const name = resolveOnlineName(sender);
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
          const sender = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(me) || {};
          const name = resolveOnlineName(sender);
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

      /* ══ تثبيت/فك تثبيت رسالة حفلة (#132 + #7): المشرفون بس ══ */
      case 'group:pin': {
        const me = socketUser.get(ws);
        const gid = Number(msg.group_id);
        const id = Number(msg.id);
        const pin = !!msg.pin;
        const days = PIN_DAYS.includes(Number(msg.days)) ? Number(msg.days) : 0;
        if (!me || !Number.isInteger(gid) || gid <= 0 || !Number.isInteger(id) || id <= 0) break;
        try {
          if (!groupsRouter.isAdmin(gid, me)) { send(ws, { type: 'group:error', reason: 'admins-only', group_id: gid }); break; }
          const m = db.prepare('SELECT id FROM group_messages WHERE id = ? AND group_id = ?').get(id, gid);
          if (!m) break;
          if (!pin) {
            db.prepare(`UPDATE group_messages SET pinned_at = NULL, pinned_until = NULL WHERE id = ?`).run(id);
          } else if (days) {
            db.prepare(`UPDATE group_messages SET pinned_at = datetime('now'),
                        pinned_until = datetime('now', '+' || ? || ' days') WHERE id = ?`).run(days, id);
          } else {
            db.prepare(`UPDATE group_messages SET pinned_at = datetime('now'), pinned_until = NULL WHERE id = ?`).run(id);
          }
          const until = pin ? (db.prepare('SELECT pinned_until AS u FROM group_messages WHERE id = ?').get(id) || {}).u : null;
          const payload = { type: 'group:pinned', group_id: gid, id, pinned: pin, pinned_until: until || null, by: me };
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
          host: makeMember(ws, hostColor, resolveOnlineNameById(hostId, msg.name), msg.deviceId || ''),
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

        const guestId = socketUser.get(ws) || userIdFromToken(msg.token) || null;
        room.guest = makeMember(ws, room.guestColor, resolveOnlineNameById(guestId, msg.name), msg.deviceId || '');
        room.guestId = guestId;
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
            stopClock(room);
            finalizeOnLeave(room, side, 'resign');   // المنسحب يخسر
            toSpectators(room, { type: 'spectate:resign', side, color: room[side] && room[side].color });
          }
          if (msg.type === 'move') {
            /* بنسجّل النقلة بصيغتين: نصّية للأرشيف، وإحداثيات للمتفرّجين
               عشان يقدروا يعيدوا بناء اللوح من البداية. */
            recordMove(room, msg.move != null ? msg.move : (msg.san || msg.uci || null));
            if (msg.fr != null && msg.to != null) {
              if (!room.mvLog) room.mvLog = [];
              if (room.mvLog.length < 600) {
                room.mvLog.push({ fr: msg.fr, to: msg.to, promo: msg.promo || null });
              }
            }
            if (room.clock) onClockMove(room, room[side] && room[side].color);
            toSpectators(room, {
              type: 'spectate:move', fr: msg.fr, to: msg.to, promo: msg.promo || null,
              clock: room.clock ? { w: room.clock.w, b: room.clock.b, turn: room.clock.turn } : null,
            });
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
              body = `${fromName} أدّى نقلته. افتح المباراة وردّ عليه`;
              tag = 'your-turn';
            } else if (msg.type === 'chat') {
              title = 'رسالة جديدة';
              body = `${fromName}: ${(msg.text || 'رسالة').toString().slice(0, 70)}`;
              tag = 'chat';
            } else if (msg.type === 'voice') {
              title = 'رسالة صوتية';
              body = `${fromName} أرسل إليك رسالة صوتية — افتح المحادثة للاستماع`;
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
    /* المتفرّج مش لاعب: بيتشال من قائمة المشاهدة بلا أي أثر على المباراة */
    try {
      const specCode = removeSpectator(ws);
      if (specCode) pushWatcherCount(roomByCode(specCode));
    } catch (e) {}
    /* السوكت الناقل لمباراة محلية قفل → المتفرّجين ياخدوا نهاية نظيفة (#5) */
    try {
      const lg = userId ? localGames.get(Number(userId)) : null;
      if (lg && lg.ws === ws) endLocalGame(userId, 'player-left');
    } catch (e) {}
    const info = getRoomAndSide(ws);
    if (info && info.room.kind === 'lan') {
      handleLanDisconnect(ws);
    } else {
      /* قطع الاتصال في مباراة أونلاين لسه شغّالة = خسارة للمنقطع،
         بس بشرط إنه اتفصل فعلاً (مش لسه فاتح على جهاز تاني). */
      if (info && info.room.kind === 'online' && info.room.started && !info.room.ended
          && (!info.room.ratingDone || !info.room.statsDone)
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

/* ══ مغادرة الغرفة ══
   مباريات الأصدقاء بتربط كل سوكتات اللاعب بالغرفة، وسوكت الحضور بيتغيّر
   مع أي رعشة شبكة. فالمقارنة بالسوكت وحدها كانت بتفسّر «سوكت قديم قفل»
   على إنه «اللاعب مشي»، فتمسح الغرفة أو تصفّر room.guest وسط المباراة —
   والعكس: تسيب ربطات شبح تخلّي liveStatus ترجّع «في مباراة» للأبد. */
function leaveRoom(ws) {
  const code = clientRoom.get(ws);
  if (!code) return;
  clientRoom.delete(ws);
  const room = rooms.get(code);
  if (!room) return;

  const uid = socketUser.get(ws) || null;
  let side = null;
  if (room.host && room.host.ws === ws) side = 'host';
  else if (room.guest && room.guest.ws === ws) side = 'guest';
  else if (uid && room.hostId === uid) side = 'host';
  else if (uid && room.guestId === uid) side = 'guest';
  if (!side) return;

  /* لسه متصل بسوكت تاني على نفس الغرفة (جهاز تاني/إعادة اتصال) →
     دي مش مغادرة، بس نحدّث السوكت المرجعي للطرف. */
  if (uid) {
    const alive = socketsOf(uid).filter(s => s !== ws && s.readyState === WebSocket.OPEN
      && clientRoom.get(s) === code);
    if (alive.length) {
      if (room[side] && room[side].ws === ws) room[side].ws = alive[0];
      return;
    }
  }

  /* أبلغ الخصم باستسلام اللاعب */
  const oppSide = side === 'host' ? 'guest' : 'host';
  const opp = room[oppSide] && room[oppSide].ws;
  if (opp && opp.readyState === WebSocket.OPEN) {
    send(opp, { type: 'resign' });
  }
  toSpectators(room, { type: 'spectate:end', reason: 'player-left' });

  if (side === 'host') {
    /* المضيف غادر → الغرفة تنتهي */
    endOnlineRoom(room, { releaseSockets: true });
    rooms.delete(code);
    if (room.guest && room.guest.ws) clientRoom.delete(room.guest.ws);
    try { endSpectating(room); } catch (e) {}
  } else {
    /* الضيف غادر — نرجع الغرفة لانتظار ضيف جديد (ماتش‑ميكينج/كود) */
    room.guest = null;
    endOnlineRoom(room, { releaseSockets: true });
  }
  for (const uidX of [room.hostId, room.guestId]) {
    if (uidX) { try { broadcastPresence(uidX); } catch (e) {} }
  }
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

/* ══ كنس التثبيت المؤقّت المنتهي (#7) ══
   واتساب بيثبّت لمدة ٢٤ ساعة/٧ أيام/٣٠ يومًا ثم يفكّ التثبيت وحده. هنا
   الكنس يمسح pinned_at/pinned_until لأي رسالة مضى وقتها، ويبثّ للطرفين
   (أو لأعضاء الحفلة) عشان شريط «مثبّتة» يختفي عندهم بلا إعادة فتح.
   والاستعلامات كمان بتتجاهل المنتهي، فحتى لو التطبيق كان مقفولًا وقت
   الانتهاء بيلاقيه مفكوكًا عند أوّل فتح. */
function sweepExpiredPins() {
  try {
    const dms = db.prepare(`SELECT id, convo_key FROM messages
                            WHERE pinned_at IS NOT NULL AND pinned_until IS NOT NULL
                              AND pinned_until <= datetime('now')`).all();
    for (const row of dms) {
      db.prepare(`UPDATE messages SET pinned_at = NULL, pinned_until = NULL WHERE id = ?`).run(row.id);
      const ids = String(row.convo_key || '').split(':').map(Number).filter(Number.isInteger);
      for (const uid of ids) {
        const other = ids.find(x => x !== uid);
        for (const s of socketsOf(uid)) {
          send(s, { type: 'chat:pinned', convo_key: row.convo_key, with: other, id: row.id, pinned: false, pinned_until: null, expired: true });
        }
      }
    }
    const grp = db.prepare(`SELECT id, group_id FROM group_messages
                            WHERE pinned_at IS NOT NULL AND pinned_until IS NOT NULL
                              AND pinned_until <= datetime('now')`).all();
    for (const row of grp) {
      db.prepare(`UPDATE group_messages SET pinned_at = NULL, pinned_until = NULL WHERE id = ?`).run(row.id);
      for (const uid of groupsRouter.memberIds(row.group_id)) {
        for (const s of socketsOf(uid)) {
          send(s, { type: 'group:pinned', group_id: row.group_id, id: row.id, pinned: false, pinned_until: null, expired: true });
        }
      }
    }
    return dms.length + grp.length;
  } catch (e) { return 0; }
}
const pinSweeper = setInterval(sweepExpiredPins, Math.max(1000, Number(process.env.AMKH_PIN_SWEEP_MS) || 60000));
if (pinSweeper.unref) pinSweeper.unref();
try { sweepExpiredPins(); } catch (e) {}

/* ══ Start ══ */
/* عند إقلاع السيرفر مفيش أي سوكت متصل، فأي صف حضوره is_online=1 هو
   بقايا قديمة من قبل آخر ريستارت. من غير المسح ده صاحبك يفضل يبان
   «متصل» و«آخر ظهور» متجمّد على وقت الريستارت (مشكلة «متصل منذ 3 ساعات»).
   بنصفّرهم كلهم offline؛ اللي يتصل فعلاً يرجع online من presence:hello. */
try {
  db.prepare(`UPDATE presence SET is_online = 0, status = 'offline', in_game = 0`).run();
} catch (e) { console.error('[presence] startup reset failed:', e.message); }

/* منفذ اختبار: لو AMKH_NO_LISTEN=1 مابنسمعش على البورت وبنصدّر دوال محرّك
   الإشعارات التكيّفي (#173) عشان نختبرها على قاعدة مؤقتة من غير ما نشغّل
   السيرفر كامل. في التشغيل العادي مافيش أي فرق. */
if (process.env.AMKH_NO_LISTEN === '1') {
  module.exports = {
    buildUserSnapshot, _renderNotif, _categories, _plannedCount,
    _slotMinutes, _sfLevel, _communitySnapshot, _renderCommunity, _notifTick,
  };
} else {
  server.listen(PORT, () => {
    console.log(`♟ Chess server running on port ${PORT}`);
    try{
      if (_adminReady) startAdaptiveNotifications();
    }catch(e){}
  });
}
