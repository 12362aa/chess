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

module.exports = { applyResult, publicRating, getUserRating };
