'use strict';
/* اختبار وحدة للمهام والإنجازات (المرحلة ٤): تقدّم المهام من أحداثٍ موثّقة،
   القصّ عند الهدف، المطالبة مرّةً واحدة، عزل الدورة بـperiod_key، والكتالوج. */
const path = require('path');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'amkh_missions_test_' + Date.now() + '.db');
process.env.AMKH_DB_PATH = TMP;
process.env.AMKH_DB_VERBOSE = '0';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.error('  ✗', msg); } }

const db = require('./db');
db.prepare("INSERT INTO users (email, username, display_name) VALUES ('m1@t.co','m1','M1')").run();
const u = db.prepare("SELECT id FROM users WHERE email='m1@t.co'").get().id;

const econ = require('./economy');
econ.snapshot(u); // منحة الإطلاق

console.log('— الكتالوج —');
const cat = econ.catalog();
ok(cat.missions.length === 6, 'الكتالوج فيه ٦ مهامّ');
ok(cat.achievements.length >= 6, 'الكتالوج فيه الإنجازات');
ok(cat.missions.every(m => m.ar && m.en && m.descAr && m.descEn && m.target > 0), 'كل مهمّة لها اسمان ووصفان وهدف');

console.log('— تقدّم المهام من الأحداث —');
// مهمّة يوميّة d_play3 (٣ مباريات) + d_win1 (فوز) + أسبوعيّة w_play20/w_win10
econ.awardGame(u, 'win', 'room-1');
econ.awardGame(u, 'loss', 'room-2');
econ.awardGame(u, 'draw', 'room-3');
let snap = econ.snapshot(u);
const play3 = snap.missions.find(m => m.id === 'd_play3');
const win1 = snap.missions.find(m => m.id === 'd_win1');
ok(play3.progress === 3, 'العَبْ ٣ مباريات: التقدّم ٣ بعد ٣ مباريات');
ok(play3.done === true, 'مهمّة الـ٣ مباريات مكتملة');
ok(win1.progress === 1 && win1.done === true, 'مهمّة الفوز: التقدّم ١ ومكتملة');

console.log('— منع تكرار نفس المباراة —');
econ.awardGame(u, 'win', 'room-1'); // نفس الغرفة → لا يُحسب ثانيةً
snap = econ.snapshot(u);
ok(snap.missions.find(m => m.id === 'd_play3').progress === 3, 'إعادة نفس المباراة لا تزيد التقدّم');

console.log('— القصّ عند الهدف —');
for (let i = 0; i < 30; i++) econ.awardGame(u, 'win', 'roomX-' + i);
snap = econ.snapshot(u);
ok(snap.missions.find(m => m.id === 'd_play3').progress === 3, 'التقدّم مقصوصٌ عند الهدف (٣)');
ok(snap.missions.find(m => m.id === 'w_play20').progress === 20, 'الأسبوعيّة مقصوصةٌ عند ٢٠');

console.log('— الألغاز —');
const before = econ.snapshot(u).missions.find(m => m.id === 'd_pz5').progress;
econ.bumpMissions(u, 'puzzles', 1);
econ.bumpMissions(u, 'puzzles', 1);
snap = econ.snapshot(u);
ok(snap.missions.find(m => m.id === 'd_pz5').progress === before + 2, 'تقدّم الألغاز يزيد بالحدث');

console.log('— المطالبة —');
const coinsBefore = econ.snapshot(u).coins;
let r = econ.claimMission(u, 'd_play3');
ok(r.ok === true, 'مطالبة مهمّة مكتملة تنجح');
const def = econ.MISSIONS.find(m => m.id === 'd_play3');
ok(econ.snapshot(u).coins === coinsBefore + def.coins, 'الرصيد زاد بمكافأة المهمّة');
ok(econ.snapshot(u).missions.find(m => m.id === 'd_play3').claimed === true, 'المهمّة صارت مُطالَبة');

r = econ.claimMission(u, 'd_play3');
ok(r.ok === false && r.reason === 'claimed', 'إعادة المطالبة مرفوضة (claimed)');

r = econ.claimMission(u, 'd_pz5');
ok(r.ok === false && r.reason === 'incomplete', 'مطالبة مهمّة غير مكتملة مرفوضة');

console.log('— مطابقة الدفتر —');
const sumLedger = db.prepare('SELECT COALESCE(SUM(delta),0) s FROM coin_ledger WHERE user_id = ?').get(u).s;
ok(sumLedger === econ.snapshot(u).coins, 'مجموع الدفتر = رصيد المحفظة');

console.log('— عزل الدورة (period_key) —');
const pkDay = econ.periodKey('daily');
const pkWeek = econ.periodKey('weekly');
ok(/^\d{4}-\d{2}-\d{2}$/.test(pkDay), 'مفتاح اليوم بصيغة YYYY-MM-DD: ' + pkDay);
ok(/^\d{4}-W\d{2}$/.test(pkWeek), 'مفتاح الأسبوع بصيغة YYYY-Www: ' + pkWeek);

console.log('\nنتيجة: ' + pass + ' نجح، ' + fail + ' فشل');
process.exit(fail ? 1 : 0);
