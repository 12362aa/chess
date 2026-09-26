'use strict';
/*
 * economy.js — العمود الفقري لاقتصاد Am-Kh Coins (المرحلة ١).
 * ────────────────────────────────────────────────────────────────────
 * كل شيء موثوق من الخادم: العملات وXP والملكية والإنجازات تُكتب هنا فقط
 * عبر req.user.id، لا من أي بلوب عميلي. coin_ledger أساس-إلحاقيّ = مصدر
 * الحقيقة، وwallet.coins نسخة مشتقّة مخزّنة للسرعة تُطابَق مع مجموع الدفتر.
 * لا Pay-to-Win: العملات/XP تجميليّة بحتة ولا تمسّ تقييم Glicko إطلاقًا.
 */

const db = require('./db.js');
const { authenticateToken } = require('./auth.js');
const express = require('express');
const router = express.Router();

/* ══ أرقام الكسب (قابلة للضبط، متوازنة ضد الاستغلال) ══ */
const AWARD = {
  game_win:  { coins: 25, xp: 40 },
  game_draw: { coins: 12, xp: 25 },
  game_loss: { coins: 8,  xp: 15 },   // مشاركة: لا يُعاقَب الخاسر
  puzzle:    { coins: 10, xp: 12 },
  beat_nour: { coins: 15, xp: 20 },
};
const WELCOME_COINS = 200;            // منحة الإطلاق للحسابات الموجودة/الجديدة
const PUZZLE_DAILY_CAP = 20;          // سقف ألغاز مكسِبة يوميًّا (مضادّ للتفريخ)
const MAX_LEVEL = 50;

/* منحنى الخبرة: كلفة الانتقال من مستوى n إلى n+1 = 100 + (n-1)*25.
   تراكميًّا حتى المستوى 50 ≈ 122500 XP. دالّة نقيّة يتّفق عليها العميل والخادم. */
function xpToReach(level) {
  let total = 0;
  for (let n = 1; n < level; n++) total += 100 + (n - 1) * 25;
  return total;
}
function levelForXp(xp) {
  let L = 1;
  while (L < MAX_LEVEL && xp >= xpToReach(L + 1)) L++;
  return L;
}

/* ══ تعريفات الإنجازات (بذرة المرحلة ١) ══
   retro=true تُحسَب بأثر رجعي من سجلّ الخادم عند أول دخول بعد التحديث. */
const ACHIEVEMENTS = [
  { id: 'first_win',  coins: 30,  xp: 50,  retro: true,  test: s => s.wins >= 1 },
  { id: 'wins_10',    coins: 80,  xp: 120, retro: true,  test: s => s.wins >= 10 },
  { id: 'games_100',  coins: 150, xp: 200, retro: true,  test: s => s.games >= 100 },
  { id: 'rating_1600',coins: 120, xp: 160, retro: true,  test: s => s.rating >= 1600 },
  { id: 'puzzle_50',  coins: 90,  xp: 120, retro: true,  test: s => s.puzzles >= 50 },
  { id: 'beat_nour',  coins: 60,  xp: 80,  retro: false, test: () => false }, // يُمنح بحدث من العميل لاحقًا
];

/* ══════════════════════════════════════════════════════════════════
   المتجر (المرحلة ٢): كتالوج تجميليّ بحت + دوران حتميّ كل ٤ ساعات.
   ────────────────────────────────────────────────────────────────
   كل عنصر تجميليّ فقط (إطار/خلفية/شارة/احتفال فوز/مؤثّر كش-مات) — لا
   يمسّ التقييم ولا اللعب. الأسعار حسب الندرة. الدوران دالّة نقيّة على
   epoch (رقم النافذة الزمنيّة) يتّفق عليها الخادم والعميل دون تنسيق:
   نفس الـepoch ⇒ نفس العناصر عند الجميع. الخادم مرجعُ الوقت والشراء.
   الاسمان (ar/en) يُرسَلان من الخادم مباشرةً فلا تسريب i18n ولا ازدواج. */
const STORE_PERIOD_MS = 4 * 3600 * 1000;   // نافذة الدوران: ٤ ساعات
const STORE_SLOTS = 6;                      // عدد العناصر المعروضة كل نافذة
const RARITY_PRICE = { common: 120, rare: 300, epic: 650, legendary: 1400, seasonal: 1000 };

const STORE_CATALOG = [
  // إطارات الأفاتار (تظهر حول صورة اللاعب في كل مكان — المرحلة ٣)
  { id: 'frame_gold',    type: 'frame',       rarity: 'rare',      ar: 'إطارٌ ذهبيّ',        en: 'Golden Frame' },
  { id: 'frame_neon',    type: 'frame',       rarity: 'epic',      ar: 'إطارٌ نيونيّ',       en: 'Neon Frame' },
  { id: 'frame_flame',   type: 'frame',       rarity: 'epic',      ar: 'إطارُ اللهب',        en: 'Flame Frame' },
  { id: 'frame_frost',   type: 'frame',       rarity: 'rare',      ar: 'إطارُ الصقيع',       en: 'Frost Frame' },
  { id: 'frame_royal',   type: 'frame',       rarity: 'legendary', ar: 'إطارٌ ملكيّ',        en: 'Royal Frame' },
  { id: 'frame_ocean',   type: 'frame',       rarity: 'rare',      ar: 'إطارُ المحيط',       en: 'Ocean Frame' },
  { id: 'frame_aurora',  type: 'frame',       rarity: 'legendary', ar: 'إطارُ الشفق القطبيّ', en: 'Aurora Frame' },
  // خلفيات البطاقة
  { id: 'bg_aurora',     type: 'background',  rarity: 'epic',      ar: 'خلفيّةُ الشفق',       en: 'Aurora Background' },
  { id: 'bg_nebula',     type: 'background',  rarity: 'legendary', ar: 'خلفيّةُ السديم',      en: 'Nebula Background' },
  { id: 'bg_sunset',     type: 'background',  rarity: 'rare',      ar: 'خلفيّةُ الغروب',      en: 'Sunset Background' },
  { id: 'bg_forest',     type: 'background',  rarity: 'common',    ar: 'خلفيّةُ الغابة',      en: 'Forest Background' },
  { id: 'bg_royal',      type: 'background',  rarity: 'epic',      ar: 'خلفيّةٌ ملكيّة',      en: 'Royal Background' },
  // شارات بجانب الاسم
  { id: 'badge_star',    type: 'badge',       rarity: 'common',    ar: 'شارةُ النجمة',        en: 'Star Badge' },
  { id: 'badge_crown',   type: 'badge',       rarity: 'legendary', ar: 'شارةُ التاج',         en: 'Crown Badge' },
  { id: 'badge_bolt',    type: 'badge',       rarity: 'rare',      ar: 'شارةُ الصاعقة',       en: 'Bolt Badge' },
  { id: 'badge_shield',  type: 'badge',       rarity: 'epic',      ar: 'شارةُ الدرع',         en: 'Shield Badge' },
  { id: 'badge_flame',   type: 'badge',       rarity: 'rare',      ar: 'شارةُ اللهب',         en: 'Flame Badge' },
  // احتفالات الفوز (تظهر عند الانتصار)
  { id: 'cel_confetti',  type: 'celebration', rarity: 'common',    ar: 'احتفالُ القصاصات',    en: 'Confetti Celebration' },
  { id: 'cel_fireworks', type: 'celebration', rarity: 'epic',      ar: 'احتفالُ الألعاب النارية', en: 'Fireworks Celebration' },
  { id: 'cel_petals',    type: 'celebration', rarity: 'rare',      ar: 'احتفالُ البتلات',     en: 'Petals Celebration' },
  { id: 'cel_stars',     type: 'celebration', rarity: 'legendary', ar: 'احتفالُ النجوم',      en: 'Starfall Celebration' },
  // مؤثّرات الكش-مات (تظهر لحظة إنهاء المباراة)
  { id: 'fx_shatter',    type: 'mate_fx',     rarity: 'epic',      ar: 'مؤثّرُ التحطيم',      en: 'Shatter Effect' },
  { id: 'fx_lightning',  type: 'mate_fx',     rarity: 'legendary', ar: 'مؤثّرُ البرق',        en: 'Lightning Effect' },
  { id: 'fx_goldrain',   type: 'mate_fx',     rarity: 'rare',      ar: 'مؤثّرُ المطرِ الذهبيّ', en: 'Gold Rain Effect' },
  { id: 'fx_seasonal_snow', type: 'mate_fx',  rarity: 'seasonal',  ar: 'مؤثّرُ الثلجِ الموسميّ', en: 'Seasonal Snow Effect' },
];
const STORE_BY_ID = Object.create(null);
for (const it of STORE_CATALOG) { it.price = RARITY_PRICE[it.rarity] || 300; STORE_BY_ID[it.id] = it; }

/* بذرة حتميّة من الـepoch (FNV-1a) ⇒ mulberry32 ⇒ خلط Fisher-Yates.
   نفس الـepoch يعطي نفس ترتيب العناصر عند الخادم وكل العملاء. */
function _fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function _mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function storeEpoch(now) { return Math.floor((now == null ? Date.now() : now) / STORE_PERIOD_MS); }
function storeItemsForEpoch(epoch) {
  const rng = _mulberry32(_fnv1a('amkh-store:' + epoch));
  const pool = STORE_CATALOG.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, STORE_SLOTS);
}
function storeCurrent(userId, now) {
  const t = (now == null ? Date.now() : now);
  const epoch = storeEpoch(t);
  const owned = new Set(userId ? qOwned.all(userId).map(r => r.item_id) : []);
  const items = storeItemsForEpoch(epoch).map(it => ({
    id: it.id, type: it.type, rarity: it.rarity, price: it.price,
    ar: it.ar, en: it.en, owned: owned.has(it.id),
  }));
  return { epoch, endsAt: (epoch + 1) * STORE_PERIOD_MS, serverNow: t, periodMs: STORE_PERIOD_MS, items };
}

/* الشراء: تحقّق ذرّيّ — العنصر ضمن النافذة الحاليّة + غير مملوك + الرصيد
   كافٍ — ثم خصمٌ في coin_ledger + إضافةُ ملكيّةٍ دائمة في user_cosmetics.
   يرجّع {ok, reason}. reason: ok | not_in_window | owned | insufficient | bad_item. */
const qOwnsItem  = db.prepare('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND item_id = ? LIMIT 1');
const insCosmetic= db.prepare("INSERT OR IGNORE INTO user_cosmetics (user_id, item_id, source) VALUES (?, ?, 'store')");
function purchase(userId, itemId) {
  userId = Number(userId);
  const item = STORE_BY_ID[itemId];
  if (!userId || !item) return { ok: false, reason: 'bad_item' };
  const windowIds = new Set(storeItemsForEpoch(storeEpoch()).map(i => i.id));
  if (!windowIds.has(itemId)) return { ok: false, reason: 'not_in_window' };
  const tx = db.transaction(() => {
    ensureWallet(userId);
    if (qOwnsItem.get(userId, itemId)) return { ok: false, reason: 'owned' };
    const w = qWallet.get(userId) || { coins: 0, xp: 0 };
    if ((Number(w.coins) || 0) < item.price) return { ok: false, reason: 'insufficient' };
    insLedger.run(userId, -item.price, 0, 'buy', 'buy:' + itemId);
    updWallet.run(-item.price, 0, levelForXp(Number(w.xp) || 0), userId);
    insCosmetic.run(userId, itemId);
    return { ok: true, reason: 'ok' };
  });
  try { return tx(); } catch (e) { console.error('[economy] purchase failed:', e.message); return { ok: false, reason: 'error' }; }
}

/* ══ عبارات SQL مُجهَّزة ══ */
const qWallet   = db.prepare('SELECT coins, xp, level, granted FROM wallet WHERE user_id = ?');
const insWallet = db.prepare("INSERT OR IGNORE INTO wallet (user_id, coins, xp, level) VALUES (?, 0, 0, 1)");
const insLedger = db.prepare('INSERT INTO coin_ledger (user_id, delta, xp, reason, ref) VALUES (?,?,?,?,?)');
const updWallet = db.prepare("UPDATE wallet SET coins = coins + ?, xp = xp + ?, level = ?, updated_at = datetime('now') WHERE user_id = ?");
const qRefExists= db.prepare('SELECT 1 FROM coin_ledger WHERE user_id = ? AND ref = ? LIMIT 1');
const qStats    = db.prepare('SELECT rating, rating_games, wins, losses, draws, puzzle_solved FROM users WHERE id = ?');
const qAch      = db.prepare('SELECT ach_id FROM achievements WHERE user_id = ?');
const insAch    = db.prepare('INSERT OR IGNORE INTO achievements (user_id, ach_id) VALUES (?, ?)');
const qOwned    = db.prepare('SELECT item_id FROM user_cosmetics WHERE user_id = ?');
const qEquipped = db.prepare('SELECT equipped_frame, equipped_background, equipped_badge, equipped_celebration, equipped_mate_fx FROM users WHERE id = ?');

function ensureWallet(userId) {
  insWallet.run(userId);
}

/* المنح الجوهري: سطر في الدفتر + تحديث المحفظة المشتقّة، ذرّيًّا.
   ref اختياري لمنع التكرار (نفس الحدث لا يُمنَح مرّتين). يرجّع false لو
   الـref موجود سلفًا (تكرار مرفوض)، وإلا true. */
function grant(userId, coins, xp, reason, ref) {
  userId = Number(userId);
  if (!userId) return false;
  coins = Math.round(Number(coins) || 0);
  xp = Math.round(Number(xp) || 0);
  const tx = db.transaction(() => {
    ensureWallet(userId);
    if (ref && qRefExists.get(userId, ref)) return false;
    insLedger.run(userId, coins, xp, String(reason || 'grant'), ref || null);
    const w = qWallet.get(userId) || { xp: 0 };
    const newLevel = levelForXp((Number(w.xp) || 0) + xp);
    updWallet.run(coins, xp, newLevel, userId);
    return true;
  });
  try { return tx(); } catch (e) { console.error('[economy] grant failed:', e.message); return false; }
}

/* كسب نتيجة مباراة (يُستدعى من finalizeGame). outcome: win|draw|loss. */
function awardGame(userId, outcome, roomRef) {
  const key = outcome === 'win' ? 'game_win' : outcome === 'draw' ? 'game_draw' : 'game_loss';
  const a = AWARD[key];
  if (!a) return;
  // ref فريد لكل (مستخدم، غرفة، نتيجة) يمنع منح نفس المباراة مرّتين
  grant(userId, a.coins, a.xp, key, roomRef ? `game:${roomRef}` : null);
  try { evaluateAchievements(userId); } catch (e) {}
}

/* تقييم الإنجازات: يمنح أي إنجاز استوفى شرطه ولم يُمنَح بعد.
   retroOnly=true يقتصر على الإنجازات القابلة للحساب الرجعي (عند الإطلاق). */
function evaluateAchievements(userId, retroOnly) {
  const s = statsSnapshot(userId);
  const have = new Set(qAch.all(userId).map(r => r.ach_id));
  for (const ach of ACHIEVEMENTS) {
    if (retroOnly && !ach.retro) continue;
    if (have.has(ach.id)) continue;
    let ok = false;
    try { ok = !!ach.test(s); } catch (e) { ok = false; }
    if (!ok) continue;
    insAch.run(userId, ach.id);
    grant(userId, ach.coins, ach.xp, 'ach:' + ach.id, 'ach:' + ach.id);
  }
}

function statsSnapshot(userId) {
  const u = qStats.get(userId) || {};
  return {
    rating: Math.round(Number(u.rating) || 1500),
    games: Number(u.rating_games) || ((Number(u.wins) || 0) + (Number(u.losses) || 0) + (Number(u.draws) || 0)),
    wins: Number(u.wins) || 0,
    losses: Number(u.losses) || 0,
    draws: Number(u.draws) || 0,
    puzzles: Number(u.puzzle_solved) || 0,
  };
}

/* منحة الإطلاق + الحساب الرجعي: مرّة واحدة لكل حساب (wallet.granted). */
function ensureLaunchGrant(userId) {
  ensureWallet(userId);
  const w = qWallet.get(userId);
  if (w && w.granted) return;
  grant(userId, WELCOME_COINS, 0, 'grant', 'welcome');
  try { evaluateAchievements(userId, true); } catch (e) {}
  db.prepare('UPDATE wallet SET granted = 1 WHERE user_id = ?').run(userId);
}

/* لقطة كاملة للعميل (مرآة قراءة فقط — العميل لا يكتبها للخادم). */
function snapshot(userId) {
  ensureLaunchGrant(userId);
  const w = qWallet.get(userId) || { coins: 0, xp: 0, level: 1 };
  const eq = qEquipped.get(userId) || {};
  return {
    coins: Number(w.coins) || 0,
    xp: Number(w.xp) || 0,
    level: Number(w.level) || 1,
    nextLevelXp: xpToReach((Number(w.level) || 1) + 1),
    thisLevelXp: xpToReach(Number(w.level) || 1),
    maxLevel: MAX_LEVEL,
    owned: qOwned.all(userId).map(r => r.item_id),
    achievements: qAch.all(userId).map(r => r.ach_id),
    equipped: {
      frame: eq.equipped_frame || null,
      background: eq.equipped_background || null,
      badge: eq.equipped_badge || null,
      celebration: eq.equipped_celebration || null,
      mate_fx: eq.equipped_mate_fx || null,
    },
  };
}

/* عدد الألغاز المكسِبة اليوم (سقف يومي مضادّ للتفريخ). */
const qPuzzleToday = db.prepare(
  "SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'puzzle' AND date(created_at) = date('now')"
);

/* ══ المسارات ══ */
router.get('/me', authenticateToken, (req, res) => {
  try { res.json(snapshot(req.user.id)); }
  catch (e) { console.error('[economy] /me', e.message); res.status(500).json({ error: 'economy_error' }); }
});

/* حلّ لغز: كسب موثّق مع سقف يومي ومنع تكرار نفس اللغز في نفس اليوم.
   التحقّق أساسيّ (السقف + التكرار)؛ الحلّ الفعلي يُتحقّق على الجهاز، لكن
   الخادم يمنع التفريخ. */
router.post('/puzzle-solved', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const pid = (req.body && (req.body.puzzleId != null)) ? String(req.body.puzzleId).slice(0, 40) : '';
  try {
    ensureWallet(userId);
    const today = qPuzzleToday.get(userId).n;
    if (today >= PUZZLE_DAILY_CAP) return res.json({ awarded: false, reason: 'daily_cap', ...snapshot(userId) });
    const day = new Date().toISOString().slice(0, 10);
    const ref = pid ? `pz:${pid}:${day}` : `pz:anon:${day}:${today}`;
    const ok = grant(userId, AWARD.puzzle.coins, AWARD.puzzle.xp, 'puzzle', ref);
    try { evaluateAchievements(userId); } catch (e) {}
    return res.json({ awarded: ok, reason: ok ? 'ok' : 'dup', ...snapshot(userId) });
  } catch (e) {
    console.error('[economy] /puzzle-solved', e.message);
    res.status(500).json({ error: 'economy_error' });
  }
});

/* حدث «هزيمة نور» من العميل (وضع اللعب ضدّ نور) — يُمنح مرّة واحدة. */
router.post('/beat-nour', authenticateToken, (req, res) => {
  const userId = req.user.id;
  try {
    ensureWallet(userId);
    const have = new Set(qAch.all(userId).map(r => r.ach_id));
    let awarded = false;
    if (!have.has('beat_nour')) {
      insAch.run(userId, 'beat_nour');
      grant(userId, AWARD.beat_nour.coins, AWARD.beat_nour.xp, 'ach:beat_nour', 'ach:beat_nour');
      awarded = true;
    }
    res.json({ awarded, ...snapshot(userId) });
  } catch (e) { res.status(500).json({ error: 'economy_error' }); }
});

/* ══ متجر: النافذة الحاليّة + الشراء ══ */
router.get('/store/current', authenticateToken, (req, res) => {
  try { res.json(storeCurrent(req.user.id)); }
  catch (e) { console.error('[economy] /store/current', e.message); res.status(500).json({ error: 'store_error' }); }
});
router.post('/store/buy', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const itemId = (req.body && req.body.itemId != null) ? String(req.body.itemId).slice(0, 40) : '';
  try {
    ensureWallet(userId);
    const r = purchase(userId, itemId);
    res.json({ ...r, store: storeCurrent(userId), ...snapshot(userId) });
  } catch (e) {
    console.error('[economy] /store/buy', e.message);
    res.status(500).json({ error: 'store_error' });
  }
});

module.exports = {
  router,
  grant,
  awardGame,
  evaluateAchievements,
  ensureLaunchGrant,
  snapshot,
  levelForXp,
  xpToReach,
  purchase,
  storeCurrent,
  storeItemsForEpoch,
  storeEpoch,
  AWARD,
  ACHIEVEMENTS,
  STORE_CATALOG,
  STORE_PERIOD_MS,
};

