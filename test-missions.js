'use strict';
/* اختبار وحدة لنظام المهام الذكيّ (البناء ٦٠): توليدٌ حتميّ لكلّ لاعب،
   تدرّجٌ بالمستوى، تكيّفٌ مع السلوك، تقدّم كلّ metric جديد (checkmate/
   streak/nour/draws) من أحداثٍ موثّقة، القصّ عند الهدف، المطالبة مرّةً
   واحدة، وثبات الاختيار عبر الدورة. + المتجر الكامل وندرة Mythic. */
const path = require('path');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'amkh_missions_test_' + Date.now() + '.db');
process.env.AMKH_DB_PATH = TMP;
process.env.AMKH_DB_VERBOSE = '0';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.error('  ✗', msg); } }

const db = require('./db');
const econ = require('./economy');
const TPL = econ.MISSION_TEMPLATES;
const TPL_BY = {};
for (const p of ['daily', 'weekly']) for (const t of TPL[p]) TPL_BY[p + '_' + t.key] = Object.assign({ period: p }, t);

function newUser(tag) {
  db.prepare("INSERT INTO users (email, username, display_name) VALUES (?,?,?)").run(tag + '@t.co', tag, tag.toUpperCase());
  return db.prepare("SELECT id FROM users WHERE email=?").get(tag + '@t.co').id;
}

console.log('— الكتالوج —');
const cat = econ.catalog();
ok(cat.missions.length === 0, 'المهامّ لم تعد ثابتةً في الكتالوج (مصدرها snapshot)');
ok(cat.achievements.length >= 6, 'الكتالوج فيه الإنجازات');
const mythics = cat.items.filter(i => i.rarity === 'mythic');
ok(mythics.length === 28, 'الكتالوج فيه ٢٨ عنصر Mythic: ' + mythics.length);
ok(mythics.every(i => i.price === 3000), 'كل عناصر Mythic بسعر ٣٠٠٠');
ok(cat.items.every(i => i.ar && i.en && i.price > 0), 'كل عنصر له اسمان وسعر');

console.log('— التوليد الأساسي —');
const u = newUser('m1');
let snap = econ.snapshot(u);
ok(snap.missions.length === 6, 'تولّدت ٦ مهامّ (٣ يوميّة + ٣ أسبوعيّة): ' + snap.missions.length);
ok(snap.missions.filter(m => m.period === 'daily').length === 3, '٣ مهامّ يوميّة');
ok(snap.missions.filter(m => m.period === 'weekly').length === 3, '٣ مهامّ أسبوعيّة');
ok(snap.missions.every(m => m.ar && m.en && m.descAr && m.descEn && m.target > 0 && m.coins > 0 && m.xp > 0),
   'كل مهمّة لها اسمان ووصفان وهدف ومكافأة');
const ids = snap.missions.map(m => m.id);
ok(new Set(ids).size === ids.length, 'لا تكرار في معرّفات المهام');

console.log('— صحّة التوليد (target/coins/xp من القالب + المستوى) —');
const lvl = snap.level;
ok(snap.missions.every(m => {
  const t = TPL_BY[m.id]; if (!t) return false;
  const expTarget = Math.max(1, t.base + t.per * Math.floor(lvl / 5));
  return m.target === expTarget && m.coins === t.cpt * m.target && m.xp === t.xpt * m.target && m.metric === t.metric;
}), 'كل مهمّة: target=base+per·⌊level/5⌋، coins=cpt·target، xp=xpt·target');

console.log('— الحتمية (نفس اللاعب/اليوم = نفس المهام) —');
const snap2 = econ.snapshot(u);
ok(JSON.stringify(snap.missions.map(m => [m.id, m.target])) === JSON.stringify(snap2.missions.map(m => [m.id, m.target])),
   'إعادة اللقطة تعطي نفس المهام والأهداف');

console.log('— التدرّج بالمستوى —');
const uHi = newUser('hi');
econ.grant(uHi, 0, 6000, 'test', 'test:xp'); // يرفع المستوى قبل البذر
const snapHi = econ.snapshot(uHi);
ok(snapHi.level > 1, 'المستخدم عالي الخبرة مستواه > ١: ' + snapHi.level);
ok(snapHi.missions.every(m => {
  const t = TPL_BY[m.id];
  return m.target === Math.max(1, t.base + t.per * Math.floor(snapHi.level / 5));
}), 'أهداف اللاعب الأعلى مستوًى تتدرّج حسب الصيغة');

console.log('— تقدّم كلّ metric عبر أحداث فعليّة —');
/* نطبّق كل حدثٍ على مجموعة مستخدمين حتى نغطّي كل metric قابلٍ للاختيار،
   ونتحقّق أن أيّ مهمّةٍ بذلك الـmetric تقدّمت بالمقدار الصحيح (بلا افتراضٍ
   لأيِّ القوالب اختيرت لكلّ لاعب). */
const seenMetrics = new Set();
let checkedProgress = 0;
for (let k = 0; k < 12; k++) {
  const uu = newUser('ev' + k);
  econ.snapshot(uu); // بذر
  // أحداث: فوز بكش-مات ×3 (غرف مختلفة) + تعادل + هزيمة نور + لغزان
  econ.awardGame(uu, 'win', 'r' + k + '-a', 'checkmate');
  econ.awardGame(uu, 'win', 'r' + k + '-b', 'checkmate');
  econ.awardGame(uu, 'win', 'r' + k + '-c', 'checkmate');
  econ.awardGame(uu, 'draw', 'r' + k + '-d');
  econ.bumpMissions(uu, 'nour', 1);
  econ.bumpMissions(uu, 'puzzles', 2);
  const s = econ.snapshot(uu);
  for (const m of s.missions) {
    seenMetrics.add(m.metric);
    // بعد ٤ مباريات (٣ فوز كش-مات + تعادل): games≥4، wins/checkmate=3، streak=3، draws=1
    if (m.metric === 'games')     { ok(m.progress === Math.min(m.target, 4), 'games تقدّم=min(target,4) [' + m.id + ']'); checkedProgress++; }
    if (m.metric === 'wins')      { ok(m.progress === Math.min(m.target, 3), 'wins تقدّم=min(target,3)'); checkedProgress++; }
    if (m.metric === 'checkmate') { ok(m.progress === Math.min(m.target, 3), 'checkmate تقدّم=min(target,3)'); checkedProgress++; }
    if (m.metric === 'streak')    { ok(m.progress === Math.min(m.target, 3), 'streak تقدّم=min(target,3)'); checkedProgress++; }
    if (m.metric === 'draws')     { ok(m.progress === Math.min(m.target, 1), 'draws تقدّم=min(target,1)'); checkedProgress++; }
    if (m.metric === 'nour')      { ok(m.progress === Math.min(m.target, 1), 'nour تقدّم=min(target,1)'); checkedProgress++; }
    if (m.metric === 'puzzles')   { ok(m.progress === Math.min(m.target, 2), 'puzzles تقدّم=min(target,2)'); checkedProgress++; }
  }
}
ok(seenMetrics.size === 7, 'كل الـ٧ metrics قابلة للاختيار والظهور: ' + [...seenMetrics].sort().join(','));
ok(checkedProgress > 0, 'جرى التحقّق من تقدّم مهامّ فعليّة: ' + checkedProgress);

console.log('— سلسلة الفوز تُصفَّر بالخسارة —');
const uStreak = newUser('streak');
econ.snapshot(uStreak);
econ.awardGame(uStreak, 'win', 's-1', 'checkmate');
econ.awardGame(uStreak, 'win', 's-2', 'checkmate');
ok((db.prepare('SELECT win_streak FROM users WHERE id=?').get(uStreak).win_streak) === 2, 'win_streak=2 بعد فوزين');
econ.awardGame(uStreak, 'loss', 's-3');
ok((db.prepare('SELECT win_streak FROM users WHERE id=?').get(uStreak).win_streak) === 0, 'win_streak=0 بعد خسارة');

console.log('— منع تكرار نفس المباراة —');
const uDup = newUser('dup');
econ.snapshot(uDup);
econ.awardGame(uDup, 'win', 'dup-room', 'checkmate');
const gAfter1 = econ.snapshot(uDup).missions.find(m => m.metric === 'games');
econ.awardGame(uDup, 'win', 'dup-room', 'checkmate'); // نفس الغرفة
const gAfter2 = econ.snapshot(uDup).missions.find(m => m.metric === 'games');
if (gAfter1 && gAfter2) ok(gAfter1.progress === gAfter2.progress, 'إعادة نفس المباراة لا تزيد التقدّم');
else ok(true, '(لا مهمّة games لهذا اللاعب — تخطٍّ آمن)');

console.log('— المطالبة —');
const uc = newUser('claim');
econ.snapshot(uc);
// أكمل مهمّة يوميّة عبر أحداثٍ وفيرة
for (let i = 0; i < 40; i++) econ.awardGame(uc, 'win', 'c-' + i, 'checkmate');
econ.bumpMissions(uc, 'puzzles', 60);
econ.bumpMissions(uc, 'nour', 10);
econ.bumpMissions(uc, 'draws', 10);
let s = econ.snapshot(uc);
const doneM = s.missions.find(m => m.period === 'daily' && m.done && !m.claimed);
ok(!!doneM, 'توجد مهمّة يوميّة مكتملة للمطالبة: ' + (doneM && doneM.id));
if (doneM) {
  const coinsBefore = econ.snapshot(uc).coins;
  let r = econ.claimMission(uc, doneM.id);
  ok(r.ok === true, 'مطالبة مهمّة مكتملة تنجح');
  ok(econ.snapshot(uc).coins === coinsBefore + doneM.coins, 'الرصيد زاد بمكافأة المهمّة (' + doneM.coins + ')');
  ok(econ.snapshot(uc).missions.find(m => m.id === doneM.id).claimed === true, 'المهمّة صارت مُطالَبة');
  r = econ.claimMission(uc, doneM.id);
  ok(r.ok === false && r.reason === 'claimed', 'إعادة المطالبة مرفوضة (claimed)');
}
let rBad = econ.claimMission(uc, 'daily_nonexistent_xyz');
ok(rBad.ok === false && rBad.reason === 'bad_mission', 'مطالبة معرّفٍ غير معروف مرفوضة');

console.log('— مطابقة الدفتر —');
const sumLedger = db.prepare('SELECT COALESCE(SUM(delta),0) s FROM coin_ledger WHERE user_id = ?').get(uc).s;
ok(sumLedger === econ.snapshot(uc).coins, 'مجموع الدفتر = رصيد المحفظة');

console.log('— المتجر الكامل + Mythic —');
const store = econ.storeCurrent(u);
ok(store.items.length === econ.STORE_CATALOG.length, 'المتجر يعرض كلّ الكتالوج: ' + store.items.length);
ok(Array.isArray(store.windowIds) && store.windowIds.length === 6, 'نافذة الدوران ٦ عناصر');
ok(store.items.filter(i => i.inWindow).length === 6, '٦ عناصر فقط inWindow');
ok(store.items.some(i => i.rarity === 'mythic'), 'عناصر Mythic ظاهرة في المتجر');
// شراء عنصر داخل النافذة (نمنح رصيدًا وفيرًا)
const uBuy = newUser('buy');
econ.grant(uBuy, 20000, 0, 'test', 'test:coins');
const st = econ.storeCurrent(uBuy);
const inWin = st.items.find(i => i.inWindow && !i.owned);
const outWin = st.items.find(i => !i.inWindow && !i.owned);
let rb = econ.purchase(uBuy, inWin.id);
ok(rb.ok === true, 'شراء عنصر داخل النافذة ينجح: ' + inWin.id);
rb = econ.purchase(uBuy, outWin.id);
ok(rb.ok === false && rb.reason === 'not_in_window', 'شراء عنصر خارج النافذة مرفوض: ' + outWin.id);
// شراء Mythic لو صادف أن أحدها في النافذة يخصم ٣٠٠٠
const mythicInWin = st.items.find(i => i.inWindow && i.rarity === 'mythic' && !i.owned);
if (mythicInWin) {
  const before = econ.snapshot(uBuy).coins;
  const r2 = econ.purchase(uBuy, mythicInWin.id);
  if (r2.ok) ok(econ.snapshot(uBuy).coins === before - 3000, 'شراء Mythic يخصم ٣٠٠٠');
}

console.log('— عزل الدورة (period_key) —');
ok(/^\d{4}-\d{2}-\d{2}$/.test(econ.periodKey('daily')), 'مفتاح اليوم YYYY-MM-DD');
ok(/^\d{4}-W\d{2}$/.test(econ.periodKey('weekly')), 'مفتاح الأسبوع YYYY-Www');

console.log('\nنتيجة: ' + pass + ' نجح، ' + fail + ' فشل');
process.exit(fail ? 1 : 0);
