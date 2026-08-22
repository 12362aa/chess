/* ══════════════════════════════════════════════════════════════════════
   جروبات الأصدقاء (شات جماعي) — HTTP
   ──────────────────────────────────────────────────────────────────────
   نفس فلسفة chat.js:
   • الإيميل مابيخرجش — الهوية العامة username + الاسم المعروض بس.
   • بتُنشئ جروب من أصدقائك بس (والحظر بيتحقّق بالاتجاهين وقت الإضافة).
   • الرسايل في القاعدة (group_messages) فبتفضل بعد تسجيل الخروج والدخول.
   • الوقت الحقيقي (إرسال/كتابة) على الـWebSocket في server.js.
     هنا HTTP للإنشاء والسجل والعدّادات بس.
   • غير المقروء لكل عضو = رسايل الجروب اللي id بتاعها أكبر من last_read_id.
══════════════════════════════════════════════════════════════════════ */
const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

let realtime = { statusOf() { return null; } };
function setRealtime(rt) {
  realtime = Object.assign({ statusOf() { return null; } }, rt || {});
}

function toId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function areFriends(a, b) {
  return !!db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(a, b);
}
function blockedBetween(a, b) {
  return !!db.prepare(`SELECT 1 FROM friend_blocks
                       WHERE (blocker_id = ? AND blocked_id = ?)
                          OR (blocker_id = ? AND blocked_id = ?)`).get(a, b, b, a);
}

/* هل المستخدم عضو في الجروب؟ */
function isMember(groupId, userId) {
  return !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}
/* كل user_ids لأعضاء الجروب — لازمة للتوزيع على السوكتات. */
function memberIds(groupId) {
  return db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId).map(r => r.user_id);
}

/* بيانات عضو عامة. */
function memberInfo(row) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url || null,
  };
}

/* ملخّص جروب لواجهة القائمة: آخر رسالة + غير المقروء + عدد الأعضاء. */
function groupSummary(groupId, me) {
  const g = db.prepare('SELECT id, name, owner_id, avatar_url, created_at FROM groups WHERE id = ?').get(groupId);
  if (!g) return null;
  const count = db.prepare('SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?').get(groupId).c;
  const last = db.prepare(`SELECT m.id, m.sender_id, m.body, m.kind, m.created_at, u.display_name, u.username
                           FROM group_messages m JOIN users u ON u.id = m.sender_id
                           WHERE m.group_id = ? ORDER BY m.id DESC LIMIT 1`).get(groupId);
  const lastRead = (db.prepare('SELECT last_read_id FROM group_reads WHERE group_id = ? AND user_id = ?').get(groupId, me) || {}).last_read_id || 0;
  const unread = db.prepare('SELECT COUNT(*) AS c FROM group_messages WHERE group_id = ? AND id > ? AND sender_id != ?').get(groupId, lastRead, me).c;
  return {
    id: g.id,
    name: g.name,
    owner_id: g.owner_id,
    avatar_url: g.avatar_url || null,
    members_count: count,
    last_message: last ? (last.kind === 'voice' ? 'رسالة صوتية' : last.kind === 'image' ? 'صورة' : last.kind === 'video' ? 'فيديو' : last.body) : null,
    last_kind: last ? (last.kind || 'text') : null,
    last_sender: last ? (last.display_name || last.username) : null,
    last_from_me: last ? (last.sender_id === me) : false,
    last_at: last ? last.created_at : g.created_at,
    last_id: last ? last.id : 0,
    unread,
  };
}

/* ── قائمة جروباتي ── */
router.get('/', authenticateToken, (req, res) => {
  const me = req.user.id;
  try {
    const ids = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(me).map(r => r.group_id);
    const out = ids.map(id => groupSummary(id, me)).filter(Boolean);
    out.sort((a, b) => (b.last_id || 0) - (a.last_id || 0));
    res.json(out);
  } catch (e) {
    console.error('[groups] list failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── إنشاء جروب ──  body: { name, members: [userId,...] } */
router.post('/', authenticateToken, (req, res) => {
  const me = req.user.id;
  const name = String((req.body && req.body.name) || '').trim().slice(0, 60);
  const raw = Array.isArray(req.body && req.body.members) ? req.body.members : [];
  if (!name) return res.status(400).json({ error: 'اسم الجروب مطلوب' });

  /* الأعضاء لازم يكونوا أصدقاء ليك ومش محظورين، والمالك بينضاف تلقائيًا. */
  const members = new Set();
  for (const v of raw) {
    const uid = toId(v);
    if (!uid || uid === me) continue;
    if (!areFriends(me, uid) || blockedBetween(me, uid)) continue;
    members.add(uid);
  }
  /* بنسمح بجروب فيه المالك بس (زي واتساب) — مش لازم تختار حد. */

  try {
    const info = db.prepare('INSERT INTO groups (name, owner_id) VALUES (?, ?)').run(name, me);
    const gid = info.lastInsertRowid;
    const add = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)');
    add.run(gid, me);
    for (const uid of members) add.run(gid, uid);
    const summary = groupSummary(gid, me);
    /* نبلّغ باقي الأعضاء المتصلين إن فيه جروب جديد. */
    try { realtime.notifyGroup && realtime.notifyGroup(gid, { type: 'group:created', group_id: gid, name }, me); } catch (e) {}
    res.json(summary);
  } catch (e) {
    console.error('[groups] create failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── أعضاء جروب ── */
router.get('/:id/members', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'مش متاح' });
  try {
    const rows = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar_url
                             FROM group_members gm JOIN users u ON u.id = gm.user_id
                             WHERE gm.group_id = ? ORDER BY gm.joined_at ASC`).all(gid);
    const g = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(gid) || {};
    res.json({ owner_id: g.owner_id, members: rows.map(memberInfo) });
  } catch (e) {
    console.error('[groups] members failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── سجل رسايل جروب (تصفّح بالمفتاح) ── */
router.get('/:id/history', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'مش متاح' });
  const before = toId(req.query.before);
  let limit = Number(req.query.limit) || 30;
  if (limit < 1) limit = 1; if (limit > 100) limit = 100;
  try {
    const cols = `m.id, m.sender_id, m.kind, m.body, m.audio_data, m.duration, m.mime, m.created_at,
                  u.username, u.display_name, u.avatar_url`;
    const rows = before
      ? db.prepare(`SELECT ${cols} FROM group_messages m JOIN users u ON u.id = m.sender_id
                    WHERE m.group_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(gid, before, limit)
      : db.prepare(`SELECT ${cols} FROM group_messages m JOIN users u ON u.id = m.sender_id
                    WHERE m.group_id = ? ORDER BY m.id DESC LIMIT ?`).all(gid, limit);
    rows.reverse();
    const messages = rows.map(m => ({
      id: m.id,
      from: m.sender_id,
      mine: m.sender_id === me,
      sender_name: m.display_name || m.username,
      sender_avatar: m.avatar_url || null,
      kind: m.kind || 'text',
      body: m.body,
      audio: m.audio_data || null,
      duration: m.duration || 0,
      mime: m.mime || '',
      created_at: m.created_at,
    }));
    res.json({ messages, has_more: rows.length === limit });
  } catch (e) {
    console.error('[groups] history failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── تعليم الجروب كمقروء لحد آخر رسالة ── */
router.post('/:id/read', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'مش متاح' });
  try {
    const last = db.prepare('SELECT MAX(id) AS m FROM group_messages WHERE group_id = ?').get(gid).m || 0;
    db.prepare(`INSERT INTO group_reads (group_id, user_id, last_read_id) VALUES (?, ?, ?)
                ON CONFLICT(group_id, user_id) DO UPDATE SET last_read_id = excluded.last_read_id`).run(gid, me, last);
    res.json({ ok: true, last_read_id: last });
  } catch (e) {
    console.error('[groups] read failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── مغادرة جروب ── */
router.post('/:id/leave', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'مش متاح' });
  try {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(gid, me);
    /* لو المالك مشي وفضل أعضاء، ننقل الملكية لأقدم عضو؛ لو فضي نمسح الجروب. */
    const g = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(gid);
    const rest = memberIds(gid);
    if (!rest.length) {
      db.prepare('DELETE FROM groups WHERE id = ?').run(gid);
    } else if (g && g.owner_id === me) {
      const next = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at ASC LIMIT 1').get(gid);
      if (next) db.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').run(next.user_id, gid);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[groups] leave failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
module.exports.setRealtime = setRealtime;
module.exports.isMember = isMember;
module.exports.memberIds = memberIds;
module.exports.areFriends = areFriends;
module.exports.blockedBetween = blockedBetween;
module.exports.groupSummary = groupSummary;
