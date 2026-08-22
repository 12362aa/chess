/* ══════════════════════════════════════════════════════════════════════
   دردشة الأصدقاء — HTTP
   ──────────────────────────────────────────────────────────────────────
   نفس قواعد friends.js:
   • الإيميل مابيخرجش من هنا خالص — الهوية العامة username + الاسم المعروض.
   • الحظر بيتحقّق بالاتجاهين، والدردشة بين أصدقاء بس.
   • الرسايل في القاعدة (جدول messages) فبتفضل بعد تسجيل الخروج والدخول.
   • الوقت الحقيقي (إرسال/استقبال/إيصالات) بيتعمل على الـWebSocket في
     server.js. هنا HTTP للسجل والعدّادات بس (قراءات كتيرة مش مكانها السوكت).
   • الترتيب من messages.id التصاعدي (سلطة السيرفر) مش من ساعة الجهاز،
     والتصفّح بالمفتاح (id < before) مش OFFSET.
══════════════════════════════════════════════════════════════════════ */
const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

/* server.js بيحقن statusOf عشان نغني حالة الصديق (نفس فكرة friends.js). */
let realtime = { statusOf() { return null; } };
function setRealtime(rt) {
  realtime = Object.assign({ statusOf() { return null; } }, rt || {});
}

function toId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* مفتاح المحادثة: نفس القيمة للطرفين مهما كان اتجاه الرسالة. */
function convoKey(a, b) {
  const x = Number(a), y = Number(b);
  return Math.min(x, y) + ':' + Math.max(x, y);
}

function areFriends(a, b) {
  return !!db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(a, b);
}
function blockedBetween(a, b) {
  return !!db.prepare(`SELECT 1 FROM friend_blocks
                       WHERE (blocker_id = ? AND blocked_id = ?)
                          OR (blocker_id = ? AND blocked_id = ?)`).get(a, b, b, a);
}

function decorateStatus(row) {
  const live = realtime.statusOf(row.id);
  const status = live || (row.is_online ? (row.in_game ? 'in-game' : 'online') : 'offline');
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url || null,
    provider: row.provider || 'local',
    status,
    online: status !== 'offline',
    last_seen_at: row.last_seen_at || null,
  };
}

/* ── قائمة المحادثات ──
   لكل صديق ليه رسايل: بياناته العامة + آخر رسالة + عدد غير المقروء. */
router.get('/conversations', authenticateToken, (req, res) => {
  const me = req.user.id;
  try {
    const friends = db.prepare(`
      SELECT ${'u.id, u.username, u.display_name, u.avatar_url, u.provider'},
             p.is_online, p.in_game, p.last_seen_at
      FROM friendships f
      JOIN users u ON u.id = f.friend_id
      LEFT JOIN presence p ON p.user_id = u.id
      WHERE f.user_id = ?`).all(me);

    const out = [];
    for (const fr of friends) {
      const key = convoKey(me, fr.id);
      const last = db.prepare(`SELECT id, sender_id, body, created_at, kind FROM messages
                               WHERE convo_key = ? ORDER BY id DESC LIMIT 1`).get(key);
      if (!last) continue;   /* بس المحادثات اللي فيها رسايل */
      const unread = db.prepare(`SELECT COUNT(*) AS c FROM messages
                                 WHERE convo_key = ? AND recipient_id = ? AND read_at IS NULL`).get(key, me).c;
      out.push({
        friend: decorateStatus(fr),
        last_message: (last.kind === 'voice') ? 'رسالة صوتية' : (last.kind === 'image') ? 'صورة' : (last.kind === 'video') ? 'فيديو' : last.body,
        last_kind: last.kind || 'text',
        last_from_me: last.sender_id === me,
        last_at: last.created_at,
        last_id: last.id,
        unread,
      });
    }
    /* الأحدث فوق */
    out.sort((a, b) => (b.last_id || 0) - (a.last_id || 0));
    res.json(out);
  } catch (e) {
    console.error('[chat] conversations failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── سجل محادثة ──
   تصفّح بالمفتاح: أحدث صفحة أولًا، و before=<id> بيجيب الأقدم منه. */
router.get('/history', authenticateToken, (req, res) => {
  const me = req.user.id;
  const other = toId(req.query.with);
  if (!other) return res.status(400).json({ error: 'صديق غير صالح' });
  if (!areFriends(me, other) || blockedBetween(me, other)) return res.status(403).json({ error: 'مش متاح' });

  const before = toId(req.query.before);
  let limit = Number(req.query.limit) || 30;
  if (limit < 1) limit = 1; if (limit > 100) limit = 100;
  const key = convoKey(me, other);

  try {
    const cols = 'id, sender_id, recipient_id, body, created_at, read_at, kind, audio_data, duration, mime';
    const rows = before
      ? db.prepare(`SELECT ${cols} FROM messages
                    WHERE convo_key = ? AND id < ? ORDER BY id DESC LIMIT ?`).all(key, before, limit)
      : db.prepare(`SELECT ${cols} FROM messages
                    WHERE convo_key = ? ORDER BY id DESC LIMIT ?`).all(key, limit);
    rows.reverse();   /* للعرض: الأقدم فوق */
    const messages = rows.map(m => ({
      id: m.id,
      from: m.sender_id,
      to: m.recipient_id,
      mine: m.sender_id === me,
      kind: m.kind || 'text',
      body: m.body,
      audio: m.audio_data || null,
      duration: m.duration || 0,
      mime: m.mime || '',
      created_at: m.created_at,
      read: !!m.read_at,
    }));
    res.json({ messages, has_more: rows.length === limit });
  } catch (e) {
    console.error('[chat] history failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── عدّاد غير المقروء ── */
router.get('/unread', authenticateToken, (req, res) => {
  const me = req.user.id;
  try {
    const rows = db.prepare(`SELECT sender_id AS friend_id, COUNT(*) AS count FROM messages
                             WHERE recipient_id = ? AND read_at IS NULL GROUP BY sender_id`).all(me);
    const total = rows.reduce((s, r) => s + r.count, 0);
    res.json({ total, by_friend: rows });
  } catch (e) {
    console.error('[chat] unread failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── تعليم رسايل صديق كمقروءة (احتياطي لـ chat:read على السوكت) ── */
router.post('/read', authenticateToken, (req, res) => {
  const me = req.user.id;
  const other = toId(req.body && req.body.with);
  if (!other) return res.status(400).json({ error: 'صديق غير صالح' });
  const key = convoKey(me, other);
  try {
    const info = db.prepare(`UPDATE messages SET read_at = datetime('now')
                             WHERE convo_key = ? AND recipient_id = ? AND sender_id = ? AND read_at IS NULL`)
                   .run(key, me, other);
    res.json({ ok: true, updated: info.changes });
  } catch (e) {
    console.error('[chat] read failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
module.exports.setRealtime = setRealtime;
module.exports.convoKey = convoKey;
module.exports.areFriends = areFriends;
module.exports.blockedBetween = blockedBetween;
