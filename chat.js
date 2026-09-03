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

/* server.js بيحقن statusOf عشان نغني حالة الصديق (نفس فكرة friends.js)،
   و push عشان نبلّغ الطرف التاني بالتفاعلات لحظيًا. */
let realtime = { statusOf() { return null; }, push() { return false; } };
function setRealtime(rt) {
  realtime = Object.assign({ statusOf() { return null; }, push() { return false; } }, rt || {});
}

function toId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* اسم العرض في الأونلاين: مستخدم جوجل → الاسم من جوجل (display_name)؛ غير كده
   → الاسم المستعار (username) من الإعدادات. نفس قاعدة resolveOnlineName في
   server.js/groups.js عشان الاسم يبقى موحَّد. */
function resolveOnlineName(row) {
  if (!row) return 'صديق';
  if (row.provider === 'google') return row.display_name || row.username || 'صديق';
  return row.username || row.display_name || 'صديق';
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
   لكل صديق ليه رسايل: بياناته العامة + آخر رسالة + عدد غير المقروء
   + هل المحادثة مثبّتة + عدد الرسايل غير المقروءة اللي فيها منشن ليك. */
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

    const pins = new Map();
    try {
      for (const r of db.prepare(`SELECT target_id, pinned_at FROM chat_pins
                                  WHERE user_id = ? AND kind = 'dm'`).all(me)) {
        pins.set(r.target_id, r.pinned_at);
      }
    } catch (e) {}

    const out = [];
    for (const fr of friends) {
      const key = convoKey(me, fr.id);
      const last = db.prepare(`SELECT id, sender_id, body, created_at, kind FROM messages
                               WHERE convo_key = ? ORDER BY id DESC LIMIT 1`).get(key);
      if (!last) continue;   /* بس المحادثات اللي فيها رسايل */
      const unread = db.prepare(`SELECT COUNT(*) AS c FROM messages
                                 WHERE convo_key = ? AND recipient_id = ? AND read_at IS NULL`).get(key, me).c;
      let mentions = 0;
      try {
        mentions = db.prepare(`SELECT COUNT(*) AS c FROM messages
                               WHERE convo_key = ? AND recipient_id = ? AND read_at IS NULL
                                 AND mentions LIKE ?`).get(key, me, `%"${me}"%`).c;
      } catch (e) {}
      out.push({
        friend: decorateStatus(fr),
        last_message: (last.kind === 'voice') ? 'رسالة صوتية' : (last.kind === 'image') ? 'صورة' : (last.kind === 'video') ? 'فيديو' : last.body,
        last_kind: last.kind || 'text',
        last_from_me: last.sender_id === me,
        last_at: last.created_at,
        last_id: last.id,
        unread,
        mentions,
        pinned: pins.has(fr.id),
        pinned_at: pins.get(fr.id) || null,
      });
    }
    /* المثبّت فوق، وبعده الأحدث بالوقت (مش بالـid: الأرقام في الفردي
       والحفلات من تسلسلين مختلفين فالمقارنة بينهم بلا معنى — #5). */
    out.sort((a, b) => (b.pinned - a.pinned)
      || String(b.last_at || '').localeCompare(String(a.last_at || ''))
      || (b.last_id || 0) - (a.last_id || 0));
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
  if (!areFriends(me, other) || blockedBetween(me, other)) return res.status(403).json({ error: 'غير متاح' });

  const before = toId(req.query.before);
  let limit = Number(req.query.limit) || 30;
  if (limit < 1) limit = 1; if (limit > 100) limit = 100;
  const key = convoKey(me, other);

  /* لقطة الرسالة الأصل عند الرد (#130): اسم صاحبها + معاينة مختصرة. */
  const replySnippet = (id) => {
    if (!id) return null;
    const r = db.prepare('SELECT id, sender_id, body, kind FROM messages WHERE id = ?').get(id);
    if (!r) return null;
    const u = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(r.sender_id) || {};
    const preview = r.kind === 'voice' ? 'رسالة صوتية' : r.kind === 'image' ? 'صورة' : r.kind === 'video' ? 'فيديو' : String(r.body || '').slice(0, 120);
    return { id: r.id, from: r.sender_id, name: resolveOnlineName(u), kind: r.kind || 'text', preview };
  };

  try {
    const cols = 'id, sender_id, recipient_id, body, created_at, read_at, delivered_at, reply_to, pinned_at, kind, audio_data, duration, mime, mentions';
    const rows = before
      ? db.prepare(`SELECT ${cols} FROM messages
                    WHERE convo_key = ? AND id < ? ORDER BY id DESC LIMIT ?`).all(key, before, limit)
      : db.prepare(`SELECT ${cols} FROM messages
                    WHERE convo_key = ? ORDER BY id DESC LIMIT ?`).all(key, limit);
    rows.reverse();   /* للعرض: الأقدم فوق */
    const reactMap = reactionsFor('dm', rows.map(m => m.id), me);
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
      delivered: !!m.delivered_at,
      reply_to: m.reply_to || null,
      reply: replySnippet(m.reply_to),
      pinned: !!m.pinned_at,
      mentions: parseMentions(m.mentions),
      reactions: reactMap.get(m.id) || [],
    }));
    res.json({ messages, has_more: rows.length === limit });
  } catch (e) {
    console.error('[chat] history failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ══════════════════════════════════════════════════════════════════════
   تفاعلات الإيموجي (#3) + تثبيت المحادثات (#4)
   ──────────────────────────────────────────────────────────────────────
   التفاعل بيتخزّن في message_reactions بمفتاح (scope, message_id, user_id)
   فتفاعل المستخدم الجديد بيستبدل القديم، وإرسال نفس الإيموجي تاني =
   إلغاء (toggle). الشكل اللي بيرجع للعميل مجمّع: لكل إيموجي عدده
   وهل أنا واحد منهم — نفس عرض واتساب.
══════════════════════════════════════════════════════════════════════ */
function parseMentions(txt) {
  if (!txt) return [];
  try { const a = JSON.parse(txt); return Array.isArray(a) ? a.map(Number).filter(Boolean) : []; }
  catch (e) { return []; }
}

/* تفاعلات مجموعة رسايل مرة واحدة (بلا استعلام لكل رسالة) */
function reactionsFor(scope, ids, me) {
  const map = new Map();
  const list = (ids || []).filter(Boolean);
  if (!list.length) return map;
  try {
    const marks = list.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT r.message_id, r.emoji, r.user_id, u.display_name, u.username, u.provider
        FROM message_reactions r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.scope = ? AND r.message_id IN (${marks})
       ORDER BY r.created_at ASC`).all(scope, ...list);
    for (const r of rows) {
      if (!map.has(r.message_id)) map.set(r.message_id, []);
      const arr = map.get(r.message_id);
      let cell = arr.find(x => x.emoji === r.emoji);
      if (!cell) { cell = { emoji: r.emoji, count: 0, mine: false, users: [] }; arr.push(cell); }
      cell.count++;
      if (r.user_id === me) cell.mine = true;
      if (cell.users.length < 50) cell.users.push({ id: r.user_id, name: resolveOnlineName(r) });
    }
  } catch (e) {}
  return map;
}

/* الإيموجي المسموح: محارف قصيرة بلا مسافات (بنمنع أي نصّ طويل) */
function cleanEmoji(v) {
  const s = String(v || '').trim();
  if (!s || s.length > 12 || /\s/.test(s)) return null;
  return s;
}

/* ── تفاعل على رسالة فردية ── */
router.post('/react', authenticateToken, (req, res) => {
  const me = req.user.id;
  const id = toId(req.body && req.body.id);
  const emoji = cleanEmoji(req.body && req.body.emoji);
  if (!id) return res.status(400).json({ error: 'رسالة غير صالحة' });
  try {
    const m = db.prepare('SELECT sender_id, recipient_id, convo_key FROM messages WHERE id = ?').get(id);
    if (!m) return res.status(404).json({ error: 'غير موجودة' });
    if (m.sender_id !== me && m.recipient_id !== me) return res.status(403).json({ error: 'غير متاح' });
    const other = m.sender_id === me ? m.recipient_id : m.sender_id;
    if (blockedBetween(me, other)) return res.status(403).json({ error: 'غير متاح' });

    const cur = db.prepare(`SELECT emoji FROM message_reactions
                            WHERE scope = 'dm' AND message_id = ? AND user_id = ?`).get(id, me);
    if (!emoji || (cur && cur.emoji === emoji)) {
      db.prepare(`DELETE FROM message_reactions WHERE scope = 'dm' AND message_id = ? AND user_id = ?`).run(id, me);
    } else {
      db.prepare(`INSERT INTO message_reactions (scope, message_id, user_id, emoji) VALUES ('dm', ?, ?, ?)
                  ON CONFLICT(scope, message_id, user_id) DO UPDATE SET emoji = excluded.emoji,
                    created_at = datetime('now')`).run(id, me, emoji);
    }
    const list = reactionsFor('dm', [id], me).get(id) || [];
    /* الطرف التاني يشوف التفاعل فورًا (لو متصل) — بنحسب القائمة من منظوره
       عشان علم mine يبان على تفاعله هو، لا على تفاعلي. */
    try {
      const theirs = reactionsFor('dm', [id], other).get(id) || [];
      realtime.push(other, { type: 'chat:reaction', convo_key: m.convo_key, id, from: me, reactions: theirs });
    } catch (e) {}
    res.json({ ok: true, id, convo_key: m.convo_key, reactions: list, peer: other });
  } catch (e) {
    console.error('[chat] react failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── تثبيت/فكّ تثبيت محادثة في صندوق الرسايل (لكل مستخدم لوحده) ── */
router.post('/pin-chat', authenticateToken, (req, res) => {
  const me = req.user.id;
  const kind = (req.body && req.body.kind) === 'grp' ? 'grp' : 'dm';
  const target = toId(req.body && (req.body.target_id || req.body.id));
  if (!target) return res.status(400).json({ error: 'محادثة غير صالحة' });
  try {
    if (kind === 'dm' && !areFriends(me, target)) return res.status(403).json({ error: 'غير متاح' });
    if (kind === 'grp') {
      const inGroup = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(target, me);
      if (!inGroup) return res.status(403).json({ error: 'غير متاح' });
    }
    const exists = db.prepare(`SELECT 1 FROM chat_pins WHERE user_id = ? AND kind = ? AND target_id = ?`).get(me, kind, target);
    if (exists) {
      db.prepare(`DELETE FROM chat_pins WHERE user_id = ? AND kind = ? AND target_id = ?`).run(me, kind, target);
      return res.json({ ok: true, pinned: false });
    }
    /* سقف معقول زي واتساب: 5 محادثات مثبّتة */
    const count = db.prepare('SELECT COUNT(*) AS c FROM chat_pins WHERE user_id = ?').get(me).c;
    if (count >= 5) return res.status(409).json({ error: 'يمكنك تثبيت 5 محادثات كحدٍّ أقصى' });
    db.prepare(`INSERT INTO chat_pins (user_id, kind, target_id) VALUES (?, ?, ?)`).run(me, kind, target);
    res.json({ ok: true, pinned: true });
  } catch (e) {
    console.error('[chat] pin-chat failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── كل المحادثات المثبّتة (فردي + حفلات) ── */
router.get('/pins', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`SELECT kind, target_id, pinned_at FROM chat_pins WHERE user_id = ?`).all(req.user.id);
    res.json({ pins: rows });
  } catch (e) {
    res.json({ pins: [] });
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

/* ── تسجيل الاستماع لرسالة صوتية (#131) ──
   حدث مستقل مش تراكمي: بنسجّله في voice_plays scope='dm'. */
router.post('/played', authenticateToken, (req, res) => {
  const me = req.user.id;
  const id = toId(req.body && req.body.id);
  if (!id) return res.status(400).json({ error: 'رسالة غير صالحة' });
  try {
    const m = db.prepare('SELECT sender_id, recipient_id, kind FROM messages WHERE id = ?').get(id);
    if (!m || m.kind !== 'voice') return res.status(404).json({ error: 'غير متاح' });
    if (m.recipient_id !== me) return res.status(403).json({ error: 'غير متاح' }); /* بتستمع لرسالة موجّهة ليك بس */
    db.prepare(`INSERT OR IGNORE INTO voice_plays (scope, message_id, user_id) VALUES ('dm', ?, ?)`).run(id, me);
    res.json({ ok: true });
  } catch (e) {
    console.error('[chat] played failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── معلومات الرسالة (#131): تسليم/قراءة + مين سمع (للصوت) — لرسايلي أنا بس ── */
router.get('/message-info', authenticateToken, (req, res) => {
  const me = req.user.id;
  const id = toId(req.query.id);
  if (!id) return res.status(400).json({ error: 'رسالة غير صالحة' });
  try {
    const m = db.prepare('SELECT sender_id, recipient_id, kind, delivered_at, read_at FROM messages WHERE id = ?').get(id);
    if (!m) return res.status(404).json({ error: 'غير موجودة' });
    if (m.sender_id !== me) return res.status(403).json({ error: 'غير متاح' });
    let listened = [];
    if (m.kind === 'voice') {
      listened = db.prepare(`SELECT v.user_id AS id, v.played_at AS at, u.display_name, u.username, u.provider, u.avatar_url
                             FROM voice_plays v JOIN users u ON u.id = v.user_id
                             WHERE v.scope = 'dm' AND v.message_id = ? ORDER BY v.played_at ASC`).all(id)
                   .map(r => ({ id: r.id, name: resolveOnlineName(r), avatar_url: r.avatar_url || null, at: r.at }));
    }
    res.json({
      scope: 'friend', kind: m.kind || 'text',
      delivered_at: m.delivered_at || null,
      read_at: m.read_at || null,
      listened,
    });
  } catch (e) {
    console.error('[chat] message-info failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
module.exports.setRealtime = setRealtime;
module.exports.convoKey = convoKey;
module.exports.areFriends = areFriends;
module.exports.blockedBetween = blockedBetween;
module.exports.reactionsFor = reactionsFor;
module.exports.parseMentions = parseMentions;
module.exports.cleanEmoji = cleanEmoji;
