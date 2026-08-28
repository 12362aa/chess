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
const privacy = require('./privacy');

const router = express.Router();

/* ── ترقية المخطّط (idempotent): أدوار الأعضaء + سياسة الإرسال + رابط الدعوة ──
   على غرار إعدادات جروبات واتساب:
   • group_members.role : 'admin' | 'member' (المالك = groups.owner_id = سوبر أدمن).
   • groups.send_policy  : 'all' | 'admins' (مين يقدر يبعت — فتح/غلق الحفلة).
   • groups.invite_token : توكِن رابط الدعوة (NULL = مقفول). */
function _addColumn(table, col, decl) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`).run();
  } catch (e) { /* الجدول ممكن يكون لسه ماتعملش — بيتعمل في db.js قبل الراوتر */ }
}
_addColumn('group_members', 'role', `TEXT DEFAULT 'member'`);
_addColumn('groups', 'send_policy', `TEXT DEFAULT 'all'`);
_addColumn('groups', 'invite_token', 'TEXT');


let realtime = { statusOf() { return null; } };
function setRealtime(rt) {
  realtime = Object.assign({ statusOf() { return null; } }, rt || {});
}

function toId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* اسم العرض في الأونلاين: مستخدم جوجل → الاسم من جوجل (display_name)؛
   غير كده → الاسم المستعار (username) اللي بيتعدّل من الإعدادات. نفس قاعدة
   resolveOnlineName في server.js عشان الاسم يبقى موحَّد في كل مكان. */
function resolveOnlineName(row) {
  if (!row) return 'صديق';
  if (row.provider === 'google') return row.display_name || row.username || 'صديق';
  return row.username || row.display_name || 'صديق';
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
/* المالك (السوبر أدمن) — مايتشالش ومايتنزّلش أبداً. */
function ownerOf(groupId) {
  const g = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(groupId);
  return g ? g.owner_id : null;
}
/* دور العضو الفعلي: 'owner' | 'admin' | 'member' | null (مش عضو). */
function roleOf(groupId, userId) {
  const own = ownerOf(groupId);
  if (own && own === userId) return 'owner';
  const r = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!r) return null;
  return r.role === 'admin' ? 'admin' : 'member';
}
/* مشرف = المالك أو أدمن — بيقدر يدير الحفلة. */
function isAdmin(groupId, userId) {
  const role = roleOf(groupId, userId);
  return role === 'owner' || role === 'admin';
}
/* توكِن دعوة عشوائي URL-safe. */
function makeInviteToken() {
  return require('crypto').randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
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
    provider: row.provider || null,
    avatar_url: row.avatar_url || null,
  };
}

/* قائمة أعضاء الجروب (هوية عامة) — لعرض صور القراء في الإيصالات. */
function memberList(groupId) {
  const rows = db.prepare(`SELECT u.id, u.username, u.display_name, u.provider, u.avatar_url
                           FROM group_members gm JOIN users u ON u.id = gm.user_id
                           WHERE gm.group_id = ?`).all(groupId);
  return rows.map(memberInfo);
}

/* لقطة إيصالات الجروب: لكل عضو أعلى رسالة وصلته (delivered) وقراها (read)
   بنظام high-water. الافتراضي 0 لعضو لسه ماقراش/ماوصلوش حاجة. ده أساس
   حساب ✓/✓✓ لكل الأعضاء + صور القراء (نمط ماسنجر). */
function receiptsSnapshot(groupId) {
  const rows = db.prepare(`SELECT gm.user_id, gr.last_read_id, gr.last_delivered_id
                           FROM group_members gm
                           LEFT JOIN group_reads gr ON gr.group_id = gm.group_id AND gr.user_id = gm.user_id
                           WHERE gm.group_id = ?`).all(groupId);
  return rows.map(r => ({ user_id: r.user_id, last_read_id: r.last_read_id || 0, last_delivered_id: r.last_delivered_id || 0 }));
}

/* ملخّص جروب لواجهة القائمة: آخر رسالة + غير المقروء + عدد الأعضاء. */
function groupSummary(groupId, me) {
  const g = db.prepare('SELECT id, name, owner_id, avatar_url, created_at, send_policy FROM groups WHERE id = ?').get(groupId);
  if (!g) return null;
  const count = db.prepare('SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?').get(groupId).c;
  const last = db.prepare(`SELECT m.id, m.sender_id, m.body, m.kind, m.created_at, u.display_name, u.username, u.provider
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
    send_policy: g.send_policy || 'all',
    my_role: roleOf(groupId, me),
    last_message: last ? (last.kind === 'voice' ? 'رسالة صوتية' : last.kind === 'image' ? 'صورة' : last.kind === 'video' ? 'فيديو' : last.body) : null,
    last_kind: last ? (last.kind || 'text') : null,
    last_sender: last ? resolveOnlineName(last) : null,
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
  if (!name) return res.status(400).json({ error: 'اسم الحفلة مطلوب' });

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
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'غير متاح' });
  try {
    const rows = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar_url, gm.role
                             FROM group_members gm JOIN users u ON u.id = gm.user_id
                             WHERE gm.group_id = ? ORDER BY gm.joined_at ASC`).all(gid);
    const g = db.prepare('SELECT owner_id, send_policy FROM groups WHERE id = ?').get(gid) || {};
    const members = rows.map(r => ({
      ...memberInfo(r),
      role: r.id === g.owner_id ? 'owner' : (r.role === 'admin' ? 'admin' : 'member'),
    }));
    res.json({
      owner_id: g.owner_id,
      send_policy: g.send_policy || 'all',
      my_role: roleOf(gid, me),
      members,
    });
  } catch (e) {
    console.error('[groups] members failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── سجل رسايل جروب (تصفّح بالمفتاح) ── */
router.get('/:id/history', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'غير متاح' });
  const before = toId(req.query.before);
  let limit = Number(req.query.limit) || 30;
  if (limit < 1) limit = 1; if (limit > 100) limit = 100;
  try {
    const cols = `m.id, m.sender_id, m.kind, m.body, m.audio_data, m.duration, m.mime, m.created_at, m.reply_to, m.pinned_at,
                  u.username, u.display_name, u.provider, u.avatar_url`;
    const rows = before
      ? db.prepare(`SELECT ${cols} FROM group_messages m JOIN users u ON u.id = m.sender_id
                    WHERE m.group_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(gid, before, limit)
      : db.prepare(`SELECT ${cols} FROM group_messages m JOIN users u ON u.id = m.sender_id
                    WHERE m.group_id = ? ORDER BY m.id DESC LIMIT ?`).all(gid, limit);
    rows.reverse();
    /* لقطة الرسالة الأصل عند الرد (#130). */
    const replySnippet = (id) => {
      if (!id) return null;
      const r = db.prepare('SELECT id, sender_id, body, kind FROM group_messages WHERE id = ?').get(id);
      if (!r) return null;
      const u = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(r.sender_id) || {};
      const preview = r.kind === 'voice' ? 'رسالة صوتية' : r.kind === 'image' ? 'صورة' : r.kind === 'video' ? 'فيديو' : String(r.body || '').slice(0, 120);
      return { id: r.id, from: r.sender_id, name: resolveOnlineName(u), kind: r.kind || 'text', preview };
    };
    const messages = rows.map(m => ({
      id: m.id,
      from: m.sender_id,
      mine: m.sender_id === me,
      sender_name: resolveOnlineName(m),
      sender_avatar: m.avatar_url || null,
      kind: m.kind || 'text',
      body: m.body,
      audio: m.audio_data || null,
      duration: m.duration || 0,
      mime: m.mime || '',
      created_at: m.created_at,
      reply_to: m.reply_to || null,
      reply: replySnippet(m.reply_to),
      pinned: !!m.pinned_at,
    }));
    res.json({ messages, has_more: rows.length === limit, members: memberList(gid), reads: receiptsSnapshot(gid) });
  } catch (e) {
    console.error('[groups] history failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── تعليم الجروب كمقروء لحد آخر رسالة ── */
router.post('/:id/read', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'غير متاح' });
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

/* ── تسجيل الاستماع لرسالة صوتية في الجروب (#131) — scope='grp' ── */
router.post('/:id/played', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'غير متاح' });
  const mid = toId(req.body && req.body.id);
  if (!mid) return res.status(400).json({ error: 'رسالة غير صالحة' });
  try {
    const m = db.prepare('SELECT sender_id, kind FROM group_messages WHERE id = ? AND group_id = ?').get(mid, gid);
    if (!m || m.kind !== 'voice') return res.status(404).json({ error: 'غير متاح' });
    if (m.sender_id !== me) db.prepare(`INSERT OR IGNORE INTO voice_plays (scope, message_id, user_id) VALUES ('grp', ?, ?)`).run(mid, me);
    res.json({ ok: true });
  } catch (e) {
    console.error('[groups] played failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── معلومات رسالة الجروب (#131): مين وصلته/قراها لكل عضو + مين سمع (للصوت) ──
   متاح لأي عضو (مش للمشرفين بس)، بس لرسالة العضو نفسه (رسايلي أنا). */
router.get('/:id/message-info', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'غير متاح' });
  const mid = toId(req.query.id);
  if (!mid) return res.status(400).json({ error: 'رسالة غير صالحة' });
  try {
    const m = db.prepare('SELECT sender_id, kind FROM group_messages WHERE id = ? AND group_id = ?').get(mid, gid);
    if (!m) return res.status(404).json({ error: 'غير موجودة' });
    if (m.sender_id !== me) return res.status(403).json({ error: 'غير متاح' });
    const reads = {};
    receiptsSnapshot(gid).forEach(r => { reads[r.user_id] = r; });
    const members = memberList(gid).filter(u => u.id !== me).map(u => {
      const r = reads[u.id] || { last_read_id: 0, last_delivered_id: 0 };
      return { id: u.id, name: resolveOnlineName(u), avatar_url: u.avatar_url || null,
               delivered: (r.last_delivered_id || 0) >= mid, read: (r.last_read_id || 0) >= mid };
    });
    let listened = [];
    if (m.kind === 'voice') {
      listened = db.prepare(`SELECT v.user_id AS id, v.played_at AS at, u.display_name, u.username, u.provider, u.avatar_url
                             FROM voice_plays v JOIN users u ON u.id = v.user_id
                             WHERE v.scope = 'grp' AND v.message_id = ? ORDER BY v.played_at ASC`).all(mid)
                   .map(r => ({ id: r.id, name: resolveOnlineName(r), avatar_url: r.avatar_url || null, at: r.at }));
    }
    res.json({ scope: 'group', kind: m.kind || 'text', members, listened });
  } catch (e) {
    console.error('[groups] message-info failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── مغادرة جروب ── */
router.post('/:id/leave', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'غير متاح' });
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

/* ── تغيير صورة الحفلة (المالك فقط) ── */
router.post('/:id/avatar', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid) return res.status(400).json({ error: 'غير متاح' });
  const g = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(gid);
  if (!g) return res.status(404).json({ error: 'الحفلة غير موجودة' });
  if (g.owner_id !== me) return res.status(403).json({ error: 'المالك بس يقدر يغيّر الصورة' });
  /* data URL صغيرة (128px JPEG). سقف أمان ~200KB عشان مايتخزنش نص ضخم. */
  let url = String((req.body && req.body.avatar_url) || '').trim();
  if (url && !/^data:image\//i.test(url)) return res.status(400).json({ error: 'صورة غير صالحة' });
  if (url.length > 200000) return res.status(400).json({ error: 'الصورة كبيرة جداً' });
  try {
    db.prepare('UPDATE groups SET avatar_url = ? WHERE id = ?').run(url || null, gid);
    /* بلّغ الأعضاء المتصلين إن صورة الحفلة اتغيّرت. */
    try { realtime.notifyGroup && realtime.notifyGroup(gid, { type: 'group:updated', group_id: gid, avatar_url: url || null }, null); } catch (e) {}
    res.json({ ok: true, avatar_url: url || null });
  } catch (e) {
    console.error('[groups] avatar failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── إضافة أعضاء بعد الإنشاء ──  body: { members: [userId,...] }
   أي عضو يقدر يضيف أصدقاءه (زي واتساب افتراضياً). المُضاف لازم يكون صديق
   للمُضيف ومش محظور. لكن خصوصية المُضاف بتحكم: لو إعداده مايسمحش بالإضافة
   المباشرة (Friends لغير صديق مباشر أو Nobody) بنبعتله دعوة معلّقة بدل ما
   نضيفه على طول — ده مطلب المستخدم: "ممنوع حد يضيفه لحفلة بإضافة عادية". */
router.post('/:id/members', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isMember(gid, me)) return res.status(403).json({ error: 'غير متاح' });
  const raw = Array.isArray(req.body && req.body.members) ? req.body.members : [];
  const added = [], invited = [];
  const gname = (db.prepare('SELECT name FROM groups WHERE id = ?').get(gid) || {}).name || '';
  try {
    const add = db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`);
    for (const v of raw) {
      const uid = toId(v);
      if (!uid || uid === me) continue;
      if (isMember(gid, uid)) continue;
      /* لازم يكون صديقك ومش محظور — أساس زي واتساب. */
      if (!areFriends(me, uid) || blockedBetween(me, uid)) continue;
      /* خصوصية المُضاف: مسموح بالإضافة المباشرة؟ */
      if (privacy.canAddToParty(me, uid)) {
        const info = add.run(gid, uid);
        if (info.changes) added.push(uid);
      } else {
        if (sendPartyInvite(gid, me, uid)) invited.push(uid);
      }
    }
    if (added.length) {
      try { realtime.notifyGroup && realtime.notifyGroup(gid, { type: 'group:created', group_id: gid, name: gname }, null); } catch (e) {}
    }
    res.json({ ok: true, added, invited, members: (db.prepare('SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?').get(gid) || {}).c || 0 });
  } catch (e) {
    console.error('[groups] add members failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── دعوات الحفلات المعلّقة (بديل الإضافة المباشرة) ──
   بتنتهي بعد 72 ساعة (معيار واتساب). بنكنس المنتهية عند القراءة. */
const PARTY_INVITE_TTL_H = 72;

function expireOldInvites() {
  try {
    db.prepare(`UPDATE party_invites SET status = 'expired'
                WHERE status = 'pending' AND expires_at <= datetime('now')`).run();
  } catch (e) {}
}

/* بيعمل دعوة معلّقة (أو بيرجّع الموجودة) ويبلّغ المدعوّ لو متصل. */
function sendPartyInvite(partyId, inviterId, inviteeId) {
  expireOldInvites();
  try {
    const exists = db.prepare(`SELECT id FROM party_invites
                               WHERE party_id = ? AND invitee_id = ? AND status = 'pending'`).get(partyId, inviteeId);
    let inviteId;
    if (exists) {
      inviteId = exists.id;
    } else {
      const info = db.prepare(`INSERT INTO party_invites (party_id, inviter_id, invitee_id, expires_at)
                               VALUES (?, ?, ?, datetime('now', '+${PARTY_INVITE_TTL_H} hours'))`)
                     .run(partyId, inviterId, inviteeId);
      inviteId = info.lastInsertRowid;
    }
    const g = db.prepare('SELECT name, avatar_url FROM groups WHERE id = ?').get(partyId) || {};
    const from = db.prepare('SELECT display_name, username, provider FROM users WHERE id = ?').get(inviterId) || {};
    try {
      realtime.notifyUser && realtime.notifyUser(inviteeId, {
        type: 'party:invite',
        invite_id: inviteId,
        party_id: partyId,
        party_name: g.name || 'حفلة',
        party_avatar: g.avatar_url || null,
        from_id: inviterId,
        from_name: resolveOnlineName(from),
      });
    } catch (e) {}
    return true;
  } catch (e) {
    console.error('[groups] party invite failed:', e.message);
    return false;
  }
}

/* ── دعوات الحفلات المعلّقة الخاصة بيّ ── */
router.get('/party-invites', authenticateToken, (req, res) => {
  const me = req.user.id;
  expireOldInvites();
  try {
    const rows = db.prepare(`SELECT pi.id, pi.party_id, pi.inviter_id, pi.created_at, pi.expires_at,
                                    g.name AS party_name, g.avatar_url AS party_avatar,
                                    u.display_name, u.username, u.provider
                             FROM party_invites pi
                             JOIN groups g ON g.id = pi.party_id
                             JOIN users  u ON u.id = pi.inviter_id
                             WHERE pi.invitee_id = ? AND pi.status = 'pending'
                             ORDER BY pi.id DESC`).all(me);
    res.json(rows.map(r => ({
      invite_id: r.id,
      party_id: r.party_id,
      party_name: r.party_name,
      party_avatar: r.party_avatar || null,
      from_id: r.inviter_id,
      from_name: resolveOnlineName(r),
      created_at: r.created_at,
      expires_at: r.expires_at,
    })));
  } catch (e) {
    console.error('[groups] party invites list failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── قبول دعوة حفلة → انضمام فعلي ── */
router.post('/party-invite/:id/accept', authenticateToken, (req, res) => {
  const me = req.user.id;
  const iid = toId(req.params.id);
  expireOldInvites();
  try {
    const inv = db.prepare(`SELECT * FROM party_invites WHERE id = ? AND invitee_id = ? AND status = 'pending'`).get(iid, me);
    if (!inv) return res.status(404).json({ error: 'الدعوة منتهية أو غير موجودة' });
    db.prepare(`UPDATE party_invites SET status = 'accepted' WHERE id = ?`).run(iid);
    if (!isMember(inv.party_id, me)) {
      db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(inv.party_id, me);
      const name = (db.prepare('SELECT name FROM groups WHERE id = ?').get(inv.party_id) || {}).name || '';
      try { realtime.notifyGroup && realtime.notifyGroup(inv.party_id, { type: 'group:created', group_id: inv.party_id, name }, null); } catch (e) {}
    }
    res.json({ ok: true, group_id: inv.party_id, summary: groupSummary(inv.party_id, me) });
  } catch (e) {
    console.error('[groups] party invite accept failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── رفض دعوة حفلة ── */
router.post('/party-invite/:id/decline', authenticateToken, (req, res) => {
  const me = req.user.id;
  const iid = toId(req.params.id);
  try {
    const inv = db.prepare(`SELECT * FROM party_invites WHERE id = ? AND invitee_id = ? AND status = 'pending'`).get(iid, me);
    if (!inv) return res.status(404).json({ error: 'الدعوة غير موجودة' });
    db.prepare(`UPDATE party_invites SET status = 'declined' WHERE id = ?`).run(iid);
    res.json({ ok: true });
  } catch (e) {
    console.error('[groups] party invite decline failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── إزالة عضو (المشرفون فقط، والمالك مايتشالش) ── */
router.delete('/:id/members/:uid', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  const uid = toId(req.params.uid);
  if (!gid || !uid || !isAdmin(gid, me)) return res.status(403).json({ error: 'المشرفون بس' });
  if (uid === ownerOf(gid)) return res.status(400).json({ error: 'لا يمكن إزالة مالك الحفلة' });
  if (!isMember(gid, uid)) return res.status(404).json({ error: 'لست عضوًا' });
  try {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(gid, uid);
    try { realtime.notifyGroup && realtime.notifyGroup(gid, { type: 'group:updated', group_id: gid }, null); } catch (e) {}
    try { realtime.notifyUser && realtime.notifyUser(uid, { type: 'group:removed', group_id: gid }); } catch (e) {}
    res.json({ ok: true });
  } catch (e) {
    console.error('[groups] remove member failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── ترقية/تنزيل مشرف (المشرفون فقط، والمالك ثابت) ──  body: { user_id, make } */
router.post('/:id/admins', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  const uid = toId(req.body && req.body.user_id);
  const make = !!(req.body && req.body.make);
  if (!gid || !uid || !isAdmin(gid, me)) return res.status(403).json({ error: 'المشرفون بس' });
  if (uid === ownerOf(gid)) return res.status(400).json({ error: 'مالك الحفلة سوبر أدمن دايماً' });
  if (!isMember(gid, uid)) return res.status(404).json({ error: 'لست عضوًا' });
  try {
    db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?')
      .run(make ? 'admin' : 'member', gid, uid);
    try { realtime.notifyGroup && realtime.notifyGroup(gid, { type: 'group:updated', group_id: gid }, null); } catch (e) {}
    res.json({ ok: true, role: make ? 'admin' : 'member' });
  } catch (e) {
    console.error('[groups] admins failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── سياسة الإرسال: فتح/غلق الحفلة (المشرفون فقط) ──  body: { send_policy: 'all'|'admins' } */
router.post('/:id/settings', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isAdmin(gid, me)) return res.status(403).json({ error: 'المشرفون بس' });
  const pol = String((req.body && req.body.send_policy) || '').trim();
  if (pol !== 'all' && pol !== 'admins') return res.status(400).json({ error: 'قيمة غير صالحة' });
  try {
    db.prepare('UPDATE groups SET send_policy = ? WHERE id = ?').run(pol, gid);
    try { realtime.notifyGroup && realtime.notifyGroup(gid, { type: 'group:updated', group_id: gid, send_policy: pol }, null); } catch (e) {}
    res.json({ ok: true, send_policy: pol });
  } catch (e) {
    console.error('[groups] settings failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── رابط الدعوة (المشرفون فقط) ──
   GET  → التوكِن الحالي (أو null). POST body { enabled, reset } → توليد/تصفير/غلق. */
router.get('/:id/invite', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isAdmin(gid, me)) return res.status(403).json({ error: 'المشرفون بس' });
  try {
    const g = db.prepare('SELECT invite_token FROM groups WHERE id = ?').get(gid) || {};
    res.json({ ok: true, token: g.invite_token || null });
  } catch (e) {
    console.error('[groups] invite get failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});
router.post('/:id/invite', authenticateToken, (req, res) => {
  const me = req.user.id;
  const gid = toId(req.params.id);
  if (!gid || !isAdmin(gid, me)) return res.status(403).json({ error: 'المشرفون بس' });
  const enabled = req.body && req.body.enabled !== undefined ? !!req.body.enabled : true;
  const reset = !!(req.body && req.body.reset);
  try {
    let token = null;
    if (enabled) {
      const cur = (db.prepare('SELECT invite_token FROM groups WHERE id = ?').get(gid) || {}).invite_token;
      token = (cur && !reset) ? cur : makeInviteToken();
    }
    db.prepare('UPDATE groups SET invite_token = ? WHERE id = ?').run(token, gid);
    res.json({ ok: true, token });
  } catch (e) {
    console.error('[groups] invite set failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── الانضمام عبر رابط الدعوة ──  أي مستخدم مسجّل. */
router.post('/join/:token', authenticateToken, (req, res) => {
  const me = req.user.id;
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).json({ error: 'رابط غير صالح' });
  try {
    const g = db.prepare('SELECT id, name FROM groups WHERE invite_token = ?').get(token);
    if (!g) return res.status(404).json({ error: 'الرابط منتهي أو غير صالح' });
    if (isMember(g.id, me)) return res.json({ ok: true, group_id: g.id, already: true, summary: groupSummary(g.id, me) });
    db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(g.id, me);
    try { realtime.notifyGroup && realtime.notifyGroup(g.id, { type: 'group:updated', group_id: g.id }, null); } catch (e) {}
    res.json({ ok: true, group_id: g.id, summary: groupSummary(g.id, me) });
  } catch (e) {
    console.error('[groups] join failed:', e.message);
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
module.exports.roleOf = roleOf;
module.exports.isAdmin = isAdmin;
module.exports.receiptsSnapshot = receiptsSnapshot;
module.exports.memberList = memberList;
