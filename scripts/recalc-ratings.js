'use strict';
/*
 * recalc-ratings.js — إعادة بناء تقييمات Glicko-2 من أرشيف المباريات المصنّفة.
 * ─────────────────────────────────────────────────────────────────────────
 * ليه؟ قبل ما نحدّ حركة التقييم في المباراة الواحدة، كانت المباراة الواحدة
 * بتودّي التقييم +336 أو −167. الأرقام اللي في القاعدة دلوقتي اتولدت
 * بالقواعد القديمة، فلوحة التصنيف بتعرض أرقامًا مالهاش معنى ولاعبين
 * اشتكوا منها فعلًا. الأرشيف (rated_games) كامل ومترتّب، فنقدر نعيد
 * المسار من الأول بالقواعد الجديدة — نفس المباريات، نفس النتائج، أرقام
 * عادلة.
 *
 * بيعيد حساب: rating, rating_rd, rating_vol, rating_games, rating_peak
 *             + أعمدة before/after في rated_games (يبقى الأرشيف متسق).
 * مابيلمسش:   wins, losses, draws, أي بيانات تانية.
 *
 * الاستخدام:
 *   node scripts/recalc-ratings.js            # معاينة فقط (مافيش كتابة)
 *   node scripts/recalc-ratings.js --apply    # ينفّذ بعد نسخة احتياطية
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const R = require(path.join(__dirname, '..', 'rating.js'));

const APPLY = process.argv.includes('--apply');
const DB_PATH = process.env.AMKH_DB_PATH || path.join(__dirname, '..', 'data.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('✗ مالقيتش قاعدة البيانات:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const games = db.prepare(`
  SELECT id, white_id, black_id, winner FROM rated_games ORDER BY id ASC
`).all();

if (!games.length) {
  console.log('مافيش مباريات مصنّفة في الأرشيف — مافيش حاجة تتعاد.');
  process.exit(0);
}

const fresh = () => ({ r: R.DEFAULT_R, rd: R.DEFAULT_RD, vol: R.DEFAULT_VOL, games: 0, peak: R.DEFAULT_R });
const st = new Map();
const at = (id) => { if (!st.has(id)) st.set(id, fresh()); return st.get(id); };

const rows = [];   // التصحيحات اللي هتتكتب على rated_games
let worstOld = 0, worstNew = 0;

for (const g of games) {
  if (!['white', 'black', 'draw'].includes(g.winner)) continue;
  const w = at(g.white_id);
  const b = at(g.black_id);
  const wB = { r: w.r, rd: w.rd, vol: w.vol };
  const bB = { r: b.r, rd: b.rd, vol: b.vol };
  const scoreW = g.winner === 'white' ? 1 : g.winner === 'draw' ? 0.5 : 0;

  const out = R.applyGame(
    { r: w.r, rd: w.rd, vol: w.vol, games: w.games },
    { r: b.r, rd: b.rd, vol: b.vol, games: b.games },
    scoreW
  );

  w.r = out.a.r; w.rd = out.a.rd; w.vol = out.a.vol; w.games++;
  b.r = out.b.r; b.rd = out.b.rd; b.vol = out.b.vol; b.games++;
  w.peak = Math.max(w.peak, w.r);
  b.peak = Math.max(b.peak, b.r);

  worstNew = Math.max(worstNew, Math.abs(out.a.r - wB.r), Math.abs(out.b.r - bB.r));
  rows.push({
    id: g.id,
    wB, bB,
    wA: { r: out.a.r, rd: out.a.rd, vol: out.a.vol },
    bA: { r: out.b.r, rd: out.b.rd, vol: out.b.vol },
  });
}

/* أكبر حركة كانت موجودة فعلًا في الأرشيف القديم — للمقارنة */
for (const g of db.prepare('SELECT w_r_before,w_r_after,b_r_before,b_r_after FROM rated_games').all()) {
  worstOld = Math.max(worstOld,
    Math.abs((g.w_r_after || 0) - (g.w_r_before || 0)),
    Math.abs((g.b_r_after || 0) - (g.b_r_before || 0)));
}

const uSel = db.prepare('SELECT id, display_name, rating, rating_rd, rating_games, rating_peak FROM users WHERE id = ?');
console.log(`قاعدة البيانات: ${DB_PATH}`);
console.log(`مباريات مصنّفة في الأرشيف: ${games.length} | لاعبون متأثرون: ${st.size}`);
console.log(`أكبر حركة في مباراة واحدة — قديمًا: ${worstOld.toFixed(1)} → بعد الإصلاح: ${worstNew.toFixed(1)}`);
console.log('');
console.log('اللاعب'.padEnd(22) + 'التقييم'.padEnd(20) + 'RD'.padEnd(18) + 'مباريات'.padEnd(14) + 'الأعلى');
console.log('─'.repeat(88));

const ids = [...st.keys()].sort((a, b) => st.get(b).r - st.get(a).r);
for (const id of ids) {
  const s = st.get(id);
  const u = uSel.get(id) || {};
  const nm = (u.display_name || ('#' + id)).slice(0, 18);
  const cell = (was, now) => `${Math.round(was)} → ${Math.round(now)}`;
  console.log(
    nm.padEnd(22) +
    cell(u.rating != null ? u.rating : R.DEFAULT_R, s.r).padEnd(20) +
    cell(u.rating_rd != null ? u.rating_rd : R.DEFAULT_RD, s.rd).padEnd(18) +
    `${u.rating_games || 0} → ${s.games}`.padEnd(14) +
    cell(u.rating_peak != null ? u.rating_peak : R.DEFAULT_R, s.peak)
  );
}

if (!APPLY) {
  console.log('\nمعاينة فقط — مفيش حاجة اتغيّرت. ضيف --apply للتنفيذ.');
  process.exit(0);
}

/* نسخة احتياطية قبل أي كتابة — لازمة، دي بيانات لاعبين حقيقيين.
   VACUUM INTO مابياخدش parameters، فالمسار بيتحوّل لنص بعلامات مفردة. */
const bak = `${DB_PATH}.bak-before-rating-recalc-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const sqlStr = (s) => "'" + String(s).replace(/\\/g, '/').replace(/'/g, "''") + "'";
db.exec('VACUUM INTO ' + sqlStr(bak));
console.log('\nنسخة احتياطية:', bak);

const updU = db.prepare(`
  UPDATE users SET rating = ?, rating_rd = ?, rating_vol = ?,
                   rating_games = ?, rating_peak = ?,
                   rating_updated_at = datetime('now')
   WHERE id = ?
`);
const updG = db.prepare(`
  UPDATE rated_games SET
    w_r_before = ?, w_rd_before = ?, w_vol_before = ?,
    b_r_before = ?, b_rd_before = ?, b_vol_before = ?,
    w_r_after  = ?, w_rd_after  = ?, w_vol_after  = ?,
    b_r_after  = ?, b_rd_after  = ?, b_vol_after  = ?
   WHERE id = ?
`);

const r2 = (x) => Math.round(x * 100) / 100;
db.transaction(() => {
  for (const x of rows) {
    updG.run(
      r2(x.wB.r), r2(x.wB.rd), x.wB.vol, r2(x.bB.r), r2(x.bB.rd), x.bB.vol,
      r2(x.wA.r), r2(x.wA.rd), x.wA.vol, r2(x.bA.r), r2(x.bA.rd), x.bA.vol,
      x.id
    );
  }
  for (const [id, s] of st) {
    updU.run(Math.round(s.r), r2(s.rd), s.vol, s.games, Math.round(s.peak), id);
  }
})();

console.log(`تم: ${rows.length} مباراة و ${st.size} لاعب اتصححوا.`);
db.close();
