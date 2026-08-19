/* ══════════════════════════════════════════════════════════════════════
   نظام الأصدقاء — HTTP
   ──────────────────────────────────────────────────────────────────────
   قواعد ثابتة في الملف ده:

   1. الإيميل مابيخرجش من هنا خالص. النسخة الأولى كانت بترجّع إيميل كل
      نتيجة بحث وكل صديق وكل طلب، يعني أي حد يبحث بـ3 حروف ياخد قائمة
      إيميلات. الهوية العامة بقت username، والبحث بيه وبالاسم المعروض.

   2. الحظر بيتحقّق في كل تفاعل مش في مكان واحد. تخزينه اتجاه واحد
      (blocker → blocked) لكن المنع بالاتجاهين: لو أنا حظرتك أو انت
      حظرتني، مافيش بحث ولا طلب ولا دعوة بينا.

   3. الدعوات في القاعدة مش في الذاكرة. لو السيرفر رستر الدعوة ماتضيعش،
      ولو المدعو مش متصل بيلاقيها لما يفتح التطبيق. وليها عمر (expires_at)
      عشان دعوة قديمة مافضلش تفتح غرفة بعد ساعة.

   4. الوقت الحقيقي بيتحقن من server.js (setRealtime) مش بيتعمله require.
      server.js أصلاً بيعمل require للملف ده، فأي require عكسي كان
      هيعمل حلقة. الحقن بيخلّي منطق HTTP هنا وسلوك السوكت هناك.
══════════════════════════════════════════════════════════════════════ */
const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

/* ── جسر الوقت الحقيقي ──
   server.js بيحقن { push, statusOf } بعد ما الـWebSocket يبقى جاهز.
   الافتراضي بيخلّي الـHTTP شغّال لو السوكت لسه مش موجود. */
let realtime = {
  push() { return false; },        /* push(userId, payload) → وصلت ولا لأ */
  statusOf() { return null; },     /* statusOf(userId) → 'online' | 'in-game' | null */
};
function setRealtime(rt) {
  realtime = Object.assign({ push() { return false; }, statusOf() { return null; } }, rt || {});
}

/* ── الحقول العامة لأي مستخدم ──
   أي استعلام بيرجّع مستخدم لازم يمرّ من هنا. مفيش email. */
const PUBLIC_FIELDS = `u.id, u.username, u.display_name, u.avatar_url, u.provider`;

/* الحالة النهائية بتجمع القاعدة مع السوكت: القاعدة بتقول آخر حالة
   محفوظة، والسوكت بيقول الحقيقة دلوقتي. السوكت أولى لأنه لحظي. */
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

/* هل فيه حظر بين الاتنين في أي اتجاه؟ */
function blockedBetween(a, b) {
  return !!db.prepare(`SELECT 1 FROM friend_blocks
                       WHERE (blocker_id = ? AND blocked_id = ?)
                          OR (blocker_id = ? AND blocked_id = ?)`).get(a, b, b, a);
}

function areFriends(a, b) {
  return !!db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(a, b);
}

/* عدد صحيح موجب أو null — كل مُعرِّف جاي من العميل بيمرّ من هنا */
function toId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ══════════════════════════════════════════════════════════════════════
   1. البحث عن لاعب
   بالـusername أو الاسم المعروض. الإيميل مش قابل للبحث عن قصد: لو كان،
   يبقى أي حد عنده إيميلك يلاقي حسابك من غير إذنك.
   بيرجّع علاقتك بكل نتيجة عشان الواجهة تعرف تظهر «إضافة» ولا «صديق»
   ولا «طلب مُرسل» من غير طلبات إضافية.
══════════════════════════════════════════════════════════════════════ */
router.get('/search', authenticateToken, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'اكتب حرفين على الأقل' });

  const me = req.user.id;
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT ${PUBLIC_FIELDS}, p.is_online, p.in_game, p.last_seen_at
    FROM users u
    LEFT JOIN presence p ON p.user_id = u.id
    WHERE u.id <> ?
      AND (u.username LIKE ? OR u.display_name LIKE ?)
      AND NOT EXISTS (SELECT 1 FROM friend_blocks b
                      WHERE (b.blocker_id = u.id AND b.blocked_id = ?)
                         OR (b.blocker_id = ? AND b.blocked_id = u.id))
    ORDER BY CASE WHEN lower(u.username) = lower(?) THEN 0 ELSE 1 END,
             length(u.username)
    LIMIT 20
  `).all(me, like, like, me, me, q);

  const out = rows.map(r => {
    const u = decorateStatus(r);
    if (areFriends(me, r.id)) u.relation = 'friend';
    else if (db.prepare(`SELECT 1 FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'`).get(me, r.id)) u.relation = 'sent';
    else if (db.prepare(`SELECT 1 FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'`).get(r.id, me)) u.relation = 'incoming';
    else u.relation = 'none';
    return u;
  });
  res.json(out);
});

/* ══════════════════════════════════════════════════════════════════════
   2. إرسال طلب صداقة
   لو الطرف التاني باعتلك طلب قبل كده، الطلبين بيتحوّلوا لصداقة فورًا
   بدل ما كل واحد يستنى التاني.
══════════════════════════════════════════════════════════════════════ */
router.post('/request', authenticateToken, (req, res) => {
  const me = req.user.id;
  /* بنقبل receiver_id أو username عشان الواجهة تبعت اللي عندها */
  let target = toId(req.body && req.body.receiver_id);
  if (!target && req.body && req.body.username) {
    const row = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(String(req.body.username).trim());
    if (row) target = row.id;
  }
  if (!target) return res.status(400).json({ error: 'مستخدم غير صحيح' });
  if (target === me) return res.status(400).json({ error: 'مش ممكن تضيف نفسك' });

  const receiver = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(target);
  if (!receiver) return res.status(404).json({ error: 'اللاعب مش موجود' });

  /* الحظر مايرجّعش رسالة تفرّق بين «محظور» و«مش موجود»، عشان الحظر
     مايتحوّلش لأداة يعرف بيها الطرف التاني إنه اتحظر */
  if (blockedBetween(me, target)) return res.status(403).json({ error: 'مش ممكن إرسال الطلب' });
  if (areFriends(me, target)) return res.status(409).json({ error: 'أنتم أصدقاء بالفعل' });

  const incoming = db.prepare(`SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'`).get(target, me);
  if (incoming) {
    db.transaction(() => {
      db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(incoming.id);
      db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)').run(me, target, target, me);
    })();
    const meRow = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users u WHERE u.id = ?`).get(me);
    realtime.push(target, { type: 'friend:added', friend: meRow });
    return res.json({ success: true, status: 'friends', message: 'بقيتم أصدقاء' });
  }

  try {
    /* طلب مرفوض قبل كده بيرجع pending تاني بدل ما يقف عند UNIQUE */
    const prev = db.prepare('SELECT id, status FROM friend_requests WHERE sender_id = ? AND receiver_id = ?').get(me, target);
    if (prev && prev.status === 'pending') return res.status(409).json({ error: 'الطلب مبعوت بالفعل' });
    if (prev) db.prepare(`UPDATE friend_requests SET status = 'pending', created_at = datetime('now') WHERE id = ?`).run(prev.id);
    else db.prepare('INSERT INTO friend_requests (sender_id, receiver_id) VALUES (?, ?)').run(me, target);
  } catch (e) {
    return res.status(409).json({ error: 'الطلب مبعوت بالفعل' });
  }

  const meRow = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users u WHERE u.id = ?`).get(me);
  realtime.push(target, { type: 'friend:request-received', from: meRow });
  res.json({ success: true, status: 'sent', message: 'تم إرسال الطلب' });
});

/* ══════════════════════════════════════════════════════════════════════
   3. الطلبات الواردة والصادرة
══════════════════════════════════════════════════════════════════════ */
router.get('/requests', authenticateToken, (req, res) => {
  const me = req.user.id;
  /* الأسماء الصريحة مقصودة: r.id و u.id الاتنين اسمهم id، ولو اتركوا
     كده SQLite بترجّع الأخير فبس، فـrequest_id كان بياخد مُعرِّف
     المستخدم والقبول بيرجع 404. */
  const incoming = db.prepare(`
    SELECT r.id AS request_id, r.created_at, ${PUBLIC_FIELDS}, p.is_online, p.in_game, p.last_seen_at
    FROM friend_requests r JOIN users u ON u.id = r.sender_id
    LEFT JOIN presence p ON p.user_id = u.id
    WHERE r.receiver_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `).all(me).map(r => ({ request_id: r.request_id, created_at: r.created_at, user_id: r.id, ...decorateStatus(r) }));

  const outgoing = db.prepare(`
    SELECT r.id AS request_id, r.created_at, ${PUBLIC_FIELDS}, p.is_online, p.in_game, p.last_seen_at
    FROM friend_requests r JOIN users u ON u.id = r.receiver_id
    LEFT JOIN presence p ON p.user_id = u.id
    WHERE r.sender_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `).all(me).map(r => ({ request_id: r.request_id, created_at: r.created_at, user_id: r.id, ...decorateStatus(r) }));

  res.json({ incoming, outgoing, count: incoming.length });
});

/* ══════════════════════════════════════════════════════════════════════
   4. قبول أو رفض طلب
══════════════════════════════════════════════════════════════════════ */
router.post('/respond', authenticateToken, (req, res) => {
  const me = req.user.id;
  const id = toId(req.body && req.body.request_id);
  const action = String((req.body && req.body.action) || '');
  if (!id) return res.status(400).json({ error: 'طلب غير صحيح' });
  if (action !== 'accept' && action !== 'decline') return res.status(400).json({ error: 'إجراء غير معروف' });

  const request = db.prepare(`SELECT id, sender_id FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = 'pending'`).get(id, me);
  if (!request) return res.status(404).json({ error: 'الطلب مش موجود أو اترد عليه' });

  if (action === 'accept') {
    db.transaction(() => {
      db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(id);
      db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)')
        .run(me, request.sender_id, request.sender_id, me);
    })();
    const meRow = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users u WHERE u.id = ?`).get(me);
    realtime.push(request.sender_id, { type: 'friend:added', friend: meRow });
    return res.json({ success: true, message: 'تم القبول' });
  }

  db.prepare(`UPDATE friend_requests SET status = 'declined' WHERE id = ?`).run(id);
  res.json({ success: true, message: 'تم الرفض' });
});

/* ══════════════════════════════════════════════════════════════════════
   5. قائمة الأصدقاء
   المتصلين الأول، وجوه المباريات بعدهم، والباقي بآخر ظهور — نفس ترتيب
   قوائم الأصدقاء في lichess: اللي ينفع تلعب معاه دلوقتي فوق.
══════════════════════════════════════════════════════════════════════ */
router.get('/', authenticateToken, (req, res) => {
  const me = req.user.id;
  const rows = db.prepare(`
    SELECT ${PUBLIC_FIELDS}, p.is_online, p.in_game, p.last_seen_at, f.since
    FROM friendships f
    JOIN users u ON u.id = f.friend_id
    LEFT JOIN presence p ON p.user_id = u.id
    WHERE f.user_id = ?
  `).all(me);

  const RANK = { online: 0, away: 1, 'in-game': 2, offline: 3 };
  const out = rows.map(r => ({ ...decorateStatus(r), since: r.since }))
    .sort((a, b) => (RANK[a.status] - RANK[b.status])
      || String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || ''))
      || String(a.display_name || a.username).localeCompare(String(b.display_name || b.username), 'ar'));
  res.json(out);
});

/* ══════════════════════════════════════════════════════════════════════
   6. دعوات المباريات
   الدعوة عمرها 90 ثانية. الرقم مقصود: أطول من كده الداعي بيسيب الشاشة
   وييجي القبول في وقت مش مناسب، وأقصر من كده مايكفيش إن صاحبك يبص
   على تليفونه.
══════════════════════════════════════════════════════════════════════ */
const INVITE_TTL_SECONDS = 90;

/* أي دعوة فات عليها وقتها بتتقفل قبل أي قراءة، عشان مافيش قارئ يشوف
   دعوة ميتة كأنها لسه حيّة */
function expireStale() {
  db.prepare(`UPDATE game_invites SET status = 'expired'
              WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < datetime('now')`).run();
}

router.post('/invite', authenticateToken, (req, res) => {
  expireStale();
  const me = req.user.id;
  const to = toId(req.body && (req.body.friend_id || req.body.to));
  const color = ['w', 'b', 'r'].includes(req.body && req.body.color) ? req.body.color : 'r';
  if (!to) return res.status(400).json({ error: 'صديق غير صحيح' });
  if (to === me) return res.status(400).json({ error: 'مش ممكن تدعي نفسك' });
  if (!areFriends(me, to)) return res.status(403).json({ error: 'ينفع تدعي أصدقاءك بس' });
  if (blockedBetween(me, to)) return res.status(403).json({ error: 'مش ممكن إرسال الدعوة' });

  /* دعوة واحدة حيّة بين الاتنين في الاتجاه ده */
  const live = db.prepare(`SELECT id FROM game_invites WHERE from_id = ? AND to_id = ? AND status = 'pending'`).get(me, to);
  if (live) return res.status(409).json({ error: 'فيه دعوة مبعوتة بالفعل', invite_id: live.id });

  const info = db.prepare(`INSERT INTO game_invites (from_id, to_id, color, expires_at)
                           VALUES (?, ?, ?, datetime('now', '+${INVITE_TTL_SECONDS} seconds'))`).run(me, to, color);
  const inviteId = info.lastInsertRowid;
  const meRow = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users u WHERE u.id = ?`).get(me);
  const delivered = realtime.push(to, {
    type: 'friend:invite-received',
    invite: { id: inviteId, from: meRow, color, expires_in: INVITE_TTL_SECONDS },
  });

  res.json({ success: true, invite_id: inviteId, delivered, expires_in: INVITE_TTL_SECONDS });
});

router.get('/invites', authenticateToken, (req, res) => {
  expireStale();
  const me = req.user.id;
  const incoming = db.prepare(`
    SELECT i.id AS invite_id, i.color, i.created_at, i.expires_at, ${PUBLIC_FIELDS}
    FROM game_invites i JOIN users u ON u.id = i.from_id
    WHERE i.to_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC
  `).all(me).map(r => ({
    invite_id: r.invite_id, color: r.color, expires_at: r.expires_at,
    from: { id: r.id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url || null },
  }));
  const outgoing = db.prepare(`
    SELECT i.id AS invite_id, i.color, i.created_at, i.expires_at, i.to_id
    FROM game_invites i WHERE i.from_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC
  `).all(me);
  res.json({ incoming, outgoing });
});

/* الرد على دعوة. القبول مابيفتحش الغرفة هنا: الغرف بتتولد في
   بروتوكول الـWebSocket في server.js، فبنسلّمه الدعوة عبر الجسر
   ونستنى منه كود الغرفة. */
router.post('/invite/respond', authenticateToken, (req, res) => {
  expireStale();
  const me = req.user.id;
  const id = toId(req.body && req.body.invite_id);
  const action = String((req.body && req.body.action) || '');
  if (!id) return res.status(400).json({ error: 'دعوة غير صحيحة' });
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'إجراء غير معروف' });

  const inv = db.prepare(`SELECT * FROM game_invites WHERE id = ? AND to_id = ? AND status = 'pending'`).get(id, me);
  if (!inv) return res.status(404).json({ error: 'الدعوة انتهت أو مش موجودة' });

  if (action === 'decline') {
    db.prepare(`UPDATE game_invites SET status = 'declined', responded_at = datetime('now') WHERE id = ?`).run(id);
    realtime.push(inv.from_id, { type: 'friend:invite-declined', invite_id: id, by: me });
    return res.json({ success: true });
  }

  db.prepare(`UPDATE game_invites SET status = 'accepted', responded_at = datetime('now') WHERE id = ?`).run(id);
  const meRow = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users u WHERE u.id = ?`).get(me);
  /* الداعي بياخد إشعار إن الدعوة اتقبلت — هو اللي بينشئ الغرفة عشان
     يبقى المستضيف، والمدعو بينضم بالكود اللي هييجي في friend:invite-room */
  realtime.push(inv.from_id, { type: 'friend:invite-accepted', invite_id: id, by: meRow, color: inv.color });
  res.json({ success: true, invite_id: id, color: inv.color, host_id: inv.from_id });
});

router.post('/invite/cancel', authenticateToken, (req, res) => {
  const me = req.user.id;
  const id = toId(req.body && req.body.invite_id);
  if (!id) return res.status(400).json({ error: 'دعوة غير صحيحة' });
  const inv = db.prepare(`SELECT to_id FROM game_invites WHERE id = ? AND from_id = ? AND status = 'pending'`).get(id, me);
  if (!inv) return res.status(404).json({ error: 'الدعوة مش موجودة' });
  db.prepare(`UPDATE game_invites SET status = 'cancelled', responded_at = datetime('now') WHERE id = ?`).run(id);
  realtime.push(inv.to_id, { type: 'friend:invite-cancelled', invite_id: id });
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════════
   7. الحظر
   الحظر بيشيل الصداقة ويلغي الطلبات والدعوات المفتوحة في نفس العملية —
   لو سيبناهم، الطرف المحظور يفضل شايف طلب معلّق مالوش نهاية.
══════════════════════════════════════════════════════════════════════ */
router.post('/block', authenticateToken, (req, res) => {
  const me = req.user.id;
  const target = toId(req.body && (req.body.user_id || req.body.friend_id));
  if (!target || target === me) return res.status(400).json({ error: 'مستخدم غير صحيح' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(target)) return res.status(404).json({ error: 'اللاعب مش موجود' });

  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO friend_blocks (blocker_id, blocked_id) VALUES (?, ?)').run(me, target);
    db.prepare('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').run(me, target, target, me);
    db.prepare(`UPDATE friend_requests SET status = 'declined'
                WHERE status = 'pending' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))`)
      .run(me, target, target, me);
    db.prepare(`UPDATE game_invites SET status = 'cancelled'
                WHERE status = 'pending' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`)
      .run(me, target, target, me);
  })();
  realtime.push(target, { type: 'friend:removed', user_id: me });
  res.json({ success: true });
});

router.post('/unblock', authenticateToken, (req, res) => {
  const me = req.user.id;
  const target = toId(req.body && req.body.user_id);
  if (!target) return res.status(400).json({ error: 'مستخدم غير صحيح' });
  db.prepare('DELETE FROM friend_blocks WHERE blocker_id = ? AND blocked_id = ?').run(me, target);
  res.json({ success: true });
});

router.get('/blocks', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT ${PUBLIC_FIELDS}, b.created_at
    FROM friend_blocks b JOIN users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ? ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json(rows.map(r => ({
    id: r.id, username: r.username, display_name: r.display_name,
    avatar_url: r.avatar_url || null, created_at: r.created_at,
  })));
});

/* ══════════════════════════════════════════════════════════════════════
   8. إزالة صديق
══════════════════════════════════════════════════════════════════════ */
router.delete('/:friendId', authenticateToken, (req, res) => {
  const me = req.user.id;
  const friendId = toId(req.params.friendId);
  if (!friendId) return res.status(400).json({ error: 'صديق غير صحيح' });

  const info = db.transaction(() => {
    const a = db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(me, friendId);
    db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(friendId, me);
    /* الطلبات القديمة بينهم بتتشال عشان أي طرف يقدر يبعت طلب جديد */
    db.prepare('DELETE FROM friend_requests WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)')
      .run(me, friendId, friendId, me);
    return a.changes;
  })();

  if (!info) return res.status(404).json({ error: 'مش في قائمة أصدقاءك' });
  realtime.push(friendId, { type: 'friend:removed', user_id: me });
  res.json({ success: true });
});

module.exports = router;
module.exports.setRealtime = setRealtime;
module.exports.INVITE_TTL_SECONDS = INVITE_TTL_SECONDS;
