/* ══════════════════════════════════════════════════════════════════════
   خصوصية على مستوى الحساب (زي واتساب) — HTTP + منطق الإنفاذ
   ──────────────────────────────────────────────────────────────────────
   • بتتخزّن في users.privacy_json (سيرفر-سايد) فبتفضل بعد تسجيل الخروج/الدخول.
   • كل مفتاح enum: Everyone | Friends | Nobody (أو On/Off لإيصالات القراءة).
   • القيمة الفاضية = الافتراضي (DEFAULTS تحت). القيم دي الوحيدة المقبولة.
   • الإنفاذ سيرفر-سايد مش في الواجهة بس: الدوال canX() بتتنادى من
     groups.js / server.js قبل أي فعل حسّاس.
   • الحظر بيتفوّق على أي إعداد: محظور = ممنوع دايمًا.
══════════════════════════════════════════════════════════════════════ */
'use strict';
const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

/* المفاتيح + خياراتها + الافتراضي (من بحث واتساب، متكيّف للّعبة). */
const SCHEMA = {
  who_can_add_me_to_parties:      { opts: ['everyone', 'friends', 'nobody'], def: 'friends' },
  who_can_message_me:             { opts: ['everyone', 'friends', 'nobody'], def: 'friends' },
  who_can_send_me_game_invites:   { opts: ['everyone', 'friends', 'nobody'], def: 'everyone' },
  who_can_send_me_friend_requests:{ opts: ['everyone', 'nobody'],            def: 'everyone' },
  who_can_see_my_online_status:   { opts: ['everyone', 'friends', 'nobody'], def: 'friends' },
  who_can_see_my_last_activity:   { opts: ['everyone', 'friends', 'nobody'], def: 'friends' },
  who_can_see_my_avatar:          { opts: ['everyone', 'friends', 'nobody'], def: 'everyone' },
  who_can_see_my_rating:          { opts: ['everyone', 'friends', 'nobody'], def: 'everyone' },
  read_receipts:                  { opts: ['on', 'off'],                     def: 'on' },
};

const DEFAULTS = Object.freeze(
  Object.fromEntries(Object.entries(SCHEMA).map(([k, v]) => [k, v.def]))
);

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

/* خصوصية مستخدم كاملة (الافتراضي + المخزّن). بترجّع نسخة آمنة دايمًا. */
function getPrivacy(userId) {
  const row = db.prepare('SELECT privacy_json FROM users WHERE id = ?').get(userId);
  let stored = {};
  if (row && row.privacy_json) {
    try { stored = JSON.parse(row.privacy_json) || {}; } catch (e) { stored = {}; }
  }
  const out = Object.assign({}, DEFAULTS);
  for (const k of Object.keys(SCHEMA)) {
    if (stored[k] && SCHEMA[k].opts.includes(String(stored[k]).toLowerCase())) {
      out[k] = String(stored[k]).toLowerCase();
    }
  }
  return out;
}

/* حفظ patch جزئي (بيتحقّق من كل مفتاح؛ المفاتيح/القيم الغلط بتتجاهل). */
function setPrivacy(userId, patch) {
  const cur = getPrivacy(userId);
  if (patch && typeof patch === 'object') {
    for (const [k, v] of Object.entries(patch)) {
      if (SCHEMA[k] && SCHEMA[k].opts.includes(String(v).toLowerCase())) {
        cur[k] = String(v).toLowerCase();
      }
    }
  }
  db.prepare('UPDATE users SET privacy_json = ? WHERE id = ?').run(JSON.stringify(cur), userId);
  return cur;
}

/* القاعدة العامة: هل actor مسموح له يعمل فعل محكوم بمفتاح على target؟
   الحظر أولًا (يتفوّق على كل حاجة)، بعدين قيمة الإعداد. */
function allowed(actorId, targetId, key) {
  actorId = toId(actorId); targetId = toId(targetId);
  if (!targetId) return false;
  if (!actorId) return getPrivacy(targetId)[key] === 'everyone'; // مجهول = زائر عام
  if (actorId === targetId) return true;
  if (blockedBetween(actorId, targetId)) return false;
  const val = getPrivacy(targetId)[key];
  if (val === 'everyone') return true;
  if (val === 'nobody') return false;
  if (val === 'friends') return areFriends(targetId, actorId);
  return false;
}

/* أفعال حسّاسة — أسماء واضحة عشان مواضع النداء تبقى مقروءة. */
const canAddToParty     = (actor, target) => allowed(actor, target, 'who_can_add_me_to_parties');
const canMessage        = (actor, target) => allowed(actor, target, 'who_can_message_me');
const canGameInvite     = (actor, target) => allowed(actor, target, 'who_can_send_me_game_invites');
const canFriendRequest  = (actor, target) => allowed(actor, target, 'who_can_send_me_friend_requests');
const canSeeOnline       = (viewer, owner) => allowed(viewer, owner, 'who_can_see_my_online_status');
const canSeeLastActivity = (viewer, owner) => allowed(viewer, owner, 'who_can_see_my_last_activity');
const canSeeAvatar       = (viewer, owner) => allowed(viewer, owner, 'who_can_see_my_avatar');
const canSeeRating       = (viewer, owner) => allowed(viewer, owner, 'who_can_see_my_rating');
function readReceiptsOn(userId) { return getPrivacy(userId).read_receipts !== 'off'; }

/* ── GET /api/privacy → إعداداتي الحالية (الافتراضي مدموج) ── */
router.get('/', authenticateToken, (req, res) => {
  try {
    res.json({ privacy: getPrivacy(req.user.id), defaults: DEFAULTS });
  } catch (e) {
    console.error('[privacy] get failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

/* ── POST /api/privacy → حفظ patch جزئي، بيرجّع الحالة بعد الحفظ ── */
router.post('/', authenticateToken, (req, res) => {
  try {
    const saved = setPrivacy(req.user.id, req.body && typeof req.body === 'object' ? req.body : {});
    res.json({ ok: true, privacy: saved });
  } catch (e) {
    console.error('[privacy] set failed:', e.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
module.exports.DEFAULTS = DEFAULTS;
module.exports.SCHEMA = SCHEMA;
module.exports.getPrivacy = getPrivacy;
module.exports.setPrivacy = setPrivacy;
module.exports.canAddToParty = canAddToParty;
module.exports.canMessage = canMessage;
module.exports.canGameInvite = canGameInvite;
module.exports.canFriendRequest = canFriendRequest;
module.exports.canSeeOnline = canSeeOnline;
module.exports.canSeeLastActivity = canSeeLastActivity;
module.exports.canSeeAvatar = canSeeAvatar;
module.exports.canSeeRating = canSeeRating;
module.exports.readReceiptsOn = readReceiptsOn;
