'use strict';
/*
 * rating-store.js — الوصلة بين محرّك Glicko-2 (rating.js) وقاعدة البيانات.
 * بيطبّق نتيجة مباراة مصنّفة على حسابَي اللاعبين، بيخزّن سجل audit،
 * وبيرجّع الفروقات عشان نعرضها للطرفين بشفافية.
 */

const db = require('./db.js');
const R = require('./rating.js');

const getUserRating = db.prepare(
  'SELECT id, rating, rating_rd, rating_vol, rating_games, rating_peak, wins, losses, draws FROM users WHERE id = ?'
);
const updUser = db.prepare(`
  UPDATE users SET
    rating = ?, rating_rd = ?, rating_vol = ?,
    rating_games = rating_games + 1,
    rating_peak = MAX(COALESCE(rating_peak, 1500), ?),
    wins = wins + ?, losses = losses + ?, draws = draws + ?,
    rating_updated_at = datetime('now')
  WHERE id = ?
`);
const insGame = db.prepare(`
  INSERT INTO rated_games
    (white_id, black_id, winner, reason,
     w_r_before, w_rd_before, w_vol_before, b_r_before, b_rd_before, b_vol_before,
     w_r_after,  w_rd_after,  w_vol_after,  b_r_after,  b_rd_after,  b_vol_after, moves)
  VALUES (?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?, ?)
`);

function snap(row) {
  return {
    r: row && isFinite(row.rating) ? row.rating : R.DEFAULT_R,
    rd: row && isFinite(row.rating_rd) ? row.rating_rd : R.DEFAULT_RD,
    vol: row && isFinite(row.rating_vol) ? row.rating_vol : R.DEFAULT_VOL,
    /* عدد المباريات المصنّفة قبل دي — رقم مهم: بيه applyGame تعرف اللاعب
       لسه في مرحلة المعايرة (سقف حركة أوسع) ولا استقرّ (سقف ضيّق). */
    games: row && isFinite(row.rating_games) ? row.rating_games : 0,
  };
}

/*
 * طبّق نتيجة مباراة مصنّفة.
 *   whiteId, blackId : هوية اللاعبين (لازم الاتنين مسجّلين)
 *   winner           : 'white' | 'black' | 'draw'
 *   reason           : سبب نصّي (checkmate/resign/timeout/…)
 *   moves            : (اختياري) مصفوفة/نص النقلات للأرشفة
 * بيرجّع { white:{before,after,delta,provisional}, black:{...} } أو null لو فشل.
 */
function applyResult(whiteId, blackId, winner, reason, moves) {
  whiteId = Number(whiteId);
  blackId = Number(blackId);
  if (!whiteId || !blackId || whiteId === blackId) return null;
  if (!['white', 'black', 'draw'].includes(winner)) return null;

  const wRow = getUserRating.get(whiteId);
  const bRow = getUserRating.get(blackId);
  if (!wRow || !bRow) return null;

  const wBefore = snap(wRow);
  const bBefore = snap(bRow);

  // نتيجة الأبيض (score للأبيض): فوز=1، تعادل=0.5، خسارة=0
  const scoreW = winner === 'white' ? 1 : winner === 'draw' ? 0.5 : 0;

  const out = R.applyGame(wBefore, bBefore, scoreW);
  const wAfter = out.a;
  const bAfter = out.b;

  const wWin = winner === 'white' ? 1 : 0;
  const wLoss = winner === 'black' ? 1 : 0;
  const wDraw = winner === 'draw' ? 1 : 0;

  const tx = db.transaction(() => {
    updUser.run(round(wAfter.r), round2(wAfter.rd), wAfter.vol, round(wAfter.r), wWin, wLoss, wDraw, whiteId);
    updUser.run(round(bAfter.r), round2(bAfter.rd), bAfter.vol, round(bAfter.r), wLoss, wWin, wDraw, blackId);
    insGame.run(
      whiteId, blackId, winner, String(reason || ''),
      wBefore.r, wBefore.rd, wBefore.vol, bBefore.r, bBefore.rd, bBefore.vol,
      wAfter.r, wAfter.rd, wAfter.vol, bAfter.r, bAfter.rd, bAfter.vol,
      moves ? JSON.stringify(moves).slice(0, 20000) : null
    );
  });
  tx();

  return {
    white: pack(wBefore, wAfter),
    black: pack(bBefore, bAfter),
  };
}

function pack(before, after) {
  return {
    before: round(before.r),
    after: round(after.r),
    delta: round(after.r) - round(before.r),
    rd: round2(after.rd),
    provisional: R.isProvisional(after.rd),
  };
}
function round(x) { return Math.round(x); }
function round2(x) { return Math.round(x * 100) / 100; }

// ملخّص تقييم للعرض العام
function publicRating(row) {
  if (!row) return null;
  const rd = isFinite(row.rating_rd) ? row.rating_rd : R.DEFAULT_RD;
  return {
    rating: Math.round(isFinite(row.rating) ? row.rating : R.DEFAULT_R),
    rd: Math.round(rd),
    provisional: R.isProvisional(rd),
    games: row.rating_games || 0,
    peak: Math.round(isFinite(row.rating_peak) ? row.rating_peak : R.DEFAULT_R),
    wins: row.wins || 0,
    losses: row.losses || 0,
    draws: row.draws || 0,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   إحصاء كل المباريات (ودّية + مصنّفة) — #12
   ──────────────────────────────────────────────────────────────────────
   لوحة التصنيف كانت بتعرض أرقامًا ناقصة لأن wins/losses/draws كانت
   بتتكتب جوه applyResult بس، واللي مابيتنفّذش غير للمباريات المصنّفة.
   والمباريات بين الأصدقاء افتراضيًا «ودّية»، فمعظم الانتصارات الحقيقية
   ماكانت بتتسجّل أبدًا.

   recordPlayed بتسجّل نتيجة أي مباراة أونلاين خلصت بين حسابين مسجّلين:
   • بتزوّد wins/losses/draws للطرفين (بدون لمس التقييم أو rating_games —
     التقييم لسه للمصنّفة بس عشان النزاهة).
   • بتكتب سجلًا في game_log (أرشيف كامل يغذّي صفحة الملف الشخصي #17).
   الحماية من التكرار مسؤولية المنادي (room.statsDone).
══════════════════════════════════════════════════════════════════════ */
const updStats = db.prepare(`
  UPDATE users SET wins = wins + ?, losses = losses + ?, draws = draws + ?
  WHERE id = ?
`);
const insLog = db.prepare(`
  INSERT INTO game_log (white_id, black_id, winner, reason, rated, tc, moves)
  VALUES (?,?,?,?,?,?,?)
`);

function recordPlayed(whiteId, blackId, winner, reason, opts) {
  whiteId = Number(whiteId);
  blackId = Number(blackId);
  if (!whiteId || !blackId || whiteId === blackId) return null;
  if (!['white', 'black', 'draw'].includes(winner)) return null;
  const o = opts || {};
  const rated = o.rated ? 1 : 0;
  const wWin = winner === 'white' ? 1 : 0;
  const wLoss = winner === 'black' ? 1 : 0;
  const wDraw = winner === 'draw' ? 1 : 0;

  try {
    const tx = db.transaction(() => {
      /* المصنّفة بتزوّد العدّادات جوه applyResult، فمانزوّدهاش تاني هنا */
      if (!rated) {
        updStats.run(wWin, wLoss, wDraw, whiteId);
        updStats.run(wLoss, wWin, wDraw, blackId);
      }
      insLog.run(
        whiteId, blackId, winner, String(reason || ''), rated,
        o.tc ? JSON.stringify(o.tc) : null,
        o.moves ? JSON.stringify(o.moves).slice(0, 20000) : null
      );
    });
    tx();
  } catch (e) {
    console.error('[stats] recordPlayed failed:', e.message);
    return null;
  }
  const w = getUserRating.get(whiteId);
  const b = getUserRating.get(blackId);
  return { white: publicRating(w), black: publicRating(b) };
}

/* آخر المباريات لحساب معيّن (لصفحة الملف الشخصي) */
const qRecent = db.prepare(`
  SELECT g.id, g.white_id, g.black_id, g.winner, g.reason, g.rated, g.created_at,
         wu.display_name AS white_name, wu.avatar_url AS white_avatar,
         bu.display_name AS black_name, bu.avatar_url AS black_avatar
    FROM game_log g
    LEFT JOIN users wu ON wu.id = g.white_id
    LEFT JOIN users bu ON bu.id = g.black_id
   WHERE g.white_id = ? OR g.black_id = ?
   ORDER BY g.id DESC LIMIT ?
`);
function recentGames(userId, limit) {
  const uid = Number(userId);
  if (!uid) return [];
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  try {
    return qRecent.all(uid, uid, n).map(g => {
      const iAmWhite = g.white_id === uid;
      const outcome = g.winner === 'draw' ? 'draw'
        : ((g.winner === 'white') === iAmWhite ? 'win' : 'loss');
      return {
        id: g.id,
        at: g.created_at,
        color: iAmWhite ? 'w' : 'b',
        outcome,
        reason: g.reason || '',
        rated: !!g.rated,
        opp_id: iAmWhite ? g.black_id : g.white_id,
        opp_name: (iAmWhite ? g.black_name : g.white_name) || 'لاعب',
        opp_avatar: (iAmWhite ? g.black_avatar : g.white_avatar) || null,
      };
    });
  } catch (e) { return []; }
}

/* أرقام مجمّعة من الأرشيف (بتغذّي صفحة الملف الشخصي #17) */
function statsOf(userId) {
  const uid = Number(userId);
  const empty = { total: 0, wins: 0, losses: 0, draws: 0, rated: 0, friendly: 0, as_white: 0, as_black: 0, streak: 0, streak_kind: '' };
  if (!uid) return empty;
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN rated = 1 THEN 1 ELSE 0 END) AS rated,
             SUM(CASE WHEN white_id = ? THEN 1 ELSE 0 END) AS as_white
        FROM game_log WHERE white_id = ? OR black_id = ?
    `).get(uid, uid, uid) || {};
    const u = getUserRating.get(uid) || {};
    const recent = recentGames(uid, 50);
    let streak = 0, kind = '';
    for (const g of recent) {
      if (!kind) { kind = g.outcome; streak = 1; continue; }
      if (g.outcome === kind) streak++; else break;
    }
    const total = row.total || 0;
    return {
      total,
      wins: u.wins || 0, losses: u.losses || 0, draws: u.draws || 0,
      rated: row.rated || 0,
      friendly: total - (row.rated || 0),
      as_white: row.as_white || 0,
      as_black: total - (row.as_white || 0),
      streak, streak_kind: kind,
    };
  } catch (e) { return empty; }
}

module.exports = { applyResult, publicRating, getUserRating, recordPlayed, recentGames, statsOf, CALIB_GAMES: R.CALIB_GAMES };
