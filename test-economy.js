'use strict';
/* اختبار وحدة للاقتصاد (المرحلة ١): منح/خصم، منع التكرار بالـref،
   منحة الإطلاق مرّة واحدة، الحساب الرجعي للإنجازات، والدوام عبر إعادة
   فتح القاعدة. يشتغل على قاعدة مؤقّتة بلا شبكة. */
const path = require('path');
const os = require('os');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), 'amkh_econ_test_' + Date.now() + '.db');
process.env.AMKH_DB_PATH = TMP;
process.env.AMKH_DB_VERBOSE = '0';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.error('  ✗', msg); } }

const db = require('./db');
// مستخدمان: user1 جديد، user2 عنده سجلّ (للحساب الرجعي)
db.prepare("INSERT INTO users (email, username, display_name) VALUES ('u1@t.co','u1','U1')").run();
db.prepare("INSERT INTO users (email, username, display_name, wins, losses, draws, rating, rating_games, puzzle_solved) VALUES ('u2@t.co','u2','U2', 12, 3, 1, 1650, 16, 55)").run();
const u1 = db.prepare("SELECT id FROM users WHERE email='u1@t.co'").get().id;
const u2 = db.prepare("SELECT id FROM users WHERE email='u2@t.co'").get().id;

const econ = require('./economy');

console.log('— منحة الإطلاق —');
const s1 = econ.snapshot(u1);
ok(s1.coins === 200, 'منحة ترحيبية 200 عملة عند أول لقطة');
ok(s1.level === 1, 'يبدأ عند المستوى 1');
const s1b = econ.snapshot(u1);
ok(s1b.coins === 200, 'اللقطة الثانية لا تكرّر المنحة (granted)');

console.log('— كسب المباراة ومنع التكرار —');
econ.awardGame(u1, 'win', 'ROOM1');
let s = econ.snapshot(u1);
ok(s.coins === 225, 'فوز يضيف 25 عملة (=225)');
ok(s.xp === 40, 'فوز يضيف 40 XP');
econ.awardGame(u1, 'win', 'ROOM1');   // نفس الغرفة → مرفوض
s = econ.snapshot(u1);
ok(s.coins === 225, 'نفس الغرفة لا تُمنَح مرّتين (ref dedupe)');
econ.awardGame(u1, 'loss', 'ROOM2');
s = econ.snapshot(u1);
ok(s.coins === 233, 'خسارة مباراة أخرى تضيف 8 (=233)');

console.log('— الحساب الرجعي للإنجازات —');
const s2 = econ.snapshot(u2);   // يستدعي evaluateAchievements(retro)
ok(s2.achievements.includes('first_win'), 'first_win بأثر رجعي');
ok(s2.achievements.includes('wins_10'), 'wins_10 بأثر رجعي (12 فوز)');
ok(s2.achievements.includes('rating_1600'), 'rating_1600 بأثر رجعي (1650)');
ok(s2.achievements.includes('puzzle_50'), 'puzzle_50 بأثر رجعي (55)');
ok(!s2.achievements.includes('games_100'), 'games_100 لا يُمنَح (16 مباراة فقط)');
ok(!s2.achievements.includes('beat_nour'), 'beat_nour لا يُحسَب رجعيًّا');
// عملات الإنجازات = 30+80+120+90 = 320 فوق منحة 200 = 520
ok(s2.coins === 520, 'مجموع منحة الإطلاق + عملات الإنجازات الرجعية = 520');

console.log('— منحنى المستوى —');
ok(econ.levelForXp(0) === 1, 'XP=0 → مستوى 1');
ok(econ.levelForXp(econ.xpToReach(2)) === 2, 'عتبة المستوى 2 → مستوى 2');
ok(econ.levelForXp(1e9) === 50, 'XP هائل يتوقّف عند 50');

console.log('— مطابقة الرصيد مع الدفتر —');
const led = db.prepare('SELECT COALESCE(SUM(delta),0) AS c FROM coin_ledger WHERE user_id = ?').get(u1).c;
const wal = db.prepare('SELECT coins FROM wallet WHERE user_id = ?').get(u1).coins;
ok(led === wal, `مجموع الدفتر (${led}) = المحفظة (${wal})`);

console.log('— الدوام عبر إعادة الفتح —');
const coinsBefore = econ.snapshot(u2).coins;
db.close();
delete require.cache[require.resolve('./db')];
delete require.cache[require.resolve('./economy')];
delete require.cache[require.resolve('./auth')];
const db2 = require('./db');
const econ2 = require('./economy');
const after = econ2.snapshot(u2).coins;
ok(after === coinsBefore, `الرصيد باقٍ بعد إعادة الفتح (${after})`);

console.log(`\nنتيجة: ${pass} نجح، ${fail} فشل`);
try { db2.close(); } catch (e) {}
try { fs.unlinkSync(TMP); } catch (e) {}
process.exit(fail ? 1 : 0);
